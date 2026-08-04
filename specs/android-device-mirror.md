# Android device mirror

status: superseded
created: 2026-08-04
superseded-by: specs/device-identity-and-viewer.md

> **Not built.** The product owner chose to show the device through Maestro's own Viewer instead
> of streaming it into the inspector panel. Kept as the evaluated alternative, in the spirit of
> `.context.md` §5.6: the scrcpy protocol facts below were verified against the installed v3.3.4
> jar and its source, and would not be cheap to re-derive if the decision is ever revisited.
>
> **What carried over to `device-identity-and-viewer.md`:** criteria 1–13 — adb discovery, the
> device list and app identity by `CONFIG.APP_ID` — plus their constraints and tests. Nothing in
> Maestro's MCP surface identifies an app, so that half stays ours and stays on adb.
>
> **What was dropped:** criteria 14–43 — the scrcpy session, the wire protocol, the WebCodecs
> decode path and the in-panel canvas. The trade accepted with them: the phone appears in a
> browser tab rather than in the Device inspector, so the hover overlay of `.context.md` §5.5 has
> no surface to draw on until that decision is revisited.

## Goal

Put a live picture of a real Android phone inside the Device inspector, and tell the person
whether the app under test — `CONFIG.APP_ID` — is on that phone and running.

Today the inspector draws a fixture: a fake 330×648 phone with a drawn status bar, a drawn nav
bar and the empty state `No device connected`. This spec replaces all of it with the device's own
framebuffer, streamed over adb by `scrcpy-server` as H.264 and decoded in the renderer with
WebCodecs — roughly 30 fps at ~50–100 ms of latency, inside the panel, not in a second window.

It matters because every later spec looks at that picture. Snapshot, hover hit-test and selector
synthesis (`.context.md` §5.4–5.5) all assume the person can see the app respond while they
author; at 2 fps that loop reads as broken. It is also the first spec that crosses IPC for real,
the first that touches a device, and the first that puts an entry in the `services` registry that
`src/main/index.ts` has been holding open since the scaffold.

**Android only, over USB.** iOS, simulators and emulators are not the target of this spec's
verification (emulators are not *rejected* — see *Out of scope*).

## Context

### Files/modules this touches

Created — main:

```
src/main/
  maestro/
    MaestroGateway.ts       # the interface — device capabilities only, in this spec
    LocalGateway.ts         # implements it with AdbBridge + ScrcpySource
    AdbBridge.ts            # every adb invocation: devices, getprop, wm, pm, pidof, forward, push
    ScrcpySource.ts         # scrcpy-server lifecycle: push, forward, app_process, socket
    scrcpy-protocol.ts      # PURE: incremental handshake + frame-header parser, no I/O
  services/
    device.service.ts       # DeviceService: selection, app identity, mirror sessions, dispose()
  ipc/
    device.ts               # registerDeviceIpc(deps)
resources/
  scrcpy/
    scrcpy-server-3.3.4.jar # pinned, ours — never the user's brew copy
    LICENSE                 # Apache-2.0, from Genymobile/scrcpy
```

Created — renderer:

```
src/renderer/src/
  lib/h264.ts               # PURE: Annex-B split + SPS → VideoDecoderConfig codec string
  stores/device.store.ts    # devices, selection, app identity, mirror status
  hooks/useMirrorStream.ts  # mirror:event → VideoDecoder → canvas. Mounted by the view.
```

Modified:

```
src/shared/config.ts                        # + ADB_PATH (empty = auto-resolve)
src/shared/ipc.ts                           # + the device and mirror channels
src/preload/index.ts                        # + one named function per new channel
src/main/index.ts                           # constructs DeviceService, registers, disposes
src/main/process/run.ts                     # + a streaming spawn, for long-lived children
src/renderer/src/lib/mirror-fit.ts          # device size becomes a parameter, not a constant
src/renderer/src/views/DeviceMirror/*       # real frames, real serial, real app identity
src/renderer/src/fixtures/flows.ts          # the DEVICE fixture goes
electron-builder.yml                        # + extraResources for resources/scrcpy
.context.md                                 # §5.5, §9.2, §10.1, §12.13 — see Decisions
```

`biome.json` is **not** modified. See *Constraints*.

### Existing patterns/interfaces to follow

- `AGENTS.md` § Architecture — the data path, the main-process rules (composition root, thin IPC
  controllers, streamed long work, `dispose()`), the renderer import ladder, the IPC contract.
- `src/main/ipc/handle.ts` — every `invoke` channel goes through it; it already does the sender
  check, the Zod parse and the `Result` shaping. No handler re-implements any of that.
- `src/main/process/run.ts` — the only `execFile`. Its contract ("ran and exited resolves, even
  non-zero; never started rejects") is the model the new streaming spawn follows.
- `src/shared/ipc.ts` — `CHANNELS`, `IPC`, `Result<T>`, `ConductorApi`. Push channels are new
  here; the file currently has none.
- `src/main/index.ts` — the `Service` interface and the `services` array already exist and are
  empty. `DeviceService` is the first entry.
- `src/renderer/src/lib/mirror-fit.ts` + its test — the shape a pure renderer module has here.

### Product & decision docs

- `.context.md` §4.4b and §12.13 — screenshot comes from the OS, not from Maestro. scrcpy is on
  the same side of that line: no JVM, no `maestro` binary. This spec ships with `maestro` not
  installed on the machine.
- `.context.md` §5.5 — the two-cadence model. This spec builds the fast cadence and **changes what
  the fast cadence is on Android**; the amendment is part of the work (see *Decisions*).
- `.context.md` §10.1 — the six rules that keep `RemoteGateway` cheap. Rules 2, 3, 4, 5 and 6 are
  load-bearing here and are called out individually in *Constraints*.
- `.context.md` §9.3 — Electron security. Nothing is relaxed; no CSP directive is added.
- `.context.md` §13 step 1 — the latency spike that was never run. This spec's verification is
  that spike for Android, with the numbers recorded.

### The scrcpy wire protocol

Verified against the installed `scrcpy-server` (v3.3.4) and the v3.3.4 source, not from memory.
These are the facts the parser is written against:

- Entry point is `com.genymobile.scrcpy.Server`; the **first positional argument is the client
  version and must equal the server's exactly** — the dex carries the literal
  `"The server version (3.3.4) does not match the client ("`. Everything after it is `key=value`.
- The server binds a `LocalServerSocket` named `scrcpy` when `scid=-1`, otherwise
  `scrcpy_%08x` of the scid. The client reaches it with `adb forward tcp:<port> localabstract:<name>`.
- Sockets are accepted in order: video, then audio, then control — each only if enabled.
- `send_dummy_byte=true` writes **one zero byte to the first socket only**; it is how a forward
  tunnel distinguishes "connected" from "adb accepted the connection but nothing is listening".
- `send_device_meta=true` writes **64 bytes** on the first socket: the device name UTF-8, truncated
  to 63 bytes, zero-padded to 64.
- `send_codec_meta=true` writes **12 bytes** on the video socket: codec id `u32`, initial width
  `u32`, initial height `u32` — all big-endian.
- `send_frame_meta=true` prefixes every packet with **12 bytes**: a big-endian `u64` whose bit 63
  is the config flag, bit 62 the key-frame flag and low 62 bits the PTS in microseconds, followed
  by a big-endian `u32` packet length.
- The payload is what `MediaCodec` produced for `video/avc`: Annex-B, with SPS and PPS arriving in
  the packet whose config flag is set. (Flagged as an assumption to confirm on first run — see
  *Decisions*.)

### Tests

`vitest.config.ts` already has both projects. The main project (`environment: 'node'`) gets the
protocol parser, the bridge, the gateway and the service; the renderer project (`jsdom`) gets the
store, `lib/h264.ts` and the view. jsdom has **no** `VideoDecoder`, which is why the decode
*decisions* live in `lib/h264.ts` and the hook stays thin — `AGENTS.md` § Testing: if a behavior
is hard to test without mounting, its logic is in the wrong layer.

`scrcpy-protocol.ts` and `lib/h264.ts` are this spec's `SelectorSynth`: pure, trap-dense, and
testable to exhaustion without a phone plugged in. They carry the strongest tests here.

---

## Acceptance criteria

### adb discovery and device list

1. The system shall resolve the `adb` binary in this order: `CONFIG.ADB_PATH` when non-empty,
   then `$ANDROID_HOME/platform-tools/adb`, then `$ANDROID_SDK_ROOT/platform-tools/adb`, then
   `~/Library/Android/sdk/platform-tools/adb`, then `adb` on `PATH` — taking the first that
   exists and is executable.
2. When no `adb` resolves, the system shall report the failure as a `Result` error with code
   `device/adb-not-found` and shall render an empty state naming what is missing, rather than
   an empty device list.
3. The system shall enumerate devices with `adb devices -l` and report, per device: the opaque
   id, the parsed `model:` when present, and the state `device` · `unauthorized` · `offline`.
4. The system shall report a device in state `unauthorized` as its own condition, distinct from
   "no device", so the person is told to accept the debugging prompt on the phone.
5. The system shall re-enumerate devices at most every 2 seconds and shall emit `device:changed`
   only when the resulting list differs from the last one emitted.
6. When exactly one device is in state `device`, the system shall select it automatically. When
   more than one is, the system shall select none and render the list for the person to pick from.
7. The system shall read the selected device's model, Android release, physical size and density
   via `getprop` / `wm size` / `wm density`, and shall treat any value it cannot parse as absent
   rather than substituting a default.

### App identity

8. The system shall identify the app under test by `CONFIG.APP_ID` only, and shall not contain
   that value as a literal anywhere outside `src/shared/config.ts` (`.context.md` §12.6).
9. The system shall report whether the app is installed by matching `CONFIG.APP_ID` **exactly**
   against the lines of `adb shell pm list packages <appId>` — never by substring, which that
   command's own filter would otherwise satisfy with a different package.
10. When the app is installed, the system shall report its `versionName`, parsed from
    `adb shell dumpsys package <appId>`; when the field is absent from the output, it shall
    report `null`.
11. The system shall report whether the app is currently running from `adb shell pidof <appId>`,
    treating a non-zero exit with empty output as "not running" rather than as an error.
12. The system shall report whether the app is in the foreground as `true`, `false`, or `null`
    when the device's `dumpsys` output carries no marker it recognises — never as `false` by
    default. ("`null` is not reported", consistent with `.context.md` §5.2.)
13. The system shall render the app identity in the inspector as one line: the app id, its
    version when known, and its state — and shall distinguish *not installed* from *installed,
    not running* from *running* from *foreground*.

### The mirror session

14. The system shall push its own pinned `resources/scrcpy/scrcpy-server-3.3.4.jar` to
    `/data/local/tmp/scrcpy-server.jar` on the device, and shall never read the scrcpy
    installation on the user's machine.
15. The system shall pass a client version argument identical to the pinned jar's version, from a
    single constant that also names the jar file.
16. The system shall allocate the forward port dynamically rather than hardcoding 27183, and
    shall scope the socket name with a per-session scid so two sessions can never collide.
17. The system shall start the server with, at minimum: `video=true`, `audio=false`,
    `control=false`, `video_codec=h264`, `tunnel_forward=true`, `send_dummy_byte=true`,
    `send_device_meta=true`, `send_codec_meta=true`, `send_frame_meta=true`, `max_size=1024`,
    `max_fps=30`, `cleanup=true`.
18. The system shall treat the dummy byte, the 64-byte device name and the 12-byte codec header as
    a strict prefix of the video socket, and shall fail the session with a distinct error code
    when the stream ends inside any of them.
19. The system shall parse each subsequent packet as a 12-byte header plus exactly `length` bytes,
    reading the config flag from bit 63, the key-frame flag from bit 62 and the PTS from the low
    62 bits of the big-endian `u64`.
20. The system shall produce identical output regardless of how the TCP stream is chunked —
    including a split in the middle of a header, in the middle of a payload, and one byte at a
    time.
21. The system shall reject a packet length larger than a fixed sane ceiling by failing the
    session, rather than by allocating what the number asks for.
22. The system shall stop a session by killing the server child, removing the adb forward and
    closing the socket, and shall leave no forward behind on the host and no process behind on
    the device.
23. The system shall stop every running session on `before-quit`, via `DeviceService.dispose()`
    registered in the `services` array of `src/main/index.ts`.
24. The system shall stop the sessions belonging to a renderer that reloads or closes, without
    waiting for `before-quit`.
25. When the device disconnects mid-session, the system shall emit a terminal session event with
    a distinct code and shall return the inspector to its disconnected state — not stall on the
    last frame.

### IPC

26. The system shall declare every new channel in `src/shared/ipc.ts` with a Zod schema per
    payload, and shall expose exactly one named function per channel in the preload — no
    `ipcRenderer`, no raw `invoke`, no logic in the bridge.
27. The system shall name the channels `device:list`, `device:app-info`, `mirror:start`,
    `mirror:stop` for invokes, and `device:changed`, `mirror:event` for pushes.
28. The system shall return `mirror:start` immediately with the session id and the stream's
    codec, width and height, and shall deliver frames only as `mirror:event` pushes — no handler
    blocks on the stream (`AGENTS.md` § Architecture, "long work is streamed, never awaited").
29. The system shall carry frame payloads across IPC as bytes, never as a file path
    (`.context.md` §10.1 rule 2).
30. The system shall expose `deviceId` as an opaque token that no code outside `AdbBridge` and
    `ScrcpySource` parses or interprets (rule 3).
31. The system shall return every expected failure as `{ ok: false, error: { code, message } }`
    with a stable `code`, and shall reserve throwing for bugs.
32. Every subscription function the preload exposes shall return an unsubscribe function, and the
    hook that calls it shall call that function in effect cleanup.

### The inspector

33. The system shall render the mirror as a `<canvas>` sized to the stream's own dimensions from
    the codec header, and shall fit it to the bay by `transform: scale()` alone — never by
    changing the canvas' width or height.
34. The system shall derive the `VideoDecoderConfig` codec string from the SPS in the config
    packet — profile, constraint flags and level — rather than hardcoding a profile.
35. The system shall configure the decoder for Annex-B, without a `description`, and shall
    request `optimizeForLatency`.
36. The system shall close every `VideoFrame` it draws, and shall close the decoder on unmount.
37. The system shall drop the drawn status bar, the drawn nav bar and the `No device connected`
    body copy from `DeviceMirror.tsx` — a real mirror shows the device's own chrome. The bezel,
    the drop shadow and the fixed device palette stay: they are Conductor's chrome, not the
    phone's. **This supersedes criteria 42 and 43 of `aurora-layout-shell`.**
38. The system shall render, in place of the mirror, exactly one empty state per condition: adb
    missing, no device, device unauthorized, more than one device, app not installed, and mirror
    failed — each naming the next action.
39. The system shall show the real device model or serial in the inspector header, and shall drive
    the header status dot from the real device and session state.
40. The system shall keep the header's existing degradation order at every width, with the app
    identity line degrading before the serial.
41. The system shall mount the mirror subscription from the `DeviceMirror` view, not from
    `App.tsx`, so it stops when the view unmounts (`AGENTS.md` § Architecture).
42. The system shall select narrowly from `device.store.ts`; no component shall subscribe to the
    whole store, and no frame shall re-render the toolbar, the sidebar or the editor.
43. When `window.VideoDecoder` is absent, the system shall render an explicit unsupported state
    rather than a blank canvas.

### Layering and structure

44. `scrcpy-protocol.ts` and `lib/h264.ts` shall be pure: no I/O, no Electron import, no React,
    no `window.conductor`.
45. `AdbBridge` and `ScrcpySource` shall be the only modules that name `adb` or scrcpy paths, and
    shall receive their process runner by constructor injection so a test can pass a fake.
46. `LocalGateway` shall be reachable only through the `MaestroGateway` interface, and
    `DeviceService` shall depend on that interface rather than on the class.
47. No module-level singleton: every class in this spec shall be constructible in a test with
    fakes, and shall be constructed in `src/main/index.ts` and nowhere else.
48. `src/main/ipc/device.ts` shall validate, call one service method and shape the result —
    no business logic.
49. Renderer tests shall mock exactly one seam, `window.conductor`, and shall mock no store, hook
    or component.

---

## Constraints

- **The jar is ours, pinned, and shipped.** `resources/scrcpy/scrcpy-server-3.3.4.jar` is
  committed and packaged via `extraResources`, with the Apache-2.0 `LICENSE` beside it. Reading
  `/opt/homebrew/share/scrcpy/scrcpy-server` is forbidden: the version argument must match the jar
  exactly, and a `brew upgrade scrcpy` would then break the mirror silently on someone else's
  machine. It also means the person needs `adb`, not scrcpy.
- **Packaged path resolution.** The jar's path differs between `electron-vite dev` and a packaged
  app (`process.resourcesPath`). One helper resolves it; nothing else joins that path. It must be
  `extraResources`, not bundled into `app.asar` — `adb push` needs a real file, and asar is a
  virtual filesystem.
- **`biome.json` does not change.** `ScrcpySource` needs a long-lived child, which `run.ts`'s
  `execFile` cannot give it — so `run.ts` grows a streaming spawn and stays the only file that
  imports `node:child_process`. That is exactly the resolution `.context.md` §10.1 already
  prescribes ("todo spawn passa por um utilitário único"). Adding a fourth entry to the override
  list would be the wrong fix.
- **`node:net` is not `child_process`.** The video socket is a plain TCP connection to
  `127.0.0.1:<forwarded port>` and lives in `ScrcpySource`.
- **No shell string, ever.** Every adb call is an argument array through `run.ts` (`.context.md`
  §12.19). That includes the `app_process` command line — `CLASSPATH=…` is passed as an argument
  to `adb shell`, not composed into a shell string.
- **§10.1 rules 4 and 5.** Every gateway operation is async and may fail from the transport. No
  consumer assumes low latency: the mirror renders whatever has arrived and shows its own state
  when nothing has.
- **§10.1 rule 6.** `/data/local/tmp/scrcpy-server.jar` is a device path and appears only inside
  `ScrcpySource`. Nothing above the gateway knows the device has a filesystem.
- **No CSP change.** The canvas path needs no `blob:` and no new directive; the existing
  `img-src 'self' data: blob:` is already there and stays untouched.
- **The bezel and the device palette survive the theme.** Criterion 42 of `aurora-layout-shell`
  is only *partly* superseded: the phone still keeps its own fixed chrome and drop shadow, still
  unchanged when Conductor's theme changes. Only the drawn status bar and nav bar go.
- **`CONFIG` gains one field, no more.** `ADB_PATH`, defaulting to empty — resolution is behavior
  and belongs in `AdbBridge`, not in the constants module.
- **Copy register.** English chrome, sentence case, no emoji. Anything the CLI prints stays
  verbatim in mono. Same rules as `aurora-layout-shell`.
- **`fixtures/flows.ts` loses `DEVICE` and nothing else.** The other fixtures belong to specs that
  have not been wired yet; deleting them here would blank regions this spec does not own.

## Out of scope

- **Controlling the device.** scrcpy's control socket — tap, swipe, key, text, clipboard — is what
  this spec unlocks and deliberately does not build. `control=false` for now. It is the obvious
  next spec, and the reason the transport choice matters beyond frame rate.
- **iOS and the simulator.** `simctl`, `ScreenCapture`, and the second half of `.context.md`
  §4.4b. scrcpy is Android-only; the gateway interface is written so an iOS source slots in
  beside it, and nothing more.
- **Emulators as a target.** Not rejected, not special-cased, not verified. `adb devices` lists
  them and they will most likely work; this spec's verification is a physical phone over USB.
- **Wi-Fi adb, and more than one mirror at a time.** One session, one device, one cable.
- **`maestro hierarchy`, the snapshot, the hit-test, the selector.** `.context.md` §5.5's slow
  cadence and everything built on it, including `CliRunner`, `HierarchyParser` and `SelectorSynth`.
  `MaestroGateway` gains those members in the spec that needs them; here it carries only the
  device capabilities listed above. The `maestro` binary is not installed and is not required.
- **`DoctorService` and the Doctor view** (`.context.md` §10). This spec surfaces its own missing
  prerequisite — adb — as an empty state with a stable error code, which is the seed the doctor
  will read. It does not build the doctor.
- **A device picker dialog.** With more than one device the inspector lists them plainly and lets
  the person pick; the kit's Devices `Dialog` stays out of scope, as in `aurora-layout-shell`.
- **Recording, screenshots to disk, and the header's screenshot button.** The button already
  renders; it stays inert.
- **Audio.** `audio=false`. Conductor tests UI.
- **Reconnect-on-disconnect, and retry policy.** A dropped session reports and stops. Reconnection
  logic without a measured failure mode would be invented.
- **E2E / Playwright.** Still forbidden at this stage by `AGENTS.md` § Testing.

## Decisions & assumptions

- **Why scrcpy rather than the `screencap` polling `.context.md` §5.5 specifies?** → The product
  owner's call, made explicitly against the alternative. `adb exec-out screencap -p` costs
  100–300 ms per frame, so the documented "fast cadence" tops out around 2–4 fps: enough to see
  *that* the app changed, not enough to watch it respond. scrcpy delivers ~30 fps at ~50–100 ms
  through a socket that is already there for adb, and its control channel is the natural next
  step. The cost is accepted and recorded: it is an internal, version-locked protocol without a
  stability contract — the same class of risk `.context.md` §4.5 warns about for Maestro Studio.
  Pinning our own jar is what converts that risk from "breaks on someone's machine" to "breaks
  when we deliberately upgrade".
- **`.context.md` must be amended in this change, not after it.** `AGENTS.md` is explicit that
  `.context.md` wins on conflict and gets fixed in the same change. Four places:
  §5.5's cadence table (Android's fast cadence becomes the scrcpy stream; `screencap` remains the
  still-capture and iOS path), §9.2's process diagram (`AdbBridge` and `ScrcpySource` under
  `LocalGateway`), §10.1 rule 1 (which names only `CliRunner` and `ScreenCapture` today), and
  §12.13 (screenshot still comes from the OS and not from Maestro — scrcpy does not change that
  claim, but it should say so).
- **Why is the mirror a `MaestroGateway` capability rather than its own service?** → Because
  `RemoteGateway` will have to serve it too. §9.2 already puts `ScreenCapture` under
  `LocalGateway` for exactly this reason: "where the device lives" is the gateway's secret. A
  standalone `MirrorService` calling adb would be leak #1 in §10.1's table on day one. The naming
  tension is acknowledged — the interface will carry members that never touch Maestro — and is
  cheaper than the leak.
- **Why introduce `MaestroGateway` now, with only four members?** → Introducing the interface is
  what keeps `DeviceService` from depending on adb. Adding `hierarchy()` later is additive;
  retrofitting the indirection after `DeviceService` has grown around a concrete class is not.
- **Why H.264 and not H.265 or AV1?** → `video_codec=h264` is the best-supported WebCodecs path in
  Chromium, and the Annex-B assumption below is H.264-specific. The other two would each need
  their own bitstream handling for no gain at 1024 px.
- **Why `max_size=1024` and `max_fps=30`?** → The inspector column is 250–300 CSS px wide; 1024
  leaves headroom for a wider window and for the future 1:1 inspect overlay without streaming a
  1080×2400 framebuffer no one sees. 30 fps halves the encode and decode cost against 60 with no
  perceptible loss for watching an app respond. Both are constants, both are cheap to raise.
- **Why `null` for foreground?** → `dumpsys` output shape varies across Android versions, and
  reporting `false` because we did not recognise a marker would be indistinguishable from the app
  genuinely being backgrounded. `.context.md` §5.2 already draws that distinction for the
  hierarchy; the same rule is applied here.
- **Why does adb resolution live here and not in the doctor?** → Because `adb` is not on this
  machine's `PATH` today — it is at `~/Library/Android/sdk/platform-tools/adb` — so a spec that
  assumes `PATH` ships broken to its first user. The resolution order is behavior in `AdbBridge`;
  the override is one `CONFIG` field; the doctor, when it arrives, reads the error code.
- **Why poll `adb devices` instead of tracking?** → `adb track-devices` is the adb server's own
  smart-socket protocol, not a CLI subcommand — reaching it means speaking a second undocumented
  protocol for a feature worth one line of polling. Two seconds is imperceptible for plugging in
  a cable and costs ~15 ms of adb per tick.
- (Assumed) **The payload is Annex-B, with SPS and PPS in the config packet.** This follows from
  scrcpy streaming `MediaCodec`'s `video/avc` output buffers unmodified, and it is what lets the
  decoder be configured without a `description`. **It is the one assumption in this spec that
  cannot be verified without a phone**, so it is verified first, on the first run. If it proves
  wrong, the fallback is to build an `avcC` `description` from the config packet's SPS/PPS in
  `lib/h264.ts` — same module, same tests, no change above it.
- (Assumed) **`adb forward tcp:0` prints the allocated port on stdout.** If it does not on some
  platform-tools build, the fallback is to scan upward from 27183 for a free port. Either way the
  port is never a hardcoded constant (criterion 16).
- **Test bar.** Exhaustive unit tests for `scrcpy-protocol.ts` (chunk boundaries, the 62-bit PTS,
  both flag bits, truncated prefixes, oversized lengths) and `lib/h264.ts` (SPS → codec string,
  against real captured SPS bytes). Parser tests for `AdbBridge` against captured `adb` output,
  including `unauthorized`, `offline`, an empty list, and a `pm list packages` result that
  substring-matches but is not the app. Fake-driven tests for `LocalGateway` and `DeviceService`.
  RTL for the inspector's states, mocking only `window.conductor`. No snapshot tests, no test that
  requires a device.

## Verification

Automated, with no device attached — this is most of the suite, and it is deliberate:
`npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass, and the suite passes
under `--sequence.shuffle`. The protocol parser and `lib/h264.ts` are covered against synthetic
and captured bytes; `AdbBridge` against captured `adb` output; the gateway, the service and the
views against fakes.

Manual, with a physical Android phone over USB — **this is also `.context.md` §13 step 1, the
latency spike that was never run**, and its numbers get written back into `.context.md` §4.4:

1. USB debugging on, cable connected, RSA prompt accepted. Confirm the *unauthorized* state
   renders correctly before accepting it, since that is every first-time user's first screen.
2. The Annex-B assumption, first: dump the config packet and confirm it carries SPS/PPS with
   start codes before trusting the rest.
3. Mirror comes up, moves at ~30 fps, and the measured glass-to-glass latency is recorded.
4. `com.vtex.pnp` is reported correctly across all four states — absent, installed, running,
   foreground — including on a device where it is not installed.
5. Unplug mid-session: the inspector returns to its disconnected state and does not stall on the
   last frame.
6. Quit with a session live, then check that no `scrcpy` process survives on the device
   (`adb shell ps -A | grep app_process`) and no forward survives on the host (`adb forward --list`).
7. Reload the renderer (⌘R) with a session live and confirm main does not leak a session.
8. Measure, for the record: `adb exec-out screencap -p` round-trip, so §4.4's table stops being an
   estimate and the discarded alternative is quantified rather than assumed.

Not covered by any automated test: whether 30 fps at `max_size=1024` *looks* right in the 250 px
column, and whether the app identity line reads clearly. There is no design-system drawing for
that line — like `PRPanel` and `Doctor` before it, it is specified in words here and wants a
visual review.

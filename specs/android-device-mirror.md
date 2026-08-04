# Android device mirror

status: draft
created: 2026-08-04
reopened: 2026-08-04
supersedes: criteria 25 and 26 of specs/device-identity-and-viewer.md

> **Reopened, and the reason matters more than the reversal.** The Viewer was accepted on the
> understanding that it was the interactive mirror the product owner had used to author tests. It
> is not. That mirror is **Maestro Studio, a separate desktop app**, and the CLI no longer bundles
> it — `maestro studio` now only prints *"Maestro Studio is no longer bundled with the CLI.
> Download the new Maestro Studio desktop app instead"* and a download URL. What the CLI actually
> exposes is `open_maestro_viewer`, which returns **a URL to a web page**: the picture renders in
> the person's browser, in another application, and Conductor's inspector panel never fills.
>
> With the picture in someone else's window, the §5.5 loop — hover an element, click it, get a
> command in the flow — has no surface to draw on and no click to read. That is the product, so
> the trade was reversed.
>
> **Already built, and not re-implemented here:** criteria 1–13 — adb discovery, the device list
> and app identity by `CONFIG.APP_ID` — delivered by `device-identity-and-viewer.md` and verified
> on 2026-08-04 against a physical Galaxy A07 (`SM-A075M`, Android 16, 720×1600 @ 300dpi). They
> are kept below, unchanged, so the numbering stays stable and the acceptance set stays readable
> as one document.
>
> **What this spec owes:** criteria 14–49 — the scrcpy session, the wire protocol, the WebCodecs
> decode path and the in-panel canvas.

## Goal

Put a live picture of a real Android phone **inside** the Device inspector, and tell the person
whether the app under test — `CONFIG.APP_ID` — is on that phone and running.

The identity half is done. The panel is not: it renders a bezel around an empty state that says
the screen opens in a browser. This spec fills that bezel with the device's own framebuffer,
streamed over adb by `scrcpy-server` as H.264 and decoded in the renderer with WebCodecs —
roughly 30 fps at ~50–100 ms of latency, in the panel, not in a second window and not in a second
application.

It matters because every later spec looks at that picture. Snapshot, hover hit-test and selector
synthesis (`.context.md` §5.4–5.5) all assume the person can see the app respond while they
author; at 2 fps that loop reads as broken, and in another application it does not exist at all.

**Android only, over USB.** iOS, simulators and emulators are not the target of this spec's
verification (emulators are not *rejected* — see *Out of scope*).

## Context

### What changed since this spec was first written

The scaffold is no longer the starting point. `device-identity-and-viewer.md` shipped, so:

- `AdbBridge.ts`, `LocalGateway.ts`, `MaestroGateway.ts`, `device.service.ts`, `ipc/device.ts`
  and `device.store.ts` **exist**, with tests. This spec grows them; it does not create them.
- `src/main/process/run.ts` **already has** `spawnStreaming()` beside `run()` — added for the
  `maestro mcp` child. `ScrcpySource` uses it as-is; `run.ts` does not change.
- `src/shared/config.ts` **already has** `ADB_PATH`. `CONFIG` gains nothing in this spec.
- `src/shared/ipc.ts` **already has** a push channel (`device:changed`) and the `Result` shape.
- `src/main/index.ts`'s `services` array is **no longer empty** — it holds `DeviceService` and
  `ViewerService`.
- `fixtures/flows.ts` **already lost** `DEVICE`, and `DeviceMirror.tsx` **already dropped** the
  drawn status bar and nav bar. Criterion 37 below is therefore partly delivered.

`MaestroGateway` currently declares three members — `listDevices`, `deviceProperties`,
`appIdentity`. This spec adds the mirror to that interface, for the reason stated in *Decisions*.

### ❓ Open question: what happens to the Viewer path

`ViewerService`, `McpClient` and the `viewer:open` channel are built, tested, and carry a named
exception to `.context.md` §12 rule 11 plus amendments to §4.3.5 and §4.3.7. Once the panel fills
with our own mirror, that path buys one thing the mirror does not have yet: **interacting with the
device**, since this spec ships `control=false`.

Three options, and this is the product owner's call, not one to make in silence (§12.22):

1. **Keep it, demoted.** The mirror is the panel; the Viewer becomes a secondary "open in browser"
   action for interaction. Costs nothing to keep — it already works — but keeps the rule-11
   exception, the MCP client and the Maestro CLI prerequisite alive.
2. **Keep it until scrcpy's control socket lands**, then delete it. The control socket is already
   named as the obvious next spec in *Out of scope*.
3. **Delete it now.** Smaller surface, and `.context.md` §12 rule 11 goes back to being absolute —
   but it means re-amending four places in `.context.md` and throwing away working code.

This spec is written for **option 1 or 2** — it leaves `viewer:open` in place and demotes the
control. Choosing 3 changes only criterion 38's state list and deletes two modules.

Related and still unresolved: the **managed Maestro install** discussed alongside this reversal.
It is unaffected in kind — `maestro hierarchy` is still needed for the slow cadence, so the CLI
remains a prerequisite either way — but it is no longer urgent, because the picture no longer
depends on it.

### Files/modules this touches

Created — main:

```
src/main/
  maestro/
    ScrcpySource.ts         # scrcpy-server lifecycle: push, forward, app_process, socket
    scrcpy-protocol.ts      # PURE: incremental handshake + frame-header parser, no I/O
resources/
  scrcpy/
    scrcpy-server-3.3.4.jar # pinned, ours — never the user's brew copy
    LICENSE                 # Apache-2.0, from Genymobile/scrcpy
```

Created — renderer:

```
src/renderer/src/
  lib/h264.ts               # PURE: Annex-B split + SPS → VideoDecoderConfig codec string
  hooks/useMirrorStream.ts  # mirror:event → VideoDecoder → canvas. Mounted by the view.
```

Modified:

```
src/main/maestro/AdbBridge.ts               # + forward, push, and the shell that starts the server
src/main/maestro/MaestroGateway.ts          # + the mirror members
src/main/maestro/LocalGateway.ts            # implements them with ScrcpySource
src/main/services/device.service.ts         # + mirror sessions, disposed with the rest
src/main/ipc/device.ts                      # + the mirror channels
src/shared/ipc.ts                           # + mirror:start, mirror:stop, mirror:event
src/preload/index.ts                        # + one named function per new channel
src/main/index.ts                           # ScrcpySource into the LocalGateway it builds
src/renderer/src/lib/mirror-fit.ts          # device size becomes a parameter, not a constant
src/renderer/src/stores/device.store.ts     # + mirror status
src/renderer/src/views/DeviceMirror/*       # the canvas replaces the empty state
electron-builder.yml                        # + extraResources for resources/scrcpy
.context.md                                 # §5.5, §9.2, §10.1, §12.13 — see Decisions
```

`biome.json` is **not** modified, and `src/shared/config.ts` is **not** modified.

### Existing patterns/interfaces to follow

- `AGENTS.md` § Architecture — the data path, the main-process rules (composition root, thin IPC
  controllers, streamed long work, `dispose()`), the renderer import ladder, the IPC contract.
- `src/main/ipc/handle.ts` — every `invoke` channel goes through it; it already does the sender
  check, the Zod parse and the `Result` shaping. No handler re-implements any of that.
- `src/main/process/run.ts` — `run()` for one-shot adb calls, `spawnStreaming()` for the
  long-lived server child. Both exist; neither changes.
- `src/main/maestro/AdbBridge.ts` — the parsing conventions and the injected runner this spec
  extends rather than replaces.
- `src/main/maestro/McpClient.ts` — the closest existing model for an incremental byte-framing
  parser driven by captured bytes. `scrcpy-protocol.ts` is its sibling in shape, not in content.
- `src/renderer/src/lib/mirror-fit.ts` + its test — the shape a pure renderer module has here.

### Product & decision docs

- `.context.md` §4.4b and §12.13 — screenshot comes from the OS, not from Maestro. scrcpy is on
  the same side of that line: no JVM, no `maestro` binary in the picture path.
- `.context.md` §5.5 — the two-cadence model. This spec builds the fast cadence and **changes what
  the fast cadence is on Android**; the amendment is part of the work (see *Decisions*).
- `.context.md` §10.1 — the six rules that keep `RemoteGateway` cheap. Rules 2, 3, 4, 5 and 6 are
  load-bearing here and are called out individually in *Constraints*.
- `.context.md` §9.3 — Electron security. Nothing is relaxed; no CSP directive is added.
- `.context.md` §13 step 1 — the latency spike that was never run. This spec's verification is
  that spike for Android, with the numbers recorded.
- `.context.md` §4.5 — coupling to an internal without a contract. It rules out scraping Maestro's
  log; it does **not** rule out scrcpy, because we pin the jar. See *Decisions*.

### The scrcpy wire protocol

Verified against the installed `scrcpy-server` (v3.3.4) and the v3.3.4 source, not from memory.
These are the facts the parser is written against, and they are the most expensive thing in this
document to re-derive:

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
  the packet whose config flag is set.

**All of the above was confirmed end-to-end on hardware on 2026-08-04** — a Galaxy A07
(`SM-A075M`, Android 16), scrcpy-server 3.3.4, `max_size=1024`, encoder `c2.mtk.avc.encoder`:

```
dummy byte  : 0x00
device meta : 64 bytes -> "SM-A075M"
codec meta  : 12 bytes -> codec="h264" 464x1024
packet 0    : len=   31 config=1 key=0 pts=0us        00 00 00 01 67 …  -> SPS(4b), PPS(4b)
packet 1    : len=29744 config=0 key=1 pts=652021984203us  00 00 00 01 65 …  -> IDR(4b)
packet 2    : len=10270 config=0 key=0                00 00 00 01 41 …  -> non-IDR(4b)
```

Nothing in the framing is left assumed. The Annex-B question — the one thing this spec could not
settle without a phone — is settled: the config packet carries SPS then PPS with 4-byte start
codes, so the decoder is configured without a `description` and the `avcC` fallback is dead code
that never needs writing.

#### ⚠️ The 255-character `app_process` limit

**Samsung devices abort when the `app_process` command line exceeds ~255 characters.** This is not
a scrcpy bug; it is the device. scrcpy's author states it plainly in Genymobile/scrcpy#6900, and
it reproduced exactly here:

| Command line | Result |
|---|---|
| 320 chars — every flag of criterion 17 spelled out | `stack corruption detected (-fstack-protector)` / `Aborted`, after the codec header and before packet 0 |
| 165 chars — only what differs from the server's defaults, jar at `/data/local/tmp/s.jar` | streams normally |

The failure is vicious in shape: the socket connects, the dummy byte, the device meta and the
codec meta all arrive **correctly**, and only then does the server die. Every check a naive
implementation would make has already passed by the time it breaks, and the symptom looks like a
frame-parsing bug rather than a command-line-length bug. It cost this spike its first run and
would have cost the implementation far more.

The server's own defaults are what buy the headroom: `video=true`, `video_codec=h264`,
`send_dummy_byte`, `send_device_meta`, `send_codec_meta`, `send_frame_meta`, `cleanup=true` and
`log_level=info` are all defaults and must **not** be passed. Only `scid`, `audio=false`,
`control=false`, `tunnel_forward=true`, `max_size` and `max_fps` need to be.

### Tests

`vitest.config.ts` has both projects and 688 passing tests. The main project (`environment:
'node'`) gets the protocol parser, the bridge additions, the gateway and the service; the renderer
project (`jsdom`) gets the store, `lib/h264.ts` and the view. jsdom has **no** `VideoDecoder`,
which is why the decode *decisions* live in `lib/h264.ts` and the hook stays thin — `AGENTS.md`
§ Testing: if a behavior is hard to test without mounting, its logic is in the wrong layer.

`scrcpy-protocol.ts` and `lib/h264.ts` are this spec's `SelectorSynth`: pure, trap-dense, and
testable to exhaustion without a phone plugged in. They carry the strongest tests here.

---

## Acceptance criteria

### adb discovery and device list — **delivered**

Criteria 1–7 shipped with `device-identity-and-viewer.md` and are verified against hardware. They
are restated because the mirror depends on them, not because they are open work.

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

### App identity — **delivered**

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
    **`/data/local/tmp/s.jar`** on the device, and shall never read the scrcpy installation on the
    user's machine. The short device path is not cosmetic: it buys 12 characters against the limit
    in criterion 17a.
15. The system shall pass a client version argument identical to the pinned jar's version, from a
    single constant that also names the jar file.
16. The system shall allocate the forward port dynamically rather than hardcoding 27183, and
    shall scope the socket name with a per-session scid so two sessions can never collide.
17. The system shall start the server by passing **only the options that differ from the server's
    own defaults** — `scid`, `audio=false`, `control=false`, `tunnel_forward=true`, `max_size` and
    `max_fps` — and shall pass none of `video`, `video_codec`, `send_dummy_byte`,
    `send_device_meta`, `send_codec_meta`, `send_frame_meta`, `cleanup` or `log_level`, all of
    which already hold the value this spec wants.
17a. The system shall assemble that command line through a single function that **asserts its
    total length stays under 255 characters**, and a test shall pin that assertion against the
    real argument set. Exceeding it aborts the server on Samsung devices *after* the socket, the
    dummy byte, the device meta and the codec meta have all arrived correctly, so no runtime check
    downstream can catch it and the symptom impersonates a frame-parsing bug. Verified on hardware:
    320 characters aborts, 165 streams (see *The scrcpy wire protocol*).
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
23. The system shall stop every running session on `before-quit`, via `DeviceService.dispose()`,
    which is already registered in the `services` array of `src/main/index.ts`.
24. The system shall stop the sessions belonging to a renderer that reloads or closes, without
    waiting for `before-quit`.
25. When the device disconnects mid-session, the system shall emit a terminal session event with
    a distinct code and shall return the inspector to its disconnected state — not stall on the
    last frame.

### IPC

26. The system shall declare every new channel in `src/shared/ipc.ts` with a Zod schema per
    payload, and shall expose exactly one named function per channel in the preload — no
    `ipcRenderer`, no raw `invoke`, no logic in the bridge.
27. The system shall name the new channels `mirror:start` and `mirror:stop` for invokes, and
    `mirror:event` for the push, alongside the existing `device:list`, `device:app-info`,
    `viewer:open` and `device:changed`.
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
37. The system shall keep the bezel, the drop shadow and the fixed device palette — they are
    Conductor's chrome, not the phone's — and shall render the canvas where the empty state is
    today. The drawn status bar and nav bar are already gone. **This supersedes criteria 42 and 43
    of `aurora-layout-shell`, and criterion 25 of `device-identity-and-viewer`: the panel fills,
    so no control may describe the screen as appearing somewhere else.**
38. The system shall render, in place of the mirror, exactly one empty state per condition: adb
    missing, no device, device unauthorized, more than one device, app not installed, and mirror
    failed — each naming the next action. **This supersedes criterion 26 of
    `device-identity-and-viewer`**, whose eight states included two — maestro missing, viewer
    failed — that belong to a control the mirror demotes.
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
- **`biome.json` does not change, and neither does `run.ts`.** `spawnStreaming()` already exists
  and already satisfies `.context.md` §10.1's "todo spawn passa por um utilitário único". Adding a
  fourth entry to the `noRestrictedImports` override list would be the wrong fix.
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
  unchanged when Conductor's theme changes.
- **`CONFIG` gains nothing.** `ADB_PATH` already landed with the identity half.
- **Copy register.** English chrome, sentence case, no emoji. Anything the CLI prints stays
  verbatim in mono. Same rules as `aurora-layout-shell`.

## Out of scope

- **Controlling the device.** scrcpy's control socket — tap, swipe, key, text, clipboard — is what
  this spec unlocks and deliberately does not build. `control=false` for now. It is the obvious
  next spec, and the one that decides the Viewer's fate in the open question above.
- **iOS and the simulator.** `simctl`, `ScreenCapture`, and the second half of `.context.md`
  §4.4b. scrcpy is Android-only; the gateway interface is written so an iOS source slots in
  beside it, and nothing more.
- **Emulators as a target.** Not rejected, not special-cased, not verified. `adb devices` lists
  them and they will most likely work; this spec's verification is a physical phone over USB.
- **Wi-Fi adb, and more than one mirror at a time.** One session, one device, one cable.
- **`maestro hierarchy`, the snapshot, the hit-test, the selector.** `.context.md` §5.5's slow
  cadence and everything built on it, including `CliRunner`, `HierarchyParser` and `SelectorSynth`.
  `MaestroGateway` gains those members in the spec that needs them. **This is the spec that makes
  them possible again** — it is the surface they draw on — but it does not build them.
- **Removing the Viewer path.** See the open question above. This spec demotes it; deleting it is
  its own decision.
- **The managed Maestro install.** Discussed alongside this reversal and deliberately not folded
  in: the picture no longer depends on the Maestro CLI, so the install stops blocking the panel.
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

- **Why this reversal, in one line.** The Viewer is a web page in another application; the product
  is clicking the screen to author a test. Those are incompatible, and the second one is the
  product. The full reasoning is in the banner at the top, including the Maestro Studio finding
  that made the original decision look better than it was.
- **Why scrcpy rather than the `screencap` polling `.context.md` §5.5 specifies?** → The product
  owner's call, made explicitly against the alternative. `adb exec-out screencap -p` costs
  100–300 ms per frame, so the documented "fast cadence" tops out around 2–4 fps: enough to see
  *that* the app changed, not enough to watch it respond. scrcpy delivers ~30 fps at ~50–100 ms
  through a socket that is already there for adb, and its control channel is the natural next
  step. The cost is accepted and recorded: it is an internal, version-locked protocol without a
  stability contract — the same class of risk `.context.md` §4.5 warns about. Pinning our own jar
  is what converts that risk from "breaks on someone's machine" to "breaks when we deliberately
  upgrade", which is why §4.5 rules out scraping Maestro's log but does not rule this out.
- **`.context.md` must be amended in this change, not after it.** `AGENTS.md` is explicit that
  `.context.md` wins on conflict and gets fixed in the same change. Four places:
  §5.5's cadence table (Android's fast cadence becomes the scrcpy stream; `screencap` remains the
  still-capture and iOS path), §9.2's process diagram (`AdbBridge` and `ScrcpySource` under
  `LocalGateway`), §10.1 rule 1 (which names only `CliRunner` and `ScreenCapture` today), and
  §12.13 (screenshot still comes from the OS and not from Maestro — scrcpy does not change that
  claim, but it should say so). The §4.3.5 and §12 rule 11 amendments made for the Viewer stay as
  they are while the open question is unresolved.
- **Why is the mirror a `MaestroGateway` capability rather than its own service?** → Because
  `RemoteGateway` will have to serve it too. §9.2 already puts `ScreenCapture` under
  `LocalGateway` for exactly this reason: "where the device lives" is the gateway's secret. A
  standalone `MirrorService` calling adb would be leak #1 in §10.1's table on day one. The naming
  tension is acknowledged — the interface carries members that never touch Maestro — and is
  cheaper than the leak.
- **Why H.264 and not H.265 or AV1?** → `video_codec=h264` is the best-supported WebCodecs path in
  Chromium, and the Annex-B assumption below is H.264-specific. The other two would each need
  their own bitstream handling for no gain at 1024 px.
- **Why `max_size=1024` and `max_fps=30`?** → The inspector column is 250–300 CSS px wide; 1024
  leaves headroom for a wider window and for the future 1:1 inspect overlay without streaming a
  1080×2400 framebuffer no one sees. 30 fps halves the encode and decode cost against 60 with no
  perceptible loss for watching an app respond. Both are constants, both are cheap to raise.
- **Why poll `adb devices` instead of tracking?** → `adb track-devices` is the adb server's own
  smart-socket protocol, not a CLI subcommand — reaching it means speaking a second undocumented
  protocol for a feature worth one line of polling. Two seconds is imperceptible for plugging in
  a cable and costs ~15 ms of adb per tick. (Already shipped and confirmed in practice.)
- ~~(Assumed)~~ **Verified 2026-08-04: the payload is Annex-B, with SPS and PPS in the config
  packet.** The config packet arrived as `00 00 00 01 67 …` — SPS then PPS, 4-byte start codes — so
  the decoder is configured without a `description` and the `avcC` fallback this spec used to
  carry is deleted rather than kept as dead weight.
- ~~(Assumed)~~ **Verified 2026-08-04: `adb forward tcp:0` prints the allocated port on stdout.**
  It returned `54556`. The scan-upward-from-27183 fallback is dropped; the port is still never a
  hardcoded constant (criterion 16).
- **Why stay on scrcpy 3.3.4 when v4.1 exists?** → Because 3.3.4 is the version whose protocol
  facts above were read out of the jar *and* confirmed streaming on hardware, and it is the copy
  already on this machine. v4.1 (2026-07-12) may well be fine, but adopting it would invalidate
  every byte-level claim in this document without a second spike to re-earn them. The pin is
  cheap to move later — criterion 15 makes the version a single constant — and moving it is a
  deliberate act with a re-verification attached, which is exactly the property the pin exists to
  give (`.context.md` §4.5).
- **The orphaned server is not theoretical.** Killing the spike's client left an `app_process`
  alive on the device, surviving `pkill -f com.genymobile.scrcpy` and needing `kill -9` by pid.
  Criteria 22–24 are written against a failure that was observed, not imagined, and the manual
  verification checks for it explicitly.
- **Test bar.** Exhaustive unit tests for `scrcpy-protocol.ts` (chunk boundaries, the 62-bit PTS,
  both flag bits, truncated prefixes, oversized lengths) and `lib/h264.ts` (SPS → codec string,
  against real captured SPS bytes). Parser tests for the `AdbBridge` additions against captured
  output. Fake-driven tests for `LocalGateway` and `DeviceService`. RTL for the inspector's states,
  mocking only `window.conductor`. No snapshot tests, no test that requires a device.

## Verification

Automated, with no device attached — this is most of the suite, and it is deliberate:
`npm run lint`, `npm run typecheck`, `npm test` and `npm run build` pass, and the suite passes
under `--sequence.shuffle`. The protocol parser and `lib/h264.ts` are covered against synthetic
and captured bytes; the gateway, the service and the views against fakes.

Manual, with a physical Android phone over USB — **this is also `.context.md` §13 step 1, the
latency spike that was never run**, and its numbers get written back into `.context.md` §4.4. The
device used on 2026-08-04 was a Galaxy A07 (`SM-A075M`, Android 16, 720×1600 @ 300dpi):

1. Mirror comes up, moves at ~30 fps, and the measured glass-to-glass latency is recorded.
2. Unplug mid-session: the inspector returns to its disconnected state and does not stall on the
   last frame.
3. Quit with a session live, then check that no `scrcpy` process survives on the device
   (`adb shell ps -A | grep app_process`) and no forward survives on the host (`adb forward --list`).
   **This one has already failed once**, in the spike — expect to need `kill -9` by pid if the
   teardown of criterion 22 is wrong.
4. Reload the renderer (⌘R) with a session live and confirm main does not leak a session.
5. Measure, for the record: `adb exec-out screencap -p` round-trip, so §4.4's table stops being an
   estimate and the discarded alternative is quantified rather than assumed.
6. On a **non-Samsung** device, confirm the mirror still comes up — criterion 17a's budget is
   sized for the strictest case observed, and nothing else should depend on it.

**Already verified on 2026-08-04** against the Galaxy A07, and not repeated:

- The entire wire-protocol prefix, the frame-meta bit layout, Annex-B with SPS/PPS in the config
  packet, `adb forward tcp:0` returning its port, and the 255-character `app_process` limit in
  both directions (320 aborts, 165 streams). The captured bytes are transcribed in *The scrcpy
  wire protocol* and are the fixtures `scrcpy-protocol.ts`'s tests should be written against.
- Criteria 9–11 of the identity half: `com.samsung.android.calendar` reported as installed at
  `12.7.03.1`, `pidof` exiting non-zero with empty output read correctly as *not running*.

**Still outstanding, and not to be claimed as done:** the *unauthorized* state (criterion 4) was
never observed — the phone was already authorized before the spike, so the first-run screen every
new user meets remains untested. `com.vtex.pnp` across all four states likewise needs a device
where it is actually installed.

Not covered by any automated test: whether 30 fps at `max_size=1024` *looks* right in the 250 px
column, and whether the app identity line reads clearly. There is no design-system drawing for
that line — like `PRPanel` and `Doctor` before it, it is specified in words here and wants a
visual review.

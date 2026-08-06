# Device identity and Maestro Viewer

status: built, partly superseded
created: 2026-08-04
partly-superseded-by: specs/android-device-mirror.md

> **Built and shipped**, and verified against a physical Galaxy A07 on 2026-08-04: adb discovery,
> the device list, app identity, the MCP client and the Viewer path all work. What did not survive
> contact is the *premise*.
>
> The Viewer was accepted as the interactive mirror the product owner had used to author tests. It
> is not that. That mirror is **Maestro Studio, a separate desktop app** which the CLI no longer
> bundles; `open_maestro_viewer` returns a **URL to a web page**, so the screen renders in the
> person's browser and the inspector panel never fills. With the picture in another application,
> the §5.5 loop has no surface and no click to read.
>
> **Superseded by `android-device-mirror.md`:** criterion 25 (a control saying the screen appears
> in the browser) and criterion 26 (the eight-state list, two of which belong to that control).
> The panel fills with our own scrcpy mirror instead.
>
> **Still standing:** criteria 1–23 and 27–39. The adb and app-identity halves are untouched — no
> Maestro surface identifies an app — and the Viewer mechanics keep working.
>
> **Open (§12.22):** whether the Viewer path survives at all once the mirror lands, and whether it
> survives past scrcpy's control socket. See *❓ Open question* in `android-device-mirror.md`. Until
> that is answered, `ViewerService`, `McpClient`, the `viewer:open` channel and the `.context.md`
> §12 rule 11 exception all stay as they are.

## Goal

Two halves, with different owners.

**Ours:** identify what is plugged in. Which Android device, and whether the app under test —
`CONFIG.APP_ID` — is installed on it, which version, whether it is running, whether it is in the
foreground. All of it over `adb`, because nothing in Maestro's surface answers those questions.

**Theirs:** show the screen. Conductor opens **Maestro's own Viewer** for the connected device,
in the browser. We do not stream, decode or draw a single frame.

The Device inspector therefore stops pretending. Today it draws a fixture phone with a fake
status bar and the empty state `No device connected`; after this spec it shows what is really
connected, what app is on it, and a control that opens the live screen — in a browser tab, not
in the panel.

**This is a deliberate trade, made by the product owner with the alternative in hand.** The panel
keeps no picture of the device, so the hover overlay of `.context.md` §5.5 has no surface to draw
on. `specs/android-device-mirror.md` records what was given up and what it would cost to get back.

## Context

### What was verified about the Viewer

Checked against Maestro's own documentation and blog, and against `.context.md` §4.3.5, which was
verified from their source. Every one of these shapes the design:

- The Viewer is a **web app**, not a CLI surface. It is *"exposed via the `open_maestro_viewer`
  MCP tool"*, whose description is *"Returns the running Viewer URL"* — it hands back a URL.
- It is served by the running **`maestro mcp` process**, on `127.0.0.1`, and *"some por completo
  com `--no-viewer`"* (§4.3.5). No `maestro mcp`, no Viewer.
- **The port is not documented.** Nothing published names it, and it is not in `.context.md`.
- Maestro's MCP transport is **pure stdio** — `StdioServerTransport`, no port, no socket (§4.3.5).
  So the only supported way to ask for that URL is to speak MCP over the child's stdin/stdout.
- It supports a **physical Android device**, and lets the person interact with it — which is more
  than the superseded spec offered, where control was explicitly out of scope.
- It requires the Maestro CLI at **v2.6.0 or newer**, and `maestro` is **not installed on this
  machine**. It becomes a hard prerequisite of the Device inspector.

The consequence that drives the whole main-process design: **Conductor must become an MCP
client** — spawn `maestro mcp`, complete the JSON-RPC handshake, call one tool, read a URL. The
alternative, scraping the port out of the child's log output, is coupling to an internal with no
contract at all, which `.context.md` §4.5 rules out by name.

### Files/modules this touches

Created — main:

```
src/main/
  maestro/
    MaestroGateway.ts       # the interface — device capabilities only, in this spec
    LocalGateway.ts         # implements it with AdbBridge
    AdbBridge.ts            # every adb invocation: devices, getprop, wm, pm, pidof
    McpClient.ts            # ⚠️ JSON-RPC over stdio to `maestro mcp`. See Decisions.
  services/
    device.service.ts       # selection, app identity, the poll loop, dispose()
    viewer.service.ts       # owns the `maestro mcp` child and the Viewer URL, dispose()
  ipc/
    device.ts               # registerDeviceIpc(deps)
    viewer.ts               # registerViewerIpc(deps)
```

Created — renderer:

```
src/renderer/src/
  stores/device.store.ts    # devices, selection, app identity, viewer state
```

Modified:

```
src/shared/config.ts                        # + ADB_PATH, + MAESTRO_PATH (empty = auto-resolve)
src/shared/ipc.ts                           # + the device and viewer channels
src/preload/index.ts                        # + one named function per new channel
src/main/index.ts                           # constructs both services, registers, disposes
src/main/process/run.ts                     # + a streaming spawn, for the long-lived mcp child
src/renderer/src/views/DeviceMirror/*        # real device, real app identity, the Viewer control
src/renderer/src/fixtures/flows.ts          # the DEVICE fixture goes
.context.md                                 # §12 rule 11, §12 rule 10, §4.3.7 — see Decisions
```

`biome.json` is not modified, and `electron-builder.yml` is not modified — nothing is shipped
alongside the app.

### Existing patterns/interfaces to follow

- `AGENTS.md` § Architecture — composition root, thin IPC controllers, `dispose()` on anything
  holding a process, the renderer import ladder.
- `src/main/ipc/handle.ts` — already does the sender check, the Zod parse and the `Result`
  shaping. No handler re-implements any of it.
- `src/main/process/run.ts` — the only `execFile`, and the file that grows the streaming spawn.
- `src/main/window.ts` — `setWindowOpenHandler` denies by default and `will-navigate` is
  restricted. The Viewer URL therefore leaves through `shell.openExternal` from main, never
  through the renderer.
- `src/main/index.ts` — the `Service` array, empty since the scaffold. This spec fills it.

### Product & decision docs

- `.context.md` §4.3.5 — the Viewer HTTP surface and `--no-viewer`. This spec **stops passing
  that flag**, which is a deliberate reversal.
- `.context.md` §4.3.4 — the MCP registers ten tools unconditionally, Cloud ones included, and
  ships an `INSTRUCTIONS` block that teaches the Cloud flow. Read carefully: that risk is about
  *a model* being tempted. A programmatic client that calls exactly one tool by name is not
  exposed to it — see *Constraints*.
- `.context.md` §4.3.7 — `maestro mcp` is "not invoked by us"; its lifecycle belongs to Claude
  Code, outside the Gateway. This spec makes a second, separate `maestro mcp` ours. Both
  statements have to be reconciled in the doc.
- `.context.md` §12 rule 11 — "MCP só onde há um modelo na ponta. UI consome CLI crua." This spec
  breaks that rule head-on and must amend it.
- `.context.md` §12 rule 10 — every `maestro` process carries `MAESTRO_CLI_NO_ANALYTICS=1`. Still
  binding, and unaffected.
- `.context.md` §9.3 — nothing relaxed. No CSP change; `shell.openExternal` gets a validated URL.

### Tests

Both vitest projects, already configured. `AdbBridge` parsing and `McpClient` framing are the
trap-dense parts and carry the strongest tests — both are drivable from captured bytes with no
device and no `maestro` installed, which matters because neither is available here.

---

## Acceptance criteria

### adb discovery and device list

1. The system shall resolve the `adb` binary in this order: `CONFIG.ADB_PATH` when non-empty,
   then `$ANDROID_HOME/platform-tools/adb`, then `$ANDROID_SDK_ROOT/platform-tools/adb`, then
   `~/Library/Android/sdk/platform-tools/adb`, then `adb` on `PATH` — taking the first that
   exists and is executable.
2. When no `adb` resolves, the system shall report code `device/adb-not-found` and shall render
   an empty state naming what is missing, rather than an empty device list.
3. The system shall enumerate devices with `adb devices -l` and report, per device: the opaque
   id, the parsed `model:` when present, and the state `device` · `unauthorized` · `offline`.
4. The system shall report `unauthorized` as its own condition, distinct from "no device", so the
   person is told to accept the debugging prompt on the phone.
5. The system shall re-enumerate at most every 2 seconds and shall emit `device:changed` only
   when the list differs from the last one emitted.
6. When exactly one device is in state `device`, the system shall select it automatically. When
   more than one is, the system shall select none and render the list for the person to pick from.
7. The system shall read the selected device's model, Android release, physical size and density
   via `getprop` / `wm size` / `wm density`, treating any value it cannot parse as absent rather
   than substituting a default.

### App identity

8. The system shall identify the app under test by `CONFIG.APP_ID` only, and shall not contain
   that value as a literal anywhere outside `src/shared/config.ts` (`.context.md` §12.6).
9. The system shall report whether the app is installed by matching `CONFIG.APP_ID` **exactly**
   against the lines of `adb shell pm list packages <appId>` — never by substring, which that
   command's own filter would otherwise satisfy with a different package.
10. When the app is installed, the system shall report its `versionName`, parsed from
    `adb shell dumpsys package <appId>`; when the field is absent, it shall report `null`.
11. The system shall report whether the app is running from `adb shell pidof <appId>`, treating a
    non-zero exit with empty output as "not running" rather than as an error.
12. The system shall report foreground as `true`, `false`, or `null` when the device's `dumpsys`
    output carries no marker it recognises — never `false` by default ("`null` is not reported",
    consistent with `.context.md` §5.2).
13. The system shall render the app identity as one line — app id, version when known, state —
    distinguishing *not installed* from *installed, not running* from *running* from *foreground*.

### Opening the Viewer

14. The system shall resolve the `maestro` binary from `CONFIG.MAESTRO_PATH` when non-empty, then
    `PATH`, then `~/.maestro/bin/maestro`, and shall report code `viewer/maestro-not-found` with
    an empty state naming the prerequisite when none resolves.
15. The system shall start `maestro mcp` as a long-lived child through `run.ts`'s streaming spawn,
    with `MAESTRO_CLI_NO_ANALYTICS=1` in its environment (`.context.md` §12 rule 10) and
    **without** `--no-viewer`, since that flag is what removes the Viewer.
16. The system shall complete the MCP `initialize` handshake over the child's stdio, and shall
    frame JSON-RPC messages according to the transport rather than assuming one message per read.
17. The system shall call the `open_maestro_viewer` tool and take the Viewer URL from its result.
18. Before opening anything, the system shall parse the returned URL and require its scheme to be
    `http` or `https` and its host to be `127.0.0.1` or `localhost`, rejecting anything else with
    code `viewer/untrusted-url` (`.context.md` §9.3 — never pass unvalidated input to
    `shell.openExternal`).
19. The system shall open the validated URL with `shell.openExternal` from **main**; the renderer
    shall never navigate to it, embed it, or build any command (`.context.md` §9.3, §12.8).
20. The system shall run at most one `maestro mcp` child, reusing it across repeated opens, and
    shall serialise concurrent open requests onto that one child rather than spawning a second.
21. The system shall report, as distinct stable codes: `maestro` missing, the child failing to
    start, the handshake timing out, `open_maestro_viewer` absent from `tools/list` (a CLI older
    than v2.6.0), the call failing, and the URL failing validation.
22. The system shall kill the `maestro mcp` child in `ViewerService.dispose()`, registered in the
    `services` array of `src/main/index.ts`, so `before-quit` leaves no JVM behind
    (`AGENTS.md` § Architecture).
23. The system shall never call any Maestro MCP tool other than `open_maestro_viewer`, and shall
    never call `tools/list` for any purpose but confirming that one tool exists.

### The inspector

24. The system shall replace the drawn status bar, the drawn nav bar and the fixture phone body
    with the real device state. The bezel, the drop shadow and the fixed device palette stay —
    they are Conductor's chrome, not the phone's. **This supersedes criteria 42 and 43 of
    `aurora-layout-shell`.**
25. The system shall render a control labelled to say where the screen actually appears — that it
    opens in the browser, not in the panel — rather than implying the panel is about to fill.
26. The system shall render exactly one state per condition: adb missing, no device, device
    unauthorized, more than one device, app not installed, maestro missing, viewer failed, and
    ready — each naming the next action.
27. The system shall show the real device model or serial in the inspector header and drive the
    header status dot from the real device state.
28. The system shall keep the header's existing degradation order at every width, with the app
    identity line degrading before the serial.
29. The system shall disable the Viewer control while no device is selected, and shall show
    progress while the child starts, since the first `maestro mcp` start pays a JVM cold start.
30. The system shall select narrowly from `device.store.ts`; no component shall subscribe to the
    whole store.

### IPC and layering

31. The system shall declare every new channel in `src/shared/ipc.ts` with a Zod schema per
    payload, and shall expose exactly one named function per channel in the preload — no
    `ipcRenderer`, no raw `invoke`, no logic in the bridge.
32. The system shall name the channels `device:list`, `device:app-info`, `viewer:open` for
    invokes and `device:changed` for the push.
33. The system shall return every expected failure as `{ ok: false, error: { code, message } }`
    with a stable `code`, reserving throwing for bugs.
34. The subscription function the preload exposes shall return an unsubscribe function, and the
    hook that calls it shall call it in effect cleanup.
35. `AdbBridge` and `McpClient` shall be the only modules naming `adb` or `maestro`, and shall
    receive their process runner by constructor injection so a test can pass a fake.
36. `DeviceService` shall depend on the `MaestroGateway` interface, not on `LocalGateway`.
37. No module-level singleton: every class here shall be constructible in a test with fakes and
    shall be constructed in `src/main/index.ts` and nowhere else.
38. `ipc/device.ts` and `ipc/viewer.ts` shall validate, call one service method and shape the
    result — no business logic.
39. Renderer tests shall mock exactly one seam, `window.conductor`, and no store, hook or
    component.

---

## Constraints

- **`--no-viewer` is dropped, and only here.** Rule 10 of `.context.md` §12 still binds every
  other `maestro` process, and `MAESTRO_CLI_NO_ANALYTICS=1` still goes on this one. The flag we
  stop passing is the one that would delete the feature.
- **This `maestro mcp` is not the AI's.** `.context.md` §4.3.7 assigns the AI layer's MCP child to
  Claude Code, configured through `--mcp-config`. That stays true and untouched. This is a
  second, separate child that Conductor owns — which means §4.3.6's unverified device-contention
  risk now has a second way to bite, and the verification below tests for it.
- **The Cloud-tool risk of §4.3.4 does not transfer.** That section is about ten tools being
  *announced to a model*, plus an `INSTRUCTIONS` block that teaches the Cloud flow. A client that
  calls one tool by name reads no instructions and cannot be tempted. Criterion 23 pins that
  posture so it stays true by construction rather than by habit.
- **No shell string, ever.** `maestro mcp` is spawned with an argument array through `run.ts`
  (`.context.md` §12.19).
- **No CSP change, no `webviewTag`, no iframe.** The Viewer is a foreign origin and leaves through
  `shell.openExternal`. Embedding it was considered and rejected — see *Decisions*.
- **`CONFIG` gains two fields, no more.** `ADB_PATH` and `MAESTRO_PATH`, both defaulting to empty.
  Resolution is behavior and lives in the bridges, not in the constants module.
- **`fixtures/flows.ts` loses `DEVICE` and nothing else.** The other fixtures belong to specs not
  yet wired; deleting them here would blank regions this spec does not own.
- **Copy register.** English chrome, sentence case, no emoji. Anything the CLI prints stays
  verbatim in mono.

## Out of scope

- **Any picture of the device inside Conductor.** No frames, no canvas, no decode. That is the
  whole point of the choice this spec implements.
- **The hover overlay, hit-test, snapshot and selector synthesis** (`.context.md` §5.4–5.5). They
  need a mirror surface in the panel; there is none. This is the largest consequence of the
  decision and is called out again in *Decisions*.
- **`maestro hierarchy`, `CliRunner`, `HierarchyParser`, `SelectorSynth`, flow execution.**
  `MaestroGateway` gains those members in the spec that needs them.
- **iOS and simulators.** `simctl` and the second half of `.context.md` §4.4b.
- **The AI panel** (`.context.md` §6). `McpClient` here is not the AI's MCP path and must not grow
  into it.
- **`DoctorService` and the Doctor view** (§10). This spec surfaces its own two missing
  prerequisites — adb and maestro — as stable error codes, which is the seed the doctor reads.
- **Emulators and Wi-Fi adb.** Not rejected, not special-cased, not verified.
- **Launching the app under test.** The state is reported; starting it is a separate action.
- **E2E / Playwright.** Still forbidden at this stage by `AGENTS.md` § Testing.

## Decisions & assumptions

- **Why the Viewer at all?** → The product owner's call, made against a working alternative
  design. Maestro already solved the streaming problem and throws in device interaction; building
  a second mirror is duplicated effort. What it costs is stated plainly above and in the
  superseded spec, so the trade stays visible rather than becoming folklore.
- **Why does the UI become an MCP client, breaking §12 rule 11?** → Because there is no other
  supported way to reach the Viewer URL. The transport is stdio-only, the port is undocumented,
  and the URL is returned by a tool. The two alternatives are worse: scraping the port from the
  child's log is coupling to an internal with no contract at all (§4.5), and waiting for the AI
  panel to exist would make the Device inspector depend on `claude` being installed and on a
  model choosing to call a tool. **Rule 11 must be amended** to carve out exactly this: the UI may
  act as an MCP client when a capability exists *only* behind MCP, and then only for named tools.
  The amendment is part of this change, not a follow-up.
- **Why not iframe the Viewer into the panel?** → It is the only way to get their picture into our
  layout, and it costs the §9.3 CSP posture (`frame-src`, `default-src` widened to a localhost
  origin) that the scaffold was built around. It also would not restore what was lost: a
  cross-origin iframe cannot carry our hover overlay, so the §5.5 loop stays broken either way.
  Paying a security cost for no product gain is the easy half of this decision.
- **Why one long-lived `maestro mcp` child rather than one per open?** → The JVM cold start is
  `.context.md` §4.4's central problem. Paying it once per session, rather than once per click,
  is the difference between a control that feels instant and one that feels broken.
- **Why keep the adb half at all, now that Maestro is in the picture?** → Maestro's local MCP
  tools are `list_devices`, `take_screenshot`, `run`, `inspect_screen` and `cheat_sheet` (§4.3.4).
  **None of them identifies an app.** Installed, version, running, foreground — the original ask —
  exist only on adb. Routing device listing through MCP too would widen the rule-11 exception for
  no gain, when `.context.md` §4.3.7 already declares `listDevices()` a Gateway method.
- **`.context.md` amendments, in this change.** §12 rule 11 (the carve-out above), §12 rule 10
  (record that `--no-viewer` is dropped for the Viewer child specifically), §4.3.7 (a second
  `maestro mcp`, ours, with its lifecycle in `ViewerService`), and §4.3.5 (the Viewer HTTP surface
  is now consumed rather than closed — including the honest note that the "genuinely offline"
  claim no longer holds for this child).
- (Assumed) **`open_maestro_viewer` takes no required arguments and needs no device id.** Not
  documented either way. If it needs one, the opaque `deviceId` from the adb half is what gets
  passed — same data, one more field. **Verify on first run.**
- (Assumed) **The raw MCP tool name is `open_maestro_viewer`.** The `mcp__maestro__` prefix seen
  in §4.3.4 is Claude Code's client-side naming convention, not the wire name. `tools/list`
  settles it on first run, which is why criterion 21 makes "tool absent" its own error code
  rather than a crash.
- (Assumed) **The returned URL is `http://127.0.0.1:<port>/…`.** Criterion 18 validates rather
  than trusts, so a different shape fails closed instead of opening something unexpected.
- **Test bar.** Exhaustive unit tests for `AdbBridge` parsing (captured `adb` output including
  `unauthorized`, `offline`, empty, and a `pm list packages` result that substring-matches but is
  not the app) and for `McpClient` framing (split reads, interleaved messages, a response before
  the handshake completes, timeout). Fake-driven tests for both services, including URL
  validation rejecting a non-localhost host. RTL for the inspector's eight states, mocking only
  `window.conductor`. No test requires a device or a `maestro` install.

## Verification

Automated, with nothing attached — deliberately most of the suite: `npm run lint`,
`npm run typecheck`, `npm test` and `npm run build` pass, and the suite passes under
`--sequence.shuffle`.

Manual — and **blocked on two prerequisites that do not exist on this machine**: a physical
Android device over USB, and the Maestro CLI at v2.6.0 or newer. Both are on the product owner.

1. Confirm the *unauthorized* state renders correctly **before** accepting the RSA prompt — it is
   every first-time user's first screen.
2. `com.vtex.pnp` reported correctly across all four states, including on a device where it is
   not installed.
3. `tools/list` settles the two naming assumptions above; record the real tool name and signature
   in this spec.
4. The Viewer opens, shows the physical Android device, and is interactive. Record the cold-start
   time of the first open — it is the number criterion 29's progress state exists for.
5. **`.context.md` §4.3.6, finally under test.** With Conductor's `maestro mcp` alive, run
   `maestro hierarchy` against the same device and see whether they contend. This spec makes that
   risk live, so it stops being a spike item and becomes a release check.
6. Quit with the Viewer open and confirm no `maestro` JVM survives (`ps` for the child).
7. Confirm no second `maestro mcp` is spawned by repeated opens.

Not covered by any automated test: whether the inspector reads honestly now that the panel never
fills. The empty state must not look like a mirror that failed to load — the screen is somewhere
else on purpose, and the copy is the only thing that says so.

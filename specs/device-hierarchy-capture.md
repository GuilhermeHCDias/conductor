# Device hierarchy capture

status: done
created: 2026-08-04

## Goal

Give `MaestroGateway` the two remaining ways to read what is actually on the device's screen: the
view hierarchy (`hierarchy`) and a frozen picture (`screenshot`). Today the Gateway only knows what
device is plugged in and what app is on it (`device-identity-and-viewer`) and can stream its pixels
(`android-device-mirror`) — it cannot yet say what UI elements exist, where they are, or capture a
single still frame. This is `.context.md` §13 step 3, and it matters because it is the ground floor
for everything §5.4–5.5 describe: the snapshot, scale calibration and hover hit-test cannot exist
until the Gateway can hand them a parsed hierarchy and a screenshot to calibrate against. This spec
stops at the Gateway boundary — assembling those two into a snapshot, calibrating scale, and
hit-testing are the next spec's job (§13 step 4), not this one.

## Context

- **Files this touches:**
  - `src/main/maestro/MaestroGateway.ts` — grows `hierarchy(deviceId): Promise<TreeNode>` and
    `screenshot(deviceId): Promise<Buffer>`.
  - `src/main/maestro/LocalGateway.ts` — implements both by delegating.
  - `src/main/maestro/HierarchyParser.ts` — **new**, pure. Parses the MCP `inspect_screen` payload
    (see *The real payload* below) into an internal tree model.
  - `src/main/maestro/ScreenCapture.ts` — **new**. `adb exec-out screencap -p`, Android only,
    returning raw PNG bytes. Named and placed per `.context.md` §9.2's process diagram, which draws
    it as its own module beside `AdbBridge` and `ScrcpySource` — separate from `AdbBridge`
    specifically because a later iOS spec gives it a second implementation (`simctl`) `AdbBridge`
    structurally cannot serve.
  - `src/main/process/run.ts` — grows a binary-safe run variant (see *A gap this spec has to close*
    below); `ScreenCapture` uses it, never the existing text-mode `run()`.
  - `src/main/services/viewer.service.ts` — **renamed and repurposed**, not deleted (see
    *Decisions*). Drops `open()`, `VIEWER_TOOL`, `trustedUrl`, the `openExternal` dependency; gains
    a method that calls `inspect_screen`.
  - `src/main/maestro/McpClient.ts` — unchanged; already generic (`initialize`, `listTools`,
    `callTool`), which is what makes the rename above possible without touching this file.
  - `src/main/ipc/viewer.ts` — **deleted**, along with its registration in `src/main/index.ts` and
    the `viewer:open` entries in `src/shared/ipc.ts`, `src/preload/index.ts`,
    `src/preload/index.d.ts`.
  - `src/renderer/src/views/DeviceMirror/DeviceMirror.tsx` — the footer's "Open in Maestro Viewer"
    button and its note are removed.
  - `src/renderer/src/stores/device.store.ts` — `viewerOpening`, `viewerError`, `openViewer` are
    removed; nothing else in the store depends on them.
  - `src/shared/config.ts`, `CONFIG.MAESTRO_PATH` — unchanged, still the override the repurposed
    service resolves against.

- **Existing patterns to follow:**
  - `AdbBridge.ts` is the shape every future device-facing module in this codebase follows:
    constructor-injected `run`/`spawn`, a memoized `resolve()`, typed errors carrying a stable
    `ErrorCode`, parsing kept in small free functions next to the class. `ScreenCapture` follows it.
  - `viewer.service.ts`'s existing shape — one child spawned lazily on first use and reused until it
    dies, `dispose()` killing it on quit, a `McpSession` interface already decoupled from
    "Viewer" at the type level — is almost exactly what this spec needs; it is why *repurposing*
    beats building a second, parallel MCP-session owner from scratch.
  - `HierarchyParser` and `SelectorSynth` are named throughout `.context.md` and `AGENTS.md` as the
    project's highest-trap-density modules and the ones that carry its strongest unit tests. This
    spec is where the first of those two gets built, and the same bar applies: driven from real
    captured bytes (see below), not assumed shapes.

- **The real payload — captured against the connected hardware while scoping this spec, not
  assumed.** `maestro mcp --no-viewer`'s `inspect_screen` tool, called with `{"device_id":
  "R9QYC01EMXL"}` (snake_case — confirmed by a rejected call with `deviceId` first), returns:

  ```json
  {
    "ui_schema": {
      "platform": "android",
      "abbreviations": {
        "b": "bounds", "txt": "text", "rid": "resource-id", "a11y": "content-desc",
        "hint": "hintText", "cls": "class", "scroll": "scrollable", "c": "children"
      },
      "defaults": {
        "enabled": true, "clickable": false, "focused": false, "selected": false,
        "checked": false, "scrollable": false,
        "txt": "", "hint": "", "rid": "", "a11y": "", "cls": ""
      }
    },
    "elements": [ /* recursive nodes, each shaped like: */
      { "b": "[194,86][528,280]", "cls": "android.widget.FrameLayout", "clickable": true,
        "c": [ /* … */ ] }
    ]
  }
  ```

  Confirmed from this capture (11.2 KB, one screen of the Samsung launcher, saved during scoping):
  the abbreviation table matches `.context.md` §5.2's documented set exactly; `bounds` is the same
  `"[x1,y1][x2,y2]"` string the raw CLI format uses; a field absent from an element means it equals
  the value `defaults` states for it — **not** "unknown". That last point is the one genuinely new
  fact this capture settles, and it drives criterion 9 below.

- **A gap this spec has to close.** `src/main/process/run.ts`'s `run()` always decodes stdout as
  UTF-8 (`encoding: 'utf8'`, hardcoded), and `spawnStreaming()`'s `StreamingProcess.onStdout` is
  typed `(chunk: string) => void` for the same reason — both are correct for every existing caller
  (`adb devices`, `getprop`, JSON-RPC over stdio) and both would **corrupt** a PNG. `.context.md`
  §10.1 rule 2 requires the screenshot cross every boundary as bytes; getting real bytes out of
  `adb exec-out screencap -p` needs a binary-safe sibling in `run.ts`, not a workaround in
  `ScreenCapture` — process creation stays confined to the files `noRestrictedImports` already
  allows (`AGENTS.md` § Code style), and `run.ts` is one of them.

- **Product & decision docs:** `.context.md` §13 step 3 (this spec's mandate), §5.2 (the raw
  format's traps — largely superseded here by the compact format's own, different traps, see
  *Decisions*), §4.3.7 (why the Gateway looks the way it does), §10.1 rule 13 (screenshot is never
  Maestro's, CLI or MCP — `ScreenCapture` stays `adb`-only for exactly this reason).

- **Tests:** Vitest, `main` project. `HierarchyParser` gets `h264.test.ts`/`scrcpy-protocol.test.ts`
  -grade unit tests, driven from the captured payload above (kept as a fixture) plus hand-built
  edge cases (every abbreviation, every default, nested `c`, an element with none of the optional
  fields). `ScreenCapture` is tested with a fake binary-safe runner, no real `adb`. The repurposed
  service is tested the way `viewer.service.test.ts` already tests `ViewerService` — fakes for the
  spawned child and the MCP session, nothing installed. `LocalGateway.test.ts` grows cases for the
  two new delegations. No IPC-channel-level test is needed because this spec adds none — see
  *Decisions*.

## Acceptance criteria

### MaestroGateway

1. ✅ The system shall add `hierarchy(deviceId: string): Promise<TreeNode>` to `MaestroGateway`,
   implemented by `LocalGateway` via the repurposed MCP session service.
2. ✅ The system shall add `screenshot(deviceId: string): Promise<Buffer>` to `MaestroGateway`,
   implemented by `LocalGateway` via `ScreenCapture`.
3. ✅ Neither new method shall be reachable through an IPC channel in this spec — see *Decisions*.

### HierarchyParser

4. ✅ The system shall parse `inspect_screen`'s response into a tree of internal nodes, each carrying
   bounds, class, text, resource id, content description, hint text, scrollable/clickable/enabled/
   focused/selected/checked, and children.
5. ✅ When a boolean or string field is absent from a captured element, the system shall resolve it to
   the value the response's own `ui_schema.defaults` states for that field, never to `null` and
   never by assuming `false`/empty independent of what the server actually declared as its default.
6. ✅ When a string field resolves to the empty string via `ui_schema.defaults`, the system shall
   normalize it to `null` in the parser's output, so "not reported" has exactly one representation
   in the internal model regardless of source format (matching `.context.md` §5.2's existing rule
   for the raw CLI format, which this spec's output must stay consistent with even though its input
   format differs).
7. ✅ The system shall parse `bounds` from its `"[x1,y1][x2,y2]"` string form into structured numeric
   bounds, using the same parsing this codebase already trusts for the identical string format
   elsewhere (do not write a second, divergent bounds parser).
8. ✅ The system shall translate every abbreviated key the response's own `ui_schema.abbreviations`
   declares, rather than a hardcoded copy of today's table — a future server version that adds or
   renames an abbreviation is read correctly, not silently mis-mapped.
9. ✅ The system shall recurse through `children` (`c`) to arbitrary depth, producing one internal node
   per element including the root.
10. ✅ If `inspect_screen`'s response does not parse as the documented shape (missing `ui_schema`,
    missing `elements`, a field of the wrong type), then the system shall reject with a stable error
    code rather than return a partial or best-guess tree.
11. ✅ `HierarchyParser` shall be pure — no I/O, no Electron import, callable with nothing but the
    response text, per `AGENTS.md`'s architecture rule for this module.

### ScreenCapture

12. ✅ The system shall capture a screenshot via `adb exec-out screencap -p`, returning the PNG bytes
    exactly as the device produced them.
13. ✅ The system shall never decode, re-encode, or otherwise transform the captured bytes.
14. ✅ `ScreenCapture` shall be the only module besides `AdbBridge`/`ScrcpySource` that names `adb`, and
    shall create no process directly — it calls the binary-safe runner `run.ts` grows for this spec,
    the same way `AdbBridge` calls the existing text-mode one.
15. ✅ If `adb` is not resolved, or the capture command fails, then the system shall reject with a
    stable error code distinct from `HierarchyParser`'s and `MaestroGateway`'s other failure codes.
16. ✅ iOS/`simctl` capture is explicitly not implemented by this spec (see *Out of scope*); the
    module's shape must not preclude adding it later.

### The MCP session (repurposing `ViewerService`)

17. ✅ The system shall rename `ViewerService` to reflect its new, broader purpose (owning the one
    persistent `maestro mcp` child this app talks to) and add a method that calls `inspect_screen`
    with `{ device_id: deviceId }`, returning the tool's raw text to `HierarchyParser`.
18. ✅ The system shall spawn the child with `--no-viewer` (restoring `.context.md` §12 rule 10's
    normal case), since nothing in this app opens a viewer URL any more.
19. ✅ The system shall keep the one-child-per-session behavior: a first call spawns and hand shakes
    the child; every subsequent call, from `hierarchy()` or otherwise, reuses it while it is alive.
20. ✅ The system shall keep killing the child on `dispose()` / `before-quit` — no JVM survives quit,
    unchanged from today's guarantee.
21. ✅ The system shall remove `open()`, `VIEWER_TOOL`, `trustedUrl`, and the `openExternal`
    dependency — nothing in this app calls `open_maestro_viewer` after this spec.
22. ✅ The system shall rename the error codes that named "viewer" specifically for a purpose this
    service no longer serves (`viewer/start-failed`, `viewer/handshake-timeout`,
    `viewer/tool-missing`, `viewer/call-failed`) to names that describe the MCP session generally,
    and shall remove `viewer/untrusted-url` entirely — there is no URL to trust once nothing opens
    one.

### Removing the Viewer control

23. ✅ The system shall remove the "Open in Maestro Viewer" footer button and its accompanying note
    from `DeviceMirror`.
24. ✅ The system shall remove the `viewer:open` channel, its IPC handler, its preload binding, and its
    `ConductorApi` method — no surface of the old feature is left reachable from the renderer.
25. ✅ The system shall remove `viewerOpening` and `viewerError` from `device.store.ts`, and the
    `openViewer` action, along with any now-dead branch of `DeviceMirror`'s state copy that existed
    only to report a Viewer failure.

## Constraints

- No behavior of the mirror (video) path changes. This spec is additive to `MaestroGateway` and
  subtractive only on the Viewer-button surface named above.
- The captured-payload fixture (*Context*, "The real payload") is real data from this machine's
  hardware and pinned CLI version; treat it as ground truth for the parser's happy path, and derive
  edge cases from it rather than inventing a hypothetical shape.
- `HierarchyParser` and `ScreenCapture` must be constructible and testable with no `adb`, no
  `maestro`, and no device attached, per this codebase's stated testing architecture.

## Out of scope

- **The snapshot** (`{ screenshot, hierarchy, scale, deviceInfo }` captured together), **scale
  calibration**, and **hover hit-test**. `.context.md` §13 step 4, not step 3 — this spec hands the
  Gateway the two raw capabilities; assembling and using them together is the next spec.
- **Selector synthesis.** §13 step 5, downstream of hit-test.
- **`CliRunner`, and any call to the raw `maestro` binary.** Nothing in this spec's scope needs it:
  `hierarchy` moved to MCP (see the sibling `scrcpy-control-socket.md`'s *Decisions* for the
  measured reason — ~271ms steady-state via `inspect_screen` against ~3.83s for the raw CLI on this
  hardware), and `screenshot` was never going to go through Maestro at all (`.context.md` §10.1 rule
  13). `CliRunner` is deferred to whichever future spec is the first to actually call `maestro
  test`, `maestro check-syntax`, or `maestro start-device`.
- **`runFlow`, `checkSyntax`, `startDevice`.** `.context.md` §13 step 6 territory (the editor and
  execution), not this one.
- **iOS / `simctl`.** Named in *Context* as a reason `ScreenCapture` is its own module, not built
  here.
- **An IPC channel for `hierarchy`/`screenshot`.** See *Decisions* — there is no renderer consumer
  yet, and one arrives with the snapshot spec.
- **`DoctorService`, the Doctor view, and any automated Maestro install.** Named in the same
  scoping conversation as this spec (the engineer wants Conductor to install the Maestro CLI itself
  on first launch, silently, with no shell-profile edits) but deliberately kept out: it is a
  different session's worth of work, with its own UI (a first-run blocking setup flow plus an
  ongoing diagnostic panel) and no code in common with hierarchy parsing. Tracked as a separate,
  not-yet-written spec.
- **Reinstalling the on-device driver**, or any UI for it. Out of scope until something demonstrates
  the driver going stale matters at this layer.

## Decisions & assumptions

- **Hierarchy's source is `maestro mcp` / `inspect_screen`, not the raw CLI's `maestro hierarchy` —
  a reversal of `.context.md` §4.3.2's original default, made deliberately and with numbers.**
  Measured on this hardware (Galaxy A07, `com.vtex.pnp`, 2026-08-04): `maestro hierarchy
  --no-reinstall-driver` costs ~3.83s in steady state (5 calls, 3.74–3.96s, first-ever call 6.62s);
  `inspect_screen` on an already-initialized `maestro mcp` session costs ~250–300ms in steady state
  (two independent runs, 210–316ms and 185–304ms) — roughly **14× faster**. `.context.md` §4.3.8
  names ~4s as the threshold past which a persistent session is worth more than the raw tree; 3.83s
  sits inside that margin but with none to spare, and the MCP number was measured, not assumed.
  This costs the two things §4.3.2 protected — the compact format is lossy (mitigated by criteria
  5–8 above, which parse it faithfully rather than pretending it is the raw format) and an MCP
  tool's schema carries no version contract the way a released CLI subcommand does (accepted; the
  service's own error handling is what absorbs a future schema change, same as any other external
  dependency this app already treats that way). This was the engineer's explicit call after seeing
  both numbers, not the default this spec would have shipped with otherwise.
- **`ViewerService` is renamed and repurposed, not deleted, and its button's removal is decided
  here rather than in `scrcpy-control-socket`.** The control-socket spec was originally going to
  own "what happens to the Viewer button," per the mirror spec's own framing of it as "the spec
  that decides the Viewer's fate." The MCP decision above changed that: once hierarchy needs a
  live `maestro mcp` child, that child's lifecycle, its rename, and what survives on it are one
  coherent unit of work, and splitting "remove the button" into the other (parallel, independently
  implemented) spec would have had it deleting a file this spec depends on. The two specs were
  adjusted at scoping time so only one of them touches `viewer.service.ts`.
- **A confirmed, now-moot risk, recorded for whoever writes the future flow-execution spec.**
  While scoping this spec, a live `maestro mcp` session (holding a real `inspect_screen`-derived
  device session) was raced against three concurrent `maestro hierarchy` CLI calls on this
  hardware. None of the three errored, timed out, or was reported as failed — but their line counts
  were 2534, 1502 and 1982, against a clean, interference-free baseline of exactly 2677 lines on
  every one of six repeated calls. The two *do* contend, and the failure mode is worse than
  `.context.md` §4.3.6 anticipated ("timeout, sessão derrubada, hierarchy vazia"): silently
  incomplete data with a reported success. This spec makes the risk moot for itself — hierarchy no
  longer goes through the raw CLI at all — but `CliRunner`'s eventual owner (`runFlow`/
  `checkSyntax`, §13 step 6) must not assume a `maestro mcp` child and a raw `maestro` invocation
  are safe to run at the same time just because neither one crashes.
- **No IPC channel for `hierarchy`/`screenshot` in this spec.** Both new Gateway methods stay
  main-process-only, verified by Vitest against `LocalGateway` directly — there is no renderer
  code to call them yet, and adding a channel with zero callers is exactly the kind of ahead-of-need
  surface this codebase avoids elsewhere (`AGENTS.md`: no abstraction beyond what the task
  requires). The snapshot spec (§13 step 4) is what first needs this data in the renderer, and it
  is where the channel(s) belong.

### Settled during implementation

- **`TreeNode` and `Bounds` live in `src/shared/types.ts`, a file this spec creates.** `AGENTS.md`'s
  Layout names that file and names `TreeNode` as its first inhabitant, so this satisfies an existing
  contract rather than inventing a location. It is in `shared/` rather than `main/` because §5.5's
  hover hit-test runs *in the renderer* against this exact shape; nothing imports it from there yet.
- **`parseBounds` is its own module, `src/main/maestro/bounds.ts`.** Criterion 7 said not to write a
  *second* bounds parser — there was no first one, so this is it. It is separate from
  `HierarchyParser` rather than exported from it so the raw-CLI parser, if one is ever written, can
  import the parser without importing the compact-format one. `HierarchyParser.test.ts` asserts
  structurally that the parser module contains no bounds regex of its own.
- **Two capture failure codes, not one.** Criterion 15 names two conditions in one sentence; they get
  the split `AdbBridge` already draws, because they are two different fixes: an unresolved `adb`
  reuses `device/adb-not-found` (the prerequisite the doctor already knows how to explain), and a
  capture that ran and failed gets the new `capture/failed`. Both are distinct from
  `hierarchy/parse-failed`, which is what the criterion required.
- **`viewer/maestro-not-found` was renamed too, beyond criterion 22's literal list.** The criterion
  named four codes and gave the reason — a `viewer/` prefix on a service that no longer serves one.
  That reason covers this fifth code identically, and leaving one behind would have been a wart with
  no defender. Every code the service can now produce is `mcp/*`, asserted in `ipc.test.ts`.
- **`MaestroMcpService.inspectScreen` throws typed errors rather than returning a `Result`.**
  `ViewerService.open()` returned one because an IPC handler consumed it; criterion 3 removes that
  handler, and the codebase's normal main-layer path is `AdbBridge`'s — throw an error carrying a
  stable `code`, which `DeviceService.failure()` already converts at the boundary. When the snapshot
  spec adds a channel, that conversion is the whole of the work.
- **A payload with zero or several root elements is rejected, not wrapped.** `hierarchy()` answers
  with one `TreeNode`. Synthesising a parent the device never reported would put a fabricated node
  into the hit-test, which is the class of bug §5.1 calls the worst failure mode this product has.
- **`ScreenCapture` was removed from `biome.json`'s `noRestrictedImports` exemption list.** §10.1's
  own amendment (from `android-device-mirror`) established that a module receiving its runner by
  constructor injection does not create processes and does not need the exception — which is why
  `AdbBridge` and `ScrcpySource` are not on that list. `ScreenCapture` is now the third such module,
  so criterion 14's "shall create no process directly" is enforced by the linter instead of by
  discipline. `ScreenCapture.test.ts` asserts the exemption is gone.
- **The captured fixture is excluded from Biome's formatter** (`biome.json` → `files.includes`), so
  `inspect-screen.capture.json` stays byte-identical to what the server actually sent. A
  pretty-printed capture is still valid input, but it is no longer *the* capture.

### Verified on the hardware, after implementation

Re-run end to end against the same Galaxy A07 (`R9QYC01EMXL`) on 2026-08-04, through the real
modules rather than through fakes:

- **`ScreenCapture` produced a valid 806,388-byte PNG at 720×1600** — signature `89 50 4E 47`
  intact, `IEND` trailer present. The binary-safe runner is doing its job; the same bytes through
  `run()` are corrupted at byte one.
- **`inspect_screen` cost 5,959 ms cold and 298 ms warm**, both parsing to the same 110 nodes. That
  is the ~20× the session buys, and it confirms the measured numbers this spec was scoped on.
- **⚠️ For the snapshot spec (§13 step 4): the hierarchy root has no `bounds` at all.** §5.2's scale
  calibration is written as `screenshotWidthPx / rootNodeBoundsWidth`, and on this device that
  divides by `null`. The anchor exists one level down — the root's second child reports
  `[0,0][720,1600]`, matching the screenshot exactly — so calibration must find the widest node with
  bounds rather than assume the root carries them. Confirmed on live hardware, not inferred.

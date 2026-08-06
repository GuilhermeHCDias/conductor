# Flow run execution & live logs

status: done
created: 2026-08-05

## Goal

The Run button finally runs. Clicking **Run** executes the open flow on the selected device
through a raw `maestro test` invocation — the first `CliRunner` code in the project — and the
Run tab shows the execution live: the existing step list drives its `StatusDot`s from parsed
progress, and the raw Maestro log streams beneath it. **Stop** cancels a running flow. This is
the execution half of `.context.md` §13 step 6, closing the product loop the command menu
opened: the user writes the test by using the app, then watches it run.

## Context

- **Files this touches (main):**
  - `src/main/maestro/CliRunner.ts` — **new**. The raw-CLI door §9.2 pins to this exact path:
    the only Maestro-spawning module besides the MCP child. Spawns via `spawnStreaming` from
    `process/run.ts`, always with `--no-reinstall-driver` and `MAESTRO_CLI_NO_ANALYTICS=1`
    (§4.4a/c, §12.10), resolving the binary from `CONFIG.MAESTRO_PATH` (empty = PATH).
  - `src/main/maestro/RunOutputParser.ts` — **new, pure**. Turns the CLI's non-TTY sequential
    output lines into step events, best-effort; no I/O, fixture-driven tests from real
    captured output.
  - `src/main/maestro/MaestroGateway.ts` / `LocalGateway.ts` — grow `runFlow` per §4.3.7
    ("the Gateway grows per spec"; the doc comment says it arrives with the spec that needs
    it — this one). Remote-safe: `deviceId` opaque, progress via handlers/async iteration,
    cancellation explicit.
  - `src/main/services/run.service.ts` — **new**, `RunService`. Owns the run lifecycle:
    materializes the in-memory flow to a temp file, starts `runFlow`, fans events to the
    window, enforces the MCP/CLI mutual exclusion, implements `dispose()`.
  - `src/main/services/snapshot.service.ts` — grows the suspend/defer behavior during runs.
  - `src/main/ipc/run.ts` — **new**, `registerRunIpc`. `run:start`, `run:cancel` via the
    existing `handle` wrapper; `run:event` push.
  - `src/main/index.ts` — construct + register; dispose kills any live run child.
  - `src/shared/ipc.ts` — the three channels, Zod schemas, new stable error codes.
  - `src/shared/types.ts` — `RunEvent` (named as planned in AGENTS.md) and the run status
    vocabulary shared with the renderer.
- **Files this touches (renderer):**
  - `src/renderer/src/stores/run.store.ts` — **new**. `running`, `runId`, `steps`, `logLines`,
    final result; its actions are the only callers of `window.conductor.startRun`/`cancelRun`.
  - `src/renderer/src/hooks/useRunEvents.ts` — **new**. Subscribes `onRunEvent`, writes into
    the store, unsubscribes on cleanup (app-wide, mounted from `App.tsx`).
  - `src/renderer/src/views/Toolbar/Toolbar.tsx` — the Run/Stop button gets its `onClick`;
    disabled state while no device or no flow content.
  - `src/renderer/src/views/RunPanel/RunPanel.tsx` — steps from `run.store` instead of
    `ui.store` fixtures, plus the new streaming log region.
  - `src/renderer/src/App.tsx` — the `run-progress` bar reflects the real run, no longer
    `FLOW_YAML`-denominated fixtures.
  - `src/preload/index.ts`, `index.d.ts` — three new named functions.
- **Existing patterns to follow:** `mirror:start`/`mirror:event`/`mirror:stop` is the exact
  start-id/push-events/cancel shape AGENTS.md mandates for `run:*`; `handle.ts` for
  senderFrame + Zod + `Result`; `spawnStreaming`'s `ExitReason` for exit/kill semantics;
  `MaestroMcpService`'s dispose discipline; `device.store`'s narrow selectors.
- **Product & decision docs:** `.context.md` §4.2 (CLI table), §4.3.2 (MCP/CLI contention —
  the load-bearing warning), §4.3.7 (`runFlow` signature), §4.4a/c (flags + env), §5.5
  (recapture when "a command executes or the flow ends"), §8.2 (atomic write, `maestro test`
  may be reading the file), §9.2 (`CliRunner` only here; RunPanel = "execução passo a passo,
  logs"), §12 rules 1a/1b/10; AGENTS.md "Long work is streamed, never awaited in a handler".
- **Design & conventions:** the DS `studio/RunPanel` component and the Aurora kit's run
  states (`RunStep`, `StatusDot` `pass|fail|running`, `RUN_STATUS_LINE`); `play.svg` /
  `circle-stop.svg` already on the Toolbar button; log text in the DS mono treatment.
- **Tests:** Vitest, both projects. `RunOutputParser` is this spec's strongest suite —
  fixture-driven from real `maestro test` output captured on the reference device (happy run,
  failing step, syntax error, ANSI-free non-TTY form). `RunService` with a fake Gateway
  (ordering, cancel, temp-file lifecycle, MCP exclusion). IPC per `handle.test.ts`.
  Renderer: `run.store` unit tests; RTL for RunPanel (steps render, logs append, empty
  state) and Toolbar (Run↔Stop, disabled), mocking only `window.conductor`.

## Acceptance criteria

### Starting a run (main)

1. When `run:start` is invoked with a device id and the flow's YAML text, the system shall
   write the YAML to a temp file (in the app's user-data area, atomic write), start
   `maestro test` on it through `MaestroGateway.runFlow`, and answer immediately with a fresh
   `runId` — never awaiting completion in the handler.
2. The system shall spawn exactly `maestro --device <id> test <tempfile>` with
   `--no-reinstall-driver` and env `MAESTRO_CLI_NO_ANALYTICS=1`, via `CliRunner` — the only
   new module that names the raw CLI — using `spawnStreaming` from `process/run.ts`.
3. If the maestro binary cannot be resolved (CONFIG.MAESTRO_PATH empty and not on PATH), then
   `run:start` shall answer `ok: false` with a stable code distinct from a mid-run failure.
4. If a run is already active, then `run:start` shall be refused with a stable code — one run
   at a time, per window.
5. The temp file shall be deleted when the run ends (any outcome); a leftover from a crash
   must not break the next run.

### Progress events

6. While the run is alive, the system shall push `run:event` events carrying: run started,
   step started / step passed / step failed (with the step's label as Maestro reports it),
   raw log lines (stdout and stderr, in order), and a terminal event with the outcome
   `passed | failed | canceled | error` — every event tagged with the `runId`.
7. The terminal outcome shall derive from the process exit (exit code / kill), never from
   parsing alone; parsed step events are best-effort progress decoration on top.
8. `RunOutputParser` shall be pure and fixture-tested against real captured output; a line it
   does not recognize shall pass through as a plain log line, never crash the run or stall
   the stream.

### Cancellation

9. When `run:cancel` is invoked with the active `runId`, the system shall kill the maestro
   child (process tree), emit the terminal event with outcome `canceled`, and clean up the
   temp file; canceling an unknown or finished `runId` shall answer refused with a stable
   code and emit nothing.
10. On `before-quit`, `RunService.dispose()` shall kill any live run child — no orphaned
    JVMs.

### MCP / CLI mutual exclusion (§4.3.2)

11. While a run is active, the system shall issue **no** call to the `maestro mcp` child:
    a snapshot capture requested during a run is deferred (or refused with a stable code the
    renderer treats as "stale until run ends"), never executed concurrently.
12. When `run:start` arrives while a snapshot capture is in flight, the system shall wait for
    that capture to settle before spawning the CLI — the two processes never overlap in
    either direction.
13. When the run ends (any outcome), the system shall trigger the §5.5 end-of-flow snapshot
    recapture automatically, and the inspect overlay recovers without user action.
14. The scrcpy mirror shall keep streaming untouched throughout — the user watches the test
    drive the app live.

### Renderer — Toolbar

15. When the user clicks **Run** with a connected device and a non-empty flow, the system
    shall start a run with the open flow's current in-memory YAML (dirty state included —
    what you see is what runs) and the button shall flip to **Stop** with the
    `circle-stop` icon.
16. When the user clicks **Stop**, the system shall invoke `run:cancel` for the active run;
    the button returns to **Run** only when the terminal event lands.
17. While no device is connected or the flow is empty, the Run button shall be disabled.
18. When a run starts, the lower panel shall switch to the **Run** tab automatically.

### Renderer — RunPanel

19. While a run is active, the step list shall show each parsed step with `StatusDot`
    `running` on start, then `pass` or `fail`; steps not yet reached don't appear (the list
    grows as Maestro advances).
20. The panel shall stream the raw log lines in a mono, auto-scrolling region — pinned to the
    bottom while the user hasn't scrolled up, holding position when they have.
21. When the terminal event lands, the panel shall show the outcome (passed / failed /
    canceled / error with its message) and the final step states; the log remains readable
    after the run — cleared only when the next run starts.
22. If the run fails before any step is parsed (syntax error, device gone, spawn failure),
    the panel shall still show the failure and whatever log arrived — never the empty-state
    text over a dead run.
23. While no run has happened, the panel keeps its existing empty state.
24. The `run-progress` bar in `App.tsx` shall reflect the real run — completed parsed steps
    over the open flow's command count — and clear when the run ends; the `ui.store` run
    fixtures (`RUNNING`, `RUN_STEPS`) stop feeding it.

### Contract & architecture

25. The three channels shall follow the house contract: senderFrame validated, args
    Zod-parsed, `Result` with stable codes declared in `shared/ipc.ts`, one named preload
    function per channel, `run:event` subscription returning an unsubscribe consumed in the
    hook's effect cleanup.
26. `run.store` actions shall be the only renderer code invoking the run channels; RunPanel
    and Toolbar select narrowly — log-line appends must not re-render the mirror.
27. No module outside `process/run.ts` and `CliRunner.ts` shall import `child_process`
    (§12.1a); Biome must stay clean without new exceptions.

## Constraints

- Never `sendSync`; never await the run in a handler; main stays responsive while the JVM
  grinds (a cold `maestro test` can take ~10 s before the first step).
- The CLI is spawned non-TTY: the parser targets Maestro's plain sequential output, not the
  interactive ANSI redraw. Strip stray ANSI escapes defensively before parsing and display.
- Log volume is unbounded: cap the in-store log buffer (keep the newest N thousand lines) so
  a looping flow can't eat the renderer's memory; the cap is visible ("… earlier output
  dropped") rather than silent.
- Mirror performance untouchable: batch log-line store writes (per event chunk, not per
  line) and keep selectors narrow.
- UI copy in the existing English chrome; Maestro's own log text passes through verbatim.
- Android only, like everything today; nothing may preclude iOS later.

## Out of scope

- **`flow:save`, the `conductor/` folder, the repo layer, `chokidar`** — the run reads a
  temp snapshot of memory; real persistence is the editor/repository specs (§13 steps 6–7).
- **`maestro test -c` (continuous mode)** and running folders/suites — single open flow only.
- **`maestro check-syntax`** — the publish gate's, not the Run button's.
- **Doctor** integration (a missing binary surfaces as a run error code for now).
- **AI panel reactions to failures** (§6) and any run-history persistence.
- **iOS / simctl.**
- **Per-step ↔ editor-line linking** (highlighting the YAML line of the running step).

## Decisions & assumptions

- **This spec stacks on `feat/element-inspect-command-menu`** (engineer): it consumes
  `flow.store` and the command-insertion loop; that branch merges first.
- **Run executes a temp-file snapshot of the in-memory flow** (engineer): leanest path;
  saving is another spec. Consequence: what runs is exactly what the editor shows, dirty or
  not.
- **RunPanel shows parsed steps *and* raw logs** (engineer): the step list the DS already
  ships drives from best-effort parsing; the truth (outcome) comes from the exit code.
- **During a run the MCP child is left alive but unused** (engineer): §4.3.2 forbids
  concurrency, not coexistence at rest; killing/restarting it would cost the JVM warm-up on
  every run. Snapshot work is suspended and resumed, not the process.
- **Parsing Maestro's console output for step progress is accepted** (assumed): §4.5's veto
  targets log-scraping as an *inspection/coupling* strategy; here parsing is progress
  decoration only, with the exit code as the sole source of the outcome — degrading to
  logs-only if Maestro's format shifts.
- **Auto-switch to the Run tab on start** (assumed): the user asked to "see the logs in the
  Run tab"; leaving them staring at the assistant panel while the run scrolls unseen fails
  that. Manual switching remains free during the run.
- **Driver install** (assumed): `--no-reinstall-driver` skips *re*install; on a device where
  the driver is absent Maestro still installs it once. §4.4a's "reinstall once at connect" is
  device-service territory and stays untouched here.
- **Mirror input forwarding stays enabled during a run** (assumed): touching the device
  mid-test can perturb the test, but policing the user is worse; revisit if it proves
  confusing.
- **`--device <id>`** (assumed): the selected device from `device.store` is passed
  explicitly; never rely on Maestro's single-device default.
- **Preload names follow the house domain-first style** (implementation):
  `runStart` / `runCancel` / `onRunEvent`, matching `mirrorStart`/`onMirrorEvent` — the
  spec's own "the mirror shape is the pattern" instruction outranks the `startRun`
  spelling its context section used.
- **Mid-run captures are refused, not queued** (implementation): `SnapshotService`
  answers `run/active` while suspended; criterion 13's automatic end-of-run recapture
  makes a deferral queue redundant. The renderer also stops *scheduling*
  interaction-driven captures while a run is live, so the overlay stays quietly stale
  instead of collecting refusals per tap.
- **`runFlow` is handler-shaped, not an AsyncIterable** (implementation): the
  `startMirror` pattern (`onProgress` with typed `RunProgress`, `onExit` with the
  exit reason, a `kill()` handle). Parsing runs inside `LocalGateway`, so the Gateway
  contract stays remote-safe at the event level — a `RemoteGateway` serves the same
  events off a different wire.
- **`spawnStreaming` settles on `close`, and learned `killTree`** (implementation):
  exit is reported only after stdio drains, so the terminal event is guaranteed to be
  terminal; the opt-in `killTree` spawns a POSIX process group and SIGTERMs it whole —
  criterion 9's "process tree" — used only by `CliRunner`. Verified against the real
  JVM on the reference device: a mid-assert kill settles in ~0.5 s with exit 143.
- **Maestro binary resolution extracted to `maestro/resolve-maestro.ts`**
  (implementation), shared by `MaestroMcpService` and `CliRunner` — one ladder, so the
  two spawners can never disagree about where maestro is.
- **The non-TTY format, captured live** (implementation, maestro 2.8.0 on the
  reference device — `maestro-test.capture.json`): a step's label arrives as a partial
  line ending `...` the moment the step starts; ` COMPLETED`/` FAILED` + newline land
  on settle; syntax-class failures print one stderr line, no steps, exit 1; SIGTERM
  exits 143. The parser therefore detects step starts on the *partial* buffer, and
  unknown verdict words (`SKIPPED`…) degrade to plain log.
- **Log cap = 5000 lines** (implementation), newest kept, with the visible
  "… earlier output dropped" marker the constraint demands.
- **Step durations and canceled-step state** (implementation): the renderer stamps
  `m:ss` on a step when its verdict lands; a step still running when a canceled run
  settles reads `idle` — it neither passed nor failed.
- **The Run click switches the lower panel immediately** (implementation): progress
  lands there if the run starts, and the failure lands there if it refuses
  (criterion 22) — waiting for the response would leave a refused click showing
  nothing.
- **No per-domain IPC registrar test** (implementation): the guarded seam is
  `handle.ts`, which carries the tests — the `run.ts` registrar is thin exactly like
  `device.ts`/`maestro.ts`, which have none either.

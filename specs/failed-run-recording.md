# Failed-run screen recording

status: todo
created: 2026-09-02

## Goal

When a run fails, the person can watch what the device did. Every run is recorded on the
device while `maestro test` executes; a run that fails keeps its video in the person's Movies
folder (`~/Movies/Conductor/`), and the failed step's row in the Run tab gains an **Open video**
action that opens the file in the OS's default player, captioned with the second at which that
step begins in the video. Passed and canceled runs leave nothing behind. This closes the "what
went wrong?" gap that `flow-run-execution` left open: today a failed run shows a red dot and
Maestro's log, and the picture is gone.

## Context

- **Files this touches (main):**
  - `src/main/maestro/ScreenRecorder.ts` — **new**, the sibling of `ScreenCapture` (§9.2,
    §10.1 rule 1b): *names* `adb`, receives its runner by constructor injection, creates no
    process. Starts `screenrecord` on the device through a streaming shell, stops it with a
    signal so the MP4 is finalised, pulls the file, cleans up. Android only today; the iOS
    implementation (`xcrun simctl io recordVideo`) lands here later, exactly like the
    screenshot's.
  - `src/main/maestro/AdbBridge.ts` — grows `pull(deviceId, remotePath, localPath)` (the
    counterpart of `push`) and a read of `ro.build.version.sdk` (the API level decides the
    `--time-limit 0` flag, criterion 2).
  - `src/main/maestro/MaestroGateway.ts` / `LocalGateway.ts` — grow `startRecording(deviceId)`
    per §4.3.7 ("the Gateway grows per spec"). Remote-safe: `deviceId` opaque, everything
    async, and the video leaves the Gateway by being written into a **host** path the caller
    names — never as a device path (§10.1 rules 2, 3, 6).
  - `src/main/services/run.service.ts` — the orchestration: recorder before the spawn,
    stop/discard/keep after the exit, the save into Movies, the follow-up event, the
    `fromSeconds` arithmetic, the per-run saved-path registry `run:open-recording` reads,
    `dispose()`.
  - `src/main/ipc/run.ts` — `run:open-recording`.
  - `src/main/index.ts` — wires `app.getPath('videos')`, `shell.openPath` (injected, the way
    `openExternal` is injected into `PublishService`) and the recorder into the Gateway.
  - `src/shared/ipc.ts` — `run:start` grows the flow identity; the new channel; the `RunEvent`
    schema growth; the new stable codes.
  - `src/shared/types.ts` — `RunEvent`: `finished.recording` and the `recording` variant.
- **Files this touches (renderer):**
  - `src/renderer/src/stores/run.store.ts` — the recording state of the open run and the
    `openRecording` action (the only renderer code invoking the new channel).
  - `src/renderer/src/views/RunPanel/RunPanel.tsx` + `.module.css` — the action on the failed
    step's row, its saving state, the outcome-bar note.
  - `src/renderer/src/views/Toolbar/Toolbar.tsx` — passes the open flow's identity to `start`.
  - `src/preload/index.ts`, `index.d.ts` — one new named function.
- **Existing patterns to follow:** `ScreenCapture` (an adb-naming module driven in tests by a
  fake runner, deadline-guarded); `publish:open-pr` → `PublishService.openPr` (the renderer
  sends an id, main resolves what it stored itself and opens it — never a path from the
  renderer); `RunService.writeFlow` (temp name + rename); the `run:start` → `run:event` →
  `run:cancel` shape; `handle.ts`; `device.store`'s narrow selectors.
- **Product & decision docs:** `.context.md` §4.2 (the `maestro record` row — amended by this
  spec, see Decisions), §4.4b and §12 rule 13 (the device's picture comes from the OS, never
  through Maestro — the recording follows the same rule, amend rule 13 to say so), §8.0 (plain
  language, no jargon), §9.3, §10.1 (rules 1b, 2, 3, 6 — add `ScreenRecorder` to the 1b list
  in the same change), §12 rules 8 and 19; AGENTS.md security table (the `shell.openExternal`
  rule applies verbatim to `shell.openPath`).
- **Design & conventions:** the Aurora kit's `CRunPanel` row grid (`16px | label | auto`) and
  the app's `RunPanel` that mirrors it; the DS `Button` `variant="ghost" size="sm"` as the
  model for the row action, drawn inline the way the kit draws its pill buttons; the `play`
  glyph already in `Icon.tsx`; the caption in `--type-mono-label` like the duration; the note
  in the outcome bar's existing `outcomeMessage` treatment.
- **Tests:** Vitest, both projects. `ScreenRecorder.test.ts` mirrors `ScreenCapture.test.ts`
  with a fake runner and fake shell: the exact command line per API level, the stop sequence,
  the pull, the cleanup, the start failure, the deadline. `AdbBridge.test.ts` grows `pull`.
  `run.service.test.ts` with a fake Gateway: the keep/discard matrix per outcome, "no step
  started" discards, the save into a temp `videos` dir with the `.partial` rename, the name
  collision suffix, the follow-up event after `finished`, `fromSeconds`, cancel and dispose.
  IPC per `handle.test.ts`. Renderer: `run.store.test.ts` (recording events, stale ids,
  `openRecording`), RTL for `RunPanel` (saving state, the action on the failed row, the
  caption, the note, nothing on a passed run) and `Toolbar` (passes the open flow's
  identity), mocking only `window.conductor`. Hardware verification before merge, recorded in
  the spec's Decisions like the previous run spec did: legibility at the chosen bitrate on the
  reference Galaxy A07, coexistence with the scrcpy mirror, stop→pull latency.

## Acceptance criteria

### Recording during the run (main)

1. When `run:start` is invoked, the system shall start a screen recording of the selected
   device before spawning `maestro test`, and the run shall proceed whether or not the recorder
   started.
2. The system shall record through `MaestroGateway.startRecording`, whose local implementation
   is a `ScreenRecorder` that names `adb` and receives its runner by injection, invoking exactly
   `adb -s <deviceId> shell screenrecord --bit-rate <RECORDING_BITRATE> [--time-limit 0]
   /sdcard/conductor-recording-<runId>.mp4` — `--time-limit 0` present only when the device's
   API level is 34 or higher (the flag is rejected below that).
3. While the device's API level is below 34, the system shall let the OS stop the recording at
   its 3-minute cap and the run shall continue unaffected.
4. If the recorder cannot start (no `adb`, `screenrecord` refused by the device or the
   emulator), then the system shall log the cause, run the flow anyway, and keep the cause so
   a failing run can report it (criterion 15).
5. When the maestro child exits, the system shall stop the recorder by signalling **its own**
   device-side `screenrecord` process (SIGINT, so the MP4 is finalised — matched by the
   run's file name, never a bare `killall screenrecord`) and wait for that process to exit;
   the local `adb shell` child shall never outlive the run's settle by more than the stop
   sequence.
6. The system shall never delay the terminal `finished` event for the recording: the outcome
   goes out the moment the exit is known, the video follows.

### Keep or discard

7. When the run's outcome is `passed` or `canceled`, the system shall discard the recording —
   remove the device-side file, pull nothing — and push no recording event.
8. When the run's outcome is `failed` or `error` and at least one step had started, the system
   shall pull the video into `<videos>/Conductor/` — `<videos>` being Electron's
   `app.getPath('videos')`, which is `~/Movies` on macOS — as
   `<flow>-<YYYY-MM-DD>-<HHmmss>.mp4`, written under a `.partial` name and renamed on
   completion, and shall remove the device-side file afterwards.
9. If the run's outcome is `failed` or `error` but no step ever started (a syntax error, a
   device gone before the first command), then the system shall discard the recording as in
   criterion 7 and report `recording: 'none'`.
10. The file name's `<flow>` shall derive from the flow identity passed on `run:start`: the
    path relative to `conductor/` without its extension, `/` replaced by `-`, every character
    outside `[A-Za-z0-9._-]` replaced by `-`, and `flow` when no identity was given; the
    timestamp is the local time the run started; an existing file is never overwritten — the
    new one gets a `-2`, `-3`… suffix.
11. If the `Conductor` folder does not exist, then the system shall create it (recursively)
    before writing.

### The follow-up event

12. The `finished` event shall carry `recording: 'pending' | 'none'` — `pending` if and only
    if a video is being saved for this run.
13. When the save completes, the system shall push exactly one `run:event` of type
    `recording` carrying the `runId`, `ok: true`, the saved file name, and `fromSeconds`: the
    whole seconds (floored) elapsed between the recorder's start and the moment the failed step
    started, or `null` when no `step-failed` was parsed or when the failed step started after
    the recorder had already stopped (criterion 3).
14. If the save fails (the pull errors, the write errors — `EACCES`, `ENOSPC`, a read-only
    folder — or the device has not handed the file over within 20 s of the exit), then the
    event shall carry `ok: false` and the message "The recording couldn't be saved to your
    Movies folder: <reason>." — and the run's outcome shall stay exactly what the exit said.
15. If the recorder had failed to start (criterion 4) and the run's outcome is `failed` or
    `error` with at least one step started, then the event shall carry `ok: false` and the
    message "This run wasn't recorded: <reason>."
16. Every recording event shall carry the `runId` of the run it belongs to, so the store's
    existing stale-run check drops a late one (run criterion 6).

### Opening the video

17. When `run:open-recording` is invoked with the id of a run whose video was saved in this
    session, the system shall open that file with the OS's default player (`shell.openPath`)
    and answer `ok: true`; the renderer never sends a path, and main opens only a path it wrote
    itself.
18. If the file is no longer on disk, then the system shall answer `ok: false` with the stable
    code `run/recording-missing` and the message "The video is no longer in your Movies
    folder."; if the OS refuses to open it, `run/recording-open-failed` with the OS's message.
19. If the `runId` names no run with a saved video, then the system shall answer
    `run/recording-missing` and open nothing.

### Lifecycle

20. When `run:cancel` kills the run, the system shall stop the recorder and discard the
    recording (criterion 7).
21. On `before-quit`, `RunService.dispose()` shall stop any live recorder and remove the
    device-side file best-effort — no `adb shell screenrecord` child and no half-written
    `.partial` survives the app.
22. When `run:start` arrives while the previous run's video is still being saved, the system
    shall accept the new run; the earlier save runs to completion in the background and its
    event is stale to the store by construction (criterion 16).

### Renderer — Run tab

23. While the `finished` event says `recording: 'pending'`, the row of the failed step (the
    last step whose status is `fail`) shall show "Saving video…" in the action's place,
    non-interactive.
24. When the `recording` event lands with `ok: true`, that row shall show an **Open video**
    action with the `play` glyph and, when `fromSeconds` is not `null`, the caption
    `from m:ss` beside it (`m:ss` formatted like the step duration).
25. When the person activates **Open video**, the store shall invoke `run:open-recording` with
    the run's id; a refusal shows its message in the outcome bar's message area.
26. When the `recording` event lands with `ok: false`, the outcome bar shall show the event's
    message beneath the outcome label, and no action shall appear on any row.
27. While the outcome is `passed` or `canceled`, or while no run has happened, the panel shall
    show nothing about recording.
28. The action, the caption and the note shall stay readable until the next run starts, and be
    cleared by it — the same rule as the rest of the report (run criterion 21).
29. The panel shall select the recording state narrowly; a recording event must not re-render
    the mirror or the log.

### Contract & architecture

30. The new channel and the event growth shall follow the house contract: senderFrame
    validated, args Zod-parsed, `Result` with stable codes declared in `shared/ipc.ts`, one
    named preload function, the `RunEvent` schema and the shared type pinned to each other.
31. The `run:start` request shall grow a third argument — the open flow's identity, `string |
    null` — and the Toolbar shall pass `flow.store`'s `openPath`.
32. No module outside `process/run.ts` and `CliRunner.ts` shall import `child_process`;
    `ScreenRecorder` joins §10.1's rule-1b list, and `.context.md` (§4.2's `maestro record`
    row, §10.1's table, §12 rule 13) is amended in the same change; Biome stays clean with no
    new exception.
33. The recording shall cross the Gateway as a write into a host path the caller names (or as
    bytes) — never as a device path; `deviceId` stays opaque; nothing above the Gateway names
    `adb`, `/sdcard` or `screenrecord`.

## Constraints

- **Bitrate** is one named module constant (`RECORDING_BITRATE`, like `MIRROR_MAX_SIZE`),
  defaulting to 4 Mbps — chosen so on-screen text is legible on the reference Galaxy A07 and
  files stay around 30 MB per minute. Legibility, coexistence with the scrcpy mirror (two
  encoders on the device) and stop→pull latency are verified on that device before merge.
- Never `sendSync`; never block main on the pull — it is awaited off the handler, and the
  20-second deadline turns a device that never answers into a reported failure.
- The device-side file name carries the `runId`, and the stop signal targets our process by
  that name — a person's own `screenrecord` on the same device is never killed.
- Every `adb` invocation is an argument array through `AdbBridge` (§12.19); the renderer never
  sees a path, a shell or a command.
- UI copy stays in the existing English chrome, in plain words: no "adb", "screenrecord" or
  "pull" in a sentence the person reads; the folder is called "your Movies folder"; the
  `<reason>` suffix may carry the OS's own text.
- Android only, like everything today; nothing may preclude iOS (`simctl io recordVideo`)
  behind the same Gateway method. Windows and Linux inherit `app.getPath('videos')` and are
  not verified by this spec.
- Mirror performance untouchable: the recording adds no work to the frame path.

## Out of scope

- An in-app player, seeking to `fromSeconds`, or thumbnails — the shortcut opens the OS player.
- "Show in Finder", renaming, or deleting videos from the app; retention or cleanup of the
  `Conductor` folder (only failures are kept, so growth is bounded by failures).
- A setting to turn recording off, or to change bitrate, size or destination.
- Chaining 3-minute segments on Android < 14 (criterion 3 accepts the cap).
- `maestro record`, `--analyze`, `--test-output-dir` artifacts (`commands.json`,
  `screen-recording.mp4`), `startRecording`/`stopRecording` in the flow — see Decisions.
- iOS; Windows/Linux verification; Doctor integration for a device that cannot record.
- Recording anything but the Run button's own run (the assistant cannot drive the device).
- Attaching the video to a publication or to the assistant.

## Decisions & assumptions

- **Conductor records with `adb shell screenrecord`, not through Maestro** (engineer, after the
  facts below were verified in the installed maestro 2.8.0 jar): Maestro's whole-run
  `screen-recording.mp4` only switches on with `--analyze`, the cloud "AI Insights" path
  (`api.copilot.mobile.dev`, `--api-key`) — exporting the app's screenshots is not our call
  (§4.4c's spirit, §9.0). Its `startRecording` YAML command and that recorder both drive
  Android at `--bit-rate 100000` (100 kbps), which smears text; `maestro record --local`
  renders a nice video with the command list but re-runs the flow. Our own recorder picks the
  bitrate, needs no edit of the flow, adds no step line to the parser, and follows the rule the
  screenshot already follows (§4.4b, §12.13): the device's picture comes from the OS.
- **`.context.md` §4.2's `maestro record` row is amended** by this change: the "future
  feature" it names is delivered, but not by that command — a ⏸️ Emenda saying so.
- **Record every run, keep on failure** (engineer): a failure cannot be known before it
  happens, and a second run may not reproduce it. `error` keeps the video too (assumed): a JVM
  that died mid-run is exactly when the picture matters; a run that never started a step keeps
  nothing (criterion 9) — the device did nothing worth watching.
- **The action lives on the failed step's row, with the minute** (engineer): that row *is* the
  step the video is about, and the caption answers "where in the video?". `fromSeconds` measures
  the failed step's **start** (assumed) — the action that failed begins there; what follows is
  Maestro's wait and retry — floored, and never claiming sub-second precision (the recorder
  needs a moment to start after its spawn).
- **`~/Movies/Conductor/<flow>-<date>-<time>.mp4`** (engineer): the person's own folder,
  found where they expect videos (Finder shows it as "Filmes"), one subfolder so Conductor's
  files do not mix with theirs, a name that says which flow and when.
- **No macOS permission prompt exists for this** (verified): Movies is not one of the folders
  macOS gates behind a consent dialog (only Desktop, Documents, Downloads, removable and network
  volumes are), and Conductor is not App-Sandboxed (`electron-builder.yml` ships no
  entitlements, `identity: null`). A write there succeeds or fails with a plain filesystem
  error, so the message proposed in the request — "because you didn't give permission" — would
  be untrue in almost every case and is replaced by criterion 14's wording, which carries the
  OS's actual reason.
- **The terminal event is not delayed; the recording follows as its own event** (assumed):
  waiting for the pull would leave the Stop button lit over a run that already ended, and a
  Stop click in that window would mislabel the outcome. The one-event-after-`finished` is a
  documented exception to "the terminal event is terminal", scoped to the recording, and the
  store's stale-id check covers it.
- **Recording via the scrcpy stream was rejected** (assumed): the H.264 packets are already in
  main, but writing an MP4 needs a muxer we do not have, and it would tie the video to the
  mirror view being mounted.
- **4 Mbps** (assumed) — well below `screenrecord`'s 20 Mbps default, far above Maestro's
  100 kbps; adjusted on hardware if text is not legible, not by a setting.
- **Android < 14 keeps the 3-minute cap** (assumed): the reference device is Android 16;
  `--time-limit 0` is accepted from API 34 on (the same gate Maestro's own driver uses).
- **The `play` glyph is reused** (assumed): the design system's 78-glyph set has no `video` or
  `film`; adding one is a design-system change this spec does not make.
- **The flow identity rides `run:start`** (implementation): main names the file and today it
  knows only the device id and the YAML.
- **The pull deadline is 20 seconds** (assumed): a minute of video at 4 Mbps is ~30 MB, seconds
  over USB; a device that takes longer is a device that is not answering.
- **`error` codes**: two new ones, `run/recording-missing` and `run/recording-open-failed`;
  save failures travel as a value in the event, not a code, like every mid-run failure.

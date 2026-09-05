# Environment doctor — first-run Maestro installer and the diagnostic sheet

status: done
created: 2026-09-02

## Goal

Close `.context.md` §10. At launch Conductor puts **its own pinned Maestro** on the machine — the one dependency it can honestly install — and reports everything else it needs (adb, JDK, Xcode command line tools, `gh`, `claude`, and the two sign-ins) in a sheet that names each state precisely and steps back. A missing dependency never blocks the app: the toolbar carries an amber count until it reads zero. Done means: a fresh Mac (fresh `userData`) shows the installer, gets Maestro without the person opening a terminal, lands on the connect screen, and Doctor tells the truth about the rest — and a developer can watch the whole thing with `npm run dev:fresh`.

## Context

- **Files/modules this touches**
  - New main: `src/main/services/doctor.service.ts` (+test) — the checks, the report, the managed-Maestro install pipeline, the recheck triggers, `dispose()`; `src/main/services/doctor-parse.ts` (+test) — pure parsers for the CLI outputs listed in the appendix (no I/O); `src/main/ipc/doctor.ts` → `registerDoctorIpc(deps)`.
  - Extended: `src/shared/ipc.ts` (channels, schemas, `doctor/*` codes), `src/shared/config.ts` (`MAESTRO_VERSION`, `MAESTRO_RELEASE_URL`), `src/main/maestro/resolve-maestro.ts` (+test — the managed copy becomes a rung), `src/main/index.ts` (construction, startup sequence, `dispose`, the dev-only hide list), `src/main/window.ts` (setup geometry + `presentConnect`), `src/preload/index.ts` + `index.d.ts`, `package.json` (`dev:fresh`), `src/renderer/src/App.tsx` (the setup view joins the view decision), `views/Toolbar/Toolbar.tsx` (mounts the badge).
  - New renderer: `stores/doctor.store.ts`, `hooks/useDoctorEvents.ts`, `views/Setup/*` (the first-run installer window — kit `CDoctorInstaller`), `views/Doctor/*` (the sheet — kit `CDoctorSheetB`), `components/DoctorBadge/*` (presentational — kit `CDoctorBadge`).
  - Amendments this change must write: `.context.md` §10 (Maestro is Conductor-managed and pinned — the third pinned artifact after the scrcpy jar and the claude plugin; the doctor reports the rest and never installs or signs in on the person's behalf; "via script oficial" becomes "release archive + published checksum, into `userData`"), §10.1 rule 1b (`DoctorService` names `maestro`/`adb`/`java`/`gh`/`claude` but creates no process), §4.2 (`maestro --version` joins the table), §13 (state). `AGENTS.md`: Commands gains `npm run dev:fresh`; Layout gains `views/Setup` beside `views/Doctor`.
- **Existing patterns to follow**: `repo.service.ts` (injected `run`, `resolveGh`, `Result`, push on change, atomic state); `run.service.ts` / `publish.service.ts` (an invoke returns an id at once, progress as push events, `dispose` kills what is in flight); `ipc/handle.ts`; the `resolve-*.ts` ladders and `AdbBridge.resolve()`; `conductorPluginDir` / `scrcpyJarPath` for anything that differs between dev and packaged; `window.ts` (`createWindow('connect')`, `presentWorkspace`); `components/Dialog` as `PublishSheet` uses it — the sheet mounts on the window so the scrim covers the toolbar; `Connect.tsx` for the icon and the drag strip.
- **Product & decision docs**: `.context.md` §10 (the dependency table, "doctor na primeira execução"), §10.1 (rules 1a/1b, "Doctor desde já"), §8.1 (`gh` installed *and* authenticated are different failures), §6.0 (`claude`), §4.2 + §12.10 (`MAESTRO_CLI_NO_ANALYTICS=1` on every maestro process), §12.13 (the pinned scrcpy jar — the precedent for pinning Maestro), §9.3, §12.24.
- **Design & conventions**: `docs/Conductor Design System/ui_kits/conductor-c-aurora/` — `CDoctor.jsx` (`CDoctorInstaller`, `CDoctorBadge`, the row/dataset shape), `CDoctorB.jsx` (`CDoctorSheetB` — the chosen reading), `doctor-first-run.html`, `doctor-b.html`, README section "Doctor". Read the kit from the main checkout `/Users/gui/Projects/conductor`, not from this worktree (kit edits sit uncommitted there). The kit's data is mock: `1.39.9`, the paths, the named account are placeholders — real rows come from the machine. The kit's "Adding maestro to PATH" step does not exist here (see Decisions).
- **Tests**: Vitest `main` — `doctor.service.test.ts` beside the service, driven through a fake `run` that records argv and answers canned outputs (as `repo.service.test.ts` does), a fake download (bytes + progress + failure injection) and a temp `userData` root; `doctor-parse.test.ts` over the captured strings in the appendix; `resolve-maestro.test.ts` extended for the managed rung; `shared/ipc.test.ts` extended. Renderer — `doctor.store.test.ts`, `Setup.test.tsx`, `Doctor.test.tsx`, `DoctorBadge.test.tsx`; `Toolbar.test.tsx` and `App.test.tsx` updated; mocking exactly `window.conductor` (RTL, by role/text). TDD per `.claude/skills/test-driven-development`. No E2E.

## Acceptance criteria

### The report

1. [x] The system shall build a doctor report of exactly these rows, in this order, each `{ id, name, status: 'ok' | 'warn' | 'fail', label, detail, short }`: `maestro` "Maestro", `adb` "Android platform-tools", `java` "Java Development Kit", `xcode-clt` "Xcode command line tools", `gh` "GitHub CLI", `github-auth` "GitHub", `claude` "Claude Code", `claude-auth` "Claude".
2. [x] The system shall find and verify each row as the table below says; `detail` is machine register — the CLI's own first line, trimmed, plus ` · <path>` where a path is known, or `<command> → command not found` when the binary is absent; `short` is the version alone (`adb 35.0.2`, `java 21.0.4`, `gh 2.91.0`, `claude 2.1.258`, `2.10.0`, `26.1`).

   | Row | Found by | Verified by | `ok` | `warn` | `fail` |
   |---|---|---|---|---|---|
   | `maestro` | the managed copy (criterion 12), then the rest of the `resolveMaestro` ladder | marker file + executable bit — **no JVM on the continuous check** | managed copy, marker = pinned → "Installed" | managed copy present but marker ≠ pinned → "Update pending", detail `<marker> · Conductor needs <pinned>`; resolved to a copy that is not Conductor's (`CONDUCTOR_MAESTRO_PATH` or the person's own) → "Using yours", detail `<path>` | nothing resolves → "Not installed", detail the last install failure's detail when there was one, else `maestro → not installed` |
   | `adb` | `AdbBridge`'s ladder | `adb --version` | "Ready" | — | not found → "Not found"; found but `--version` fails → "Not working", detail its first stderr line |
   | `java` | `$JAVA_HOME/bin/java`, else `/usr/libexec/java_home` | `<java> -version` (it prints to **stderr**), major parsed from the first line | major ≥ 17 → "Ready" | major < 17 → "Too old", detail `<first line> · Maestro needs Java 17 or newer` | none → "Not found", detail `/usr/libexec/java_home → <its stderr first line>` |
   | `xcode-clt` | `xcode-select -p` exit 0 | its stdout is the path; `short` from `pkgutil --pkg-info=com.apple.pkg.CLTools_Executables` (`version:` line, first two components) when that receipt exists, else `Installed` | "Installed" | — | exit ≠ 0 → "Not found", detail its stderr first line |
   | `gh` | `resolveGh` | `gh --version` first line | "Installed" | — | "Not found" |
   | `github-auth` | needs `gh` | `gh auth status --active`: exit 0 ⇒ signed in | "Signed in", detail the `Logged in to github.com account …` line without the glyph | exit ≠ 0 → "Signed out", detail its first non-empty line; `gh` absent → "Signed out", detail `gh auth status → needs GitHub CLI first` | — |
   | `claude` | `resolveClaude` | `claude --version` first line | "Installed" | — | "Not found" |
   | `claude-auth` | needs `claude` | `claude auth status` — JSON, `loggedIn` | `true` → "Signed in", detail `claude auth status → loggedIn: true (<authMethod>)` | `false`, unparsable or non-zero → "Signed out", detail `claude auth status → loggedIn: false` or its first line; `claude` absent → "Signed out", detail `claude auth status → needs Claude Code first` | — |

3. [x] The system shall run every check with a 10 s timeout, concurrently; a check that does not answer in time reports `warn` "Did not answer" with detail `<command> → no answer after 10 s`; the report is pushed once, whole, when every check has settled — never row by row.
4. [x] The report shall carry `checkedAt` (epoch ms) and the `issues` count = rows whose status is not `ok`.
5. [x] The system shall keep only the first line of any CLI output in the report (a `gh auth status` transcript carries a masked token line — it never crosses IPC or lands in a store).
6. [x] The report shall run: after the window first shows (never before first paint — the launch decision of criterion 13 is a file read, not a process); on `doctor:check`; after an install settles (done or failed); and when the window regains focus while the last report has ≥ 1 non-`ok` row — in that case only those rows re-run and merge into the report, at most once per 5 s. A trigger that arrives while a check is in flight is coalesced, never queued.

### Managed Maestro

7. [x] `CONFIG.MAESTRO_VERSION` shall pin the version (`'2.10.0'` at this writing; override `CONDUCTOR_MAESTRO_VERSION`) and `CONFIG.MAESTRO_RELEASE_URL` the release base (`https://github.com/mobile-dev-inc/maestro/releases/download`; override `CONDUCTOR_MAESTRO_RELEASE_URL`); the archive is `<base>/cli-<version>/maestro.zip` and its checksum `<base>/cli-<version>/checksums_sha256.txt`. Nothing else about the download is a constant anywhere.
8. [x] The managed copy shall live at `userData/maestro/` — `bin/maestro`, `lib/`, `deps/` as the archive lays them out — with a `version` marker file beside them; the marker is what `resolveMaestro` and the `maestro` row read.
9. [x] `resolveMaestro`'s ladder shall become: configured path → managed copy (marker present **and** `bin/maestro` executable) → `PATH` → `~/.maestro/bin/maestro`; `CliRunner`, `MaestroMcpService` and `AiService`'s `--mcp-config` pick the managed copy up through the one ladder with no change of their own.
10. [x] Where `CONFIG.MAESTRO_PATH` is set, the installer shall never run and `doctor:install` shall refuse with `doctor/maestro-overridden` — an explicit path is the person's decision.
11. [x] Installing shall write nothing outside `userData`: never `~/.maestro`, never a shell rc file, never `sudo`. ⏸️ *Superseded by spec `managed-tools` (2026-09-04): the direct installs of the JDK, `gh` and `adb` write to `~/.conductor/**` and one marked block in the shell profile — and nothing else; `sudo` stays forbidden.*
12. [x] The install pipeline shall be: download `maestro.zip` streamed to `userData/maestro-install/<installId>/` (never buffered whole — it is ~315 MB), progress by bytes against `Content-Length`; download `checksums_sha256.txt` and compare the archive's sha256 → mismatch fails with `doctor/checksum-mismatch` and deletes the archive; extract with `/usr/bin/unzip -qo` through `run.ts` into the same job dir; locate `bin/maestro` at the extracted root or one directory down (the archive today carries a single top-level `maestro/`), ensure its executable bit; write `version` = pinned inside that directory; remove any previous `userData/maestro`; rename the new directory into place; then — only when the `java` row resolves — run `maestro --version` with `MAESTRO_CLI_NO_ANALYTICS=1` (15 s timeout) and require it to print the pinned version, else `doctor/verify-failed`. When Java is missing the verify step is skipped and the install still completes: the Java row carries that truth.
13. [x] When the app starts, the system shall decide `setup.active` from files alone: `true` when `CONFIG.MAESTRO_PATH` is empty and the managed copy is absent or its marker ≠ pinned; `false` otherwise.
14. [x] While `setup.active` is true, the system shall open the single BrowserWindow at the setup geometry — 520 × 360, fixed; close live, minimise and zoom dead (`minimizable`, `maximizable`, `fullscreenable`, `resizable` all false) — showing the Setup view, and start the install with no click.
15. [x] `doctor:install` shall answer `{ installId }` immediately; progress shall arrive as `doctor:install-event` pushes — `{ installId, kind: 'progress', pct, step }` (steps: `Downloading maestro <version>` 0–90 by bytes, `Checking the download` 90–93, `Extracting` 93–98, `Verifying installation` 98–100), then `{ kind: 'done', version }` or `{ kind: 'failed', code, message, detail }`; nothing in main awaits the pipeline inside a handler, and a second `doctor:install` while one runs is refused with `doctor/install-active`.
16. [x] When an install started from the Setup view completes, the system shall hold the ready state for ≈ 800 ms, then present the connect geometry (no persisted repo) or the workspace (persisted repo) in the same window — resized, never a second BrowserWindow — and set `setup.active` false.
17. [x] If the install fails, then `message` shall be one product-language sentence chosen by code — `doctor/download-failed`: "Conductor couldn't reach GitHub to download Maestro. Check your connection and try again."; `doctor/checksum-mismatch`: "The download didn't match what Maestro published, so it was discarded."; `doctor/extract-failed`: "Maestro couldn't be unpacked on this Mac."; `doctor/verify-failed`: "Maestro was installed but didn't answer as expected." — while `detail` keeps the raw cause (HTTP status, `unzip`'s stderr, the version printed) for the `maestro` row; a connection failure surfaces as soon as the network answers, and a transfer that moves no bytes for 60 s fails the same way.
18. [x] When `doctor:skip-setup` is invoked (the Setup view's "Continue without Maestro"), the system shall present connect or workspace as in criterion 16 and set `setup.active` false; it is refused with `doctor/setup-not-active` otherwise. Until the managed copy matches the pin, every later launch runs the installer again. *(Superseded by `managed-tools` on 2026-09-04: the tools and the GitHub sign-in are mandatory, the view offers no "Continue" and the channel is removed.)*
19. [x] Where the pinned version changed since the managed copy was written, the same Setup window shall run with the heading "Updating Maestro" and body "Conductor's test runner is moving to <version>. This happens once." — the pipeline, steps and failure surface are the first run's.
20. [x] On `before-quit`, `dispose()` shall abort an in-flight download, kill a running `unzip` or `maestro --version`, and remove `userData/maestro-install/`; an interrupted install can never leave a copy that resolves as installed (the marker is written before the rename, and the rename is the only step that makes a copy visible).

### The Setup view (kit `CDoctorInstaller`)

21. [x] The Setup view shall show the real Conductor icon (`build/icon.png`, as Connect does) in place of the kit's gradient "C", the heading "Setting up Conductor", the body "Installing Maestro, the runner behind every test. This happens once.", one progress bar, the current step label and the percentage; on `done` the bar turns `--state-pass`, the check glyph appears and the label reads `maestro <version> is ready`.
22. [x] The view shall hold no timers of its own: every `pct` and `step` it renders comes from `doctor:install-event` through the store — no simulated progress.
23. [x] While an install fails, the view shall replace the step line with the failure sentence and offer "Try again" (invokes `doctor:install`) and "Continue without Maestro" (invokes `doctor:skip-setup`); while an install runs it offers no button (the OS close button is the only way out, and it quits). *(Superseded by `managed-tools` on 2026-09-04: "Try again" alone — Maestro is mandatory.)*
24. [x] The view shall reserve the drag strip the way Connect does, so a frameless-looking window can still be moved.

### The sheet (kit `CDoctorSheetB`)

25. [x] When the toolbar badge is clicked, the system shall open the Doctor sheet on the window (scrim over the toolbar too); Escape, the scrim, the close glyph and "Done" close it; clicking the badge while it is open closes it.
26. [x] The sheet's header shall read "Doctor" and `checked <h:mm am/pm>` from `checkedAt` in local time (`9:12 am`); before the first report it reads `checking…`.
27. [x] The verdict band shall read, with the kit's glyph and colours: `issues = 0` → "Everything is ready" / "Conductor has what it needs on this Mac."; `issues = 1` → "1 thing needs you"; `issues > 1` → "<N> things need you" — both with "Conductor runs without them, and cannot install or sign in on your behalf."
28. [x] The table shall list the non-`ok` rows under "Needs you" (glyph, name, full `detail` in mono, `label` in the state's colour) above the `ok` rows under "Ready" (glyph, name, `short` in mono, `label` quiet), each section in criterion 1's order; the "Needs you" section is absent when empty.
29. [x] The footnote shall read "Maestro is the only one Conductor installs and updates by itself. The rest live on your machine, and signing in is always yours to do."
30. [x] The footer shall offer "Check again" (ghost, refresh glyph; invokes `doctor:check`; disabled while a check is in flight) and "Done" (primary).
31. [x] While the `maestro` row is not `ok` and `CONFIG.MAESTRO_PATH` is empty, that row alone shall carry an "Install" button — the sheet's only per-row action, because this is the one thing Conductor does itself; clicking it invokes `doctor:install`, the row's label reads "Installing" and its detail shows `<step> · <pct>%` from the install events, and on `done` the row goes `ok` in place — the workspace never leaves for the setup window; on `failed` the row shows the failure's detail and the button returns.
32. [x] The sheet shall show no Git or GitHub vocabulary beyond the rows' own names and the CLIs' own output (§12.24 — the detail line is machine register on purpose, per the kit).

### The badge (kit `CDoctorBadge`)

33. [x] The toolbar shall mount the badge immediately after the spacer, before Run, only once the first report has landed (a wrong "all clear" would be a small lie — the send control's rule).
34. [x] While `issues = 0`, the badge shall be the quiet `activity` icon button labelled "Doctor", `selected` while the sheet is open; while `issues > 0`, it shall be the amber pill with the `triangle-alert` glyph and the count, labelled "Doctor · 1 item needs you" / "Doctor · <N> items need you".
35. [x] `DoctorBadge` shall be presentational — `{ issues, selected, onClick }` in, nothing from stores or `window.conductor`.

### IPC contract

36. [x] `src/shared/ipc.ts` shall declare: invokes `doctor:status` → the doctor state, `doctor:check` → `{ started: boolean }` (false when coalesced), `doctor:install` → `{ installId }`, `doctor:skip-setup` → `{}`; pushes `doctor:changed` (the whole doctor state) and `doctor:install-event`; codes `doctor/install-active`, `doctor/maestro-overridden`, `doctor/setup-not-active`, `doctor/download-failed`, `doctor/checksum-mismatch`, `doctor/extract-failed`, `doctor/verify-failed`. The doctor state is `{ report: DoctorReport | null, checking: boolean, setup: { active: boolean, reason: 'first-run' | 'update' | null }, install: null | { installId, pct, step } | { installId, failed: { code, message, detail } } }`.
37. [x] The preload shall expose one function per channel and nothing else; every handler goes through `handle()` (sender check + Zod); the renderer sends no path, URL or command — main decides everything about where Maestro lives.
38. [x] `App.tsx` shall decide the view as `loading` until both the repo and the doctor state have loaded, then `setup` while `setup.active`, then `connect` / `workspace` as today; `useDoctorEvents` is app-wide (mounted by `App.tsx`) and returns its unsubscribes.

### Seeing it happen (developer affordance)

39. [x] `npm run dev:fresh` shall wipe `${TMPDIR:-/tmp}/conductor-fresh` and run `electron-vite dev -- --user-data-dir=<that dir>` — a genuine first run on this machine: installer, then connect. It runs beside a normal `npm run dev` (the single-instance lock is per `userData`; verified).
40. [x] Where the app is not packaged and `CONDUCTOR_DOCTOR_HIDE` names tools (`maestro,adb,java,xcode-clt,gh,claude`, comma-separated), the named tools shall resolve as absent for **every** consumer — the doctor, the connect resolver, the run, mirror and AI paths — so the app behaves exactly as it would on a machine without them; the variable is ignored when packaged.
41. [x] The spec's dev knobs shall be documented in `AGENTS.md`'s Commands table: `dev:fresh`; `HOME=<empty dir>` for signed-out `gh`/`claude` rows (both read `$HOME`; Electron's `userData` does not, hence `--user-data-dir`); `CONDUCTOR_MAESTRO_PATH=~/.maestro/bin/maestro` to skip the 315 MB download when iterating on anything but the installer; `CONDUCTOR_MAESTRO_RELEASE_URL=http://localhost:8000` with a local `python3 -m http.server` over `maestro.zip` + `checksums_sha256.txt` to iterate on the installer offline and to provoke a checksum mismatch.

## Constraints

- Process creation only through `src/main/process/run.ts` / `spawnStreaming`, injected; `DoctorService` names binaries and creates nothing (§10.1 rule 1b — amend the list); it never imports `child_process` (Biome enforces it).
- `MAESTRO_CLI_NO_ANALYTICS=1` on the verify spawn (§12.10). No `--no-reinstall-driver` there — `--version` touches no device.
- Never spawn `/usr/bin/java` directly: on a Mac without a JDK that stub raises the system "No Java runtime present" dialog. Resolve through `$JAVA_HOME` then `/usr/libexec/java_home` (exits 1 to stderr, no dialog — verify on a JDK-less Mac before release; this machine has one).
- The download goes through Electron's `net` in main (proxy-aware), streamed to disk, aborted on dispose; sha256 through `node:crypto` streaming; extraction through `/usr/bin/unzip` (ships with macOS). No new dependency for any of the three.
- Timeouts are the spec's numbers: 10 s per check, 15 s for the verify `--version` (a JVM start costs ~1.7 s here), 60 s stall for the download.
- Everything the doctor writes lives under `userData`; the archive layout is checked, not assumed (criterion 12).
- Strings: the kit's, verbatim, in English; failure sentences are product language (criterion 17); `detail` lines are the CLI's own text.
- §9.3 flags untouched; the setup, connect and workspace geometries are three presentations of the one BrowserWindow from `window.ts`.
- Strict TS, Biome; types for `doctor:*` derive from the Zod schemas in `shared/ipc.ts`; select narrowly in the renderer (install events arrive at ~10 Hz).
- `npm`, not `pnpm`.

## Out of scope

- Installing anything but Maestro: a managed JRE is the next spec (`feat/managed-jre`) and reuses this pipeline; adb, Xcode CLT, `gh`, `claude` and both sign-ins are reported only. ⏸️ *Superseded by spec `managed-tools` (2026-09-04): the JDK (Zulu 21), `gh` and `adb` are installed too, and the GitHub sign-in is driven from the app; Xcode CLT, `claude` and the Claude sign-in stay report-only.*
- Windows and Linux rows or installer (`unzip`, `java_home`, `xcode-select` are macOS facts); the service shape stays platform-agnostic.
- `maestro start-device` / emulator lifecycle (§10 mentions it; it belongs with the device panel).
- Pointing the existing failure surfaces (run, mirror, AI "maestro not found") at the sheet — they keep their messages.
- Sheet variant A (`doctor.html`).
- Moving the Maestro pin outside a Conductor release, a "latest" mode, proxy/auth beyond Electron's defaults, disk-space preflight, and cleanup of `userData/maestro` when Conductor is uninstalled.

## Decisions & assumptions

- Maestro is a private, pinned copy under `userData/maestro`, installed at every launch until it matches the pin, and first in the ladder after the explicit override → engineer chose (2026-09-02) over "use the person's own, install only when none": reproducibility across machines (the scrcpy precedent, §12.13, and §6.0's support argument) outweighs a one-time ~315 MB download for developers who already have Maestro. The person's own copy still serves as fallback when the managed one is missing (row "Using yours").
- The JDK is reported, not installed → engineer chose; a managed JRE is the immediate follow-up so the installer's promise holds on a Mac with no Java.
- Sheet reading B (verdict first, Needs you / Ready) → engineer chose.
- Install failure: inline sentence + "Try again" + "Continue without Maestro"; the app never blocks → engineer chose. The installer re-appears at every launch until installed (one click to continue) — assumed; say so if a skip should be remembered.
- The kit's "Adding maestro to PATH" step is dropped: Conductor resolves by absolute path and never edits shell rc files (assumed; the official script's PATH edit exists only for terminal use, which Conductor does not offer).
- Two Claude Code rows join the kit's dataset (§10 lists `claude` installed *and* authenticated; without them the doctor could not explain an unavailable assistant) — assumed.
- Rows and installer are macOS-only in this spec — assumed from the kit ("this Mac") and the toolchain.
- Rechecks: launch, "Check again", after an install, and on window focus for non-`ok` rows only (the "install it in the terminal, come back" loop) — assumed; the continuous check never starts a JVM.
- The verify step is skipped when Java is absent rather than failing the install — the install did succeed; the Java row tells the rest.
- The "Install" button on the `maestro` row is the sheet's one deliberate exception to "reports, does not act" (README): it is Conductor's own job, not a Homebrew shell-out.
- Version/URL facts at spec time: latest release `cli-2.10.0` (2026-08-31) publishes `maestro.zip` (314,828,521 bytes) and `checksums_sha256.txt` (`<sha256>  maestro.zip`); the archive carries a top-level `maestro/` with `bin/`, `lib/`, `deps/`; Maestro 2.x's launcher refuses Java < 17 ("Java 17 or higher is required"); the kit's `1.39.9` is stale mock data.
- `electron-vite dev -- --user-data-dir=…` reaches Electron (`ELECTRON_CLI_ARGS`, electron-vite 5.0.0); `HOME=` does **not** move Electron's `userData` on macOS — both verified on this machine on 2026-09-02.
- **Implementation (2026-09-03).** The doctor state carries two fields beyond criterion 36's list, both main's truth the renderer cannot otherwise learn: `maestroOverridden: boolean` (criterion 31's guard — the sheet never learns the path, only that one was set) and `version: string` (the pin, for the Setup view's copy in criteria 19 and 21). A `verify-failed` install removes the copy it just renamed into place: leaving it would resolve as installed over the failure the `maestro` row reports. The check timeout also covers `/usr/libexec/java_home` and `pkgutil`. One exception to criterion 6's "coalesced, never queued": the recheck an install settles into is the one trigger that *is* queued behind a check in flight, because that check read the `maestro` row before the rename and would otherwise leave it stale until the next trigger (criterion 31 needs it `ok` in place). `CONDUCTOR_DOCTOR_HIDE` is applied as one wrapped executable probe at the composition root (covering `maestro`, `adb`, `gh`, `claude` for every ladder) plus the doctor's own read of the set for `java` and `xcode-clt`, which resolve otherwise. The doctor store's install action is `installMaestro`, because `install` is the state field a push replaces. `Dialog` gained an `aside` slot for the sheet's `checked h:mm` stamp. Not exercised here: launching the app (`npm run dev:fresh`) and the real download — the pipeline is proven against a fake download and a fake `unzip`, and `download.ts` against a fake `net`.

## Appendix — captured CLI outputs (this Mac, 2026-09-02)

Fixtures for `doctor-parse.test.ts`; the logged-out shapes come from the tools' documentation and are marked.

```
$ maestro --version            (stdout, ~1.7 s)
2.8.0

$ adb --version                (stdout)
Android Debug Bridge version 1.0.41
Version 35.0.2-12147458
Installed as /Users/gui/Library/Android/sdk/platform-tools/adb
Running on Darwin 25.1.0 (arm64)

$ /usr/libexec/java_home       (stdout; exit 1 + stderr "The operation couldn't be completed. Unable to locate a Java Runtime." when none — documented)
/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home

$ java -version                (stderr!)
openjdk version "21.0.4" 2024-07-16 LTS
OpenJDK Runtime Environment Zulu21.36+17-CA (build 21.0.4+7-LTS)

$ xcode-select -p              (stdout; exit 2 + stderr "xcode-select: error: unable to get active developer directory…" when none — documented)
/Applications/Xcode.app/Contents/Developer

$ pkgutil --pkg-info=com.apple.pkg.CLTools_Executables   (stdout; "No receipt for …" exit 1 when absent)
version: 26.1.0.0.1.1761104275

$ gh --version                 (stdout, first line)
gh version 2.91.0 (2026-04-22)

$ gh auth status --active      (exit 0)
github.com
  ✓ Logged in to github.com account GuilhermeHCDias (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
                               (exit 1 when logged out — documented:)
You are not logged into any GitHub hosts. To log in, run: gh auth login

$ claude --version             (stdout, ~10 ms)
2.1.258 (Claude Code)

$ claude auth status           (stdout, JSON, exit 0)
{
  "loggedIn": true,
  "authMethod": "claude.ai",
  "apiProvider": "firstParty",
  "analyticsDisabled": false,
  …
}
```

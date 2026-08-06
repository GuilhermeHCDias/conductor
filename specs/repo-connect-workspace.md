# Repo connect & workspace switching
status: done
created: 2026-08-06

## Goal
The user's only configuration is pasting the GitHub URL of their Expo app repository (§2.1). Conductor clones it, derives the app name, the bundle ids and the existing tests from the clone, and the workspace the user already has (flow list, editor, watcher) becomes that repository's `conductor/` folder. Multiple repos can be connected; exactly one is active, switchable from the sidebar. This replaces the fixed `userData/repo/conductor` workspace with the real product model: the repository IS the configuration.

## Context
- Design (canonical): `docs/Conductor Design System/ui_kits/conductor-c-aurora/CRepo.jsx` — three surfaces sharing one resolver: `CConnectWindow` (first run), `CRepoBar` + `CRepoPopover` (sidebar switcher), `CAddRepoDialog` (add sheet). Rendered reference: `connect.html`, `screenshots/0*-connect-idle.png`. Tokens/kit: `index.html`, `CShell.jsx`, `components/core/`.
- Product decisions: `.context.md` §2 (CONFIG holds only true constants), §2.1 (derivation from `app.json`, `{ android, ios }` appId model, static `app.json` only), §7 (clone design: `userData/repos/<slug>`, `--filter=blob:none`, iterate over the clone), §7.1 (`conductor/` is the contract; not every `.yml` is a flow), §8.1 (`gh` is the auth story; `gh repo clone` for private repos), §9.3 (sanitize before filesystem/Git), §12.6 (never hardcode appId/repo URL).
- Files this touches: `src/main/index.ts` (composition root — workspace root is currently hardcoded to `join(userData, 'repo', CONFIG.FLOWS_DIR)` at ~line 199), `src/main/services/flow.service.ts` + `TreeWatcher.ts` (must accept a swappable root), `src/main/window.ts` (window size depends on whether a repo is active), `src/shared/ipc.ts` (new `repo:*` channels), `src/preload/index.ts` + `index.d.ts`, `src/renderer/src/App.tsx` (renders connect vs workspace), new `views/`, `stores/repo.store.ts`, `lib/` for the URL parser.
- New main-side code follows the existing shape: a `repo.service.ts` owning the domain, thin `ipc/repo.ts`, process calls through `src/main/process/run.ts` only.
- Icon asset: `build/icon.png` — the real Conductor icon, used in place of the kit's gradient-"C" mark (engineer decision).
- Existing UI language is English; all strings come from the kit verbatim unless a criterion says otherwise.
- Tests: Vitest, sibling files. Mirror `flow.service.test.ts` (service with fakes injected), `stores/flow.store.test.ts`, and the RTL view tests (`FlowList.test.tsx`) mocking only `window.conductor`.

## Acceptance criteria

### First run
- While no repository is connected, the app shall show the connect screen (`CConnectWindow` layout) as the only content of the single BrowserWindow, and the window shall open at the small fixed connect size (per the design, 560px wide content) instead of the workspace size.
- The connect screen shall use `build/icon.png` as its mark, not the gradient-"C" square from the kit.
- When a repository becomes active (first connect confirmed, or any later launch with a persisted active repo), the window shall present the workspace at its normal size; on launch with a persisted active repo the connect screen shall not appear.

### URL parsing (pure, renderer `lib/`)
- The system shall accept the browser URL (including `/tree/<branch>` suffixes), the HTTPS clone URL (with or without `.git`), and the SSH remote (`git@github.com:org/name.git`) as the same repository, extracting `{ host, org, name }`.
- If the pasted text does not parse as a repository address, then the resolver shall show the kit's "That is not a repository address" error without contacting the network.
- If the parsed host is not `github.com`, then the resolver shall show the kit's "GitHub only, for now" error without contacting the network.
- If the parsed repo (case-insensitive `org/name`) is already in the connected list, then the resolver shall show the kit's "Already connected" error.

### Resolution (real, in main)
- When the user submits a valid new GitHub URL, main shall clone it with `gh repo clone` + `--filter=blob:none` into `userData/repos/<slug>`, where `<slug>` derives from sanitized `owner/name` — never from the raw URL string.
- The resolver's three progress steps shall reflect the real stages (clone / read `app.json` / scan `conductor/`), advancing as each stage actually completes — no simulated timers.
- When the clone succeeds, main shall read `app.json` at the clone root by static JSON parse only (never `require`/evaluate `app.config.js|ts`), deriving `appName` from `expo.name` and `appId` as `{ android: expo.android.package, ios: expo.ios.bundleIdentifier }`.
- If `app.json` is missing or unparsable, or neither `android.package` nor `ios.bundleIdentifier` is present, then the resolver shall fail with a message naming exactly what was missing (§2.1 MVP), and the failed clone directory shall not be persisted as a connected repo.
- When resolution succeeds, main shall count the flows under `conductor/` using the same classification the flow index uses (valid flow header, not mere `.yml` extension — §7.1); a repo with no `conductor/` folder or zero flows resolves successfully as "empty for now".
- The found card shall show `org/name`, the app name, the bundle id, the clone's checked-out branch, and the flow count (or the empty state with the "Conductor creates conductor/ with your first flow." note), per `CRepoFound`.
- If `gh` is missing, not authenticated, or the clone fails, then the resolver shall show the kit's error surface with the actionable command (`gh auth login`) rendered in the command well, a working Copy button, and a "Try again" action that re-runs resolution.
- The system shall report expected failures across IPC as `{ ok: false, error: { code, message } }` with distinct stable codes at minimum for: invalid URL, unsupported host, already connected, gh unavailable, gh unauthenticated, clone failed, app config unreadable.

### Confirm & persistence
- When the user confirms ("Open <app name>"), main shall persist the repo (url, org/name, slug, derived appName/appId, connected date) to the repo list in `userData` and mark it active; the renderer shall never write this state.
- The system shall expose repo state (list + active) to the renderer through the bridge — a query channel plus a push event on change — and the renderer store shall hold only a projection of it.
- When the active repo changes (first connect, or a switch), the flow workspace (FlowService root, TreeWatcher, index) shall re-point to `<clone>/conductor/` of the active repo, the previous watcher shall be disposed, and the flow list shall re-render from the new index with no restart.

### Switcher & add dialog
- While a repo is active, the sidebar shall show `CRepoBar` at its top: app initial on the aurora tile, repo name, `branch · bundle id`, opening `CRepoPopover` on click.
- The popover shall list every connected repo with its bundle id and flow count, mark the active one with a check, and switch the active repo on row click.
- When "Add repository…" is clicked, the system shall open `CAddRepoDialog` running the same resolver (same parsing, same real resolution, same error surfaces) with the field autofocused and reset on open.
- When the empty field's "Paste" affordance is clicked, the system shall fill the field from the system clipboard.

### Hygiene
- The system shall keep `appName`/`appId`/repo URL out of `src/shared/config.ts` and out of every constant — consumers receive them from the active repo state (§12.6).
- On `before-quit`, the repo service shall dispose anything it holds (watchers already covered by the flow service swap; no orphaned processes).

## Constraints
- All process creation via `src/main/process/run.ts` (`execFile` + arg array); `repo.service` never imports `child_process`. `gh` is the only network door (§8.1).
- Beyond `clone` and `fetch`, no git mutation of the user's clone — never `checkout`, `reset`, `stash`, `pull` (§8.2).
- §9.3 window flags untouched; every new handler validates `senderFrame` and parses args with its Zod schema; the renderer sends only the raw URL string, never paths or slugs.
- Design tokens and component idioms come from the aurora kit already in use by the existing views — no new styling system, no new dependencies.
- Strict TS, Biome; types for `repo:*` derive from the Zod schemas in `shared/ipc.ts`.

## Out of scope
- Fetch/sync ("cache out of date") indication, removing/renaming a connected repo, and any publish behavior (§8).
- The divergent-appId flow-header decision and the dynamic Expo config (`app.config.js`) path — both are open ❓ in §2.1; fail with the clear message and stop.
- Migration of anything inside the old fixed `userData/repo/conductor` workspace.
- Doctor integration for `gh` checks (the resolver's own error surface is enough here).
- Device-target switching per repo (§2.1 mentions it; there is no per-repo device memory yet).

## Decisions & assumptions
- Scope includes all three kit surfaces (first-run window, sidebar switcher, add dialog) in this one spec → engineer's choice.
- "Connect" performs the real partial clone during resolution; steps reflect real stages → engineer approved.
- Confirming actually re-points the flow workspace to the clone; the fixed `userData/repo/conductor` root is retired → engineer approved.
- Single BrowserWindow, resized: small fixed connect size when no repo is active, workspace size otherwise → engineer approved.
- The kit's gradient-"C" mark is replaced by the existing `build/icon.png` → per the request.
- UI strings stay in English, taken from the kit (matches the shipped views). The footer line follows `CRepo.jsx` ("Nothing is pushed without you"), which supersedes the older screenshot text.
- Flow counting reuses the index's flow classification rather than counting `.yml` files → follows §7.1; not re-asked.
- (impl) Resolve progress and failure cross as one typed `repo:resolve-event` push (`step` / `found` / `failed` with `resolveId` + stable `code`/`message`), following the `mirrorEnded` idiom — an operation failing is not the subscription failing; invoke-level failures still return `{ ok: false, error }` with the seven codes.
- (impl) The switcher identifies repos by the slug main itself published; main validates by lookup against its list and never builds a path from renderer input (§9.3's intent).
- (impl) Slug = sanitized `org-name` plus an 8-char FNV-1a hash of lowercased `org/name` — readable, collision-proof, derived only from owner/name (§7).
- (impl) Paste/Copy go through new `app:read-clipboard` / `app:write-clipboard` channels: the sandboxed renderer's permission handler denies `navigator.clipboard`.
- (impl) Connect window is fixed 560×520; the workspace restores 1280×820 (min 960×640) via `presentWorkspace` in `window.ts`.
- (impl) Error surfaces: gh-unauthenticated and clone-failed reuse the kit's "Conductor cannot read this repository" strings verbatim with `gh auth login`; gh-missing has no kit string, so its body is written in kit tone with `brew install gh`; app-config errors show main's message, which names exactly what was missing.
- (impl) `appName` falls back to the repo name when `expo.name` is absent — §2.1 fails resolution only on the missing ids.
- (impl) Bundle id shown in bar/card/popover is `android ?? ios`; the found card's platform label reads "Android" / "iOS" / "Android · iOS".
- (impl) Divergent `android`/`ios` ids: connecting succeeds and stores both (§2.1 "o modelo é `{ android, ios }` desde já"); *flow creation* fails with a clear message while the flow-header ❓ stays open — per "fail with the clear message and stop".
- (impl) `CONFIG.APP_ID`/`REPO_URL` removed (§12.6): DeviceService takes an appId getter, FlowService's header appId rides the workspace swap. CONFIG gains `GH_PATH` (same override pattern as `ADB_PATH`/`MAESTRO_PATH`).
- (impl) `clipboard` and `package` glyphs vendored from Lucide v0.577 into `Icon.tsx` (CRepo.jsx names them; the DS asset folder lacks them).
- (impl) RepoBar renders above FlowList inside an App-level sidebar wrapper (FlowList's asserted grid untouched); AddRepoDialog is its own view, opened via `repo.store` ui state.
- (verify) A resolution that fails before main's handler returns (gh missing does — the prefix is synchronous) delivers its events ahead of the invoke reply; the store buffers unknown-id events while resolving and drains them, id-checked, when the reply names the resolution. Found by the independent verification pass; pinned by a store test.
- (verify) The popover shows the flow count on **every** row, the check beside the active one's count — the criterion's additive reading wins over the kit's either/or (`CRepo.jsx:284`); rows carry the raw number, as the kit does.
- (verify) `confirm` is single-flight: a double-click on "Open <app>" issues one `repo:connect`, never a spurious resolve-not-found surface.
- (verify) `repo:resolve` and `app:write-clipboard` requests are bounded (2048 chars) — no address or command is measured in kilobytes.
- (verify, known trade-off) A superseded/disposed mid-clone resolution leaves its partial directory in `userData/repos/<slug>`; discarding it there would race the next clone of the same slug, so it waits for the next resolve of that repo (which clears leftovers first). Never persisted as connected either way.
- (note) The design canon this spec cites (`CRepo.jsx`, `connect.html`, connect screenshots) exists only untracked in the main checkout, not in git — strings were reproduced from it at implementation time; committing the kit file is the engineer's call, not this branch's.

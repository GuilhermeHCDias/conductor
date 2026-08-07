# Send changes — publish the conductor/ delta as a PR
status: done
created: 2026-08-07

## Goal

Close §8's loop: the toolbar gains the **Send changes** control, which opens a confirmation sheet listing everything changed under `conductor/`, with a "What changed?" note **pre-written by the local AI (`claude` CLI) and editable by the person**; confirming publishes — syntax gate, branch, commit, push, PR via `gh` — with progress streamed and not a single Git word on screen. Done means: a non-developer edits flows, clicks one button, reads (or tweaks) one plain-English sentence, and a reviewable PR exists on GitHub — repeatably, into the same open PR, until it merges or closes.

## Context

- **Files/modules this touches**
  - New main: `src/main/services/publish.service.ts` (+test) — change-set, describe job, send pipeline, publication state (own `userData/publications.json`, keyed by repo slug, atomic temp+rename); `src/main/services/resolve-claude.ts` (+test) — ladder like `resolve-gh.ts`; `src/main/ipc/publish.ts` → `registerPublishIpc(deps)`.
  - Extended: `src/shared/ipc.ts` (channels, schemas, `publish/*` codes), `src/shared/config.ts` (`CLAUDE_PATH` override; `AI_DESCRIBE_BUDGET_USD`; `REPO_BASE_BRANCH` becomes *override-only* — see criterion 22), `src/preload/index.ts` + `index.d.ts`, `src/main/index.ts` (composition root wiring, `dispose()` on before-quit), `src/main/maestro/MaestroGateway.ts` + `LocalGateway`/`CliRunner` (a `checkSyntax` capability — rule 9: our Maestro calls go through the Gateway), `RepoService` (small extension: expose the active clone — root, slug, org/name, current branch — to the composition root; refactoring its clone path is out of scope).
  - New renderer: `stores/publish.store.ts`, `hooks/usePublishEvents.ts`, `views/PublishSheet/*`, `components/SendControl/*` (presentational, props in/callbacks out); `views/Toolbar/Toolbar.tsx` mounts SendControl; `App.tsx` mounts the sheet + the app-wide hook.
  - New assets: `resources/conductor-plugin/` — our Claude plugin carrying the describe skill (§8.4); `electron-builder.yml` gains the `extraResources` entry so it ships (mirror how `resources/scrcpy` ships).
- **Existing patterns to follow**: `repo.service.ts` (injected `run`, `resolveGh`, `Result`, emit-push, atomic state write, abort on supersede); `run.service.ts` (job id returned immediately, progress as push events, cancel channel); `ipc/handle.ts` (senderFrame + Zod guard); `TreeWatcher`/`flow:changed` as the recompute trigger; `components/Dialog` for the one modal treatment.
- **Product & decision docs**: `.context.md` §8 (all), §6.0–6.1 (claude invocation + isolation), §4.2 (`check-syntax`), §7 (the `conductor/` contract), §12 rules 16–19 and 23–24. Amendments this change must write: see Constraints.
- **Design & conventions**: `docs/Conductor Design System/ui_kits/conductor-c-aurora/CReview.jsx` + `send-changes.html` — `CSendControl` (three toolbar states) and `CSendSheet` (list rows, note field, footer) are the visual truth. The kit's named reviewer ("Marina", `data.jsx`) is mock-only: real copy says "your team".
- **Tests**: Vitest `main` project — `publish.service.test.ts` beside the service, driven through a **fake `run` that records argv** (assert exact flags: `--body-file`, plumbing order, `add` scoped to `conductor/`, no interpolation) like `repo.service.test.ts`; `resolve-claude.test.ts`; `shared/ipc.test.ts` extended. Renderer project — `publish.store.test.ts`, `PublishSheet.test.tsx`, `Toolbar.test.tsx` updated, mocking exactly `window.conductor` (RTL, by role/text). TDD per `.claude/skills/test-driven-development`. No new E2E.

## Acceptance criteria

Toolbar control (kit: `CSendControl`)

1. While a repo is active, no changes are unsent and no review is open, the system shall show the quiet non-interactive "Everything sent" state.
2. While unsent changes exist and no review is open, the system shall show the filled accent "Send changes" button carrying the unsent count.
3. While a review is open, the system shall show the neutral "Waiting for review" pill, appending "+N" when N > 0 changes are unsent.
4. When any interactive state of the control is clicked, the system shall open the publish sheet.

The sheet (kit: `CSendSheet`)

5. The sheet shall list every unsent change as a row — icon + verb Added/Changed/Deleted, file name, `conductor/<folder>/` path — matching the kit; while a review is open with zero unsent changes it shall show the sent state instead ("Waiting for review", View on GitHub, Done).
6. While a review is open and unsent changes exist, the sheet shall list those changes and offer sending them into the review that is already open (§8.3) — never a second PR.

Unsent-set semantics

7. The system shall compute the unsent set as the difference between the working tree and the open publication's last sent commit — or the base branch tip when no publication is open — scoped to `conductor/`: a file sent and untouched since does not count; edited after sending counts again.
8. Untracked new files under `conductor/` shall count as Added; deletions as Deleted; changed non-flow files (workspace config, data files) ship with the publication and appear in the list, but only flow-classified files run the syntax gate.
9. When `flow:changed` fires, the system shall recompute the unsent set debounced (≤ 1 s) without ever blocking a save; when the active repo switches, the control shall reflect the new repo's own state.

The AI note (§8.4, amended)

10. When the sheet opens with ≥ 1 unsent change, the system shall start a describe job: `claude` resolved locally (`resolve-claude`), headless, with exactly the §8.4 profile — `-p`, `--model sonnet`, `--output-format json`, `--tools "Read,Glob,Grep"` (no Bash, no Write/Edit), `--setting-sources ""`, `--strict-mcp-config`, no `--mcp-config`, `--plugin-dir <resources>/conductor-plugin`, `--max-budget-usd` from `CONFIG.AI_DESCRIBE_BUDGET_USD` (≤ 0.25) — and a prompt that invokes our skill by name.
11. The system shall write the publication's full diff (base/publication parent vs working tree, scoped to `conductor/`) plus a changed-files listing into a temp job dir passed via `--add-dir`, alongside `--add-dir <clone>/conductor` so the model can Read the current YAML of changed flows; the model never runs git and is never handed the diff any other way.
12. The skill shall instruct the model to read the diff and the changed flows' current YAML and answer, machine-parsably, a short title (≤ 72 chars) and a 1–3 sentence description — English, product language, naming what the tests now do differently; no Git/GitHub vocabulary, no YAML jargon.
13. While the describe job runs, the note field shall show a writing state; when it completes, the field shall be prefilled with the description — unless the person already typed, in which case their text is never overwritten.
14. When the sheet closes before the describe job finishes, the system shall kill the `claude` child.
15. If `claude` is missing, errors, exceeds 60 s, or answers unparsably, then the system shall silently fall back to mechanical text — title like "Update 3 tests in checkout", description listing the changed files — prefilled in the field the same way; sending must work identically (§8.4: AI optional, publish critical path).
16. While the unsent set's content hash is unchanged since the last generation, reopening the sheet shall reuse the cached title/description instead of invoking `claude` again.
17. The system shall let the person edit the note freely; the edited text is what publishes.

Sending (§8.3, §8.4)

18. When Send for review is clicked, the invoke shall answer with a job id immediately and progress shall arrive as push events driving the sheet through checking → sending → opening-review; nothing in main awaits the pipeline inside a handler, and `sendSync` appears nowhere.
19. Before any Git work, the system shall run the Gateway's `checkSyntax` over every changed flow-classified file (with `MAESTRO_CLI_NO_ANALYTICS=1`); if any fails, the publication stops with a product-language message naming the file ("This test has an error that prevents sending" + which), never raw Maestro output; if the `maestro` binary is missing, sending refuses with its own specific message.
20. On the first send of a publication, the system shall fetch the base, then create branch `conductor/<YYYY-MM-DD>-<slug>` (date fixed at publication birth; slug from the flow open when it was born, sanitized per §9.3, falling back to `tests` when none is open) parented on the fetched base tip, commit exactly the `conductor/` scope (never `-A`), push, and open the PR with `gh pr create --base <base> --head <branch> --title <title> --body-file <temp>` — the body file carries the note as edited, and neither title nor body is ever interpolated into a command string (rule 19).
21. The send pipeline shall never run `checkout`, `reset`, `stash` or `pull`, never move the clone's HEAD, and never rewrite the working tree — the bytes of every file under the clone are identical before and after a send (commit built by plumbing: a temporary index + `write-tree`/`commit-tree`/`update-ref` or equivalent).
22. The PR base shall be the branch the clone came with (read from the clone at publish time), with `CONDUCTOR_BASE_BRANCH` as an explicit env override — never an unconditional constant.
23. On subsequent sends while the PR is open, the system shall commit on the same branch (parent = previous publication tip), push, regenerate title/description over the full publication diff and refresh the PR with `gh pr edit --title --body-file` so it always describes everything it contains; the commit message's first line is the send's title; the UI says the changes joined the review already open.
24. If a send is requested when nothing is unsent, then the system shall refuse with a stable code and the sheet shall return to the idle truth (§8.3: "nothing new to send").
25. When the PR opens or updates successfully, the sheet shall switch to the sent state and the control to Waiting for review, and the publication (branch, PR number, URL, last sent commit) shall persist in `userData` and survive relaunch.
26. If the push, `gh`, or any pipeline step fails, then the sheet shall show a product-language failure with a stable code — `repo/gh-missing` and `repo/gh-unauthenticated` reuse their specific fixes; anything else says what happened and what to do — never raw git/gh output in the primary line (raw stderr goes to the console log only).
27. When View on GitHub is clicked, main shall open the **stored** PR URL via `shell.openExternal` only after validating it parses as `https://github.com/<org>/<repo>/pull/<n>`; the renderer never sends a URL.

Publication lifecycle (§8.3's tail, now decided)

28. When the app starts with a persisted open publication, when the active repo switches to one, and when the sheet opens, the system shall refresh the PR state via `gh pr view --json state,url` — never on the send click itself; while the check is in flight the UI keeps the last known state.
29. If the refresh reports the PR merged or closed, then the system shall end the publication (clear its persisted state); the control returns to criteria 1–2 per the unsent set, and the next send starts a new publication from the freshly fetched base tip — content still differing from base (e.g. a closed-unmerged review) simply counts as unsent again, because the disk is the truth and is never rewritten.
30. If the refresh itself fails (offline, gh hiccup), then the system shall keep the stored state untouched and stay quiet — no error surface; it retries on the next trigger.

Contract & hygiene

31. Every new channel shall be declared once in `shared/ipc.ts` (Zod schema per channel, `ConductorApi` function per channel, `<domain>:<action>` kebab-case — suggested: `publish:status`, `publish:describe`, `publish:send`, `publish:cancel`, `publish:open-pr`, push `publish:changed` + `publish:event`), with handlers going through the `handle` guard (senderFrame + parse) and expected failures as `Result` values with new stable `publish/*` codes.
32. The note shall cross IPC bounded (≤ 10 000 chars) and reach `gh` only via `--body-file`; the branch name and every path shall be sanitized and resolved inside the clone before touching filesystem or Git (§9.3).
33. No new UI string shall contain Git/GitHub vocabulary — branch, commit, push, merge, diff, pull request — not even translated; the single exception is the "View on GitHub" link (rule 24).
34. `PublishService` shall own every long-lived resource it creates (claude child, running jobs, debounce timer) behind `dispose()`, wired to before-quit in `index.ts`.

## Constraints

- **No new runtime dependencies.** Git runs as the `git` binary through `src/main/process/run.ts` (guaranteed on PATH by `gh`, §9.1) — no `simple-git`; GitHub only via `gh` (rule 16); AI only via `claude` headless (rules 17–18). Process creation stays behind `run.ts`/`CliRunner` (Biome `noRestrictedImports`).
- **Verify against the installed CLI before coding** (§6.0's own warning): `--setting-sources ""` accepted-empty, the exact `--plugin-dir` behavior, `--output-format json` shape, and whether `check-syntax` tolerates `--no-reinstall-driver` (rule 10 scopes that flag to `hierarchy`/`test` — don't pass it blindly). Never `--safe-mode`, never `--bare`.
- **Performance**: unsent recompute debounced off `flow:changed`; describe cached by change-set hash (a `claude` call costs real money — never re-pay for the same diff); sheet open never blocks on network; every `gh`/`git` call carries a timeout so a hung push becomes a visible failure, not an eternal "Sending".
- **Electron §9.3 unchanged**; plugin ships via `extraResources` and its path resolves in both dev and packaged runs (mirror `resources/scrcpy`).
- **`.context.md` amendments ride in this same change** (⏸️ Emenda, 2026-08-07, decisão do dono do produto): §8.4/§8.5 + rule 24 — the sheet's note is AI-prefilled and **editable**, still never required (title stays invisible/AI-owned; the "no fields" absolute is amended, its spirit — nothing to fill — stands); §8.3 — base branch is the clone's own, `CONDUCTOR_BASE_BRANCH` as override; §8.3's merged/closed detection is now validated as specified here; §9.1 — the Git row reflects the `git` binary via `run.ts`, not `simple-git`.
- **Plugin format**: `resources/conductor-plugin/` with `.claude-plugin/plugin.json` and one skill (name it `describe-changes`), invoked by name in the prompt we compose — it is the same plugin dir §6.0 mandates for both invocations; keep it AIPanel-compatible (nothing in it may assume the describe task).

## Out of scope

- The AI writing or editing tests, and the AIPanel chat session (future work the user already flagged; the plugin/skill layout must merely not preclude it).
- Conflict/mergeability pre-warning ("someone changed this test before you"), review comments, CI status.
- DoctorService or any Doctor UI (gh/claude/maestro failures surface inline with their stable codes).
- Multiple simultaneous publications per repo, choosing which files go (§8.3: everything changed, always), un-sending/reverting.
- i18n, RemoteGateway, reviewer identity (CODEOWNERS), PR templates of the target repo.

## Decisions & assumptions

- The "What changed?" note is AI-prefilled and user-editable → decided by the product owner in this request; amends §8.4/§8.5/rule 24 as listed in Constraints.
- PR merged/closed detection is in scope, on open/switch/sheet-open, never on click → confirmed (Q1).
- The PR body (and title) are rewritten on every send over the full publication diff via `gh pr edit` → confirmed (Q2).
- PR base = the clone's own default branch, `CONDUCTOR_BASE_BRANCH` env as override → confirmed (Q3).
- Generated text is English → confirmed (Q4).
- The PR title stays AI-written and never appears in the sheet (§8.4 stands); mechanical fallback title when the AI is unavailable.
- Publication state lives in its own `userData/publications.json` owned by `PublishService` (not in `repos.json` — no migration risk), keyed by repo slug, one open publication per repo.
- (Assumed) Branch slug fallback when no flow is open at publication birth: `tests`.
- (Assumed) `publish:cancel` serves both job kinds; the UI only wires it to the describe job (the kit's sending state offers no cancel), and send steps are individually timeout-guarded instead.
- (Assumed) Commit author/committer come from the user's own git config (present for any `gh` user); a missing identity surfaces as a normal send failure, not something we configure behind the person's back.
- **CLI verification outcomes (2.1.224 / maestro 2.8.0, constraint "verify before coding")**: `--setting-sources ""` is accepted empty; `--output-format json` answers one object with the final text in `result` (`is_error`/`subtype` checked); `maestro check-syntax` takes only `<file>` — no `--device`, no `--no-reinstall-driver` (rule 10 stands). **Deviation from criterion 10's literal flag list:** the profile is `--tools "Skill,Read,Glob,Grep"` — the installed `--tools` restricts the whole built-in set, and without `Skill` the model cannot load the skill the prompt names (verified live: the model asked for permission instead of answering; with `Skill` it answered the exact TITLE/DESCRIPTION contract at $0.13 ≤ the $0.25 cap). The §8.4 intent — no Bash, no Write, no Edit — is untouched.
- Push auth rides each networked git call as a per-invocation credential helper (`-c credential.helper=` reset + `-c credential.helper=!"<gh>" auth git-credential`) — never `gh auth setup-git`, which would edit the person's gitconfig behind their back.
- The branch date is UTC (`toISOString`), deterministic under the injectable clock. Known §8.3-model edge, accepted: a publication closed and re-opened the same day for the same flow can collide with the stale remote branch; the send then fails with the criterion-26 product message and the raw cause in the console.

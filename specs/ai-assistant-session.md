# AI assistant session — wire the AI window to a real `claude`

status: done
created: 2026-08-14

## Goal

Turn the AI window from a fixture into the product's differentiator (§6): the person types "Quero implementar os testes e2e do fluxo de login" into the Composer, and a headless `claude` session — isolated from the user's environment, carrying our plugin's skills, seeing the device through its own `maestro mcp` — reads the app's source for the journey, inspects the live screen for selectors, and writes the flow into `conductor/`, where the watcher re-renders the editor in front of the person while the assistant's words stream token by token into the panel. Done means the fixture thread, suggestions and status line are gone; a real multi-turn conversation writes real files that appear live in the editor; and every §6 guardrail — isolation, allowlist, no `Bash`, the conversation ceiling — is enforced by construction, not by prompt.

## Context

- **Files/modules this touches**:
  - `src/shared/ipc.ts` — channels `ai:send`, `ai:cancel`, `ai:reset`, `ai:status`; push `ai:event`; the `AiEvent` union; new `ERROR_CODES` (`ai/no-repo`, `ai/claude-missing`, `ai/active`, `ai/budget-exceeded`, `ai/turn-failed`); `ConductorApi` grows the matching functions.
  - `src/shared/config.ts` — `AI_BUDGET_USD` (the §6.4 conversation ceiling; `AI_DESCRIBE_BUDGET_USD`'s comment already points at it).
  - `src/main/services/ai.service.ts` (new) — `AiService`: turn lifecycle, one `claude -p` child per message, stream-json parsing, `--resume` bookkeeping, budget accounting, the snapshot lease, `dispose()`.
  - `src/main/ipc/ai.ts` (new) — `registerAiIpc`, thin per the architecture.
  - `src/main/index.ts` — construct, wire (repo/device/snapshot/run deps by injection), disposal registry.
  - `src/preload/index.ts` + `index.d.ts` — one named function per new channel, `onAiEvent` subscription.
  - `src/renderer/src/stores/ai.store.ts` (new) — thread, streaming turn, activity, availability; its actions are the only callers of the new `window.conductor.ai*` commands.
  - `src/renderer/src/hooks/useAiEvents.ts` (new) — app-wide subscription writing into the store.
  - `src/renderer/src/lib/diff-lines.ts` (new, pure) — line diff for the editor's `ai` wash.
  - `src/renderer/src/views/AIPanel/AIPanel.tsx`, `views/Composer/Composer.tsx`, `views/FlowEditor/FlowEditor.tsx` — wire to the store; drop the code-block + "Insert into flow" affordance (§12.21: the file is the deliverable).
  - `src/renderer/src/stores/ui.store.ts`, `src/renderer/src/fixtures/flows.ts`, `App.tsx` — `THREAD`, `SUGGESTIONS`, `AI_LINES`, `ASSISTANT_STATUS_LINE` and `ChatTurn` leave the fixtures; `thread`/`aiLines` leave `ui.store` (`errorLines`, `RUN_STATUS_LINE`, `ENVIRONMENT` stay — not this spec's).
  - `.context.md` — amendments in the same change (see Constraints).
- **Existing patterns to follow**: `publish.service.ts:446` (`generate`) is the `claude` spawn precedent — `resolveClaude`, argv array, env passthrough, `AbortController` + timeout, budget flag; `conductorPluginDir` and `stripFrontMatter` are exported there and are reused, never copied. `maestro-mcp.service.ts` is the long-lived-child precedent (`spawnStreaming` seam, stable error codes, `dispose`). `SnapshotService.suspend()/resume()` + `ERROR_CODES.runActive` are the device-exclusion precedent this spec extends. `RunService` is the start → push events → cancel shape. `flow.store.ts` (`reloadOpen`, `revision`) already renders external disk edits — the AI rides that path unchanged.
- **Product & decision docs**: `.context.md` §6.0–6.5 (the invocation, isolation, context, budget), §4.3.2–4.3.7 (the two `maestro mcp` children, the measured silent-truncation contention, the §4.3.4 allowlist), §5.5, §8.0 + §1.2 (who reads the chat), §12 rules 17–19, 21, 22, 24; `specs/flow-authoring-skills.md` — the four decisions it defers to "the AI-window spec" are resolved here (Decisions).
- **Design & conventions**: the built `AIPanel`/`Composer` already match the kit (`docs/Conductor Design System/components/studio/ChatMessage.jsx`, `ChatComposer.jsx`, `guidelines/color-ai.html`); this spec changes what feeds them, not their look. Everything AI-facing keeps the `ai` variant/glow.
- **Tests**: Vitest `main` — `ai.service.test.ts` with a fake `spawnStreaming` child emitting canned stream-json lines (turn lifecycle, flag set, resume ids, budget math, lease, dispose), `ipc/ai.test.ts`; `renderer` — `ai.store.test.ts`, `useAiEvents.test.tsx`, `diff-lines.test.ts`, RTL updates for `AIPanel`/`Composer`/`FlowEditor`. No `claude` runs in CI (§9.0); behaviour is proven by the manual evaluations in criterion 30. TDD per `.claude/skills/test-driven-development`; no E2E.

## Acceptance criteria

### The session — spawn, isolation, resume

1. When `ai:send` arrives with a person's message, `AiService` shall spawn exactly one `claude` child for that turn through the injected streaming seam, and the arguments shall carry, at minimum: `-p`, `--model` `CONFIG.AI_MODEL`, `--output-format stream-json`, `--include-partial-messages`, `--setting-sources ""`, `--strict-mcp-config`, `--plugin-dir` = `conductorPluginDir`, an `--mcp-config` whose single server runs `maestro mcp --no-viewer` with `MAESTRO_CLI_NO_ANALYTICS=1`, a tool allowlist of exactly `mcp__maestro__inspect_screen`, `mcp__maestro__take_screenshot`, `mcp__maestro__list_devices`, `mcp__maestro__cheat_sheet`, `Read`, `Edit`, `Write`, `Glob`, `Grep` (§4.3.4 — never `Bash`, never a blocklist), and a `--max-budget-usd` equal to the conversation's remaining budget.
2. The child's working directory shall be the active repo's clone root, its env the process env passed through (the user's own `claude` login, §6.4/§9.0) plus `MAESTRO_CLI_NO_ANALYTICS=1`, and the person's message shall cross as an argv element — never through a shell (§12.19).
3. The spawn arguments shall carry a permission configuration under which `Edit` and `Write` succeed only inside `<clone>/conductor/` — reads reach the whole clone, writes never leave the flows folder. The mechanism (path-scoped allow rules vs. a `--settings` file of ours) is chosen against the installed CLI and recorded in the PR; a unit test asserts the configuration is present in the argv, and evaluation 30d proves it holds.
4. When a turn's stream reports its session id, `AiService` shall remember the id from the **completed** turn's terminal event, and the next `ai:send` shall pass it via `--resume` — so a conversation spans processes; a canceled or failed turn's id is discarded and the next turn resumes from the last completed state.
5. While a turn is in flight, a second `ai:send` shall be refused with `ai/active`; while no repo is connected, with `ai/no-repo`; while a flow run is active, with `run/active`; and when the conversation's spend has reached `CONFIG.AI_BUDGET_USD`, with `ai/budget-exceeded` — each carrying a product-language message, and the budget refusal naming the limit as a limit ("this conversation has reached its limit — start a new one"), never as an amount.
6. If `resolveClaude` finds no binary, `ai:send` (and `ai:status`) shall answer `ai/claude-missing`, and the panel shall show what Claude Code is and that installing it enables the assistant — in product language, no terminal jargon beyond the install pointer.
7. If the child exits non-zero and its output identifies authentication as the failure, the surfaced message shall say the person's Claude sign-in is needed — distinct from the generic `ai/turn-failed`, the way `repo/gh-missing` and `repo/gh-unauthenticated` are distinct (§8.1's spirit).

### The stream — what crosses as `ai:event`

8. While the child streams, `AiService` shall push typed `ai:event`s: `turn-started`; `text-delta` for assistant text as it arrives (token-by-token in the panel, §6.0); `activity` naming the tool category in product terms; `file-edited` carrying the repo-relative flow path whenever an `Edit`/`Write` tool call names a file under `conductor/`; and a terminal `turn-ended` with outcome `done | canceled | failed`. Spend is read from the stream's own cost reporting and accumulated main-side only — it is not part of any push payload (criterion 25). Unknown stream-event types are ignored, never fatal.
9. The activity mapping shall speak the product's language (§8.0, §12.24): reading files → "Reading the app's code…", `mcp__maestro__inspect_screen`/`take_screenshot` → "Looking at the screen…", `Edit`/`Write` → "Writing the test…" — never tool names, YAML, selector or regex vocabulary in app-authored strings.
10. When a turn exceeds its time ceiling (a service-level constant with an injectable override, generous — minutes, not seconds), the child shall be killed and the turn shall end as `failed` with an honest message.
11. `ai:cancel` shall kill the in-flight child, end the turn as `canceled`, and roll nothing back — an edit already on disk stays, exactly as saving works everywhere else (§12.23); the panel keeps the partial text, marked stopped.
12. `ai:reset` shall end any in-flight turn, clear the remembered session id and the accumulated spend, and push the reset so the renderer empties the thread; switching or disconnecting the active repo shall do the same implicitly (a conversation is about one repo's flows and one clone's cwd).
13. `AiService.dispose()` shall kill any live child and settle the snapshot lease, and the service shall be in `index.ts`'s disposal registry — `before-quit` leaves no `claude` child behind.
14. Every new handler shall validate `event.senderFrame` and parse with the channel's schema via `ipc/handle.ts`, the message bounded (non-empty, ≤ 10 000 chars).

### Device exclusion — one driver, one owner (§4.3.2)

15. Before spawning the child, `AiService` shall suspend the snapshot path and wait out any in-flight capture — the same `SnapshotService.suspend()` discipline `RunService` uses — and resume it when the turn settles, whatever the outcome.
16. While an AI turn is in flight, `maestro:snapshot` shall be refused with `ai/active` and a message saying the assistant is looking at the screen — distinct from `run/active` so each surface names its own cause; while a flow run is active, `ai:send` is refused per criterion 5. The mirror and its input (scrcpy over adb, no Maestro) shall be unaffected in both directions.
17. Before merge, the mcp-vs-mcp contention shall be measured once on real hardware — our warm `inspect_screen` against the AI child's session, per §4.3.7's release-check obligation — and the result recorded in the PR; if idle-session contention appears, the finding and its mitigation decision are recorded as a `.context.md` amendment, not silently absorbed.

### Context the model receives

18. The invocation shall carry `--append-system-prompt` composed of the `work-in-conductor` skill body (read through `conductorPluginDir` + `stripFrontMatter`, the §8.4 read path) plus the session facts that hold for the whole conversation: the active repo's `appId` when known, and that replies follow the person's language. The skill file itself remains in the plugin unchanged — one source, loaded every turn, resolving the drift risk `flow-authoring-skills` recorded.
19. Each `ai:send` shall prepend an app-authored, clearly-fenced context block to the person's message carrying the volatile facts: the flow open in the editor (repo-relative path, or that none is), and the connected device (id and platform, or that none is). The person's own words cross verbatim inside it.
20. When no device is connected, the send shall still proceed — the context block says so, and the embedded skills make the assistant explain and ask rather than write selectors from memory (evaluation 30b; the app adds no second gate).

### The renderer — panel, composer, editor loop

21. The `AIPanel` shall render the real conversation from `ai.store`: person turns bubbled, assistant turns unbubbled under the existing byline, streaming text growing as `text-delta`s land, the current activity line while tools run, and error states as quiet in-thread notices; the fixture code block and its "Insert into flow" button shall be gone — a flow is delivered as the file, never as chat text (§12.21).
22. While the thread is empty, the panel shall show the greeting and app-authored suggestion pills in the journey's vocabulary (e.g. "Write a test for the login flow"); clicking a pill sends it as a message.
23. The Composer shall send on the send control and on Enter (Shift+Enter inserts a newline), clear the draft on successful send, and — while a turn streams — replace send with a stop control wired to `ai:cancel`; the assistant's availability gates it (no repo / no `claude` → disabled with the reason nearby).
24. `useAiEvents` shall be mounted app-wide in `App.tsx` (events keep landing while the Run tab is selected), and its subscription returns the unsubscribe that effect cleanup calls.
25. While the assistant panel is the active lower tab, the status line shall carry the assistant's state in product language — empty while it is idle and ready, the blocking reason while it is not (no repository connected; Claude Code not installed) — and no surface of the app shall ever display a cost, a token count or a budget (§6.4 as amended). The panel chrome shall offer a "new conversation" affordance wired to `ai:reset`, disabled while a turn streams.
26. When the assistant edits the flow that is open in the editor, the change shall appear through the existing watcher → `flow:changed` → `reloadOpen` path — this spec adds no second edit path into the editor (§12.21) — and when a `file-edited` event names a flow that is not open, the app shall open it in the editor and sidebar selection, so the person watches the test being written (the selection decision `flow-authoring-skills` deferred here).
27. When an assistant edit lands in the open editor, the lines that edit changed shall carry the editor's `ai` wash — computed by the pure `diff-lines` against the previous text — and the wash shall clear when the person edits the file, when the open flow changes, or when a newer assistant edit replaces it. Error lines keep precedence (the built criterion 27 ordering).

### Cross-cutting

28. No AI fixture shall remain: `THREAD`, `SUGGESTIONS`, `AI_LINES`, `ASSISTANT_STATUS_LINE` and `ChatTurn` leave `fixtures/flows.ts`, `thread`/`aiLines` leave `ui.store` — and nothing else in the fixtures file moves.
29. `npm run lint`, `npm run typecheck` and `npm test` shall pass with no new warnings.

### Manual evaluation (not automated — run by hand, recorded in the PR)

30. Before this spec is done, the author shall run and record pass/fail with a one-line note each, against a real device and a real `claude`:
    (a) the headline: "Quero implementar os testes e2e do fluxo de login", no flow open — a flow appears under `conductor/`, the editor opens and shows it live with the `ai` wash, every selector exists on the real screen, the reply is in Portuguese and in product language;
    (b) the same with no device connected — the assistant says so and asks, and writes nothing;
    (c) a follow-up turn ("adiciona uma checagem da mensagem de boas-vindas") — a surgical edit to the same file, comments intact, proving `--resume` carried the conversation;
    (d) a containment probe ("edita o README do projeto") — the write fails at the permission layer and the assistant says it only changes tests;
    (e) opening the inspector mid-turn — the refusal reads as "the assistant is looking at the screen", and the mirror keeps moving;
    (f) the criterion 17 contention measurement.

⏸️ **Criteria 17 and 30 are outstanding — the only ones.** Criteria 1–16 and 18–29 are delivered and green (2 593 tests, lint and both typechecks clean), and an independent verification pass graded every automatable criterion against the code. 17 and 30 need a real device, a real `claude` and a hand at the keyboard, which is why they assign themselves to the author and route their results to the PR. `status: done` marks the implementation, not the evaluation — the `flow-authoring-skills` precedent: **run the six before merging.** Everything needed is on this branch; the CLI-behaviour verification (the Constraints' other pre-merge obligation) is already done and recorded under *Decisions & assumptions*.

## Constraints

- **The `claude` CLI child is the only AI door** (§12.17): no model SDK, no API key, no new dependency for the stream — stream-json is parsed by us. Process creation stays behind the existing `process/run.ts` seams (§10.1); `AiService` receives `spawnStreaming` by injection and creates nothing itself.
- **Verify against the installed CLI before coding, and record the findings in the PR** (§6.0's own instruction): that `--setting-sources ""` is accepted; that `--resume` works with it; whether `-p` + `--output-format stream-json` requires `--verbose`; the exact stream-json event shapes and the `mcp__maestro__*` tool-name format (§4.3.4's caveat); and the permission-rule syntax criterion 3 rides on. Behaviour read from the real binary, never deduced from `--help`.
- **`--bare` stays forbidden** (§6.0 — it breaks subscription auth), and the allowlist is an allowlist (§12.12).
- **The renderer never talks to `claude`**: everything crosses as `ai:*` channels; store actions are the only command callers; push payloads wear the `Result` envelope like every other push channel.
- **The plugin is not modified**: `write-flow`, `work-in-conductor`, `describe-changes` and the manifest ship as they are; this spec consumes them.
- **`.context.md` amendments travel in this change** (per `AGENTS.md`): §12.18 (the AIPanel session's scope is the whole clone read-side, writes contained to `conductor/` at the permission layer), §6.0/§6.2 (respawn + `--resume` decided; the turn-scoped exclusion; the snapshot-file fallback superseded unless criterion 17 says otherwise), §6.4 (the ceiling stays, its display is dropped — see Decisions), §13 (step 8 delivered). `AGENTS.md` itself already names the `ai` service and needs no edit.
- **App-authored strings obey §8.0/§12.24**: test, screen, journey — never YAML, selector, regex, branch or commit; the assistant's replies follow the person's language (the skills already handle it).
- **Budget**: `CONFIG.AI_BUDGET_USD` defaults to `0.50` with a `CONDUCTOR_AI_BUDGET_USD` override, matching the file's own pattern; spend is accumulated main-side and the remainder rides each spawn, so the flag itself enforces the ceiling worst-case. The number stops at `AiService` — it crosses no channel, enters no store, and reaches no screen.
- **Streaming stays cheap**: `text-delta`s may be coalesced per stream chunk, stores selected narrowly — a token stream must not become whole-app re-renders (the mirror rule, §9.2's spirit).

## Out of scope

- **The assistant driving the device** — `mcp__maestro__run` stays off the allowlist. Inherited from `flow-authoring-skills`' parking, and criterion 17's measurement is a prerequisite for ever revisiting; when it lands, the allowlist, §4.3.4, and the skills' criteria 5/12/23 move together in their own spec.
- Conversation persistence across app restarts, or a multi-conversation history UI — one in-memory conversation per repo per app session.
- `DoctorService` (§10) — the `ai/*` codes are written for it to consume later, the panel's inline guidance is this spec's whole surface.
- Wiring `errorLines` (run domain) and `RUN_STATUS_LINE` — they stay fixtures here.
- A persistent `--input-format stream-json` child — recorded as the revisit path if per-turn spawn latency proves painful, carrying the idle-session contention caveat with it.
- The §6.2 snapshot-file fallback (superseded by the exclusion decision unless criterion 17 reopens it).
- Streaming the assistant's edits character-by-character into the editor (the watcher's save-granularity is the loop; §12.21).

## Decisions & assumptions

- **Respawn per message + `--resume`** (engineer, over §6.0's listed alternative) → one `claude -p` child per turn, dead at turn end, so the AI's `maestro mcp` JVM never holds a device session between turns — the §4.3.2 truncation class stays bounded to turns, and the lifecycle matches the publish precedent. Cost accepted: the first inspect of each turn pays the JVM cold start inside a model turn that dwarfs it, and the conversation ceiling becomes our arithmetic (criterion 1's remaining-budget flag).
- **The clone is readable, `conductor/` is the only writable surface** (engineer) → §12.18 amended by this spec; source code is a hint for journeys/testIDs, never a selector source — the shipped skills already enforce the reading discipline, the permission layer enforces the writing one.
- **Turn-scoped device exclusion, mirrored from `RunService`** (engineer) → `suspend()/resume()` around the turn, `ai/active` on the snapshot surface, symmetric refusal against runs, mirror untouched, release-check measurement before merge.
- **No device → the assistant asks and writes nothing** (engineer) → matches §12.1 and evaluation 28b of the skills spec; the app sends the fact, the skill owns the behavior.
- **The conversation's cost is never displayed** → the engineer's call, against §6.4's 🔷 "definir um teto por conversa e **mostrá-lo na UI**"; §6.4 is amended by this spec, and only the *display* is dropped. The ceiling still binds exactly as designed — `AI_BUDGET_USD` rides every spawn as `--max-budget-usd`, spend accumulates main-side, `ai/budget-exceeded` refuses past it — so the guarantee §6.4 was protecting (a runaway agent loop cannot spend without limit) is untouched. What goes is a running dollar figure on screen: the reader of this panel is not the person who can act on it (§1.2), and the same reasoning that keeps Git vocabulary off the screen (§12.24) keeps a cost meter off it. This is why criterion 8 stops the number at main rather than pushing it and leaving the renderer to ignore it.
- **`work-in-conductor` feeds `--append-system-prompt`** → resolves the drift risk `flow-authoring-skills` recorded: one file, read at spawn, also still a skill; nothing is duplicated by hand.
- **A canceled turn forks from the last completed state** → the discarded session id means the model never half-remembers a killed turn; the panel keeps the partial text marked stopped, and the person's next message stands on clean ground. Cost of a canceled turn may go unreported by the CLI; the per-spawn budget flag bounds it.
- **Simultaneous person + assistant edits of the same open flow are last-write-wins** → the AI is an external editor (§12.21's "one path, no special cases"); `flow.store`'s single-writer save model already arbitrates exactly this, and no lock is added over the editor.
- **Each `file-edited` event selects its flow** → turns realistically touch one file; if a person switches away mid-turn the next edit event pulls them back, accepted as the lesser evil versus missing the write entirely.
- **Suggestion pills are app-authored English generics** → the fixtures' app-specific Portuguese lines were review props; the real pills invite the headline journeys and stay in the UI's own language, while replies follow the person's.
- (Assumed, flagged for review) `--resume` reads the session store regardless of `--setting-sources ""` — sessions are state, not settings; the constraint's CLI verification proves it before any code depends on it.

### Resolved at implementation (verified against claude 2.1.232, the installed CLI — probes, not `--help`)

- **The assumption above held**: `--resume <id>` under `--setting-sources ""` recalled a fact planted one process earlier, and the session id stays the *same* across resumes.
- **`-p` + `--output-format stream-json` requires `--verbose`** — hard error without it. The shipped argv carries it.
- **Criterion 3's mechanism: path-scoped allow rules on `--allowedTools`, patterns resolved against the child's cwd.** `Edit(conductor/**)` + `Write(conductor/**)`: the inside write landed, the clone-root write auto-denied (headless has no prompt), the turn continued, the model was told why, and `result.permission_denials` recorded it — evaluation 30d's exact shape. No `--settings` file needed. **`Read` is spelled `Read(**)`**: a bare `Read` reaches the whole disk (verified against `/etc/hosts`), while the scoped form allows the clone and blocks above it — which is what makes §12.18's "whole clone read-side" literally true. `Glob`/`Grep` stay bare per criterion 1; with no `Bash` and no network the exposure is nil.
- **`--tools 'Read,Edit,Write,Glob,Grep,Skill'` rides alongside the allowlist**: it restricts the *available* builtin set (Bash/WebFetch/Task are not even announced — "no Bash" by construction) and leaves MCP tools untouched. `Skill` must be in it or the plugin's skills can never load — they load through the Skill tool (announced as `conductor:<name>`), and it needs **no** allowlist entry (invoked with zero denials), so `--allowedTools` stays exactly the spec's nine.
- **`--mcp-config` accepts inline JSON and needs the `{"mcpServers":{…}}` wrapper** (§6.2's sketch lacks it); the server connected and `mcp__maestro__cheat_sheet` was called live — §4.3.4's name format confirmed, all ten tools announced unconditionally, Cloud included.
- **The message rides after `--`** — a message beginning with a dash cannot parse as a flag, and the variadic allowlist cannot swallow it (verified).
- **Stream shapes**: `assistant` events carry one completed content block each (`tool_use` input whole — the `file-edited` source); with `--include-partial-messages`, visible text is `stream_event`/`content_block_delta`/`text_delta` *only* (assistant events would double it; thinking deltas never shown); `result` carries `total_cost_usd` + `session_id` + `permission_denials`. Unknown kinds occur in practice (`rate_limit_event`, `system/thinking_tokens`) — criterion 8's ignore-unknown is load-bearing.
- **`file-edited` carries the §7.2 flow identity** (the path relative to `conductor/`) — criterion 8 says "repo-relative", but the app has exactly one flow-identity vocabulary (`flow:changed`, `flow:save`, the sidebar, `openFlow`) and inventing a second spelling for the same file would put a translation at every consumer. The context block, being for the model, names the file as `conductor/<path>`.
- **The context block's device fact reads `id` + `model`, not `platform`** — criterion 19 says "id and platform", but the device domain is adb/Android-only today and carries no platform field; the model is how every other surface tells devices apart. The platform fact arrives with the iOS lane.
- **The auth failure keeps the `ai/turn-failed` code and gets its own message** — the Context's ERROR_CODES list is closed at five, so criterion 7's distinctness lives in the surfaced message (detected from the child's output), not in a sixth code.
- **`ai:cancel` and `ai:reset` take no turn id** — there is at most one turn in flight, and a stale Stop click naming yesterday's turn must not be able to kill today's; the answer says which turn was put down, or that none was.
- **The snapshot lease grew owners** (`suspend('run' | 'ai')`, default `'run'`): a suspend against the other owner's hold *rejects* carrying the holder's code, which is criterion 5 + 16's mutual exclusion with `RunService` completely untouched — its plain `suspend()`/`resume()` calls keep their meaning, and its failure-path `resume()` can no longer lift an AI hold.
- **The composer's placeholder says "write a test…"** (was "…a step…") — the deliverable this spec wires is the whole test.
- **Three findings from the independent verification pass, fixed before commit**: `config:get` used to answer `CONFIG` wholesale, which would have carried `AI_BUDGET_USD` over a channel — the handler now returns exactly the three declared fields; a reset racing a not-yet-spawned send used to let the turn spawn anyway and repopulate the emptied thread — the reset now frees the slot and the send answers a refusal; and a turn killed by reset whose `result` had already landed used to charge the *fresh* conversation's ledger — turns are stamped with their conversation and a late cost only lands on its own era.

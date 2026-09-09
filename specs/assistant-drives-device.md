# The assistant drives the device

status: done
created: 2026-09-09

## Goal

Give the AI window hands. Today the assistant can only *read* whatever screen happens to be
open, so a request as ordinary as "teste o fluxo de login com este e-mail e esta senha" turns
into the assistant asking the person to open the app, navigate to the login screen, type the
credentials themselves and report back the exact error text — the person doing the test by
hand while the assistant watches. Done means the opposite: the assistant opens the app, walks
the journey itself with the Maestro MCP `run` tool, inspects each screen it lands on, writes
the flow, runs the finished file to prove it passes, and only then reports back. It stops
asking the person to be its hands.

Three defects observed in one session (2026-09-08, prints in the request) all resolve here:
the assistant refusing to open the app; the assistant asking the person to tap "Entrar" and
transcribe the error message; and `Device server died during 'deviceInfo'` killing the
inspector mid-conversation, because our `maestro mcp` child and the assistant's were holding
the same on-device driver at once.

## Context

- **Files/modules this touches**
  - `src/main/services/ai.service.ts` — the `allowedTools` allowlist (`:39`), `pushActivity`'s
    label map (`:558`), the budget arithmetic (`:181`, `:378`, `:408`, `:676`), and the
    `snapshots.suspend('ai')` / `releaseLease` path (`:210`, `:290`).
  - `src/main/services/maestro-mcp.service.ts` — dead-session recovery, plus a way to stop and
    restart the child on demand (it has `dispose()` only, and `dispose` is terminal).
  - `src/main/services/snapshot.service.ts` — `suspend`/`resume` grow the "the device is really
    free" contract (`SnapshotLeaseOwner` stays `'run' | 'ai'`).
  - `src/main/index.ts` — the composition root wires whatever new dependency the two services
    need (`:270` builds `MaestroMcpService`, `:373` builds `AiService`).
  - `src/shared/config.ts` — `AI_BUDGET_USD` (`:120`) and its `CONDUCTOR_AI_BUDGET_USD` override.
  - `src/shared/ipc.ts` — `aiBudgetExceeded` (`:1249`) becomes dead and goes.
  - `resources/conductor-plugin/skills/write-flow/SKILL.md` — the craft grows a navigation and
    a verification step.
  - `resources/conductor-plugin/skills/work-in-conductor/SKILL.md` — "This session cannot run a
    test" is now false and must be rewritten.
  - `src/main/conductor-plugin.test.ts` — the structural guard over the shipped plugin; its
    assertion that naming `mcp__maestro__run` is a *failure* inverts.
- **Existing patterns/interfaces to follow**
  - `MaestroGateway`/`LocalGateway` — untouched here. The assistant reaches the device through
    *its own* `maestro mcp` child, which Claude Code owns (§4.3.7); we only decide the
    allowlist. No new process creator, no new IPC channel.
  - `RunService`'s lease discipline is the model for the contention fix — same `SnapshotService`
    lease, same "resume comes first in `settle`" ordering.
  - `MaestroMcpService.connected()`'s identity-not-slot reasoning already handles a child that
    dies; reconnection must keep it (a slow handshake must not kill a healthy successor).
- **Product & decision docs**: `.context.md` §6.0–6.2 (invocation, isolation, how the AI sees
  the screen), §6.4 (the budget ceiling — **amended by this spec**), §4.3.4 (the allowlist —
  **amended**), §4.3.6/§4.3.7 (device contention, the two `maestro mcp` children), §5.3–5.4
  (selector rules), §12.18 (the toolset), §8.0/§1.2 (who reads the chat).
  `specs/flow-authoring-skills.md` criterion 5 forbade naming `run` in a skill — **this spec
  reverses that decision**; `specs/ai-assistant-session.md` owns the turn lifecycle and lease.
- **Verified against the installed Maestro (2.8.0) before writing this spec** — findings that
  the implementation may rely on rather than re-derive:
  - `maestro/cli/mcp/tools/RunTool.class` registers the local tool `run`. Its own description:
    *"Simulate user interactions with a mobile device by running raw Maestro commands or
    Maestro flow files. Exactly one of `yaml`, `files`, or `dir` must be provided … 1) Inline
    YAML (preferred for exploration/debugging): { "device_id": "...", "yaml": "- tapOn: 123" }
    … Syntax is validated as part of this call; no separate pre-check is needed."* Args are
    snake_case (`device_id`), matching `inspect_screen`.
  - `maestro/orchestra/RunScriptCommand.class` and `EvalScriptCommand.class` exist, so
    `runScript`/`evalScript` are reachable *through* `run` — the one hole this capability opens
    in the "no `Bash`, no network" guarantee of §12.18. See Constraints.
  - The Cloud tools (`run_on_cloud`, `list_cloud_devices`, …) are still registered
    unconditionally; the allowlist stays an allowlist.
- **Tests**: Vitest `main` project. `src/main/services/ai.service.test.ts` (argv, activity
  labels, budget removal, lease), `src/main/services/maestro-mcp.service.test.ts` (recovery,
  stop/restart), `src/main/services/snapshot.service.test.ts`, and
  `src/main/conductor-plugin.test.ts` (the skills' structural guard). No `claude` and no device
  in CI — behavioural quality is proved by the manual evaluation in the last criterion, the way
  `flow-authoring-skills` did it. TDD per `.claude/skills/test-driven-development`; no E2E.

## Acceptance criteria

### The assistant may act on the device

1. [x] The system shall include `mcp__maestro__run` in the AI turn's `--allowedTools`, alongside
   the four Maestro tools already there.
2. [x] The system shall keep the allowlist an allowlist: no Maestro MCP tool other than
   `inspect_screen`, `take_screenshot`, `list_devices`, `cheat_sheet` and `run` is permitted,
   and every Cloud tool stays out with no blocklist entry naming it.
3. [x] The system shall not add `Bash`, `WebFetch` or any other built-in tool to `--tools`; the
   built-in set stays `Read,Edit,Write,Glob,Grep,Skill`.
4. [x] When the assistant calls `mcp__maestro__run`, the system shall push an `activity` event
   whose label is in the person's language and names the act, not the tool — "Using the app…"
   — and shall continue to let no tool name cross the IPC boundary.
5. [x] Where a turn both drives the device and edits a flow, the system shall keep emitting the
   existing `flow:changed`-shaped edit events unchanged: `run` produces no file edit and shall
   never be reported as one.

### The skills teach it to navigate and to verify

6. [x] The `write-flow` skill shall instruct the assistant to reach the screen it needs **itself**:
   launch the app and walk to it with `mcp__maestro__run` using inline `yaml`, inspecting the
   screen again after every move, instead of asking the person to navigate.
7. [x] The `write-flow` skill shall instruct the assistant to use the app's own source in the
   clone — reachable with `Glob`/`Grep`/`Read` — as the map of where a journey lives (which
   screen, which route, which `testID`), while keeping the live hierarchy as the only source of
   selector truth. A `testID` read from the source is a hypothesis to confirm in the tree,
   never a selector to write.
8. [x] The `write-flow` skill shall require the finished flow to be **run once** with
   `mcp__maestro__run` against its file before the assistant reports it as done, and shall
   require the assistant to fix and re-run rather than hand over a flow it watched fail.
9. [x] If the flow still fails after the assistant has exhausted what it can fix, then the skill
   shall require the assistant to say plainly, in product language, what the app did instead of
   what was expected — never to report the test as finished, and never to delete the file.
10. [x] The `write-flow` skill shall forbid inventing test data exactly as today, and shall state
    that data the person has given in the conversation is data to *use*, not to re-confirm: the
    assistant runs the journey with it and reports what the app actually did.
11. [x] The `work-in-conductor` skill shall replace "This session cannot run a test" with what is
    now true: this session can act on the device and run flows, everything it does is visible in
    the mirror, and it acts only inside the journey it was asked about.
12. [x] The `work-in-conductor` skill shall forbid authoring or executing `runScript` and
    `evalScript` in any flow or inline `yaml`, stating the reason in one line: they execute
    arbitrary code and reach the network, which nothing in this session is allowed to do.
13. [x] The `work-in-conductor` skill shall forbid `mcp__maestro__run` from touching anything
    outside the journey under discussion — no `dir` mode, no running the whole suite, no flow
    file outside `conductor/`.
14. [x] Where no device is connected, the skills shall keep today's rule unchanged: say so, ask for
    a device, and write nothing.
15. [x] The system shall keep every structural guard of `specs/flow-authoring-skills.md` criteria
    1–7 passing (frontmatter, ≤500 lines, resolving links, fully-qualified MCP names, no
    scripts, no dates), with the allowlist those guards check now including `run`.

### One client on the device at a time

16. [x] While an AI turn holds the snapshot lease, the system shall hold no `maestro mcp` child of
    its own against the device: taking the lease for `'ai'` stops the Conductor's own MCP child,
    and the JVM is gone before the `claude` child is spawned.
17. [x] When an AI turn settles — completed, cancelled, failed or timed out — the system shall
    leave the Conductor's own MCP path able to serve the next inspection, starting a fresh child
    on first use.
18. [x] While a flow run holds the lease (`'run'`), the system shall behave exactly as it does
    today: this criterion changes nothing on the run path.
19. [x] The system shall keep the device mirror (scrcpy over `adb`) running untouched in both
    directions, so the person watches the assistant drive the app live.
20. [x] If stopping the Conductor's MCP child fails, then the system shall still start the turn:
    a child that will not die is a worse reason to refuse the assistant than the contention it
    was meant to avoid, and the recovery below covers the consequence.

### A dead device session recovers itself

21. [x] If a `maestro mcp` call fails because the device session died while the child lives — the
    `Device server died during '<call>' on <device>` / `StatusRuntimeException: UNAVAILABLE`
    class of failure — then the system shall discard that child, start a new one, and retry the
    call once, without the person seeing an error.
22. [x] If the retry also fails, then the system shall surface the failure as it does today, and the
    Retry button in the mirror shall reach a freshly started child rather than the dead one.
23. [x] The system shall retry at most once per call, and shall never retry a failure that is not a
    dead session (a missing tool, a Maestro that will not start, a timeout on a live session).
24. [x] While Conductor is shutting down, the system shall start no replacement child.

### The conversation has no spend ceiling

25. [x] The system shall not pass `--max-budget-usd` on the AI window's `claude` invocation, and
    shall not track accumulated spend for the conversation.
26. [x] The system shall refuse no `ai:send` for reasons of cost, and `ai/budget-exceeded` shall no
    longer exist as an error code.
27. [x] The system shall keep every other §6.4 guarantee: no cost, token count or budget reaches any
    channel, store or screen.
28. [x] The system shall keep `AI_DESCRIBE_BUDGET_USD` and the publish-time describe invocation
    exactly as they are — this criterion is about the AI window's conversation only.
29. [x] The system shall keep the per-turn timeout at its current ceiling (`TURN_TIMEOUT_MS`,
    10 minutes) and shall keep reporting a timed-out turn as it does today.

### Proof on real hardware

30. [ ] The system shall be evaluated once, by hand, on a connected Android device against the
    Expo preview app, from a Conductor whose `conductor/` folder is **empty**, with the single
    message *"Teste o fluxo de login digitando como e-mail: test@test.com E a senha: a@a"* and
    no further human input: the assistant shall open the app itself, reach the login screen,
    write `conductor/login.yml`, run it, and report in Portuguese what the test does and what
    the app answered — with no request that the person navigate, tap or transcribe anything.

## Constraints

- **`run` widens the blast radius, and it is a deliberate trade.** The assistant now acts on the
  person's real device against the real app: it can reset app state, tap real buttons and submit
  real forms. Two things keep it bounded and both are instructions, not flags — the Maestro MCP
  allowlist is name-level only, so tool *arguments* cannot be constrained by us: (a) it acts only
  within the journey it was asked about (criterion 13); (b) it never authors `runScript` or
  `evalScript` (criterion 12), which are the one path from this session to arbitrary code and the
  network. Anyone weakening either instruction is weakening §12.18's guarantee.
- **No new process creator.** The `run` calls happen inside Claude Code's own `maestro mcp`
  child. `src/main/process/run.ts` and `CliRunner` stay the only two files that create OS
  processes (§10.1); nothing here needs a Biome exception.
- **The `--setting-sources ""` / `--strict-mcp-config` / `--plugin-dir` isolation is untouched.**
- **`--no-viewer` and `MAESTRO_CLI_NO_ANALYTICS=1` stay on both children** (§4.3.5).
- **Cold start is the price of criterion 16**: the first inspection after an AI turn pays the
  JVM's ~5.6s again instead of ~300ms. Accepted — a snapshot that is slow once beats a driver
  that dies mid-conversation.
- Skill bodies stay ≤500 lines, English, no dates, no scripts.
- Chat language rules are unchanged: product vocabulary only, reply in the person's language,
  and the banned-vocabulary list still holds.

## Out of scope

- Any new IPC channel, store or UI surface. The AIPanel renders what it already renders.
- Showing the assistant's run as a first-class run in the Run panel — its `run` calls are not
  `RunService` runs and produce no step list. The mirror is the only live window into them.
- Changing the Run button, `RunService`, `CliRunner`, or the flow-run path in any way.
- iOS. The evaluation and the contention reasoning are Android-first; nothing here is
  Android-specific by construction, but nothing is proved on `simctl` either.
- Rewriting `HierarchyParser`, `SelectorSynth`, or anything on the inspector's synthesis path.
- The publish path and the `describe-changes` skill.
- Any change to `TURN_TIMEOUT_MS`.

## Decisions & assumptions

- Assistant blocked from acting on the device → **allowlist `mcp__maestro__run`, for both
  exploration and verification**. It navigates *and* runs the finished flow, rather than
  exploring only and leaving the verdict to the Run button.
- Two `maestro mcp` children on one driver → **the AI's lease stops ours**. `suspend('ai')` kills
  the Conductor's MCP child and it restarts on the next inspection, rather than leaving the
  inspector warm and hoping the driver tolerates two clients.
- `Device server died` recovery → **in this spec**, not a follow-up: it is the same subsystem the
  contention decision touches.
- Cost ceiling → **removed entirely** (product owner, 2026-09-09: "não precisa ter teto"). Driving
  a device costs several times what a chat turn costs, and a conversation dying mid-journey with a
  refusal the person cannot act on is worse than an uncapped spend on the person's own Claude
  subscription. This **amends `.context.md` §6.4's amendment**, which mandated `--max-budget-usd`
  and `ai/budget-exceeded`; §6.4's other guarantee — that no number reaches any screen — survives
  intact and is criterion 27. `.context.md` §6.4 and §4.3.4 are updated in the same change.
- `specs/flow-authoring-skills.md` criterion 5 ("naming `run` is a failure") → **reversed**, and
  its guard test inverts with it. The reason it existed — Cloud tools shipping unconditionally —
  is unchanged and is still served by the allowlist.
- **Where the "stop our own child" hook lives → in the lease, not in `AiService`.** Criterion 16
  says *taking the lease* stops the child, so `SnapshotService.suspend('ai')` is what calls it
  (`stopMcp`, a required dep wired to `MaestroMcpService.stop`). One place decides the device is
  really free, the run path keeps its warm session (criterion 18), and the ordering — wait the
  in-flight capture out, *then* kill — is enforced where the in-flight count already lives. The
  stop's failure is swallowed there with a `console.error` (criterion 20).
- **`stop()` resolves on the child's exit, not on the signal**, bounded by `STOP_TIMEOUT_MS`
  (5s). "The JVM is gone before the `claude` child is spawned" is only true if something waits
  for the exit; the bound is what keeps a child that will not answer a signal from hanging the
  turn forever.
- **The recovery discards synchronously; only the lease waits.** `retryOnFreshChild` kills and
  clears the dead child without awaiting its exit — its device session is already broken, and
  awaiting would add latency to every recovery plus a failure mode to swallow. Criterion 16 is
  the one that needs the JVM provably gone.
- **`run` is exempt from the plugin guard's bare-name check**, and only that check. "run" is an
  ordinary English word — "nothing will run", "at run time", "a green run" — so
  `(?<!mcp__maestro__)\brun\b` cannot tell a taught tool name from prose; every other
  allowlisted tool is a compound token and stays under the rule. The two checks that matter for
  it both cover it: it is in the allowlist and out of the withheld list. Named in
  `conductor-plugin.test.ts` as `ALSO_AN_ENGLISH_WORD`.
- **The guard's allowlist is now derived from `allowedTools()`** rather than hand-copied, which
  is what makes criterion 15 hold by construction: a skill can no longer teach a step the client
  blocks, and the two lists cannot drift.
- **`positiveOverride` went with `AI_BUDGET_USD`** — it was that override's only caller — and so
  did its own tests. Same for the `/budget/i` branch of `failureMessage`, unreachable once the
  flag stopped being passed, and for `ActiveTurn`'s `conversation` stamp and `costUsd`, whose
  only purpose was charging the right ledger. Three test files that used `ai/budget-exceeded` as
  an incidental example refusal now use `ai/active`.
- **Criterion 30 is not done.** No Android device is connected to this machine, so the manual
  evaluation on the Galaxy A07 against the Expo preview app has not been run. Everything it
  would exercise is implemented and unit-proven; the hand evaluation itself is outstanding.
- The observed "it did not create the file" → **not a defect**; the session's own last message
  shows the flow was written and only its final assertion was missing. The real defect was that
  the assistant could not observe the outcome it needed to write that assertion, which criteria
  6–10 remove. No file-creation criterion is added: `work-in-conductor` already mandates creating
  `conductor/<journey>.yml` when nothing is open.

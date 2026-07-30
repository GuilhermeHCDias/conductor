---
name: octo-implement
description: Implements an existing octo spec end to end under mandatory TDD — the building half of the octo workflow, run after octo-specify. Use when the engineer says "implement the checkout-guest-flow spec", "octo implement", "build the spec we just wrote", or asks to start coding a prepared spec. Given a spec name it implements that spec; given nothing, the newest one that isn't done — resolved to its git worktree by the bundled scripts/octo-worktree.sh. Does not rewrite the spec.
argument-hint: "[spec name]"
disable-model-invocation: true
metadata:
  version: 1.0.0
---

# octo-implement

The spec already defines *what* to build and how to verify it; the job here is deciding *how* and writing the code — without re-litigating the spec and without letting the work blow up the context window.

## Non-negotiables

- **TDD is mandatory — load and follow the `test-driven-development` skill.** Each acceptance criterion becomes a failing test *before* the code that satisfies it. Never invert this.
- **Work only inside the spec's worktree.** `resolve` gives you the absolute path; every file you read or edit and every command you run lives under it — `git -C <worktree>`, absolute paths, no `cd`. The main checkout is off-limits: code written there is the right change in the wrong place, invisible to the branch and to the PR.
- **The spec rules the *what*; project docs rule the *how*.** Read `AGENTS.md`/`CLAUDE.md` (root plus any nested in the directories you'll touch) before writing code — naming, structure, libraries, test layout, lint rules. Code that ignores them gets rejected in review even when tests pass. If they conflict with the spec: spec wins on behavior, project docs win on code style.
- **Ask only genuinely-unresolved questions.** Most ambiguity was settled at spec time. Before asking, re-read the spec and check the code — the answer is usually there. When you do ask, batch the questions, offer concrete options, and never assume in place of asking. Append any resolution to the spec's *Decisions & assumptions*.
- **Show evidence, not claims.** "Done" is proven by passing-test output and every criterion checked — not by asserting success.

## The flow

1. **Resolve the spec and its worktree.** Run `scripts/octo-worktree.sh resolve <slug>` (bundled with this skill) — or plain `resolve` for the newest spec that isn't `status: done`. It prints the worktree, branch, spec path and status; when it reports `candidates` greater than 1 it also lists the runners-up — name your pick, and if the right one isn't obvious, ask rather than guess. State the spec *and* the worktree path before starting, so a wrong target is caught immediately. Load the `test-driven-development` skill.
2. **Read the project conventions**, plus any convention source the spec points to.
3. **Explore — delegate if noisy.** Find where and how to implement; if it takes many reads, send it to a subagent and get back a compact summary that includes the relevant conventions (see *Subagents*).
4. **Plan.** Map each acceptance criterion to a test at the *lowest layer that proves it* (the TDD skill's layer guidance); write an E2E only where the spec's `Tests:` line calls for one — believing one is needed while the spec is silent is a genuine question, not a default. Decide the file changes and their order; note genuinely independent pieces. If exploration surfaced real new ambiguity, ask now — batched — before coding.
5. **Implement via TDD.** Red → green → refactor per criterion; keep cycles small. Set the spec's `status: doing` and tick criteria off as their tests pass.
6. **Verify.** Run the full affected suite. Prefer a fresh verification subagent to check the implementation against the criteria — the agent that wrote the code shouldn't grade it. Surface the evidence (command + output).
7. **Finish.** Set `status: done`, commit the work on the worktree's branch with a conventional message matching its type (`feat: …`, `fix: …` — the spec travels in the same history), and summarize what changed and how it was verified. The branch is now ready for `octo-review` and the PR.

## Subagents: protect the main context

A subagent helps by trading a lot of **raw noise** for a small **summary** — not by moving cost around (its ~15k-token startup lives in its window, but delegating still costs a delegate-wait-interpret round). Delegate only when the work passes all three checks:

- **Read or write?** Exploring and verifying favor a subagent; writing coupled code does not.
- **Noisy?** Dozens of file reads, big searches, trial-and-error → delegate. One or two reads → keep it in the main thread.
- **Compressible?** "Found X in Y, the pattern is Z" compresses well; code does not — never delegate writing you need back verbatim.

Work that passes all three: exploring a large codebase, researching an unfamiliar API, running the suite and summarizing failures, the final verification against the criteria.

**Keep coupled or convention-setting writing in one thread.** Naming, parameter shapes, and edge-case handling need continuous shared context; parallel agents in clean windows make conflicting implicit choices and produce code that doesn't integrate. This is sharpest when conventions are still being *defined* — the first piece of a new module should set the pattern the rest follow.

**Parallelize writing only when pieces are genuinely independent** — separate modules, an interface the spec already fixed, no shared state — and give each agent a self-sufficient brief with isolated files. The judgment test: *would two engineers doing these pieces need to talk to stay consistent?* Yes → one thread. When in doubt, serialize.

**Every brief must be self-sufficient.** A subagent starts with none of this conversation. Give it the task plus the exact context it needs, stated explicitly; prefer focused briefs ("find every caller of X and how they use it") over generic ones. That includes *where*: name the worktree path in every brief — a subagent left to default paths will explore or edit the main checkout, which is the wrong tree.

## Context discipline

- The spec file survives compaction *and* the engineer's `/clear` between skills — it is the only memory the next session gets. Keep its `status` and criteria ticks current; a fresh session resumes from exactly what the spec says, nothing more.
- If you keep hitting auto-compaction before finishing, the spec was too big — say so rather than pushing through a degraded context, and let the engineer narrow the spec.
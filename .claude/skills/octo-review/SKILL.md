---
name: octo-review
description: Pre-PR review of the changes built by octo-implement — the final octo step before the engineer opens the pull request, whose reviewer is an AI (CodeRabbit, Copilot review, a Claude action), not a human. Use when the engineer says "review my changes", "octo review", or "review before I open the PR". Two independent axes - Spec (was the task implemented correctly? — only octo has the spec) and Reviewer (what will the repo's AI reviewer flag? — read its actual config and pre-empt it).
disable-model-invocation: true
metadata:
  version: 1.0.0
---

# octo-review

The PR this branch becomes will be reviewed by an AI, not a human. That splits the job in two, and the two halves must not blend — a change can pass one and fail the other, and a single merged verdict lets one mask the other (Pocock's two-axis rule):

- **Spec axis — was the *right thing* built?** The PR bot will never see the spec; checking implementation against intent is the one review only octo can do. This axis is why the skill exists.
- **Reviewer axis — what will the bot flag?** The bot is deterministic enough to pre-empt: read its configuration and review the diff the way *it* will, so the PR arrives with nothing for it to say.

## Non-negotiables

- **Every finding cites its evidence** — a quoted spec line, a named rule from the bot's config, or a named smell. A finding that can't cite its source is dropped, not reported. This is the false-positive filter.
- **Machines before model.** Formatter, linter, typecheck, tests — run the repo's own gates first, at zero model cost. Never spend model attention on what a gate or the CI already reports.
- **Axes stay separate.** Two blocks in the report, no cross-axis ranking, each block honest about its basis. No spec found → say "no spec available", never invent requirements (octo normally guarantees one via the worktree).
- **Brief with pointers, never content.** Subagents get refs, paths and commands — not pasted diffs or file bodies. Cap each subagent's report (~400 words).
- **Ask before you fix.** Present findings, the engineer picks, implement only the picked — under TDD (load `test-driven-development`; behavior-changing fixes get their test first).
- **Close honestly.** AI-only review is the goal, not a certified fact — report what was checked and what wasn't; flag security-critical changes as the one case still deserving human eyes.

## The flow

1. **Pin and validate — cheaply.** Resolve worktree + spec (`octo-worktree.sh resolve`). Pin the base ref, confirm it resolves (`git rev-parse`) and the diff is non-empty; fail fast here, not inside subagents. Read only `git diff --stat` in the main thread. Over ~400 changed lines: warn that review quality degrades (for the PR bot too) and the spec was probably too big.
2. **Run the machines.** Gate commands come from AGENTS.md/CLAUDE.md, package.json/Makefile, CI config. Failures are deterministic findings — collect them.
3. **Know the reviewer.** Find the bot's brain and read it: `.coderabbit.yaml`, `.github/copilot-instructions.md`, review workflows under `.github/workflows/`, reviewer prompts, plus documented standards (CONTRIBUTING, coding-standards docs). Found → those rules ARE the Reviewer axis. Nothing found → fall back to the universal AI-reviewer profile: edge cases, error handling, security patterns, missing tests, leftover debug code, and the Fowler smell baseline (e.g. duplication, feature envy, speculative generality) — judgement calls, never hard violations; documented rules override the baseline; skip anything a gate enforces.
4. **Review — two parallel subagents, one message.** Each gets pointers (diff command, worktree path) plus its axis brief:
   - *Spec:* the spec path. Report criteria missing or partial, behavior the spec never asked for (scope creep), and criteria implemented incorrectly — quoting the spec line for each.
   - *Reviewer:* the config/standards paths (or the baseline). Report what the bot will flag, citing the rule or smell by name, distinguishing hard violations from judgement calls.
   Both read selectively — hunks, plus enclosing code and callers of changed signatures; whole files only when structure changed. Findings only, never a diff restatement. *(Tiny diff — few files, <~150 lines — in a session that didn't write the code: review inline instead, keeping the two-block report; a subagent shouldn't cost more than the reading it does.)*
5. **Verify blockers.** For each blocking claim, read just the cited lines in the main thread; drop what doesn't hold.
6. **Present in two blocks** — `Spec` (S1, S2…) and `Reviewer` (R1, R2…), each finding with where, why, severity, evidence, proposed fix; gate failures listed first as facts; nits folded into one line each block. One-line close: counts per axis, worst per axis. Then: *"Which do you want me to resolve?"*
7. **Fix selected under TDD, re-run affected gates,** show evidence.
8. **Package the PR for AI-only review.** What makes human review skippable is the PR carrying what the bot can't reconstruct: title from the branch's `<type>/<slug>` (conventional commits), body with the spec's goal + acceptance criteria as a checklist, the criteria→test mapping, and the gate/test evidence. Offer to write it; the engineer opens the PR.

## Done

Gates green, both axes reported with cited evidence, the engineer's selection fixed and re-verified, PR description drafted, honest close delivered.

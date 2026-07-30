# Changelog — octo-review

The octo suite (octo-specify, octo-implement, octo-review) versions as one unit: the three skills share the worktree contract, so their versions always match.

## 1.0.0 — 2026-07-18

First stable release. The contract:

- Premise: the PR's reviewer is an AI bot, not a human. Two independent axes, never blended — Spec (implementation vs. the octo spec the bot will never see) and Reviewer (pre-empt what the repo's bot will flag by reading its config).
- Repo gates (formatter/linter/typecheck/tests) run before any model judgment; every finding cites its evidence or is dropped.
- Fixes only what the engineer selects, under TDD; closes by packaging the PR (conventional title from the branch, criteria checklist, criteria→test map, gate evidence).
- User-invoked only (`disable-model-invocation`) — zero description cost in regular sessions.

# Changelog — octo-implement

The octo suite (octo-specify, octo-implement, octo-review) versions as one unit: the three skills share the worktree contract and `scripts/octo-worktree.sh`, so their versions always match.

## 1.0.0 — 2026-07-18

First stable release. The contract:

- Resolves spec + worktree via the bundled `scripts/octo-worktree.sh resolve [<slug>]`; no slug → newest spec that isn't done (`candidates` > 1 → name the pick, ask if unobvious).
- All work happens inside the spec's worktree (`git -C`, absolute paths); the main checkout is off-limits, and every subagent brief names the worktree path.
- Mandatory TDD via the `test-driven-development` skill; each criterion is tested at the lowest layer that proves it — E2E only where the spec's `Tests:` line calls for one.
- The spec file is the cross-session memory (survives compaction and the engineer's `/clear`): `status` flips todo → doing → done, criteria ticked as tests pass.
- Finishes by committing on the worktree's branch with a conventional message matching the branch type.
- User-invoked only (`disable-model-invocation`) — zero description cost in regular sessions.

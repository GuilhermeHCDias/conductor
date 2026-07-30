# Changelog — octo-specify

The octo suite (octo-specify, octo-implement, octo-review) versions as one unit: the three skills share the worktree contract and `scripts/octo-worktree.sh`, so their versions always match.

## 1.0.0 — 2026-07-18

First stable release. The contract:

- Spec is born inside its own git worktree (`<worktree>/specs/<slug>.md`), never in the main tree — created via the bundled `scripts/octo-worktree.sh create <type>/<slug>`; branch named per `references/branch-naming.md` (Conventional Commits types); one slug names spec, branch and worktree.
- Specify creates the worktree but never enters it; the approved spec is committed on its branch.
- One batch of targeted questions resolves every ambiguity — each question offers concrete options **and a recommended answer**; facts are looked up with tools, only decisions are asked; never assumes unless delegated.
- One request = one spec — specify never splits a request into multiple specs; the workflow assumes tasks arrive lean enough for a single implement session, and flags one that plainly isn't for the engineer to narrow.
- Template carries EARS acceptance criteria and a `Tests:` line (which layer proves the criteria, existing test to mirror) — a new E2E only for a business-critical journey no existing E2E covers.
- User-invoked only (`disable-model-invocation`) — zero description cost in regular sessions.

# Branch naming

Every octo branch is `<type>/<slug>`. The type vocabulary is the Conventional Commits one; the `<type>/<slug>` branch shape is the convention built on top of it — Conventional Commits itself governs commit messages, not branch names.

```
feat/checkout-guest-flow
fix/avatar-upload-timeout
refactor/extract-pricing-rules
```

## Pick the type from the spec's Goal

The Goal says what outcome the change produces. That — not the size of the diff or which files move — decides the type.

| Type | Use when the Goal is |
|---|---|
| `feat` | new capability a user or caller can now invoke |
| `fix` | correcting behavior that is already wrong |
| `refactor` | restructuring code with no behavior change |
| `perf` | making existing behavior faster or lighter |
| `test` | adding or repairing tests only |
| `docs` | documentation only |
| `build` | build system, dependencies, packaging |
| `ci` | pipeline and automation config |
| `chore` | maintenance touching no src or test behavior |
| `revert` | undoing a previous change |

When two types fit, prefer the one the *user* would notice. A performance rewrite that also fixes a timeout is `fix` if the timeout is why anyone asked for it. A refactor that quietly adds a capability is `feat` — the capability is the outcome that matters.

`style` exists in the vocabulary but is rarely a whole branch; formatting usually rides along with the change it touches.

## The slug is the spec name

The slug after the slash is exactly the spec's filename slug. That is what keeps branch, worktree, and spec addressable as one thing — `specs/checkout-guest-flow.md` lives in the worktree on `feat/checkout-guest-flow`. Never rename one without the other.

Slug rules, same as the spec's:

- **kebab-case, lowercase, ASCII.** Two to five words.
- **Name the change, not the ticket.** `fix/PROJ-1421` tells a reader nothing; `fix/avatar-upload-timeout` tells them everything. Put the ticket in the spec's Context.
- **Specific enough to stand alone.** `feat/search` will collide with someone's future work; `feat/search-typeahead-debounce` won't.
- **No verbs like `add`/`update`/`implement`.** The type already carries that: `feat/add-guest-checkout` says "feat" twice.

## Constraints that will bite

These are git and shell limits, not style preferences — violating them produces a branch that fails to create or a path that breaks in a script:

- **Lowercase only.** Worktree directories are derived from the slug, and on macOS a case-insensitive filesystem will treat `feat/Search` and `feat/search` as one directory while git treats them as two branches.
- **No `!`.** Conventional Commits marks a breaking change with `feat!:` in the *commit*; in a branch name `!` triggers shell history expansion. Record the break in the spec and the commit, never the branch.
- **One slash, no nesting.** `feat/checkout/guest` is a branch inside a `feat/checkout` directory, which makes a `feat/checkout` branch impossible to create later. Keep it flat.
- **Nothing git rejects:** spaces, `~ ^ : ? * [ \`, `..`, a trailing `/` or `.lock`, a leading or trailing `.`.

## Examples

| | |
|---|---|
| ✅ `feat/guest-checkout-flow` | type matches the outcome, slug stands alone |
| ✅ `fix/session-expiry-race` | names the actual defect |
| ✅ `perf/dashboard-query-batching` | scoped and specific |
| ❌ `feature/checkout` | `feature` isn't a type; slug too generic |
| ❌ `fix/PROJ-1421` | ticket number carries no meaning to a reader |
| ❌ `feat/add-new-search-feature` | "add" and "feature" both duplicate the type |
| ❌ `Feat/Guest-Checkout` | uppercase breaks case-insensitive worktree paths |

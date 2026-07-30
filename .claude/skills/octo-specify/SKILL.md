---
name: octo-specify
description: Turns a feature request, bug, or change into one implementation-ready spec file — the planning half of the octo workflow, run before octo-implement. Use when the engineer says "create a spec for X", "spec out Y", "octo specify", or hands over a feature/ticket/PRD to prepare for implementation. Grounds itself in the codebase, then asks one batch of targeted questions to resolve every ambiguity and request missing documents instead of crawling the project for them. Creates the change's git worktree and branch first and writes the spec inside it, never in the main tree — one self-contained spec with EARS acceptance criteria. Never assumes unless explicitly told to; does not write implementation code.
argument-hint: "[feature or change to spec]"
disable-model-invocation: true
metadata:
  version: 1.0.0
---

# octo-specify

Produce **one spec file** that an AI agent can implement with no guessing. The entire value is resolving ambiguity now, on paper, instead of mid-implementation.

## Non-negotiables

- **Never assume — ask.** If anything that could change *what gets built* is unspecified, ask. Only exception: the engineer explicitly delegates ("use your judgment", "assume X") — then record the assumption in the spec so it stays visible.
- **Ask once, in a batch.** Collect every open question and ask them together in a single round. Make each question targeted — offer the concrete options *and mark your recommended answer*, so the engineer can approve or override each one in a word. Vague questions get vague answers.
- **Ground in the repo before asking.** Read the relevant code, `AGENTS.md`/`CLAUDE.md`, the README, and any design-system/schema/config files first — many answers are already there.
- **Ask for documents; don't go hunting for them.** Take one cheap look in the usual places (see *Finding and asking for documents*), then ask the engineer for the path or link to whatever is still missing. Never crawl the project reading files hoping a PRD or a contract turns up — one targeted question costs a line, an exhaustive search costs the context window you still need for the spec.
- **Define what, not how.** Goal, acceptance criteria, constraints. No implementation plan, no code — that's `octo-implement`'s job.
- **One request = one spec — never split.** The workflow assumes tasks arrive lean enough for a single `octo-implement` session; don't break a request into multiple specs. If one plainly can't fit one session, say so and let the engineer narrow it.
- **Write for an AI reader.** Concrete, unambiguous, testable — not prose for a human.

## The flow

1. **Gather context.** Read the request and the code it touches — files, interfaces, existing patterns — plus any document the engineer already handed you.
2. **Notice what wasn't handed over.** The engineer forgets context they take for granted. Decide which documents *this* task actually needs (see *Inputs engineers commonly forget*), look in the usual places, and queue a request for each one still missing (see *Finding and asking for documents*).
3. **Resolve ambiguity.** Find everything underspecified (see *Detecting ambiguity*), fold in the document requests from step 2, and ask everything in one batch.
4. **Create the worktree, then write the spec inside it.** Name the branch per `references/branch-naming.md` — the type comes from the Goal, the slug names the change — and run `scripts/octo-worktree.sh create <type>/<slug>` (bundled with this skill). Write the spec, using the template below, at the exact `spec=` path it prints — one file, no spec/plan/tasks split. Stay where you are: you create the worktree, you don't enter it — implementation happens there later, not now.
5. **Confirm.** Show the engineer the spec — especially the acceptance criteria — and adjust until approved. Once approved, commit it on its branch — `git -C <worktree> add <spec> && git -C <worktree> commit -m "docs(spec): <slug>"` — so the spec survives anything that happens to the tree and travels with the eventual PR. It's now ready for `octo-implement`; your job ends there.

## The spec file

The spec lives at `<worktree>/specs/<slug>.md` — inside the worktree that will implement it. One slug names everything: the spec file, the branch (`<type>/<slug>`), and the worktree directory — so spec, branch and tree find each other with no lookup table, and `octo-implement` can never grab the wrong tree. Slug rules are in `references/branch-naming.md` — choose it once, well.

**No number prefix — the slug is the identifier.** A sequence forces every run to race for the next free number and leaves teammates resolving merge conflicts over a name; a name never collides that way. Two people, or two parallel octo runs, can each spec with no coordination — each in its own worktree.

- **Never overwrite an existing spec.** `create` is idempotent: `created=no` with a status that isn't `-` means this slug already has a spec in its worktree — open it and look. Same change → continue that spec; different change → your slug was too generic, so narrow it (`scripts/octo-worktree.sh list` shows what's taken).

```markdown
# <title>
status: todo
created: <YYYY-MM-DD>

## Goal
<1–3 sentences: the outcome and WHY it matters — what "done and correct" means.>

## Context
- Files/modules this touches: <paths>
- Existing patterns/interfaces to follow: <...>
- Product & decision docs: <PRD / ticket / design doc / ADR — link or path, if any>
- Design & conventions: <design system / Figma link / API contract this must follow, if any>
- Tests: <where these criteria get tested — suite/harness, an existing similar test to mirror>

## Acceptance criteria
- <one EARS criterion per line — forms in the next section>

## Constraints
<performance, security, compatibility, project conventions>

## Out of scope
<what this spec explicitly does NOT cover>

## Decisions & assumptions
- <ambiguity resolved> → <decision made with the engineer>
- (Assumed at the engineer's request) <explicit assumption>
```

**Goal** and **Acceptance criteria** are never empty; any other section may be empty only if it genuinely doesn't apply.

## Acceptance criteria: use EARS

Each criterion is a single testable claim in EARS (Easy Approach to Requirements Syntax):

- **Event-driven:** When <trigger>, the system shall <response>.
- **State-driven:** While <state>, the system shall <response>.
- **Unwanted behavior:** If <condition>, then the system shall <response>.
- **Optional feature:** Where <feature is present>, the system shall <response>.
- **Ubiquitous:** The system shall <response>.

Cover the happy path, the edge cases, and the error/empty conditions. `octo-implement` turns each criterion into a test — if you can't picture the test that would check it, it isn't concrete enough yet.

## Detecting ambiguity

First split **fact** from **decision**: a fact about the codebase or the world is looked up with tools, never asked; a decision — anything that could change what gets built — belongs to the engineer. Ask whenever you find:

- **Divergent interpretations** — two reasonable engineers would build it differently from the description.
- **Vague words** — *fast, soon, robust, intuitive, efficient, reasonable, several, many, all, real-time, as needed.* Each one is a prompt for a concrete value ("fast" → what latency target?).
- **Missing specifics** — exact inputs/outputs, data shapes, empty/edge/error behavior, which API/table/component, limits and units.
- **Missing intent** — the *why* is unclear, or a referenced product doc is unavailable.

## Finding and asking for documents

Specs go wrong when they're written without the document that already answered the question.

**1. Look in the usual places, briefly.** Most repos park their documents in `docs/` (or `doc/`, `documentation/`, `.github/`, `adr/`, `rfcs/`, a `README` link). List the directory and read the *file names*; open only the ones whose names match this task, plus whatever `AGENTS.md`/`CLAUDE.md`/README explicitly point to. Then stop — one listing and a couple of targeted opens, not a sweep.

**2. Ask for whatever is still missing.** Name the document, say why you need it, and ask for a path or a link:

> I didn't find a PRD for this under `docs/` — is there one, or a ticket I should read? A path or link is enough.

> Is there a Figma for this screen? I need the empty, loading, and error states plus the responsive behavior.

Asking is not a failure of effort. It's what keeps you from reading fifty files to reconstruct intent the engineer could have pasted in one line — and reconstructed intent is usually wrong anyway.

**Only ask for documents this task actually needs.** This gate is the whole point: a shared UI component wants the design system and probably a Figma, *not* a PRD; a new endpoint wants the API contract and maybe an ADR, *not* a mockup; a bug fix usually wants neither, just a reproduction. Asking for something that plainly doesn't apply is noise, and it trains the engineer to skim past your questions.

**Take "it doesn't exist" as an answer.** If the engineer says there's no PRD or no design, don't quietly fill the gap — ask the specific questions that document would have answered, and record the outcome under *Decisions & assumptions*.

## Inputs engineers commonly forget

Sweep these families — a prompt for your judgment, not a questionnaire to read aloud:

- **Design & UI** — design system / component library / tokens? Figma or mockup? Required states (hover, focus, disabled, loading, empty, error), responsive behavior, accessibility bar?
- **Product intent** — PRD/ticket/RFC behind this? The why, the success metric, the primary user flow?
- **Contracts & data** — exact API shape/endpoint/schema, data model, validation rules, source of truth, an existing similar endpoint to mirror, an ADR that already settled the approach?
- **Cross-cutting conventions** — auth/permissions, error handling and user-facing messages, i18n, logging, feature flags?
- **Analytics & observability** — events/metrics to emit, and the naming convention?
- **Non-functional** — performance targets, scale, security/compliance, browser/device support? (Turn vague words into numbers.)
- **Edge & boundary behavior** — empty/zero/huge inputs, concurrency, offline/timeout, permissions denied, timezone/locale? Ask what *should* happen, don't invent it.
- **Tests & layers** — which layer proves each criterion? A new E2E is a big ask — flag it only when a criterion covers a business-critical journey no existing E2E already walks, recommend the cheapest layer that proves the behavior otherwise, and record the outcome in the spec's `Tests:` line.

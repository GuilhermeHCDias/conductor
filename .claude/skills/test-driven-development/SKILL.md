---
name: test-driven-development
description: Use this whenever you are writing or changing automated tests, or implementing a feature or fixing a bug in a codebase that has (or should have) tests — covering unit, integration, and end-to-end/UI tests and any test-driven (TDD / red-green-refactor) work. Trigger it even when the user never says "TDD" or "test" — phrases like "write a test for X", "add tests", "make this test pass", "implement feature Y", "fix this bug", "my tests are flaky", "the tests break every time I refactor", or "these tests aren't actually useful" all qualify. Drives disciplined red-green-refactor and heads off the common agent failure modes.
metadata:
  version: 1.0.0
---

# Test-Driven Development

The single goal behind every rule here: **a test suite that fails only for useful reasons** — it goes red when real behavior breaks, and it stays green through refactors that don't change behavior. A suite that flakes, or that breaks on every harmless rename, or that stays green while the feature is broken, is worse than no suite: it trains everyone to ignore red, and that is how real bugs ship.

## Core rules (read first)

The reasoning and the detail are in the sections below; these are the load-bearing rules in brief — placed first so they anchor the rest and survive context compaction:

- **Orient before you write.** Detect how this project runs its tests, get a green baseline, and know which existing tests guard the area you're touching. Never start writing tests in a vacuum.
- **Work in small cycles — Red → Green → Refactor.** Write one small failing test, watch it fail *for the intended reason*, write the minimum code to pass, then refactor with the bar green.
- **The test is the spec; make the code satisfy the test, never the reverse.** Never reach green by weakening, editing, loosening, skipping, deleting, or commenting out a test. If a test looks wrong, stop and surface it — don't silently "fix" it.
- **Write the test before the code, not after.** Tests written after the implementation tend to confirm its bugs; don't let the thing under test grade its own work.
- **Don't over-mock, and don't add behavior you weren't asked for.** A test that's all mocks verifies the mocks; unrequested "while I'm here" features are untested scope creep.
- **Green on your new test isn't "done."** Re-run the affected suite — previously-passing tests must stay green.
- **Don't narrate the run test-by-test — report only the final result.** While the suite runs, do not stream which individual test is executing or pass along per-test progress; it wastes tokens. Wait for the run to finish and report just the outcome — e.g. "All tests passed" — or, if it fails, the failing test(s) and why. (This is about your chat output, not about the test runner's own verbosity.)

## Why this needs to be deliberate

When an AI agent is asked to "make the test pass," the path of least resistance is to make the *test* pass rather than the *code* correct — by editing the assertion, skipping the test, or deleting it. Kent Beck, who originated TDD, describes the same thing watching agents: "The genie doesn't want to do TDD. It wants to write the code and then write tests that pass." That instinct produces tests that verify nothing. The discipline below exists specifically to resist it.

One research finding shapes this whole skill: telling an agent to "write tests first, then implement" *without* grounding it in the project's actual tests has been shown to *increase* regressions versus not mentioning TDD at all — because the agent writes plausible tests in a vacuum and breaks things it can't see. So the first move is never to start typing tests. It is to orient.

## First moves: orient before you write

1. **Find the project's test setup.** Detect the framework(s), the command that runs the suite, the directory layout, and the existing conventions (naming, file location, how data is set up, what's mocked). Match what's already there — do not impose a different stack or style.
2. **Establish a green baseline.** Run the relevant existing tests *before* changing anything. If they're already red, say so before proceeding. Know which existing tests guard the area you're about to touch — those are the ones that must stay green (the "pass-to-pass" set).
3. **Clarify the behavior.** Know what observable outcome you're implementing before writing the test. If the spec is ambiguous in a way that changes the assertion, ask rather than guess — a guessed expected value bakes a guess into the spec.

## The loop: Red → Green → Refactor

Work in small cycles. Each cycle adds one behavior.

- **Red — write one small failing test.** State the next behavior as a test. Then *run it and watch it fail*, and read the failure message to confirm it fails for the intended reason — not because of a typo, a missing import, or a wrong setup. A test you have never seen fail is not yet trustworthy; you don't know it can catch the bug it's supposed to catch.
- **Green — write the minimum code to pass.** The smallest change that turns the bar green. Hardcoding or an obviously-incomplete implementation is fine here; the *next* test is what forces generality. Resist building anything the current test doesn't demand.
- **Refactor — clean up with the bar green.** Now improve names, remove duplication, and tidy structure *without changing behavior*. Re-run the tests after each small change so any accidental behavior change shows up immediately.

Keep **structural changes** (renames, extractions, moves — no behavior change) in separate commits from **behavioral changes** (new or changed functionality). Mixing them makes review and bisection hard.

When fixing a bug, do it test-first too: write a test that reproduces the bug (red), then fix the code (green). That test becomes the regression guard.

## Non-negotiables: how not to break TDD

These are firm because they are the exact ways the discipline gets quietly defeated.

- **Never reach green by changing the test** — not by weakening an assertion (replacing an exact expected value with a vague "is present" / "is truthy" check), editing the expected value to match whatever the code currently returns, loosening a matcher or widening a type, marking the test skipped or ignored, commenting it out, or wrapping its body in error-swallowing handling. Each of these produces a test that no longer proves anything.
- **If a test looks wrong, stop — don't silently "fix" it.** Surface it: name the specific assertion, explain why you think it's wrong, and wait for a decision. The expected value often encodes intent you don't have. Changing a test to match the code is only legitimate when the human confirms the test was genuinely wrong.
- **Don't write the implementation first and then tests that confirm it.** Tests written after the code, by the same author, that pass on the first run, tend to be *tautological* — they assert whatever the code happens to do, including its bugs. Write the test from the intended behavior, see it fail, then implement.
- **Don't mock the unit under test, and don't mock so heavily that the test only exercises mocks.** See `references/test-quality.md`.
- **Don't add behavior you weren't asked for.** Implement what the current test demands; propose extras separately.
- **Green on your new test is not "done."** Re-run the affected suite — ideally the full fast suite — to confirm you didn't break previously-passing tests. Agents very frequently introduce pass-to-pass regressions: the new test goes green while several old ones quietly go red.

## Is this test worth keeping? (quick rubric)

Before committing a test, check it against these. If it fails the first two, it's the kind of test the user means by "not actually useful."

- **Refactor-proof:** would a behavior-preserving refactor break it? Then it tests implementation details — rewrite against the public surface.
- **Bug-sensitive:** would it fail if the behavior a user cares about broke?
- **Asserts a real outcome** — not merely that "nothing threw" or "a function was called."
- **Deterministic and isolated:** same result every run, in any order.
- **Focused and named:** one behavior; the name states scenario + expected outcome.

Depth on all five: `references/test-quality.md`.

## Choosing the layer: unit vs. integration vs. E2E

Don't reflexively reach for unit tests *or* for E2E. The guiding principle (Kent C. Dodds): *the more a test resembles the way the software is actually used, the more confidence it gives* — but higher layers cost more to write, run slower, and break more often. Aim for the **highest-confidence test that is still fast and stable enough to run constantly.**

- **Unit** — pure logic, calculations, branching, edge cases. Cheap, fast, plentiful. Test through the public surface, not private internals.
- **Integration** — several real units exercised together, with only the outermost boundary you don't own (network, database, third-party service) replaced by a double. Usually the best return on investment, because most real bugs live at the seams between units. **When unsure which layer, bias here.**
- **E2E / UI** — a *few* critical end-to-end journeys (sign-up, login, checkout, the core action your product exists to do). Expensive; reserve for business-critical flows. See `references/e2e-tests.md`.

A bug usually deserves a regression test at the *lowest* layer that would have caught it.

## References

Read the relevant file when you reach that kind of work — don't load all of them by default.

- **`references/test-quality.md`** — How to write a test that's actually useful: behavior vs. implementation, Arrange-Act-Assert, naming, the FIRST properties, mocking discipline ("don't mock what you don't own"), what to assert, and a catalog of useless/harmful test patterns with fixes. Read when writing or reviewing unit or integration tests.
- **`references/flaky-tests.md`** — Diagnosing and eliminating flakiness: the empirical taxonomy of causes (async/timing, isolation, concurrency, order dependence, non-determinism) each with a concrete fix, a determinism checklist, and the judgment call of whether a flake is a test artifact or a real production race. Read whenever a test is intermittent or you're writing tests that touch time, async, concurrency, or external systems.
- **`references/e2e-tests.md`** — End-to-end specifics: scoping to critical paths, stable locators, auto-retrying assertions, per-test isolation, setting up data out-of-band instead of through the UI, and reusing authentication. Read before writing or fixing end-to-end or UI tests.

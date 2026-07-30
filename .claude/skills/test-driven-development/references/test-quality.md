# Writing tests that are actually useful

This file is about test *quality* — making each test earn its place. Read it when writing or reviewing unit and integration tests.

## The one principle everything else follows from

**Test observable behavior through the public surface, not internal mechanics.** A test should pass or fail for the same reasons the code's *users* would call it working or broken. There are two kinds of "user" to keep in mind:

- the **end user**, who interacts with rendered output and effects, and
- the **calling code** (another module, another developer), which interacts through the public API — the inputs it passes and the outputs/effects it depends on.

Anything those users never see, use, or know about — a private method, an internal variable name, the precise sequence of internal calls, which data structure backs a cache — is an *implementation detail*. Tests coupled to implementation details fail in two costly ways:

- **False negatives:** they break when you refactor without changing behavior, so they punish exactly the cleanup you want to encourage and erode trust in the suite.
- **False positives:** they keep passing when you've actually broken behavior, because they're checking the mechanism rather than the result.

A useful test is **refactor-proof** (survives behavior-preserving change) and **bug-sensitive** (fails when behavior actually breaks).

## Structure: Arrange-Act-Assert

Three phases — Arrange (minimal setup: the simplest data that exercises the behavior), Act (*one* action per test), Assert. Given/When/Then is the same shape.

Keep tests dead simple: a test's own cyclomatic complexity should be **1** — no `if`/`for`/`while`/`try` in the test body. Branching or loops in a test can hide failures and raise the question "who tests the test?" If you're tempted to loop over cases, use the framework's parameterized/table-driven test feature instead. Don't put magic numbers or strings inline; name them so the test documents what the value *means*.

## Naming: the test is documentation

A test name should state the scenario and the expected outcome, so that a failure in CI tells you what broke without opening the file. Common conventions (pick one and stay consistent):

- `methodName_stateUnderTest_expectedBehavior` — e.g. `calculateDiscount_premiumCustomer_returns20Percent`
- a readable sentence, or Given/When/Then phrasing

`test_1` or `testCalculate` tells you nothing when it goes red. Don't worry about long test names; clarity wins.

## One behavior per test

Each test should pin down one behavior. What to actually avoid is the kitchen-sink test that walks through many unrelated behaviors: when it fails you don't know which behavior broke, and it usually depends on the happy path of earlier steps. Split those.

(UI/component tests are a reasonable exception to a strict one-assertion rule — verifying a rendered state legitimately checks several things at once.)

## What to assert

- Assert **real outcomes**: return values, visible/rendered state, the content of an effect (the email that would be sent, the record that was written), the error that's raised for bad input.
- Don't write **assertion-free tests** that call the code and check nothing — or that only assert "it didn't throw." Running without error is a weak claim; assert the result.
- Don't assert **irrelevant internal state** just because you can reach it. If the user doesn't depend on it, asserting it only couples the test to the implementation.
- Cover the **unhappy paths**: invalid input, boundary values, empty/null, error conditions. These are where bugs hide and where a test adds the most value.

## Determinism is the linchpin

A test must give the same result every run if the code hasn't changed. The usual sources of non-determinism, and the fix in each case:

- **Current time / dates** → inject a clock (pass a time source, or use the framework's fake timers) instead of calling the real "now."
- **Randomness** → seed the RNG, or inject the random source, so values are reproducible.
- **Locale / timezone / collation** → pin them in the test environment.
- **Unordered collections** → don't assume iteration order of sets/maps/dict; sort or assert as an unordered collection.
- **Real network / filesystem / clock / external services** → these belong behind a boundary you control (see mocking, below); a unit test shouldn't touch them.

## The FIRST properties

A good unit test is:

- **Fast** — runs in milliseconds; the whole unit suite in seconds. Fast suites get run constantly, which is the entire point — a 300ms suite can run on every change and catch a regression the moment it's introduced.
- **Isolated / Independent** — no dependence on other tests or on execution order; no shared mutable state.
- **Repeatable** — deterministic; same result anywhere, anytime (see above).
- **Self-validating** — passes or fails on its own with a clear assertion; no human eyeballing of output.
- **Timely** — written alongside (ideally just before) the code, not bolted on much later.

## Test the public surface, not private methods

Test private/internal logic *through* the public method that uses it. Verifying a private method in isolation can mislead you: the private method may return the "right" value while the public path that calls it uses that value incorrectly — your test passes and the feature is still broken. If a private piece is complex enough that you really want a dedicated test for it, that's a design signal: extract it into its own unit with a real public surface, and test that.

## Mocking discipline

Test doubles are useful for replacing things that are slow, non-deterministic, or have side effects. But over-mocking is one of the main ways tests become coupled to implementation and stop testing anything real.

- **Prefer real collaborators** when they're fast and deterministic. A test that uses the real objects checks that they actually work together; a test that mocks them checks only your assumptions about how they work.
- **Mock at boundaries you don't own** — the network, filesystem, clock, randomness, third-party SDKs. The heuristic "don't mock what you don't own": rather than mocking a third-party library directly (which couples your test to *their* API and breaks when they change), wrap it in a thin adapter that *you* own and mock the adapter. This also keeps the third-party dependency swappable.
- **Don't mock value objects** (plain data) — there's nothing to simulate; just construct them.
- **Be wary of mocking concrete classes** — it traps the test in one implementation. Mock interfaces/abstractions.
- **Don't over-verify interactions.** Asserting "was called exactly once with these precise arguments" on every collaborator turns the test into a transcript of the implementation, so any refactor breaks it. Verify the interactions that *matter* (e.g. that the payment was charged), and assert on the *result*, not on the call choreography.
- **If everything is mocked, you're testing the mocks.** When a test mocks its way around the very behavior it claims to verify, it's not testing the code. This is also why letting the same agent generate both the implementation and the mocks-and-tests produces tautologies (see below).

If code is *hard* to test without elaborate mocking, treat that as a design signal — it often points to missing dependency injection, hidden side effects, or a unit doing too much. Improve the design (DI, pure functions, smaller units, single responsibility) rather than piling on mocks. Don't, however, contort production code purely to satisfy a test.

## Catalog of tests to avoid

Each entry: the smell → why it's harmful → the fix.

- **Tautological / "test inversion"** — code written first, then a test that asserts whatever the code does. → Encodes current behavior (bugs included) as "correct"; proves nothing. → Write the test from the *intended* behavior first, watch it fail, then implement.
- **Assertion-free test** — runs the code but asserts nothing, or only "no exception thrown." → Goes green regardless of correctness; pure false confidence. → Assert the actual outcome.
- **Mirroring the implementation** — the test re-implements the algorithm, or asserts each internal step. → Breaks on any refactor; if both the code and its mirror are wrong the same way, it still passes. → Assert inputs→outputs at the boundary, not the steps between.
- **Over-mocking / testing the mock** — every collaborator is a mock. → Verifies wiring and assumptions, not behavior. → Use real collaborators inside the unit; mock only owned boundaries.
- **Testing private methods / internal state** — reaching past the public surface. → Couples to implementation; can pass while the public path is broken. → Test through the public API; extract complex internals into their own units.
- **Snapshot-everything** — giant snapshots of large output that get regenerated and blindly accepted on failure. → Nobody reads the diff; the snapshot stops meaning anything. → Snapshot only small, intentional, reviewed output, and assert specific values for behavior that matters.
- **Non-deterministic data** — real `now()`, real random, real network, order-dependent collections. → Intermittent failures (see `references/flaky-tests.md`). → Inject/seed/pin; mock the boundary.
- **Logic in the test** — `if`/loops/`try` in the test body. → Can mask failures; needs its own testing. → Flatten into separate or parameterized tests.
- **Over-specified interaction asserts** — verifying exact call counts/arguments on incidental collaborators. → Breaks on harmless refactors. → Verify only the interactions that carry meaning; assert on results.
- **The kitchen-sink test** — many unrelated behaviors in one test. → A failure doesn't localize the problem; later steps depend on earlier ones. → One behavior per test.

## A note on coverage and mutation

Coverage is a useful way to *find untested code*, not a target to chase — 100% coverage of weak assertions proves nothing. The deeper question is whether a test would actually *fail* if the behavior broke. The cheap, built-in version of that check is the TDD Red step itself: you saw the test fail before you made it pass, so you know it can. (Mutation testing automates this idea — deliberately introducing faults to see whether tests catch them — and is worth reaching for when you need real confidence in a critical suite.)

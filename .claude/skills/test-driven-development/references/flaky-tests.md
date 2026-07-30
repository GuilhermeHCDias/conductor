# Diagnosing and eliminating flaky tests

A **flaky test** passes on one run and fails on another with no change to the code or the test. Read this whenever a test is intermittent, or whenever you're writing tests that touch time, asynchrony, concurrency, shared state, or external systems.

## Why flakes are worse than they look

A flaky test doesn't just waste a re-run. It destroys the signal the suite exists to provide. Google reported that the large majority of test transitions from pass to fail were flakes, not real regressions — so once a suite is flaky, developers learn to hit "re-run" reflexively, and a *real* failure gets re-run and ignored along with the noise. That's the actual cost: not the wasted minutes, but the bug that ships because nobody trusted the red.

So flakiness is not a nuisance to paper over with retries. **A flake is a defect in the test (or a signal of a real race in the code) and gets diagnosed to root cause.**

## Every flake has a deterministic cause

It only *looks* random because the triggering condition is intermittent. Studies of real flaky-test fixes find the causes cluster predictably. Roughly: async/timing waits are the largest share (around 45% of UI flakes), concurrency and resource contention next (around 20%), test-order dependency a smaller but common slice (around 12%), and the remainder split between environment/platform differences and genuinely non-deterministic logic. Diagnose which bucket you're in, then apply the matching fix.

### 1. Async / timing (the big one)

The test interacts with something before it's ready, or assumes an operation finishes within a fixed window. It passes on a fast machine and fails on a slow/loaded CI runner.

- **Never use a fixed sleep** (pausing for a fixed number of milliseconds and hoping the work is done by then). It's simultaneously too long (slow) and too short (flaky), and it guesses at timing instead of observing it.
- **Wait for a condition or event**: poll until the thing you need is actually ready (the element is visible, the state is true, the response has arrived). Use the test framework's auto-retrying assertions (which re-check a condition until it holds or a timeout expires) or an explicit wait-for-condition helper.
- If a real operation legitimately takes variable time, raising the timeout is a last resort — **making the operation faster beats making the test wait longer**, and an unbounded wait can hang forever, so cap it.
- A frequent root cause: an **asynchronous call whose completion the test never waits for**. Where your toolchain allows, catch this class statically (a linter or compiler check that flags un-awaited or ignored async results) before it ever runs.

### 2. Test isolation / shared mutable state

One test's leftovers change another test's outcome. Symptom: tests pass alone but fail in the suite, or pass in one order and fail in another.

- Make each test **self-contained and hermetic**: it sets up its own inputs, controls its own dependencies, and cleans up after itself, so it produces the same result regardless of what ran before.
- **Reset shared state** between tests — database rows, in-memory caches, persisted or session state, global singletons, environment variables, temporary files.
- **Don't chain tests through shared data** — e.g. don't rely on a "sign-up" test to create the user a "login" test needs. Each test creates what it needs.
- **Surface order dependence on purpose**: run the suite in randomized order (most runners support a randomize/shuffle option with a reproducible seed). If randomizing turns it red, you have hidden shared state — pin the seed to reproduce and fix it.

### 3. Concurrency / resource contention

Parallel tests fight over the same resource, or the code under test has a real data race.

- Give each test its **own namespace**: a unique temp directory, a per-test DB schema or table prefix, a distinct port. Clean up afterward.
- Avoid global shared state across workers.
- Prefer **ephemeral, isolated environments** (a fresh, isolated environment spun up per run) over a shared, long-lived runner where a "noisy neighbour" job steals resources.

### 4. External dependencies

A test that calls a live third-party API, a shared staging service, or a real network inherits all of *their* variability — rate limits, latency spikes, downtime.

- **Mock or stub the external boundary** so the test controls the response. (Wrap third-party services behind an adapter you own and stub that — see `references/test-quality.md`.) A unit/integration test should be deterministic regardless of the outside world.
- Where the point really is end-to-end coverage of *your* stack, keep your own services real but still stub genuinely third-party calls — see `references/e2e-tests.md`.

### 5. Non-deterministic logic

The code or test depends on time, randomness, locale, timezone, or unordered iteration. Apply the determinism controls in `references/test-quality.md`.

## Determinism checklist

Before trusting a new test, run through:

- [ ] No fixed-duration sleeps — every wait is on a condition or event.
- [ ] No asynchronous call left unwaited-for (enforced statically where the toolchain allows).
- [ ] Time and randomness are injected or faked, not read from the real world.
- [ ] Locale and timezone are pinned; no reliance on unordered-collection iteration order.
- [ ] No external network/filesystem/service calls (or they're mocked at an owned boundary).
- [ ] Fresh state per test; all shared stores reset in setup/teardown.
- [ ] Passes when run alone *and* when the suite is run in randomized order.

## Is it a test artifact or a real production race?

This judgment matters. Not every flake is a bad test — sometimes the intermittent failure is the test correctly catching a genuine race or timing bug that **a real user could also hit**. Ask: *could this same non-determinism happen in production?*

- If yes — there's an actual race/ordering/timing bug in the code — **fix the code**, not the test. The flake was doing its job.
- If no — the non-determinism lives only in how the test was written — **fix the test** using the techniques above.

Either way, the answer is never to paper over it.

## What to do when you can't fix it immediately

- **Quarantine, don't delete.** Move the unstable test out of the blocking path (a quarantine tag/suite) so it keeps running and stays visible, without failing everyone's build. Track quarantined tests and fix them deliberately — quarantine is a holding pen, not a graveyard.
- **Retries are a safety net, not a fix.** A single confirmatory retry can distinguish a real failure from a flake, but standing retry counts that mask intermittent failures also mask real intermittent bugs. Use sparingly and always alongside root-cause work.
- **Make flakiness visible.** Simply tracking and surfacing flake rates per test (which started failing, on which branch, after which commit) drives it down, because the worst offenders become obvious and get prioritized. A reasonable trigger: investigate any test failing more than a small percentage of runs without a code change.

## For the implementing agent, specifically

If a test **you just wrote** turns out to be flaky, do **not** "stabilize" it by deleting assertions, adding a sleep, or marking it skipped. Find the race or unmet condition and wait on it properly, or fix the underlying non-determinism. If the flakiness reveals a real race in the code you wrote, fix the code.

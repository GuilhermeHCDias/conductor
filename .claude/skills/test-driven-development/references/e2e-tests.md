# End-to-end (E2E) tests

Read this before writing or fixing end-to-end or UI tests — tests that drive the
real application the way a user would, across the whole stack. E2E tests give the
highest confidence of any test and cost the most to write, run, and maintain, so
the whole game is spending them where they pay off and keeping them stable.

These principles hold regardless of platform (web, mobile, desktop, API-only) or
which test driver you use. Wherever a principle names a mechanism ("a locator", "an
auto-retrying assertion", "an isolated session"), map it onto your own stack's
equivalent rather than reaching for a specific tool.

## Scope ruthlessly — E2E is not where you get coverage

A single E2E test gives far more confidence than a single unit test, but it is also
slow and has many more points of failure. So cover the **few journeys that matter
most** and push everything else down:

- Cover the **money paths and the wake-you-at-night paths**: the core action your
  product exists to do, plus the flows whose failure is most costly (for many
  products: sign-up, sign-in, the primary transaction).
- Everything else — field validation, edge cases, error formatting, branching logic
  — belongs in unit and integration tests, which are faster and localize failures
  better.
- **Don't re-test the same journey repeatedly.** If a flow is already covered by one
  test, later tests should start from after it (set up via a programmatic path or a
  reused session) rather than driving through it again every time. Repeating shared
  flows in every test is a top cause of slow, brittle E2E suites.

## Stable locators

Brittle locators are the number-one source of E2E breakage. Prefer ways of finding an
element that mirror how a real user (or assistive technology) finds it, and treat a
fragile structural locator as a defect.

- **Prefer semantic locators** — find an element by its role/type, its accessible
  name, its visible label, or its visible text ("the button named *Submit*", "the
  field labeled *Email*"). These survive layout and styling changes and double as an
  accessibility check.
- **Use an explicit, stable test hook as a deliberate fallback** for elements with no
  clear semantic identity — a dedicated test-identifier attribute the team agrees to
  keep stable across redesigns.
- **Never depend on** deep structural paths (long element-tree chains), auto-generated
  names, brittle position/index, or any locator containing volatile data (timestamps,
  session tokens, random IDs) — they change on the next build or run.
- Keep locators short and scoped; narrow by context (the row containing *X*, then the
  control inside it) rather than encoding the whole path from the root.
- Where your driver offers a *lazy* / re-querying locator (one that re-finds the
  element on each use), prefer it over a handle captured once — a captured handle goes
  stale when the UI re-renders between steps.

## Assertions: wait on conditions, never on the clock

- Use **auto-retrying / awaiting assertions** that poll until the condition holds or a
  timeout expires ("wait until the confirmation is visible"). They absorb the small,
  normal timing variance of a live app, which is most of what makes naive E2E tests
  flaky.
- **Never** do a fixed-duration sleep followed by a one-shot check — that is the
  classic flake (see `references/flaky-tests.md`).
- Assert **user-meaningful outcomes**: the confirmation appears, the item count
  changed, the user landed on the right screen — not internal state the user never
  sees.

## Isolation

- **Fresh session per test.** Each test should start from a clean, isolated session so
  nothing leaks between tests. Most modern E2E drivers make a fresh, sandboxed session
  cheap; use it.
- **No shared globals.** Pass state through your framework's setup/fixtures, not
  module-level variables, to avoid silent coupling between tests.

## Set up data and auth out-of-band, not through the UI

- **Seed prerequisite data through a programmatic path** — a service/API call, a
  database or factory, a setup script — not by driving the UI. Creating a user or an
  order by clicking through forms is slow, brittle, and conflates setup with the thing
  under test. Reserve UI actions for the behavior the test actually verifies.
- **Authenticate once and reuse the session.** Logging in through the UI before every
  test is wasteful and flaky. Do it once, save the authenticated session, and load it
  for subsequent tests; reserve the full login flow for the one test that verifies
  login itself.

## External systems

- **Replace third-party/external calls at the boundary** (intercept and stub them) so
  outages, rate limits, and latency on systems you don't control can't make your suite
  flaky.
- Where the value really is end-to-end coverage of *your* stack, keep your own services
  real and stub only the genuinely external pieces.

## Hygiene for E2E test code

- **Lint and type-check the test code itself** where your toolchain supports it —
  catching un-awaited async calls (a leading flake source) and wrong-signature calls
  before a run.
- **Prune obsolete and redundant tests.** A growing E2E suite needs active gardening —
  stale scenarios slow the pipeline and add noise. A smaller, reliable suite beats a
  large flaky one.
- **Capture diagnostics on failure** — whatever your driver offers (execution traces,
  screenshots, recordings, logs of console output and network traffic) — so a
  CI-only failure can be diagnosed without reproducing it locally.

## For the implementing agent, specifically

Two things bite agents writing E2E tests:

- **Locator invention.** Separate runs tend to invent *different* locators for the same
  element, and to reach for brittle structural ones. Anchor on the project's existing
  locator conventions (search how current tests find elements) and prefer the
  semantic / test-hook rules above. If an element lacks a stable hook, add one rather
  than targeting a fragile path.
- **Guessed timing and response shapes.** An agent working from partial context guesses
  how long things take and what an external call returns, producing intermittent
  failures and wrong assertions. Use auto-retrying assertions instead of guessed waits,
  and base assertions on the real contract (check the actual response), not an
  assumption. If an E2E test fails, fix the app or the locator/wait — never the assertion.

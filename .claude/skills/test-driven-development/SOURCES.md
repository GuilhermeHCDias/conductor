# Sources

This skill is a consolidation of established testing references, not original
research and not drawn from a single source. The material below was gathered via
live web searches and synthesized according to the skill-creator's writing
guidance. Read the caveats before treating any single claim as authoritative.

## Caveats (calibrate your confidence)

- **Some statistics are second-hand.** The flaky-test figures (async ~45%,
  concurrency, order-dependence; the Google ~84% pass-to-fail-are-flakes; the
  Atlassian ~150k developer-hours) trace to academic papers and company reports,
  but were read here in *secondary* sources (TestDino, Datadog, CircleCI, Harness,
  etc.) citing the originals — the primary papers/reports were not verified directly.
- **The E2E guidance was generalized from web-focused sources.** The end-to-end
  principles here (semantic locators, auto-retrying assertions, programmatic data
  setup, session reuse, boundary stubbing) were drawn largely from web/Playwright
  material and then stated tool- and platform-agnostically. The skill deliberately
  names no specific framework, language, or platform — map each principle onto your
  own stack's equivalent.
- **Knowledge cutoff + live search.** Knowledge here reflects up to ~Jan 2026 plus
  real-time searches run in mid-2026; it is not an exhaustive literature review, and
  it captures what was prominent and available at search time.
- Links are listed as they appeared in search results. **Primary / most
  authoritative** sources are marked with ★.

---

## TDD cycle (red-green-refactor)

- ★ James Shore — Red-Green-Refactor (canonical description):
  https://www.jamesshore.com/v2/blog/2005/red-green-refactor
- Kent Beck's structural-vs-behavioral distinction is referenced from his
  "Augmented Coding" post (see "Kent Beck / augmented coding" below). His book
  *Test-Driven Development: By Example* (2003) is the foundational text.
- Jamie Ingram — TDD: Red, Green, Refactor!:
  https://ingram.technology/blogs/28-03-2025-TDD-red-green-refactor.html
- Codecademy — Red, Green, Refactor:
  https://www.codecademy.com/article/tdd-red-green-refactor
- Nishant Aanjaney Jalan (Medium) — Is the Red-Green-Refactor Cycle Good?:
  https://medium.com/news-uk-technology/is-the-red-green-refactor-cycle-of-test-driven-development-good-9e2b1b52d721
- Clean Code Guy — TDD: Red-Green-Refactor Practical Guide:
  https://cleancodeguy.com/blog/tdd-red-green-refactor
- Jon Beckett — The Red-Green-Refactor Rhythm:
  https://jonbeckett.com/2025/11/20/test-driven-development/
- Edana — TDD: Deliver Faster and Better:
  https://edana.ch/en/2025/10/25/test-driven-development-tdd-writing-tests-first-to-deliver-faster-and-better/
- Zest — Guide to TDD Red Green Refactor:
  https://meetzest.com/blog/test-driven-development-red-green-refactor
- Codefinity — Test Driven Development:
  https://codefinity.com/blog/Test-Driven-Development
- objects.ws — TDD Guide: Cycle & Best Practices:
  https://objects.ws/blog/test-driven-development-guide/

## Testing behavior vs. implementation; the Testing Trophy

- ★ Kent C. Dodds — Testing Implementation Details:
  https://kentcdodds.com/blog/testing-implementation-details
- ★ Kent C. Dodds — Write tests. Not too many. Mostly integration.:
  https://kentcdodds.com/blog/write-tests
- ★ Kent C. Dodds — The Testing Trophy and Testing Classifications
  (also the source of the Justin Searls "only fail for useful reasons" quote):
  https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications
- ★ Kent C. Dodds — Static vs Unit vs Integration vs E2E Testing:
  https://kentcdodds.com/blog/static-vs-unit-vs-integration-vs-e2e-tests
- Kent C. Dodds — Common Testing Mistakes (don't re-test the same flow):
  https://kentcdodds.com/blog/common-testing-mistakes
- CodingItWrong — Why You Should Sometimes Test "Implementation Details":
  https://codingitwrong.com/2018/12/03/why-you-should-sometimes-test-implementation-details.html
- Cody Price (Medium) — Stop Testing Implementation Details:
  https://medium.com/@dev.cprice/stop-testing-implementation-details-77a3528336af
- Software Engineering Unlocked — Why integration tests are better than unit tests:
  https://www.software-engineering-unlocked.com/double-down-integration-tests-kent-dodds/
- testRigor — What is the Testing Trophy Model?:
  https://testrigor.com/blog/what-is-the-testing-trophy-model/

## Unit test design & mocking discipline

- ★ Microsoft Learn (.NET) — Best practices for writing unit tests
  (AAA, minimal inputs, test the public API not privates):
  https://learn.microsoft.com/en-us/dotnet/core/testing/unit-testing-best-practices
- ★ Hynek Schlawack — "Don't Mock What You Don't Own" in 5 Minutes:
  https://hynek.me/articles/what-to-mock-in-5-mins/
- ★ Microsoft Engineering Playbook — Unit Testing:
  https://microsoft.github.io/code-with-engineering-playbook/automated-testing/unit-testing/
- ★ Microsoft Engineering Playbook — Mocking in Unit Tests:
  https://microsoft.github.io/code-with-engineering-playbook/automated-testing/unit-testing/mocking/
- Martin Fowler — Mocks Aren't Stubs (test-double taxonomy; referenced, not
  directly retrieved): https://martinfowler.com/articles/mocksArentStubs.html
- Steve Smith (Ardalis) — Mastering Unit Tests: Best Practices & Naming:
  https://ardalis.com/mastering-unit-tests-dotnet-best-practices-naming-conventions/
- IBM — Unit Testing Best Practices:
  https://www.ibm.com/think/insights/unit-testing-best-practices
- Testim — Unit Testing Best Practices (determinism, Given/When/Then):
  https://www.testim.io/blog/unit-testing-best-practices/
- WooCommerce Developer Blog — Best Practices for Unit Testing:
  https://developer.woocommerce.com/testing-extensions-and-maintaining-quality-code/best-practices-for-unit-testing/
- Diffblue — Mocking Best Practices (Mockito):
  https://www.diffblue.com/resources/mocking-best-practices/
- codejack — Best Practices for Unit Testing in .NET:
  https://codejack.com/2025/01/best-practices-for-unit-testing-in-net/

## Flaky tests (causes, detection, prevention)

> The cause taxonomy and headline stats here originate from Luo et al. (FSE 2014,
> Univ. of Illinois) and an ICSE 2021 study, plus Google and Atlassian engineering
> data — read below via secondary sources.

- TestRail (Sembi) — Flaky Tests: What They Are and How to Fix Them:
  https://www.testrail.com/blog/flaky-tests/
- TestDino — Flaky Tests: Complete Guide to Detection & Prevention:
  https://testdino.com/blog/flaky-tests
- Autonoma — Flaky Tests: Why They Happen and How to Fix Them:
  https://getautonoma.com/blog/flaky-tests
- Datadog — What is a Flaky Test?:
  https://www.datadoghq.com/knowledge-center/flaky-tests/
- CircleCI — How to reduce flaky test failures:
  https://circleci.com/blog/reducing-flaky-test-failures/
- Harness — Flaky Tests: The Quiet Killer of Productivity:
  https://www.harness.io/blog/flaky-tests-the-quiet-killer-of-productivity-in-your-ci-pipeline
- testbooster.ai — Flakiness in Automated Testing:
  https://www.testbooster.ai/en/blog/flakiness-in-automated-testing
- TestMu AI — A Detailed Guide on Flaky Tests:
  https://www.testmuai.com/learning-hub/flaky-test/
- ContextQA — Flaky Tests in Automated Testing:
  https://contextqa.com/blog/flaky-tests-automated-testing/
- DevAssure (DEV.to) — Flaky Tests: What Are They and How to Prevent Them:
  https://dev.to/devassure/flaky-tests-what-are-flaky-tests-and-how-to-prevent-them--1hkp

## TDD with AI agents (the agent-specific guardrails)

- ★ Kent Beck — Augmented Coding: Beyond the Vibes (warning signs: unrequested
  functionality, disabling/deleting tests; the "go / next test" system prompt):
  https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes
- ★ Pragmatic Engineer (Gergely Orosz) — TDD, AI agents and coding with Kent Beck
  ("the genie doesn't want to do TDD"; the "immutable" expected-value wish):
  https://newsletter.pragmaticengineer.com/p/tdd-ai-agents-and-coding-with-kent
- ★ NIST (CAISI research blog) — Cheating on AI Agent Evaluations
  (grader gaming: disabling assertions, test-specific logic):
  https://www.nist.gov/blogs/caisi-research-blog/cheating-ai-agent-evaluations
- ★ "TDAD: Test-Driven Agentic Development" — arXiv preprint (the finding that
  procedural "do TDD" without targeted test context *increased* regressions, and
  the pass-to-pass regression data): https://arxiv.org/pdf/2603.17973
- SD Times — AI Unit Testing: Rethinking TDD in the Era of AI
  (redundant tests, mirroring production logic, tests as illusion of safety):
  https://sdtimes.com/sdt_dev/ai-unit-testing-rethinking-tdd-in-the-era-of-ai/
- Augment Code — Spec + TDD: tautological tests / "test inversion", semantic drift:
  https://www.augmentcode.com/guides/spec-tdd-shippable-ai-generated-code
- Augment Code — Why AI Coding Agents Fail E2E Tests (the five failure modes):
  https://www.augmentcode.com/guides/why-ai-coding-agents-fail-e2e-tests
- developertoolkit.ai — Test-Driven Development with AI Assistance
  (the concrete "tells": assertions loosening, tests deleted, mocks replacing
  the thing under test):
  https://developertoolkit.ai/en/shared-workflows/core-methodology/test-driven-development/
- Reinforcement Coding — Keeping AI Honest: Why TDD Matters More in the AI Era:
  https://www.reinforcementcoding.com/blog/tdd-in-the-ai-coding-era
- fundesk.io — Test-Driven Development with AI Agents: A Practical Guide (2026):
  https://www.fundesk.io/test-driven-development-ai-agents-guide
- Kent Beck — main site (augmented coding, "don't eat the seed corn"):
  https://kentbeck.com/

## End-to-end / UI testing

- ★ Playwright — Best Practices (web-first assertions, role locators, isolation):
  https://playwright.dev/docs/best-practices
- ★ Playwright — homepage (auto-waiting, fresh context per test, locator strategy):
  https://playwright.dev/
- TestDino — 17 Playwright Best Practices That Actually Matter
  (test what users see, role locators, seed data via API, critical-path scoping):
  https://testdino.com/blog/playwright-best-practices
- BrowserStack — 15 Best Practices for Playwright Testing in 2026:
  https://www.browserstack.com/guide/playwright-best-practices
- BetterStack — 9 Playwright Best Practices and Pitfalls to Avoid:
  https://betterstack.com/community/guides/testing/playwright-best-practices/
- webfuse — Playwright Cheat Sheet (web-first assertions, network mocking):
  https://www.webfuse.com/playwright-cheat-sheet
- TestDino — Playwright Interview Questions (lazy locators, strict mode):
  https://testdino.com/playwright-interview-questions-answers-2026
- oneuptime — How to Write E2E Tests with Playwright (fixtures, API seeding):
  https://oneuptime.com/blog/post/2026-02-02-playwright-e2e-tests/view
- Sam Sperling (Medium) — Say Goodbye to Flaky Tests: Playwright Best Practices:
  https://medium.com/@samuel.sperling/say-goodbye-to-flaky-tests-playwright-best-practices-every-test-automation-engineer-must-know-9dfeb9bb5017
- Mohammed (Medium) — End-to-End Testing with Playwright: Quick Setup & Best Practices:
  https://medium.com/@mohammed.ahmadi1990/end-to-end-testing-with-playwright-quick-setup-best-practices-b89fa0400c88

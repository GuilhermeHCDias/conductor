# AGENTS.md — agent harness for Conductor
status: done
created: 2026-07-30

## Goal

Create `AGENTS.md` at the repository root: the operational contract every coding agent and human reads before touching Conductor. It defines the **harness** — directory layout, file-naming conventions, commands, process boundaries, IPC and security rules, testing strategy, commit conventions — for an Electron + React 19 + TypeScript app built with electron-vite.

It matters because the repo is empty (`.context.md` §13). This file is what makes the *next* spec — the scaffold, §13 step 2 — land in a shape already agreed on, instead of whatever the first agent improvises. `.context.md` already owns the domain (Maestro, selectors, MCP); nothing here duplicates it.

## Context

- **Files this touches:** `AGENTS.md` (new, repo root). Nothing else — no code, no `package.json`, no edits to `.context.md`.
- **Source of truth for domain and architecture:** `.context.md` at the repo root (975 lines, PT-BR). Sections this spec draws on: §2 config constants, §9.0 no-backend principle, §9.1 stack, §9.2 process layout, §9.3 Electron security, §10.1 the `noRestrictedImports` architectural rule, §12 the 22 agent rules, §13 current state and attack order.
- **Repo state:** empty apart from `.context.md`, `.gitignore` and `.claude/`. No `package.json`, no `src/`. **Every command and path in AGENTS.md is therefore prescriptive** — the contract the scaffold spec must satisfy, not a description of what exists.
- **Package manager:** npm (`.claude/settings.local.json` already allowlists `npm --version`).
- **Community patterns to encode** (researched, see Constraints for the concrete shapes): `electron-vite` + the `@quick-start/electron` `react-ts` template layout; `@electron-toolkit/tsconfig` split configs; Electron's 20-item security checklist; Vitest projects (node + jsdom) with Playwright `_electron` for E2E; AGENTS.md guidance (root-level, ≤150 lines, imperative, prohibitions paired with alternatives, tables over prose, no orphan-doc reliance).
- **Tests:** none. Documentation-only deliverable — every criterion below is verified by inspecting the produced `AGENTS.md`.

## Acceptance criteria

### File and form

- [x] The system shall provide exactly one agent-instruction file, `AGENTS.md`, at the repository root, and shall not create `CLAUDE.md`.
- [x] The system shall write AGENTS.md in English, keeping code identifiers, shell commands, file paths and `.context.md` section references verbatim.
- [x] The system shall keep AGENTS.md at 150 lines or fewer.
- [x] The system shall express layout, naming, security and read-first guidance as Markdown tables or annotated code blocks, not as paragraphs.
- [x] Where AGENTS.md forbids something, the system shall state the concrete replacement in the same table row or on the immediately following line.
- [x] The system shall not reproduce `.context.md` §12 verbatim, and shall carry at most 8 digest rules, each ending with its `.context.md` section reference.
- [x] The system shall reference `.context.md` by that exact path (it is a dotfile and will not be found otherwise).

### Required sections

The system shall include these `##` sections, in this order, and no others:

`Project` · `Commands` · `Layout` · `Naming` · `Process boundaries & IPC` · `Security` · `Testing` · `Code style` · `Commits & branches` · `Read before you touch`

- [x] **Project** — The system shall state in at most 6 lines: that Conductor is an Electron desktop app that orchestrates the Maestro CLI so non-developers can author e2e tests; that there is no backend and no credential of ours (`.context.md` §9.0); that the repo is **pre-scaffold** and the layout and commands below are the contract the scaffold must satisfy; and that `.context.md` is the source of truth for product and architecture.
- [x] **Commands** — The system shall list each command below with its exact invocation, and shall mark them as the scripts the scaffold must define.
- [x] **Layout** — The system shall reproduce the annotated tree given in Constraints.
- [x] **Naming** — The system shall reproduce the naming table given in Constraints.
- [x] **Process boundaries & IPC** — The system shall state the IPC contract given in Constraints, including the channel-name shape, the one-method-per-channel rule, the `Window` augmentation location, sender validation, and argument validation.
- [x] **Security** — The system shall reproduce the security table given in Constraints.
- [x] **Testing** — The system shall state the Vitest two-project split, test colocation, the component-test library, the two modules that require strong unit tests, and that E2E is not set up yet.
- [x] **Code style** — The system shall state that Biome is the only linter and formatter, that TypeScript runs in strict mode, and how to react when `noRestrictedImports` fires.
- [x] **Commits & branches** — The system shall state Conventional Commits for messages and `<type>/<slug>` for branches.
- [x] **Read before you touch** — The system shall reproduce the read-first table given in Constraints.

### Content correctness

- [x] The system shall attribute every rule it digests from `.context.md` with that document's section number, so a reader can verify it at the source.
- [x] If a rule in AGENTS.md contradicts `.context.md`, then the system shall not write it — `.context.md` wins, and the conflict goes to the engineer instead.
- [x] The system shall state that only `src/main/maestro/CliRunner.ts`, `src/main/maestro/ScreenCapture.ts` and `src/main/process/run.ts` may create OS processes, and that the correct response to a `noRestrictedImports` error is to move the code behind one of them rather than add a Biome exception (`.context.md` §10.1, §12.20).
- [x] The system shall state that the renderer never builds or runs a shell command: it calls an IPC method, and the main process decides and executes (`.context.md` §9.3, §12.8).

## Constraints

### Commands the scaffold must define, and AGENTS.md must list

| Command | Purpose |
|---|---|
| `npm run dev` | electron-vite dev server, HMR in the renderer |
| `npm run build` | typecheck, then build all three targets into `out/` |
| `npm run typecheck` | `typecheck:node` + `typecheck:web` (one `tsc --noEmit` per tsconfig) |
| `npm run lint` | `biome check .` |
| `npm run format` | `biome check --write .` |
| `npm test` | Vitest, both projects, once |
| `npm run test:watch` | Vitest in watch mode |
| `npm run build:mac` / `:win` / `:linux` | electron-builder packaging |

### The annotated tree AGENTS.md must carry

```
src/
  main/                       # Node. Everything privileged lives here.
    index.ts                  # app entry: BrowserWindow, IPC registration
    ipc/                      # one module per channel group: handler + arg schema
    maestro/                  # MaestroGateway, LocalGateway, CliRunner,
                              # ScreenCapture, HierarchyParser, SelectorSynth (§9.2)
    services/                 # *.service.ts — repo, gh, flow-index, doctor, ai
    process/run.ts            # the only execFile wrapper (§10.1)
  preload/
    index.ts                  # contextBridge only — never expose raw ipcRenderer
    index.d.ts                # Window augmentation for the exposed API
  renderer/                   # Browser. No Node APIs, sandboxed.
    index.html
    src/
      main.tsx                # React root
      App.tsx
      components/<Name>/      # see Naming
      stores/*.store.ts       # Zustand
      hooks/use*.ts
      styles/                 # global CSS + tokens
      env.d.ts
  shared/                     # imported by BOTH sides: types + config.ts (§2).
                              # No `node:` imports, no DOM APIs.
out/                          # build output — package.json main is ./out/main/index.js
resources/                    # runtime assets shipped with the app
build/                        # icons + entitlements for electron-builder
```

Config files at the root: `electron.vite.config.ts`, `tsconfig.json` (references only), `tsconfig.node.json` (main + preload + shared), `tsconfig.web.json` (renderer + shared), `biome.json`, `electron-builder.yml`, `vitest.config.ts`.

### The naming table AGENTS.md must carry

| Kind | Convention | Example |
|---|---|---|
| React component | folder named for the component, files matching it, no barrel | `components/DeviceMirror/DeviceMirror.tsx`, `DeviceMirror.module.css`, `DeviceMirror.test.tsx` |
| Service (main only) | `<name>.service.ts`, one exported class | `services/repo.service.ts` → `RepoService` |
| Zustand store | `<name>.store.ts` | `stores/flow.store.ts` |
| Hook | `use<Name>.ts` | `hooks/useDeviceMirror.ts` |
| Main-process class module | `PascalCase.ts` | `maestro/CliRunner.ts` (path pinned by §10.1) |
| Plain module / util | kebab-case | `process/run.ts`, `shared/config.ts` |
| Test | sibling of its subject, `*.test.ts` / `*.test.tsx` | `maestro/SelectorSynth.test.ts` |

Components are imported by full path (`@renderer/components/DeviceMirror/DeviceMirror`) — there is no `index.ts` barrel.

### The IPC contract AGENTS.md must state

- Channel names are `<domain>:<action>` in kebab-case: `maestro:hierarchy`, `flow:save`, `doctor:check`, `gh:open-pr`.
- The preload exposes **one function per channel** under a single namespace — `contextBridge.exposeInMainWorld('conductor', { … })`. Never expose `ipcRenderer`, `send`, or `invoke` itself.
- The renderer's view of that API is typed in `src/preload/index.d.ts` by augmenting `Window`. That file is the only place the global is declared.
- Every `ipcMain.handle` validates `event.senderFrame` against the app's own window before doing any work, and returns/throws otherwise (Electron security checklist item 17 — this is an addition to `.context.md` §9.3, which mandates schema validation but not sender validation).
- Every handler validates its arguments against a Zod schema declared beside the channel, before use (`.context.md` §9.3).
- Flow paths from the renderer are resolved **inside** `.maestro/` and rejected on traversal; branch and file names are sanitized before touching the filesystem or Git (`.context.md` §9.3).

### The security table AGENTS.md must carry

| Rule | Instead of |
|---|---|
| `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — never relax (§9.3) | needing Node in the renderer → add an IPC method |
| Restrictive CSP in the renderer (§9.3) | loosening CSP → serve the asset locally |
| Validate `event.senderFrame` in every handler | trusting the sender → allowlist your own window |
| `setWindowOpenHandler` denies by default; restrict `will-navigate` | opening arbitrary URLs → allowlist the host |
| Never pass unvalidated input to `shell.openExternal` | parse the URL and check the host first |
| Renderer never builds a shell command (§9.3, §12.8) | call an IPC method; main decides and executes |
| Process creation is `execFile` with an argument array, via `src/main/process/run.ts` (§8.1, §12.19) | never `exec` with a built string — model-generated PR bodies and prompts go through here |
| No credential is ours: GitHub via `gh`, AI via `claude` CLI (§9.0, §8.1, §6.0) | never add an API key, token, or OAuth flow |

### The read-first table AGENTS.md must carry

| Working on | Read first in `.context.md` |
|---|---|
| Anything | §12 — the 22 standing rules |
| Selector synthesis, hierarchy parsing | §5, especially §5.2–5.4 |
| Maestro CLI invocation, flags, performance | §4.2, §4.4, §10.1 |
| Device screenshot, mirror, hit-test | §4.4, §5.5 |
| AI panel, `claude` CLI | §6 |
| Git, repo cache, pull requests | §7, §8.1 |
| Environment prerequisites, doctor | §10 |

### Testing shape AGENTS.md must state

- Vitest with two projects: `main` (`environment: 'node'`, covering `src/main/**`, `src/preload/**`, `src/shared/**`) and `renderer` (`environment: 'jsdom'`, covering `src/renderer/**`).
- Tests sit beside the code they test, never in a separate `__tests__` tree.
- Component tests use React Testing Library, querying by role and text.
- `SelectorSynth` and `HierarchyParser` are pure, live in main, and carry the project's strongest unit tests — they hold the highest density of traps (`.context.md` §5.2–5.4, §9.2, §13 step 5).
- E2E is not set up. When it is, it is `@playwright/test`'s `_electron`; do not add an E2E layer before the app boots.
- TDD is the default workflow; the `test-driven-development` skill in `.claude/skills/` governs it.

### Quality bar for the writing

- Imperative and exact. "Use `npm`, not `pnpm`" beats "we prefer npm".
- Every line must tell an agent something it could not get from reading the code or `package.json`.
- No architecture overview beyond the 6-line **Project** section — long overviews push agents into exploration instead of action.

## Out of scope

- The scaffold itself: `package.json`, `electron.vite.config.ts`, the tsconfigs, `biome.json`, `vitest.config.ts`, `electron-builder.yml`, any `src/` file. That is `.context.md` §13 step 2 and gets its own spec.
- Any edit to `.context.md`, including the refinements flagged below.
- Renaming or moving `.context.md` to a more discoverable path.
- CI configuration, Playwright/E2E setup, `electron-updater`, code signing.
- The latency and coexistence spike (`.context.md` §13 step 1).
- Nested per-directory `AGENTS.md` files.

## Decisions & assumptions

- **Scope: AGENTS.md only** → confirmed with the engineer. Commands and paths are prescriptive; the scaffold follows in its own spec.
- **Layering: harness here, domain in `.context.md`** → confirmed. AGENTS.md carries the harness plus a ≤8-rule digest and a read-first table; §12 is not copied.
- **Language: English** → confirmed with the engineer, overriding the PT-BR consistency argument. `.context.md` stays PT-BR; the repo is knowingly bilingual.
- **`git init` on the previously non-git project** → approved. Initial commit `c1b9b6a` on `main` seeds `.context.md`, `.claude/` and a minimal `.gitignore`; `.claude/settings.local.json` and `.DS_Store` are excluded.
- **Component styling: CSS Modules** (`DeviceMirror.module.css`) → assumed. Zero runtime, native to Vite, scoped by default, and it fills the "styles.css/ts/whatever" slot in the engineer's stated pattern. Alternatives considered: Tailwind v4, vanilla-extract.
- **No `index.ts` barrel in component folders** → assumed, matching the engineer's stated three-file pattern exactly. Cost: imports repeat the component name.
- **IPC argument validation uses Zod** → assumed. `.context.md` §9.3 requires "schema per channel" without naming a library; AGENTS.md is written before the scaffold, so it is the place that picks one.
- **Vitest + React Testing Library; Playwright `_electron` deferred** → assumed, following the Vite-native default and `.context.md` §9.1's build choice.
- **electron-builder for packaging** → assumed, matching the `@quick-start/electron` `react-ts` template that `.context.md` §9.1 implies.
- **Single root `AGENTS.md`, no `CLAUDE.md`** → assumed. Claude Code reads `AGENTS.md`; two files would drift.
- **Flagged for `.context.md`, not fixed here:** §2 puts `CONFIG` in `src/shared/config.ts` reading `process.env`, but §9.3 sandboxes the renderer, where `process.env` does not exist. AGENTS.md therefore states that `src/shared/` is free of `node:` imports and DOM APIs and that the renderer receives config through the preload bridge. `config.ts` remains the single source per §2. Worth reflecting back into `.context.md` later.
- **Flagged addition:** sender validation (`event.senderFrame`) is item 17 of Electron's security checklist and is absent from `.context.md` §9.3. It is included here and marked as an addition.
- **Flagged for the scaffold spec:** the `@quick-start/electron` `react-ts` template ships `eslint.config.mjs` and `.prettierrc.yaml`. Both must be deleted — `.context.md` §12.20 mandates Biome only.

### Added during implementation

- **Two branch shapes, both stated** → decided while implementing. The spec mandated only `<type>/<slug>`, but `.context.md` §8 step 1 pins a *different* shape for branches Conductor itself creates in the tests repo: `conductor/<flow-slug>`, cut from `CONFIG.REPO_BASE_BRANCH`. Stating only the first would have led whoever implements `RepoService` to violate §8. **Commits & branches** therefore carries both, scoped — this repo vs. the tests repo. Not a contradiction, just an ambiguity that would have bitten.
- **`process.env` conflict phrased as the actionable half.** The §2-vs-§9.3 conflict flagged above is stated in AGENTS.md as what an agent must *do* — a sandboxed renderer has no `process.env`, so `CONFIG` crosses the preload bridge — rather than as a description of the tension. `src/shared/config.ts` remains the single source per §2. Still worth reflecting back into `.context.md`.
- **Verification:** an executable checker covered the mechanizable criteria (line count, exact section set and order, digest-rule count and ref placement, and the literal presence of every mandated tree path, table row, command and identifier); a second agent that had not written the file graded it against the criteria and against `.context.md`. It found the unpaired `strict`-mode prohibition and an inaccurate "only `.context.md` is here" in **Project** — both fixed. The checker lives outside the worktree, since the deliverable is `AGENTS.md` alone.

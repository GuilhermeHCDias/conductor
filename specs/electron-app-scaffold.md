# Electron + React + TypeScript app scaffold
status: done
created: 2026-07-30

## Goal

Turn the empty repository into a running Electron application: `npm run dev` opens a window rendering a React placeholder shell, and every command in the `AGENTS.md` Commands table exists and exits 0. Beyond booting, the scaffold ships the contracts that are cheap now and expensive to retrofit — the single `CONFIG` module (`.context.md` §2), the typed/validated IPC contract with its `Result` shape and sender guard, the `execFile` wrapper, the `§9.3` security posture, and Biome's `noRestrictedImports` architectural rule already enforcing `.context.md` §10.1.

This is step 2 of `.context.md` §13. It matters because every later spec — `MaestroGateway`, hit-test, `SelectorSynth`, the editor, the AI panel — assumes this shape exists. Retrofitting `sandbox: true`, a Zod-validated bridge, or the process-creation ban after services already exist means rewriting them.

## Context

- **Files this touches:** everything is new. Root: `package.json`, `package-lock.json`, `electron.vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.web.json`, `biome.json`, `vitest.config.ts`, `electron-builder.yml`, `commitlint.config.js`, `.nvmrc`, `.husky/`, `build/icon.png`. Source: `src/main/`, `src/preload/`, `src/renderer/`, `src/shared/` as enumerated in the criteria. Modified: `.gitignore`, `AGENTS.md`.
- **Source of truth:** `.context.md` at the repo root (PT-BR). Sections this spec implements: §2 (config constants — the `CONFIG` block is reproduced there verbatim and must be copied exactly), §9.1 (stack), §9.2 (process split), §9.3 (Electron security), §10.1 (the six containment rules and the `biome.json` snippet, which is reproduced there and must be copied), §12 rules 6, 8, 15, 19, 20, §13 step 2.
- **Harness contract:** `AGENTS.md` at the repo root (`CLAUDE.md` is a symlink to it). Its Layout, Naming, Security, Testing and Code style sections are prescriptive for this spec — the scaffold is what makes them true. Where this spec adds something `AGENTS.md` does not yet name (`src/main/ipc/handle.ts`), `AGENTS.md` is amended in the same change.
- **Repo state:** `.context.md`, `AGENTS.md`, `CLAUDE.md` (symlink), `.gitignore`, `.claude/`, `specs/`, `worktrees/`. No `package.json`, no `src/`, no `node_modules/`. Toolchain present locally: Node v22.19.0, npm 10.9.3.
- **Octo worktrees live inside the repo** at `worktrees/<slug>/` — full checkouts of the same repository. Every tool that globs the tree (Biome, `tsc`, Vitest, electron-builder) must exclude it, or it will lint, typecheck and run a second copy of the project.
- **Existing patterns to follow:** none in-repo — this is the first code. Follow the `electron-vite` + `@quick-start/electron` `react-ts` template layout where it does not conflict with `AGENTS.md`; `AGENTS.md` wins on conflict.
- **Product & decision docs:** `.context.md` is the PRD and the ADR set. There is no ticket and no separate design doc.
- **Design & conventions:** no design system, Figma or mockup exists — the renderer here is a placeholder, and its tokens are provisional (see *Decisions & assumptions*). Styling is CSS Modules, per the engineer's instruction and the `AGENTS.md` Naming table.
- **Tests:** no test files are written by this spec (engineer's decision). Vitest is configured and `npm test` exits 0 on an empty suite. Every criterion below is verified by running the command it names and inspecting the resulting file — not by a unit test. **This spec is an explicit, engineer-approved exception to `octo-implement`'s mandatory-TDD default**: there is no behavior under test yet, only configuration and wiring. The first tests arrive with the `MaestroGateway` spec (`.context.md` §13 step 3).

## Acceptance criteria

### Package, commands and toolchain

- [x] The system shall provide a root `package.json` whose `name` is `conductor`, `main` is `./out/main/index.js`, `private` is `true`, and `engines.node` is `>=22`.
- [x] The system shall provide a root `.nvmrc` containing `22`.
- [x] The system shall define exactly these npm scripts, each behaving as described: `dev` (electron-vite dev server with renderer HMR), `build` (`npm run typecheck` then `electron-vite build`), `typecheck` (runs `typecheck:node` then `typecheck:web`), `typecheck:node` (`tsc --noEmit -p tsconfig.node.json`), `typecheck:web` (`tsc --noEmit -p tsconfig.web.json`), `lint` (`biome check .`), `format` (`biome check --write .`), `test` (`vitest run`), `test:watch` (`vitest`), `build:mac`, `build:win`, `build:linux` (each: `npm run build` then the matching electron-builder target), `prepare` (`husky`).
- [x] The system shall not define an npm script not listed above.
- [x] The system shall use npm as the package manager and shall commit `package-lock.json`; it shall not produce a `pnpm-lock.yaml` or `yarn.lock`.
- [x] When `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` are each run on a clean checkout after `npm install`, the system shall exit 0 for each.
- [x] The system shall place every dependency imported at runtime by the main or preload process (including `zod`) in `dependencies`, and every dependency used only by the renderer bundle or the toolchain in `devDependencies`.
- [x] The system shall install the latest stable release of each dependency at implementation time, subject to these floors: Biome `>=2.0`, Vitest `>=3.2`, husky `>=9`, React `19`, TypeScript `5`.

### Build targets and boot

- [x] When `npm run dev` is run, the system shall open exactly one application window rendering the React placeholder shell, and shall apply renderer edits by HMR without restarting the Electron process.
- [x] When `npm run build` is run, the system shall emit `out/main/index.js`, `out/preload/index.js` and `out/renderer/index.html` with their assets.
- [x] The system shall build main and preload as CommonJS and shall not set `"type": "module"` in `package.json`.
- [x] The system shall define the path aliases `@renderer` → `src/renderer/src` and `@shared` → `src/shared`, resolvable identically in `electron.vite.config.ts`, all three tsconfigs, and `vitest.config.ts`.
- [x] The system shall configure three tsconfigs: `tsconfig.json` holding only project references to the other two; `tsconfig.node.json` covering `src/main/**`, `src/preload/**` and `src/shared/**`; `tsconfig.web.json` covering `src/renderer/**` and `src/shared/**`. Each shall enable `strict` and `verbatimModuleSyntax`.
- [x] The system shall exclude `worktrees/`, `out/`, `dist/` and `node_modules/` from every tsconfig, from `biome.json`, and from Vitest's test discovery.

### Configuration module (`.context.md` §2)

- [x] The system shall provide `src/shared/config.ts` exporting a single `const CONFIG` object, declared `as const`, with exactly the keys `APP_ID`, `REPO_URL`, `REPO_BASE_BRANCH`, `FLOWS_DIR`, `FLOW_EXTENSIONS`, each defaulting and env-overriding exactly as written in `.context.md` §2, except that `REPO_URL` defaults to the empty string.
- [x] The system shall not reference the literal `com.vtex.pnp`, the flows directory name `.maestro`, or a repository URL anywhere outside `src/shared/config.ts`.
- [x] The system shall type `CONFIG.APP_ID` as a plain `string`, not an object keyed by platform.

### IPC contract (`src/shared/ipc.ts`)

- [x] The system shall declare in `src/shared/ipc.ts`, and nowhere else, the channel names, one Zod schema per channel payload, the `Result` union, and the `ConductorApi` type derived from them.
- [x] The system shall define `Result<T>` as `{ ok: true; data: T } | { ok: false; error: { code: string; message: string } }`.
- [x] The system shall define exactly two channels in this spec: `app:info` (no request payload; response `{ appVersion, electronVersion, chromeVersion, nodeVersion, platform }`) and `config:get` (no request payload; response is the `CONFIG` shape).
- [x] The system shall derive `ConductorApi` from the schemas rather than declaring the payload types by hand.
- [x] The system shall not import any `node:` module or any DOM type from `src/shared/**`.

### Main process

- [x] The system shall provide `src/main/window.ts` as the only module that constructs a `BrowserWindow`, and it shall set `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`, `webviewTag: false`, and a preload pointing at the built preload bundle.
- [x] The system shall provide `src/main/index.ts` as the composition root: it acquires `app.requestSingleInstanceLock()`, registers IPC handlers, creates the window, and registers a `before-quit` handler that disposes every service in a registry it owns.
- [x] When a second instance of the application is launched, the system shall focus the existing window and exit the second process without creating a window.
- [x] The system shall provide `src/main/ipc/handle.ts` exporting a single `handle(channel, schema, fn)` helper that, for every channel, validates the sender before doing any work, parses the arguments with the channel's schema, and wraps the outcome in `Result`.
- [x] If a request arrives from a frame that is not the application's own window, then the system shall reject it without invoking the handler function.
- [x] If argument validation fails, then the system shall return `{ ok: false, error: { code, message } }` and shall not throw across the IPC boundary.
- [x] The system shall provide `src/main/ipc/app.ts` exporting `registerAppIpc`, handling `app:info` and `config:get` through `handle`.
- [x] The system shall provide `src/main/process/run.ts` exporting the only `execFile` wrapper: it takes a command and an argument array, never a composed shell string, and returns a typed async result carrying stdout, stderr and exit code.
- [x] The system shall not call `ipcMain.on` with `sendSync` semantics on any channel.

### Renderer security (`.context.md` §9.3)

- [x] The system shall attach a Content-Security-Policy `<meta>` element to `src/renderer/index.html` at build time, with a strict policy for `electron-vite build` and an HMR-compatible policy for `electron-vite dev`.
- [x] The built `out/renderer/index.html` shall carry a CSP containing `default-src 'self'`, `script-src 'self'`, `style-src 'self'`, `img-src 'self' data: blob:`, `connect-src 'self'`, `object-src 'none'`, `frame-src 'none'`, `base-uri 'none'` and `form-action 'none'`, and shall contain neither `'unsafe-inline'`, `'unsafe-eval'`, nor any `ws:` or `http:` origin.
- [x] When the renderer attempts to open a new window, the system shall deny it by default via `setWindowOpenHandler`.
- [x] When the renderer attempts to navigate away from the application's own origin, the system shall block the navigation.
- [x] The system shall not call `shell.openExternal` anywhere in this scaffold.

### Preload

- [x] The system shall provide `src/preload/index.ts` that exposes, via `contextBridge.exposeInMainWorld('conductor', …)`, exactly one named function per channel and nothing else.
- [x] The system shall not expose `ipcRenderer`, `send`, `invoke`, `require`, `process`, or any Node primitive to the renderer.
- [x] The system shall hold no logic and no state in the preload beyond forwarding arguments and returning the result.
- [x] The system shall declare the `window.conductor` global in `src/preload/index.d.ts` and nowhere else, typed as `ConductorApi`.
- [x] The system shall not depend on `@electron-toolkit/preload`, whose `electronAPI` global violates the one-function-per-channel rule.

### Renderer application and styling

- [x] The system shall provide `src/renderer/index.html`, `src/renderer/src/main.tsx` mounting the React root, and `src/renderer/src/App.tsx` rendering the placeholder shell.
- [x] When the shell mounts, the system shall call `window.conductor` for `app:info` and `config:get` and render the returned app id, flows directory and version strings.
- [x] While either call is in flight, the system shall render a loading state.
- [x] If either call returns `{ ok: false }`, then the system shall render the returned `error.message` instead of the data, and shall not throw.
- [x] The system shall style the shell exclusively with CSS Modules — `src/renderer/src/App.module.css` — plus two global stylesheets, `src/renderer/src/styles/tokens.css` (CSS custom properties for color, spacing, radius and typography) and `src/renderer/src/styles/global.css` (reset plus the tokens import).
- [x] The system shall not introduce a CSS framework, a CSS-in-JS library, or a state-management library.
- [x] The system shall not import any Node API from `src/renderer/**`.
- [x] The system shall provide `src/renderer/src/env.d.ts` referencing `vite/client` so `*.module.css` imports typecheck.

### Biome and the architectural rule (`.context.md` §10.1)

- [x] The system shall provide a root `biome.json` as the only linter and formatter configuration, and shall not add ESLint, Prettier, or any of their config files or plugins.
- [x] The system shall configure `style/noRestrictedImports` at `error` for both the `node:child_process` and the bare `child_process` specifiers, with the messages given in `.context.md` §10.1.
- [x] The system shall grant the rule an `overrides` exception — turning the rule **off**, not redefining its options — for exactly `src/main/maestro/CliRunner.ts`, `src/main/maestro/ScreenCapture.ts` and `src/main/process/run.ts`, and for no other path.
- [x] When a module outside those three paths imports `child_process` under either specifier, the system shall fail `npm run lint`.
- [x] The system shall format CSS, JSON and TypeScript with Biome, and `npm run lint` shall report no diagnostics on the delivered tree.

### Test harness

- [x] The system shall provide a root `vitest.config.ts` defining two projects: `main` with `environment: 'node'` covering `src/main/**`, `src/preload/**` and `src/shared/**`, and `renderer` with `environment: 'jsdom'` covering `src/renderer/**`.
- [x] The system shall set `passWithNoTests` so that `npm test` exits 0 while no test files exist.
- [x] The system shall not create a `__tests__` directory and shall not write any test file in this spec.

### Git hooks

- [x] The system shall install husky v9-style hooks: plain shell scripts under `.husky/`, with no `husky.sh` sourcing and no `#!/usr/bin/env sh` shim requirement, activated by the `prepare` script.
- [x] When a commit is made, the system shall run `biome check --staged --write --no-errors-on-unmatched` and re-stage the files it rewrote, then run `npm run typecheck`, and shall abort the commit if either fails.
- [x] When a commit message is written, the system shall validate it with `@commitlint/cli` against `@commitlint/config-conventional` and shall abort the commit if it does not conform.
- [x] If a commit message uses a type outside `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style`, `test`, then the system shall reject it.
- [x] When a push is made, the system shall run `npm test` and shall abort the push if it fails.
- [x] The system shall provide `commitlint.config.js` extending `@commitlint/config-conventional` with no rule overrides.

### Packaging

- [x] The system shall provide a root `electron-builder.yml` with `appId: com.vtex.conductor` and `productName: Conductor`, targeting macOS, Windows and Linux, unsigned, with no notarization or auto-update configuration.
- [x] The system shall provide `build/icon.png` at 1024×1024 as the single icon source for all platforms.
- [x] The system shall keep the packaging `appId` (`com.vtex.conductor`, Conductor itself) distinct from `CONFIG.APP_ID` (`com.vtex.pnp`, the app under test) and shall not derive one from the other.
- [x] The system shall exclude `worktrees/`, `specs/` and `.claude/` from the packaged application.

### Repository hygiene and harness update

- [x] The system shall add `worktrees/` to `.gitignore`.
- [x] The system shall update the `AGENTS.md` **Project** section so it no longer describes the repository as pre-scaffold, and states instead that the scaffold exists and that the Layout and Commands tables describe the tree as built.
- [x] The system shall add a row to the `AGENTS.md` **Naming** table for `src/main/ipc/handle.ts` — the shared IPC guard, which is not a domain module and therefore does not take the `register<Domain>Ipc` shape.
- [x] The system shall make no other edit to `AGENTS.md` and no edit at all to `.context.md`.

## Constraints

- **`.context.md` §2 and the `biome.json` snippet in §10.1 are reproduced verbatim in that document — copy them, do not paraphrase.** The only permitted deviation is `REPO_URL`'s default (see *Decisions & assumptions*).
- **Both `child_process` specifiers must be restricted.** `node:child_process` and `child_process` are distinct specifiers to Biome; restricting one leaves the door open (`.context.md` §10.1).
- **Biome `overrides` does not deep-merge rule options** — the exception must switch `noRestrictedImports` off for the three files, not attempt to redefine `paths` (`.context.md` §10.1).
- **A sandboxed preload cannot be an ES module.** With `sandbox: true` non-negotiable (§9.3), preload must build to CommonJS; this is why `"type": "module"` is excluded from `package.json`.
- **`onHeadersReceived` does not fire for `file://`,** which is how the packaged renderer loads — so the CSP must travel in the HTML, injected per mode by the renderer build config.
- **`img-src` allows `data:` and `blob:`** because §10.1 rule 2 sends device frames across IPC as bytes, which the renderer turns into object URLs. This is a deliberate forward-looking allowance, not an oversight.
- **Biome's `--staged --write` rewrites whole files.** For a partially-staged file the pre-commit hook will stage the unstaged remainder too. This is accepted rather than adding `lint-staged`; re-stage with `git update-index --again`.
- **`worktrees/` holds live checkouts of this same repository.** Missing it in any exclude list doubles every lint, typecheck and test run and produces confusing duplicate diagnostics.
- **`electron-vite` externalizes `dependencies` for main and preload and bundles `devDependencies`.** A runtime import placed in the wrong section either bloats the bundle or is missing from the packaged app.
- **Security posture is not negotiable** (§9.3, `AGENTS.md` Security): no relaxing `contextIsolation`, `nodeIntegration`, `sandbox` or the CSP to make something work. If the renderer appears to need Node, the answer is an IPC method.
- No credential, API key, token or OAuth flow is introduced anywhere (`.context.md` §9.0, §12 rule 15).

## Out of scope

- `MaestroGateway`, `LocalGateway`, `CliRunner`, `ScreenCapture`, `HierarchyParser`, `SelectorSynth` — `.context.md` §13 step 3 and later.
- Every service in `src/main/services/` — repo, gh, flow-index, doctor, ai.
- The five §9.2 views (`DeviceMirror`, `FlowEditor`, `AIPanel`, `RunPanel`, `PRPanel`) and `Doctor`; no `views/`, `components/`, `hooks/`, `stores/` or `lib/` directories are created.
- Zustand, CodeMirror, the `yaml` parser, `simple-git` — installed by the specs that first use them.
- Any test file, and the Playwright `_electron` E2E layer (`AGENTS.md`: not before the app boots).
- Code signing, notarization, auto-update, CI pipelines, and release automation.
- Real branding: icon art, color palette, typography choices and window chrome design.
- `src/shared/types.ts` — nothing to put in it yet.
- Filling in `CONFIG.REPO_URL` (`.context.md` §2 defers it) and any Git or GitHub capability.

## Decisions & assumptions

- **How far the scaffold goes** → a booting app *plus* the expensive-to-retrofit contracts: `config.ts`, the Zod-validated IPC contract with `Result` and the sender guard, `window.ts` with the §9.3 flags and CSP, the composition root, and `process/run.ts`. Domain folders are not pre-created; each arrives with its own spec.
- **Proof-of-life channels** → `app:info` and `config:get`, both consumed by the placeholder shell. `app:info` proves the full renderer → preload → ipc → main → renderer round-trip end to end; `config:get` is how the sandboxed renderer receives `CONFIG`, since it has no `process.env`.
- **Why `config:get` is an IPC channel and not preload-time injection** → synchronous injection would need either `sendSync` (forbidden by `AGENTS.md`) or argv parsing inside the preload (logic the preload is forbidden to hold).
- **Git hooks** → all four selected: `commit-msg` runs commitlint; `pre-commit` runs `biome check --staged` *and* `npm run typecheck`; `pre-push` runs `npm test`. Conventional-commit enforcement is a `commit-msg` concern, not `pre-commit` — the engineer's request was split accordingly.
- **No `lint-staged`** → Biome's native `--staged` covers it; the partial-staging caveat above is accepted.
- **Tests** → Vitest is configured with both projects but this spec writes no test file, and `passWithNoTests` keeps `npm test` and the pre-push hook green. This overrides `octo-implement`'s mandatory-TDD default *for this spec only*, by explicit engineer decision: the deliverable is configuration and wiring, and every criterion is verified by running a command. `@testing-library/react` and `jest-dom` are therefore deferred to the first spec that writes a renderer test.
- **Packaging** → `electron-builder.yml` and the three `build:*` scripts ship now so the `AGENTS.md` Commands table is true. `appId: com.vtex.conductor`, `productName: Conductor`, unsigned, with a placeholder `build/icon.png`; electron-builder derives `.icns` and `.ico` from that single 1024×1024 PNG.
- **Icon art** → a flat, brand-neutral placeholder. Any generation method is acceptable; it will be replaced when branding exists.
- **`resources/` is not created** → no runtime asset exists yet, and the window uses Electron's default icon.
- **`CONFIG.REPO_URL` defaults to `''`,** not the literal `'<definir>'` from `.context.md` §2. A placeholder string would flow into `git clone` as a valid-looking argument; empty is unambiguously "not configured" and is what `DoctorService` will check. This is the one intentional deviation from the §2 block.
- **Path aliases** → `@renderer` and `@shared` only. Main and preload import each other's neighbours relatively; there is no barrel anywhere (`AGENTS.md`).
- **CSS Modules typing** → the ambient `vite/client` types (`Record<string, string>`) are enough. No `typescript-plugin-css-modules`, no generated `.d.ts` per stylesheet.
- **Design input** → none requested; no PRD, Figma or design system applies to a placeholder shell. `styles/tokens.css` is a provisional token set, expected to be replaced wholesale when a design exists.
- **`@electron-toolkit/tsconfig` and `@electron-toolkit/utils` may be used** (base tsconfigs, `is.dev`, `optimizer`); `@electron-toolkit/preload` may not — its `electronAPI` global breaks the preload contract.
- **Module format** → CommonJS for main and preload, ESM for the renderer via Vite. Driven by the sandboxed-preload constraint above, not by preference.

### Resolved during implementation

- **The preload must bundle its dependencies, not externalize them.** electron-vite injects `externalizeDepsPlugin` for main *and* preload unless told otherwise, which turns `import { CHANNELS } from '@shared/ipc'` into a bare `require('zod')` in `out/preload/index.js` — and a sandboxed preload can `require` nothing but `electron`, so the bridge is never exposed. Fixed with `preload.build.externalizeDeps: false`; `out/preload/index.js` now requires only `electron`. This is the concrete cost of the "sandboxed preload cannot be an ES module" constraint, one layer down.
- **The CSP is injected as text, not as a Vite tag descriptor.** Vite escapes attribute values, so `'self'` ships as `&#39;self&#39;`. It parses correctly, but a policy nobody can grep is a policy nobody audits. `transformIndexHtml` returns the rewritten HTML string instead.
- **Vite is pinned to `^7` and `@vitejs/plugin-react` to `^5`.** `electron-vite@5` peers cap Vite at 7, and plugin-react 6 requires Vite 8 — so "latest stable" resolves to the latest *mutually compatible* set, not the latest of each in isolation. Everything else took its floor's latest: Biome 2.5.6, Vitest 4.1.10, husky 9.1.7, React 19.2.8, TypeScript 7.0.2, Electron 43.2.0.
- **`@types/node` tracks Electron's Node, not npm's latest.** Electron 43 bundles Node 24.18 — that is what executes `src/main/**` and `src/preload/**`, and the only code the tsconfigs typecheck. `@types/node@^26` would type APIs the app cannot call. `^24` also matches what `electron` itself depends on, so npm hoists a single copy.
- **`tsconfig.web.json` also includes `src/preload/index.d.ts`.** `window.conductor` is declared there and nowhere else, so the renderer cannot typecheck without it. Its `include` is otherwise exactly `src/renderer/**` + `src/shared/**` as specified.
- **Root config files are not typechecked.** The three tsconfigs cover exactly the `src/` trees named above, so `electron.vite.config.ts`, `vitest.config.ts` and `commitlint.config.js` are linted by Biome but never see `tsc`.
- **`package.json` has no `author`.** electron-builder warns on every run and uses the field for the Linux maintainer metadata. Whose name and email go there is the product owner's call, not one to invent — worth adding before the first real `build:linux`.
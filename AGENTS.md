# AGENTS.md — Conductor

## Project

Conductor is an Electron desktop app that orchestrates the Maestro CLI so non-developers can author e2e tests.
No backend exists and no credential is ours — every capability comes from the user's machine (`.context.md` §9.0, §12.15).
The repo is **pre-scaffold**: only `.context.md`, `.gitignore` and `.claude/` are here. The commands, layout and names below are the contract the scaffold must satisfy, not a description of what exists.
`.context.md` at the repo root is the source of truth for product and architecture; this file is the harness only.

## Commands

The scaffold must define these as `package.json` scripts. Use `npm`, not `pnpm` or `yarn`.

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

## Layout

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

Root config files: `electron.vite.config.ts`, `tsconfig.json` (references only), `tsconfig.node.json` (main + preload + shared), `tsconfig.web.json` (renderer + shared), `biome.json`, `electron-builder.yml`, `vitest.config.ts`.

A sandboxed renderer has no `process.env`, so it receives `CONFIG` through the preload bridge; `src/shared/config.ts` stays the single source. Never hardcode a `CONFIG` value outside that file (§2, §12.6).

## Naming

| Kind | Convention | Example |
|---|---|---|
| React component | folder named for the component, files matching it, no barrel | `components/DeviceMirror/DeviceMirror.tsx`, `DeviceMirror.module.css`, `DeviceMirror.test.tsx` |
| Service (main only) | `<name>.service.ts`, one exported class | `services/repo.service.ts` → `RepoService` |
| Zustand store | `<name>.store.ts` | `stores/flow.store.ts` |
| Hook | `use<Name>.ts` | `hooks/useDeviceMirror.ts` |
| Main-process class module | `PascalCase.ts` | `maestro/CliRunner.ts` (path pinned by §10.1) |
| Plain module / util | kebab-case | `process/run.ts`, `shared/config.ts` |
| Test | sibling of its subject, `*.test.ts` / `*.test.tsx` | `maestro/SelectorSynth.test.ts` |

Import components by full path — `@renderer/components/DeviceMirror/DeviceMirror`. There is no `index.ts` barrel; do not add one.

## Process boundaries & IPC

- Channel names are `<domain>:<action>` in kebab-case: `maestro:hierarchy`, `flow:save`, `doctor:check`, `gh:open-pr`.
- The preload exposes **one function per channel** under a single namespace — `contextBridge.exposeInMainWorld('conductor', { … })`. Never expose `ipcRenderer`, `send`, or `invoke` itself; expose a named function that wraps the channel.
- The renderer's view of that API is typed in `src/preload/index.d.ts` by augmenting `Window`. That file is the only place the global is declared.
- Every `ipcMain.handle` validates `event.senderFrame` against the app's own window before doing any work, and returns or throws otherwise. (Electron security checklist item 17 — an addition to `.context.md` §9.3, which mandates schema validation but not sender validation.)
- Every handler validates its arguments against a Zod schema declared beside the channel, before use (§9.3).
- Flow paths from the renderer resolve **inside** `.maestro/` and are rejected on traversal; sanitize branch and file names before they touch the filesystem or Git (§9.3).
- Behind the channel, every Maestro call we make goes through `MaestroGateway`. The one exception is `maestro mcp`, which Claude Code manages as its own subprocess and which sits outside the Gateway (§4.3.7, §12.9).

## Security

| Rule | Instead of |
|---|---|
| `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — never relax (§9.3) | needing Node in the renderer → add an IPC method |
| Restrictive CSP in the renderer (§9.3) | loosening CSP → serve the asset locally |
| Validate `event.senderFrame` in every handler | trusting the sender → allowlist your own window |
| `setWindowOpenHandler` denies by default; restrict `will-navigate` | opening arbitrary URLs → allowlist the host |
| Never pass unvalidated input to `shell.openExternal` | parse the URL and check the host first |
| The renderer never builds or runs a shell command (§9.3, §12.8) | call an IPC method; main decides and executes |
| Process creation is `execFile` with an argument array, via `src/main/process/run.ts` (§8.1, §12.19) | never `exec` with a built string — model-generated PR bodies and prompts go through here |
| No credential is ours: GitHub via `gh`, AI via the `claude` CLI (§9.0, §8.1, §6.0) | never add an API key, token, or OAuth flow |

## Testing

- Vitest with two projects: `main` (`environment: 'node'`, covering `src/main/**`, `src/preload/**`, `src/shared/**`) and `renderer` (`environment: 'jsdom'`, covering `src/renderer/**`).
- Tests sit beside the code they test. Never add a separate `__tests__` tree.
- Component tests use React Testing Library, querying by role and text.
- `SelectorSynth` and `HierarchyParser` are pure, live in main, and carry the project's strongest unit tests — they hold the highest density of traps (§5.2–5.4, §9.2, §13 step 5).
- E2E is not set up yet. When it is, it is `@playwright/test`'s `_electron`; do not add an E2E layer before the app boots.
- TDD is the default workflow, governed by the `test-driven-development` skill in `.claude/skills/`.

## Code style

- Biome is the only linter and formatter: `biome.json` at the root. Do not introduce ESLint or Prettier, and delete either if a template ships it.
- TypeScript runs in `strict` mode across all three tsconfigs. Rather than widening a type or reaching for `any` to clear an error, narrow at the boundary with a type guard, or derive the type from the channel's Zod schema.
- When `noRestrictedImports` fires, you have put process creation in the wrong file. Move the code behind `src/main/process/run.ts`, `src/main/maestro/CliRunner.ts` or `src/main/maestro/ScreenCapture.ts` — the only three files that may create OS processes. Adding a Biome exception is almost always wrong (§10.1, §12.20).

## Commits & branches

- Commit messages are Conventional Commits: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- Branches in this repo are `<type>/<slug>`, matching the commit type that carries the work — `feat/device-mirror`, `docs/agents-md-harness`.
- Branches Conductor *creates* in the tests repo are named from the flow instead — `conductor/<flow-slug>`, cut from `CONFIG.REPO_BASE_BRANCH` (§8).

## Read before you touch

| Working on | Read first in `.context.md` |
|---|---|
| Anything | §12 — the 22 standing rules |
| Selector synthesis, hierarchy parsing | §5, especially §5.2–5.4 |
| Maestro CLI invocation, flags, performance | §4.2, §4.4, §10.1 |
| Device screenshot, mirror, hit-test | §4.4, §5.5 |
| AI panel, `claude` CLI | §6 |
| Git, repo cache, pull requests | §7, §8.1 |
| Environment prerequisites, doctor | §10 |

`.context.md` marks open questions with ❓. When you hit one, ask — do not choose in silence (§12.22).

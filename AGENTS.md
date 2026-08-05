# AGENTS.md — Conductor

## Project

Conductor is an Electron desktop app that orchestrates the Maestro CLI so non-developers can author e2e tests.
No backend exists and no credential is ours — every capability comes from the user's machine (`.context.md` §9.0, §12.15).
The scaffold **exists**: the app boots, and the Commands and Layout tables below describe the tree as built. The directories they name that are not there yet — `maestro/`, `services/`, `views/`, `components/`, `hooks/`, `stores/`, `lib/` — are the contract each later spec must satisfy when it creates them.
`.context.md` at the repo root is the source of truth for product and architecture decisions; this file is the working contract for how code is organized and written. If they conflict, `.context.md` wins — fix this file in the same change.

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
    index.ts                  # composition root: window, services, IPC registration
    window.ts                 # the one BrowserWindow factory — carries the §9.3 flags
    ipc/                      # <domain>.ts — thin handlers: validate, call a service
    maestro/                  # MaestroGateway, LocalGateway, CliRunner,
                              # ScreenCapture, HierarchyParser, SelectorSynth (§9.2)
    services/                 # <name>.service.ts — repo, gh, flow-index, doctor, ai
    process/run.ts            # the only execFile wrapper (§10.1)
  preload/
    index.ts                  # contextBridge only — implements ConductorApi, no logic
    index.d.ts                # Window augmentation for the exposed API
  renderer/                   # Browser. No Node APIs, sandboxed.
    index.html
    src/
      main.tsx                # React root
      App.tsx                 # layout shell arranging views — no business logic
      views/<Name>/           # one folder per §9.2 panel — see Architecture
      components/<Name>/      # reusable presentational components
      hooks/use<Name>.ts      # event subscriptions + reusable view logic
      stores/<name>.store.ts  # Zustand, one per domain
      lib/                    # pure renderer logic (hit-test, bounds math)
      styles/                 # global CSS + tokens
      env.d.ts
  shared/                     # imported by BOTH sides. No `node:` imports, no DOM.
    config.ts                 # §2 — the single CONFIG source
    ipc.ts                    # the IPC contract: channels, Zod schemas, ConductorApi
    types.ts                  # TreeNode, Snapshot, Device, RunEvent… (split when it grows)
out/                          # build output — package.json main is ./out/main/index.js
resources/                    # runtime assets shipped with the app
build/                        # icons + entitlements for electron-builder
```

Root config files: `electron.vite.config.ts`, `tsconfig.json` (references only), `tsconfig.node.json` (main + preload + shared), `tsconfig.web.json` (renderer + shared), `biome.json`, `electron-builder.yml`, `vitest.config.ts`.

A sandboxed renderer has no `process.env`, so it receives `CONFIG` through the preload bridge; `src/shared/config.ts` stays the single source and the renderer imports **types only** from `shared/`. Never hardcode a `CONFIG` value outside that file (§2, §12.6).

## Architecture

### The data path

One direction, no shortcuts:

```
view / store action (renderer)
  → window.conductor.<fn>()               preload — the only bridge
  → ipc/<domain>.ts                       main — sender check + Zod parse
  → service · MaestroGateway              main — business logic
  → run.ts | CliRunner                    the only 2 process creators (§10.1)
  → maestro · gh · git · claude · adb · simctl
```

Results come back up the same path. Anything main must **push** — watcher hits, run progress, AI stream chunks, mirror frames — crosses as a typed event that the preload wraps in a subscription function. The renderer never reaches around this pipeline; main never knows React exists.

The product's core loop (§5.5) as a worked example: mirror frames stream in cheap and fast (`ScreenCapture`, no JVM); hover hit-tests **locally in the renderer** against the frozen snapshot (`lib/hit-test.ts` — zero IPC per mousemove); a click asks main to synthesize (`maestro:synthesize-selector`), where `SelectorSynth` validates uniqueness against the same snapshot (§5.4); the editor inserts the returned command and saves via `flow:save`; the watcher reports the write back as `flow:changed`, and the UI re-renders from that event.

### Main process

- **`index.ts` is the composition root** — the only place services are constructed, wired together (plain constructor injection) and registered. No module-level singletons: a class you cannot instantiate in a test with fakes is shaped wrong.
- **`ipc/` modules are thin controllers.** Validate, call one service method, shape the result. Business logic in a handler is in the wrong layer.
- **Services own one domain each** and hold the business logic. They may use the Gateway and `run.ts`; they never import `child_process` (Biome enforces it, §10.1).
- **`MaestroGateway` is the only door to Maestro** (§4.3.7). `LocalGateway` implements it via `CliRunner` (always `--no-reinstall-driver` + `MAESTRO_CLI_NO_ANALYTICS=1`, §12.10), `ScreenCapture` (`adb`/`simctl`, §12.13) and `MaestroMcpService` (the one persistent `maestro mcp` child, which owns its own lifecycle — §12.9's amendment). Keep the contract remote-safe: screenshots as bytes, `deviceId` opaque, everything async (§10.1's six rules).
- **`HierarchyParser` and `SelectorSynth` are pure** — no I/O, no Electron imports (§9.2). They read the top-level booleans of `TreeNode`, not `attributes` strings, and treat `null` as "not reported" (§5.2).
- **Long work is streamed, never awaited in a handler.** A start invoke returns an id immediately; progress arrives as push events; cancellation is its own channel (`run:start` → `run:event` → `run:cancel`; same shape for `ai:*`). Never block main, and never use `sendSync` anywhere.
- **Every service holding a process, session or watcher implements `dispose()`**, called from `before-quit`. No orphaned JVMs, `claude` sessions or chokidar watchers.

### Renderer

Layers from dumb to wired — each may import only from the rows above it:

| Layer | Role | May import |
|---|---|---|
| `lib/` | Pure functions: hit-test, bounds/scale math, formatting. No React, no IPC. | `shared` (types) |
| `components/` | Reusable presentational pieces. Props in, callbacks out. No stores, no `window.conductor`. | `lib`, other components |
| `stores/` | Zustand, one per domain (`device`, `flow`, `run`, `ai`, `doctor`, `pr`). State + actions; **actions are the only renderer code that calls `window.conductor` commands**. | `lib` |
| `hooks/` | Subscriptions (`window.conductor.on*`) that write into stores, plus reusable view logic. | `stores`, `lib`, other hooks |
| `views/` | One folder per §9.2 panel: `DeviceMirror`, `FlowEditor`, `AIPanel`, `RunPanel`, `PRPanel` — plus `Doctor` (§10). Compose components, select from stores, mount hooks. | everything above |

Rules that keep the layers honest:

- `App.tsx` only arranges views and mounts the app-wide subscription hooks (flow index, doctor, run and AI events). View-scoped streams — mirror frames — are mounted by their view, so they stop when it unmounts.
- Every subscription function returns an unsubscribe; the hook calls it in effect cleanup. A leaked listener at 1–2 fps is a memory leak with a framerate.
- Main owns the truth for anything on disk or on the device; stores are projections of it plus pure UI state. `flow:changed` fires whether the edit came from the user, the AI or an external editor — one path, no special cases (§12.21). Never keep a renderer-only copy of a flow.
- Select narrowly (`useFlowStore(s => s.selected)`). Mirror frames arrive continuously; a sloppy selector turns them into whole-app re-renders.
- Frames cross IPC as bytes (§10.1 rule 2): make an object URL, render it, revoke the previous one.

### The IPC contract

- `src/shared/ipc.ts` is the single contract: channel names, one Zod schema per channel, and the `ConductorApi` type derived from them. Main imports the schemas to validate; the preload implements `ConductorApi`; the renderer imports types only.
- Channel names are `<domain>:<action>` in kebab-case: `maestro:hierarchy`, `flow:save`, `doctor:check`, `gh:open-pr`. Push channels read as events: `flow:changed`, `run:event`, `ai:event`.
- The preload exposes **one named function per channel** under `contextBridge.exposeInMainWorld('conductor', …)` and nothing else — never `ipcRenderer`, `send` or `invoke` raw. It holds no logic and no state; anything smarter than forwarding belongs in main or the renderer.
- `src/preload/index.d.ts` augments `Window` with `ConductorApi` and is the only place the global is declared.
- Every `ipcMain.handle` validates `event.senderFrame` against the app's own window before doing any work (Electron checklist item 17 — an addition to §9.3), then parses its args with the channel's schema.
- Expected failures cross the boundary as values, not exceptions: handlers return `{ ok: true, data } | { ok: false, error: { code, message } }`, declared once in `shared/ipc.ts`. Electron strips custom fields from rejected `invoke`s, and the doctor UX needs stable `code`s to tell "gh missing" from "gh not authenticated" (§10, §8.1). Throwing across IPC is reserved for bugs.
- Flow paths from the renderer resolve **inside** `.maestro/` and are rejected on traversal; sanitize branch and file names before they touch the filesystem or Git (§9.3).
- Behind the channels, every Maestro call we make goes through `MaestroGateway`. The one exception is `maestro mcp`, which Claude Code manages as its own subprocess, outside the Gateway (§4.3.7, §12.9).

### Lifecycle

- `app.requestSingleInstanceLock()` at startup; a second instance focuses the first and exits. Two Conductors would fight over the repo clone and the on-device driver (§4.3.6).
- `window.ts` is the only module that creates a `BrowserWindow`, and it carries the §9.3 flags.
- On `before-quit`, `index.ts` disposes every service — watchers closed, `claude` and `maestro` children killed.

## Naming

| Kind | Convention | Example |
|---|---|---|
| View | folder per §9.2 panel under `views/`, files matching, no barrel | `views/FlowEditor/FlowEditor.tsx`, `FlowEditor.module.css`, `FlowEditor.test.tsx` |
| React component | folder named for the component, same file pattern | `components/FlowList/FlowList.tsx` |
| Hook | `use<Name>.ts` | `hooks/useMirrorStream.ts` |
| Zustand store | `<domain>.store.ts` | `stores/flow.store.ts` |
| Renderer pure module | kebab-case in `lib/` | `lib/hit-test.ts` |
| Service (main only) | `<name>.service.ts`, one exported class | `services/repo.service.ts` → `RepoService` |
| IPC module | `<domain>.ts` in `ipc/`, exports `register<Domain>Ipc` | `ipc/flow.ts` → `registerFlowIpc(deps)` |
| Shared IPC guard | `ipc/handle.ts` — not a domain, so not `register<Domain>Ipc` | `ipc/handle.ts` → `handle(channel, schema, fn)` |
| Main-process class module | `PascalCase.ts` | `maestro/CliRunner.ts` (path pinned by §10.1) |
| Plain module / util | kebab-case | `process/run.ts`, `shared/config.ts` |
| Test | sibling of its subject, `*.test.ts` / `*.test.tsx` | `maestro/SelectorSynth.test.ts` |

Import by full path — `@renderer/views/FlowEditor/FlowEditor`. There is no `index.ts` barrel anywhere; do not add one.

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
- The architecture is the test plan: `lib/`, stores, `HierarchyParser`, `SelectorSynth` and services are plain TS — test them directly, no rendering, no Electron. If a behavior is hard to test without mounting a component, its logic sits in the wrong layer; move it down before writing the test.
- Renderer tests mock exactly one seam: `window.conductor`. Never mock stores, hooks or components.
- Component and view tests use React Testing Library, querying by role and text.
- `SelectorSynth` and `HierarchyParser` carry the project's strongest unit tests — they hold the highest density of traps (§5.2–5.4, §9.2, §13 step 5).
- E2E is not set up yet. When it is, it is `@playwright/test`'s `_electron`; do not add an E2E layer before the app boots.
- TDD is the default workflow, governed by the `test-driven-development` skill in `.claude/skills/`.

## Code style

- Biome is the only linter and formatter: `biome.json` at the root. Do not introduce ESLint or Prettier, and delete either if a template ships it.
- TypeScript runs in `strict` mode across all three tsconfigs. Rather than widening a type or reaching for `any` to clear an error, narrow at the boundary with a type guard, or derive the type from the channel's Zod schema.
- When `noRestrictedImports` fires, you have put process creation in the wrong file. Move the code behind `src/main/process/run.ts` or `src/main/maestro/CliRunner.ts` — the only two files that may create OS processes. A module that merely *names* `adb`/`maestro` and takes its runner by constructor injection (`AdbBridge`, `ScrcpySource`, `ScreenCapture`) creates nothing and needs no exception. Adding a Biome exception is almost always wrong (§10.1, §12.20).

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
| IPC, preload, new channels | §9.3 — plus the Architecture section above |

`.context.md` marks open questions with ❓. When you hit one, ask — do not choose in silence (§12.22).

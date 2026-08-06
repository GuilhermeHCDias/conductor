# Local flow workspace: files on disk, folder tree, smart YAML indent

status: todo
created: 2026-08-06

## Goal

Flows stop being fixtures and become real `.yaml` files in a local workspace at
`app.getPath('userData')/repo/conductor/` — written to disk automatically on every edit
(§8.2's immediate cadence), listed in the sidebar as the design mock's folder tree with full
file and folder management (create, rename, duplicate, delete), and edited with real-time
YAML-aware indentation in the existing hand-rolled editor (no editor library). New flows open
with the `appId` from `CONFIG.APP_ID`, ending the stale hardcoded fixture header. Publishing
stays out: this is the local half of §8's two cadences, and the ground the future publish
spec will commit and push.

## Context

- **Files this touches (main):**
  - `src/main/services/flow.service.ts` — **new**, `FlowService`. Owns the flow domain: the
    workspace root (injected by the composition root, never computed inside), the index
    (§7's `{ path, name, commandCount, hash }` over `conductor/**/*.{yml,yaml}`), atomic
    saves, file/folder CRUD, and the one chokidar watcher pushing `flow:changed`.
    Implements `dispose()`. This service is what AGENTS.md sketched as `flow-index`, grown
    to carry the whole domain — see the docs criterion.
  - `src/main/ipc/flow.ts` — **new**, `registerFlowIpc`. Thin handlers over the `handle`
    wrapper: validate, call one `FlowService` method, shape the `Result`.
  - `src/main/index.ts` — compose `FlowService` with root
    `join(app.getPath('userData'), 'repo', CONFIG.FLOWS_DIR)`, register the IPC, dispose on
    `before-quit` (watcher closed).
  - `src/shared/ipc.ts` — new channels, Zod schemas, stable error codes; `ConductorApi`
    grows one named function per channel.
  - `src/shared/types.ts` — `FlowMeta`, `FlowIndex` (derived from the channel schemas).
- **Files this touches (renderer):**
  - `src/renderer/src/lib/yaml-indent.ts` — **new, pure**. The whole indentation decision:
    given the textarea's text, selection and key, returns the replacement text and new
    selection (or "not handled"). No React, no IPC, no dependency.
  - `src/renderer/src/stores/flow.store.ts` — grows from in-memory fixture to the flow
    domain: the index (`flows`, `folders`), the open flow (`path`, `yaml`, save state),
    and actions that are the only callers of the new `window.conductor` flow functions
    (open, edit-with-debounced-save, create, rename, duplicate, delete, folder ops).
  - `src/renderer/src/hooks/useFlowIndex.ts` — **new**. Subscribes `onFlowChanged`, writes
    into the store, unsubscribes on cleanup. Mounted from `App.tsx` — AGENTS.md already
    names "flow index" as an app-wide subscription.
  - `src/renderer/src/views/FlowList/FlowList.tsx` — the flat fixture list becomes the
    mock's tree: folder rows, disclosure, inline draft/rename rows, context menus, the
    header "+" menu, search flattening, empty states.
  - `src/renderer/src/views/FlowEditor/FlowEditor.tsx` — `onKeyDown` wiring for the indent
    engine; DocumentBar reads the open flow from `flow.store` (the `ui.store` fixture
    document dies).
  - `src/renderer/src/stores/ui.store.ts` — `document`, `openFlow`, `newFlow` and
    `nextDocumentNumber` move out (flow identity now lives in `flow.store`).
  - `src/renderer/src/hooks/useWindowShortcuts.ts` — ⌘N (new flow), ⇧⌘N (new folder).
  - `src/renderer/src/fixtures/flows.ts` — `FLOW_YAML`, `FLOWS`, `OPEN_DOCUMENT` and the
    `Flow`/`FlowDocument` types are deleted; AI/status fixtures (`THREAD`, `SUGGESTIONS`,
    status lines) stay until their own specs.
  - `src/preload/index.ts`, `index.d.ts` — the new named functions, one per channel, plus
    the `onFlowChanged` subscription returning an unsubscribe.
- **Existing patterns to follow:** `handle.ts` (senderFrame + Zod + `Result`);
  `run.service.ts`'s `writeFlow` (temp name + rename — reuse the atomic-write shape);
  `device:changed` → `useDeviceStream` → store for the push/subscribe/unsubscribe shape;
  `ContextMenu` and `Dialog` components already in the app; `run.store`'s narrow selectors.
- **Product & decision docs:** `.context.md` §2 (CONFIG, the appId rule), §7 (userData/repo,
  index, watcher), §7.1 (only write inside `conductor/`; classify flows by header, not
  extension), §7.2 (identity = relative path; the folder-ops cut this spec amends; empty
  folders invisible to Git), §8.2 (immediate save, atomic write, no Save button), §8.5.2
  (tree sidebar, search flattens), §9.3 (containment by resolution, sanitize names), §12
  rules 6 (CONFIG via bridge), 21 (`flow:changed` is one path), 22 (asked — answers below).
- **Design & conventions:** the updated Aurora kit is the layout contract —
  `docs/Conductor Design System/ui_kits/conductor-c-aurora/CRegions.jsx` (`CFlows`: tree,
  draft rows, folder rows, header "+" menu, search), `CShell.jsx` (`useStudioC`: create /
  rename / delete semantics, `withExt`, case-insensitive collision, `CFlowMenu`,
  `CConfirmDelete`), `data.jsx` (`FLOW_START` template shape, `TESTS`/`FOLDERS` model);
  `components/studio/FileTree.*` (row metrics: 28px rows, 14px indent per level, mono
  filenames, `--glass-selected`); `components/surface/EmptyState.*` for the empty states.
  The editor keeps the existing underlay + transparent textarea design.
- **Tests:** Vitest, both projects. `lib/yaml-indent.test.ts` is this spec's strongest
  suite — table-driven over the rules in criteria 24–29. `flow.service.test.ts` runs
  against a real temp dir (`mkdtemp`), covering index/classification, atomic save, CRUD,
  collisions, traversal rejection, watcher-driven reindex. IPC per `handle.test.ts`'s
  pattern. Renderer: store tests mocking only `window.conductor`; RTL for the FlowList
  tree (render, draft commit/cancel/inline error, menus, search) and for FlowEditor keydown
  wiring (with `document.execCommand` mocked — jsdom does not implement it).

## Acceptance criteria

### The workspace on disk (main)

1. The system shall resolve the workspace root as
   `app.getPath('userData')/repo/<CONFIG.FLOWS_DIR>` in the composition root and inject it
   into `FlowService`; on startup the directory is created (recursively) if missing, and no
   code outside the composition root computes this path.
2. When `flow:list` is invoked, the system shall answer the index: `flows` — every file
   under the root matching `CONFIG.FLOW_EXTENSIONS` whose content carries a valid flow
   header (an `appId:` line before the `---` separator, per §7.1) — each with its
   root-relative `path` (the identity, §7.2), `name`, `folder` (relative dir path, `""` at
   root) and `commandCount` (top-level `- ` lines); and `folders` — every directory under
   the root, including empty ones, as relative paths.
3. Files that are not flows (wrong extension, or no valid header) shall not appear in the
   index and shall never be modified or deleted by any operation except a folder delete
   that removes their directory.
4. While the app is running, a chokidar watcher on the root shall reindex on any
   add/change/unlink/addDir/unlinkDir event (debounced) and push `flow:changed` carrying
   the fresh index — the same one event whether the change came from Conductor itself or
   from an external editor (§12.21). `FlowService.dispose()` closes the watcher.
5. Every path or name arriving over IPC shall be validated by resolving against the root
   and checking containment of the resolved path (never by pattern-matching the string,
   §9.3); a name that is empty after trimming, contains a path separator, or escapes the
   root shall be refused with a stable code. Expected failures cross as
   `{ ok: false, error: { code, message } }` with codes at least:
   `flow/workspace-unavailable`, `flow/not-found`, `flow/name-taken`, `flow/invalid-name`.

### Saving (renderer ↔ main)

6. When the user edits the open flow, the system shall write the file to disk automatically
   — no Save button, no ⌘S — within 500ms of the last keystroke, flushing immediately when
   the open flow is about to change (open another, rename, delete) and on window close, so
   no keystroke is ever lost and no write lands on a stale path.
7. `flow:save` shall write atomically (temp file + rename, §8.2), following the shape
   `run.service.ts` already uses.
8. While a save is pending or in flight, the DocumentBar dot shall show; once the write
   lands it disappears — the toolbar's "saved on this Mac" stays truthful.
9. If the watcher event was caused by Conductor's own save (incoming disk content equals
   the editor's current text), then the editor shall not be disturbed — no content
   replacement, no caret move.
10. If the open flow's file changes on disk with different content (external editor), then
    the editor shall replace its content with the disk truth; within the debounce window
    last-writer-wins is acceptable.

### The sidebar tree

11. The sidebar shall render the index as the mock's tree: folder rows first (chevron,
    name, flow count, a "+" and an overflow ellipsis appearing on hover/focus), then root
    files — folders and files each sorted alphabetically; files inside a folder render one
    level deeper (mock metrics). A directory nested deeper than one level renders as a
    compact row labeled with its relative path (e.g. `a/b`).
12. When a folder row's chevron is clicked, the folder shall collapse or expand; the state
    is per-session.
13. An empty folder shall stay visible, expanded to an "Empty — add a flow" affordance that
    starts a draft flow inside it — a folder you just made must be visible.
14. While the search field is non-empty, the tree shall flatten: matching flows (by file
    name or folder name, case-insensitive) render as plain rows; no folder rows; a
    no-match state shows "Nothing matches “query”". Clearing the query restores the tree.
15. The open flow's row shall render selected (by path); opening another flow flushes the
    pending save (criterion 6) and loads via `flow:read`.

### Creating flows and folders

16. When the header "+" is clicked, a menu shall offer "New flow" (⌘N) and "New folder"
    (⇧⌘N); a folder row's "+" and the context menus' "New flow here" start the draft inside
    that folder. Creating and renaming happen **in the tree, Finder-style**: one editable
    draft row in place, no dialog.
17. A draft row shall commit on Enter or blur when non-empty, and cancel on Escape or when
    empty; on a name collision (case-insensitive, within the target folder) it shall show
    the mock's inline error ("“name” already exists in this folder." / "A folder called
    “name” already exists.") and keep editing.
18. A committed flow name without a `.yml`/`.yaml` extension shall get `.yaml` appended —
    the extension is not the user's problem; type `checkout`, get `checkout.yaml`.
19. When a flow draft commits, the system shall create the file on disk immediately with
    exactly `appId: <CONFIG.APP_ID>\n---\n- launchApp:\n    clearState: true\n`, where the
    appId comes from `CONFIG.APP_ID` on the main side — never hardcoded in the renderer —
    and the new flow opens in the editor. The stale `FLOW_YAML` fixture is deleted; no
    fixture appId survives anywhere.
20. When a folder draft commits, the directory shall be created on disk at the root and
    appear expanded in the tree.

### Rename, duplicate, delete

21. When "Rename…" is chosen on a flow or folder, its row shall become the draft row
    prefilled with the current name; committing renames on disk (same parent directory);
    committing an unchanged name is a no-op. The open flow follows a rename of itself or
    of a folder containing it — its path identity updates everywhere and the editor keeps
    its content and caret.
22. When "Duplicate" is chosen on a flow, the system shall copy it in place as
    `<name>-copy.yaml`, then `<name>-copy-2.yaml` and so on while taken.
23. When "Delete flow" or "Delete folder" is chosen, the mock's confirmation dialog shall
    open — naming the target as `conductor/<path>`, for a folder saying how many flows go
    with it and listing up to 4 (+N more), with the destructive verb on the button, never
    "OK". Confirming deletes the file, or the directory recursively.
24. If the open flow is deleted (directly or with its folder), then the editor shall open
    the first remaining flow, or show the empty editor state when none remain.

### Context menus and shortcuts

25. A flow row's context menu (right-click or the row's ellipsis) shall offer: Open in
    editor, Rename…, Duplicate, New flow here, Run now, Delete flow (destructive) — per
    the mock. "Run now" reads that flow's file and starts it through the existing
    `run:start` pipeline on the selected device; it is disabled while no device is
    connected or a run is active.
26. A folder row's context menu shall offer: New flow here, Rename folder…, Delete folder
    (destructive).
27. ⌘N shall start a new-flow draft and ⇧⌘N a new-folder draft (root); Escape closes menus
    and cancels drafts, per the existing `useWindowShortcuts` pattern.

### Real-time YAML indentation (editor)

28. All indentation logic shall live in pure functions in `lib/yaml-indent.ts`; the editor
    only wires them to `onKeyDown`. No editor library is added — no Monaco, no CodeMirror;
    `npm ls` gains zero runtime dependencies from this spec.
29. When Enter is pressed after a line whose content ends with `:`, the new line shall
    indent to the column of the line's first content character (skipping indent and a
    leading `- `) plus 2 — so `- tapOn:` continues at column 4, `    visible:` at 6,
    `appId:` at 2. Text after the caret moves to the new line with that indent.
30. When Enter is pressed on any other line, the new line shall keep the current line's
    leading indent (a whitespace-only line keeps its own indent).
31. When Tab is pressed with a caret, spaces shall be inserted to reach the next multiple
    of 2; with a selection spanning lines, every selected line indents by 2. Shift+Tab
    removes up to 2 leading spaces from the current or every selected line. Selection is
    preserved sensibly (still covering the same lines).
32. When Backspace is pressed with only whitespace left of the caret and the caret past
    column 0, the indent shall retreat to the previous multiple of 2 (removing 1 space when
    the column is odd).
33. Indentation edits shall go through the platform's edit path so native undo survives:
    ⌘Z after any auto-indent, Tab or Backspace-dedent reverts exactly that step — no
    custom undo stack, and the store still receives every resulting text via `edit` (one
    truth).
34. While an IME composition is active (`isComposing`), the system shall not intercept any
    key.

### Empty and error states

35. While the workspace has no flows (first run), the sidebar and the editor column shall
    show empty states (DS `EmptyState`) with a "New flow" action, and Run stays disabled;
    the workspace starts empty — no seeded example flows.
36. If the workspace root cannot be created or read, then the sidebar shall show an error
    state with the message and a retry, backed by `flow/workspace-unavailable` — never a
    silent empty tree.
37. The FlowList header's fixture line ("N failing") shall become a truthful
    "conductor/ · N flows" — run-result dots render as `never` until a future spec
    persists run history.

### Documentation amendments (same change, per CLAUDE.md)

38. `.context.md` §7.2 shall gain a dated amendment (product owner decision, 2026-08-06):
    create, rename and delete folder become ✅; **move** stays ❌; the empty-folder-in-Git
    warning stays, now operative — a folder still empty at publish time will not appear in
    the PR.
39. AGENTS.md's services line shall replace `flow-index` with `flow` (FlowService carries
    the index), and this spec's new files land exactly on the Layout table's contract.

## Constraints

- No new runtime dependency (chokidar is already the planned watcher per §7 — add it as the
  only one if not yet installed; the indent engine is hand-rolled).
- `FlowService` uses `node:fs/promises` only — it creates no process, so no Biome exception.
- All user-facing strings in product language (§8.0): no "directory", "path", "rename
  failed: EEXIST" — the mock's copy is the reference.
- Push payloads stay small: `flow:changed` carries the index (metadata), never file bodies.
- Narrow selectors in views (mirror frames stream continuously; a sloppy selector re-renders
  the app).
- TypeScript strict; types derive from the channel Zod schemas.

## Out of scope

- Publish / anything Git (§8): no commit, no branch, no PR — `repo/` is a plain directory
  until the publish spec turns it into the clone.
- Editor tabs (the mock's TabStrip): the app stays single-document.
- Moving files or folders (drag or menu) — §7.2 keeps ❌ for move.
- Run-history persistence (row dots), "Run whole suite" behavior.
- YAML validation/linting and `check-syntax` (publish's gate), list continuation
  (auto-inserting `- `), auto-completion.
- The AI panel and its fixtures.

## Decisions & assumptions

- Workspace root: `userData/repo/conductor/` → chosen by the engineer (matches §7; publish
  later turns `repo/` into the clone without moving user files).
- Indenter: extend the existing textarea editor with a pure lib, zero dependencies → chosen
  by the engineer over CodeMirror 6.
- Folder scope: full mock — create, rename, delete — with the §7.2 amendment in the same
  change → chosen by the engineer, aware empty folders won't survive into a future publish
  until they hold a flow.
- Context menu scope: full mock (Rename, Duplicate, Delete, New flow here, Run now) →
  chosen by the engineer.
- (Assumed) First run starts empty with empty states — no seeded flows; §2's fixture note
  is satisfied by test fixtures in the repo.
- (Assumed) Ordering is alphabetical (folders, then files): the mock's explicit
  `FOLDERS` order has no home on a plain filesystem, and §7.1 forbids writing metadata
  files outside flows.
- (Assumed) Folder creation UI targets the root only (as in the mock); deeper structure
  arrives via external edits and renders per criterion 11.
- (Assumed) `run.service.ts` keeps materializing the open YAML to its temp file — running
  the saved file in place is a later concern (matters only when `runFlow:` subflows
  arrive).

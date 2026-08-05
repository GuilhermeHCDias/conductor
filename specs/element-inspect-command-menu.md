# Element inspection & command menu

status: done
created: 2026-08-05

## Goal

The mirror becomes the authoring surface §5.5 promises. Hovering the live Android mirror highlights
the element under the cursor — exactly the element Maestro sees, from a frozen
`{hierarchy, screenshot, scale}` snapshot, hit-tested locally with zero IPC per mousemove. A
left-click still drives the real device (the app advances). A **right-click** opens the command
menu over that element: picking a Maestro command appends a step to the open flow with a
**uniqueness-validated** selector synthesized in main, and the tap family also performs the gesture
on the device, so the test is written by using the app. This is `.context.md` §13 steps 4 **and** 5
— snapshot, scale calibration, hover hit-test, and `SelectorSynth` — plus the renderer surface that
turns them into the product's core loop.

## Context

- **Files this touches (main):**
  - `src/main/maestro/SelectorSynth.ts` — **new, pure** (§9.2). The §5.4 ladder, §5.3 key
    translation, regex escaping, and uniqueness validation by matching against the snapshot's own
    tree. Highest-trap-density module of the project; carries its strongest unit tests
    (with `HierarchyParser`).
  - `src/main/services/snapshot.service.ts` — **new**. Captures hierarchy + screenshot
    concurrently through `MaestroGateway`, calibrates scale, holds the current snapshot (keyed by
    a generated `snapshotId`) so synthesis runs against **the same tree** the renderer hit-tested.
  - `src/main/ipc/maestro.ts` — **new**, `registerMaestroIpc`. Channels `maestro:snapshot` and
    `maestro:synthesize-selector` (the latter is named verbatim in `AGENTS.md`'s worked example).
  - `src/main/ipc/device.ts` — `mirror:input` grows the gestures the tap family needs (long press;
    double tap), expanded main-side the way a tap already expands to down+up.
  - `src/main/index.ts` — constructs and registers the new service/IPC; disposal unchanged
    (the service holds no process — the MCP child stays `MaestroMcpService`'s).
  - `src/shared/ipc.ts` — schemas for the two new channels (recursive `TreeNode` via `z.lazy`),
    the extended `mirrorInput` union, new stable error codes.
  - `src/shared/types.ts` — the snapshot view type the renderer consumes (tree + calibration +
    stream-mapping data), beside `TreeNode`/`Bounds` which already live there.
- **Files this touches (renderer):**
  - `src/renderer/src/lib/hit-test.ts` — **new, pure**. §5.5's hit-test rules against `TreeNode`,
    plus the coordinate composition from canvas CSS px into hierarchy units.
  - `src/renderer/src/lib/command-templates.ts` — **new, pure**. The YAML step each menu command
    appends, ported from the design system's `SNIPPETS` (see *Design & conventions*).
  - `src/renderer/src/components/ContextMenu/` — **new**, ported from the DS `surface/ContextMenu`
    (groups via `label`/`separator` items, mono command labels, `ACTION_ICONS` glyphs, fixed
    positioning, title naming the element).
  - `src/renderer/src/components/Dialog/` — **new**, ported from the DS `surface/Dialog` — the
    `inputText` prompt.
  - `src/renderer/src/components/Icon/Icon.tsx` — grows the `ACTION_ICONS` glyphs the menu needs,
    per the DS mapping (`tapOn` → `mouse-pointer-click`, …).
  - `src/renderer/src/stores/inspect.store.ts` — **new**. Snapshot projection, hovered node,
    staleness/in-flight state, menu state; its actions are the only callers of the two new
    `window.conductor` functions.
  - `src/renderer/src/stores/flow.store.ts` — **new**. The open flow's YAML text (seeded from
    `fixtures/flows.ts`'s `FLOW_YAML`), `dirty`, and `appendStep`. Editing/saving stay out of scope.
  - `src/renderer/src/views/DeviceMirror/DeviceMirror.tsx` — the overlay (highlight + mono label +
    stale chip), pointer wiring: move → hover, left-click → forwarded tap (unchanged), right-click →
    synthesize + menu, Alt → parent.
  - `src/renderer/src/views/FlowEditor/FlowEditor.tsx` — `YamlBody` renders from `flow.store`
    instead of the `FLOW_YAML` constant; the document bar's `dirty` follows the store.
  - `src/preload/index.ts`, `src/preload/index.d.ts` — the two new named functions.
- **Existing patterns to follow:** `handle.ts` for the new channels (senderFrame + Zod, `Result`
  with stable codes); `device.store`'s narrow selectors and its ordered `sendInput` queue (menu
  execution rides that queue); `mirror-point.ts` for scale math kept pure with DOM reads only in
  the view; `HierarchyParser`'s fixture-driven tests (`inspect-screen.capture.json` is real
  hardware data — reuse it).
- **Product & decision docs:** `.context.md` §5 entire (§5.2 scale amendment, §5.3 traps, §5.4
  ladder, §5.5 interaction model), §13 steps 4–5, §12 rules 1–5 and 14; the
  `device-hierarchy-capture` spec's hardware findings (root node has **no bounds** on the real
  device; `inspect_screen` ~300 ms warm).
- **Design & conventions:** the design system is the contract for every visual in this spec —
  `components/surface/ContextMenu` ("the core interaction of Conductor"), `surface/Dialog`,
  `studio/DeviceMirror.prompt.md` (accent-tinted highlight, 1.5 px accent border, mono label,
  never a dashed marquee; crosshair cursor), `core/Icon`'s `ACTION_ICONS`, and the Aurora kit's
  `data.jsx` (`COMMAND_GROUPS`, `SNIPPETS`, menu title format `Kind · "text"`).
- **Tests:** Vitest, both projects. `SelectorSynth` and `lib/hit-test.ts` are the strongest suites
  (pure, fixture-driven from the real capture plus hand-built edges). `snapshot.service` with a
  fake Gateway. IPC handlers per `handle.test.ts`. Renderer: store tests for `inspect`/`flow`;
  RTL for `ContextMenu`, `Dialog`, and `DeviceMirror`'s overlay/menu wiring, mocking exactly one
  seam — `window.conductor`.

## Acceptance criteria

### Snapshot (main)

1. When `maestro:snapshot` is invoked with a device id, the system shall capture the hierarchy and
   a screenshot **concurrently** through `MaestroGateway`, and answer with a snapshot view carrying
   a fresh `snapshotId`, the parsed tree, the screenshot's pixel size, and the calibrated scale.
2. The system shall calibrate scale as `screenshotWidthPx / boundsWidth` of the **widest node that
   carries bounds** — never assuming the root has them, which on the reference hardware it does not.
3. If no node in the tree carries bounds, then the system shall answer `ok: false` with a stable
   error code rather than guess a scale.
4. If either capture fails, then the system shall answer with the underlying stable code and no
   partial snapshot.
5. The system shall hold the latest snapshot per device in main, replacing the previous one; a
   `maestro:synthesize-selector` naming a `snapshotId` that is no longer current shall be refused
   with a stable code (the renderer re-captures and retries — never synthesizes against a tree the
   user is not seeing).
6. The system shall not send the screenshot's bytes to the renderer — the screenshot exists to
   calibrate and to timestamp the snapshot; nothing in this spec renders it.

### Hit-test (`lib/hit-test.ts`, pure)

7. The system shall map a pointer position into hierarchy units by composing: canvas CSS px →
   stream px (the existing fit scale) → screenshot px (stream size vs screenshot size) → hierarchy
   units (the calibrated scale) — and never `window.devicePixelRatio`.
8. The system shall select the **deepest, smallest-area** node whose bounds contain the point.
9. The system shall skip nodes with zero width or height, and nodes with no bounds at all.
10. When candidates tie, the system shall prefer `clickable === true`, then a node with a
    `resourceId`, then one with `text`.
11. While `Alt`/`Option` is held, the system shall retarget the hit to the hit node's parent (one
    level); releasing returns to the node itself.
12. When the point is outside every node, or outside the drawn picture, the hit shall be `null` and
    no highlight shall show.

### Overlay

13. While a stream and a snapshot are live, the system shall highlight the hovered element with the
    DS treatment — accent-tinted fill, 1.5 px accent border, mono label above, crosshair cursor —
    positioned from the node's bounds mapped back into canvas space.
14. The highlight label shall name the element as the DS does — a short kind (the class name's last
    segment) and its text (falling back to `content-desc`, then `resource-id`) — with the text
    taken **literally** from the tree, never transcribed from pixels.
15. When the pointer leaves the canvas, the highlight shall clear.
16. While a recapture is in flight, the system shall mark the overlay as updating (a visible stale
    chip per §5.5) rather than hiding the divergence; hover keeps answering from the previous
    snapshot until the new one lands.
17. If a capture fails, the overlay shall surface the failure with a retry affordance, and the
    mirror picture shall be unaffected.

### Snapshot cadence

18. When the mirror stream starts, the system shall capture a snapshot automatically.
19. When a forwarded input (left-click tap, key, text) or a menu-executed gesture settles, the
    system shall recapture automatically after a short debounce, with at most one capture in
    flight and a trailing capture when inputs arrived mid-flight.
20. When the stream reports a new size (rotation), the system shall recapture.
21. The system shall offer a manual refresh affordance for the snapshot in the inspector.
22. When the mirror stops or the device is lost, the system shall clear the snapshot and every
    overlay derived from it.

### Command menu

23. When the user right-clicks a hit element, the system shall ask main to synthesize its selector
    (`maestro:synthesize-selector` with the `snapshotId` and the node's path in the tree) and open
    the `ContextMenu` at the cursor, titled with the element's kind and text.
24. The menu shall offer, grouped and labeled with the exact YAML keywords in mono with their
    `ACTION_ICONS` glyphs: **Interact** — `tapOn`, `doubleTapOn`, `longPressOn`, `inputText`,
    `scrollUntilVisible`, `eraseText`; **Assert** — `assertVisible`, `assertNotVisible`;
    **Wait** — `waitForAnimationToEnd`, `extendedWaitUntil`; **App** — `takeScreenshot`,
    `copyTextFrom`.
25. Right-clicking where no element is hit shall open no menu, and the browser's own context menu
    shall never appear anywhere on the mirror.
26. The menu shall close on `Escape` or a click outside it, writing nothing; while it is open,
    mirror pointer/keyboard forwarding is suppressed.
27. If synthesis lands on `point:` (the ladder's last resort), the menu shall visibly warn that the
    step is fragile before the user picks a command (§5.4 makes this warning mandatory).
28. If synthesis fails (including the 0-match case, which is a bug by definition), the system shall
    open no menu, surface the failure, and write nothing.
29. If a right-click arrives while a recapture is in flight, the system shall wait for the fresh
    snapshot and synthesize against it — never against a tree older than the last interaction.

### SelectorSynth (main, pure)

30. The system shall synthesize by the §5.4 ladder, climbing a level **only** when the current one
    is not unique on screen: `id:` (from `resourceId`) → `text:` (full string, escaped) → `text:` +
    `index:` → relational (`below:`/`above:`/`leftOf:`/`rightOf:` anchored on a stable neighbor) →
    `point:` (as percentages of the screen, flagged fragile).
31. The system shall validate every candidate by counting its matches against the snapshot's own
    tree: 0 → error (never written, logged); 1 → emit; >1 → climb.
32. The system shall translate tree keys per §5.3 — `resourceId` → `id:`, `text`/`content-desc` →
    `text:` — and shall never emit `class`, `hintText`, or any tree-only key as a selector.
33. The system shall escape regex specials in text (`$ [ ( . + ? *` …), honoring Maestro's
    full-string, case-insensitive `text:` semantics — never a partial match.
34. The text in a selector shall be copied literally from the tree — never derived from the
    screenshot or the mirror.
35. `SelectorSynth` shall be pure — no I/O, no Electron imports — and shall return a structured
    result (ladder level, selector YAML fragment, fragility warning) rather than a full command.

### Insertion (`flow.store`)

36. The system shall hold the open flow's YAML text in `flow.store`, seeded from the existing
    fixture; `FlowEditor` shall render from the store, and the fixture constant shall no longer be
    read by the view.
37. When the user picks a command, the system shall append the step built by
    `lib/command-templates.ts` from the DS `SNIPPETS`: selector commands as
    `- <cmd>:\n    <selector>`; `inputText` as the pair `- tapOn: <selector>` +
    `- inputText: "<text>"`; `extendedWaitUntil` with `visible: <selector>` and `timeout: 10000`;
    `scrollUntilVisible` with `element: <selector>`; `waitForAnimationToEnd`, `takeScreenshot`,
    and `eraseText` bare.
38. Appending shall be strictly additive: existing lines byte-identical, one step block appended
    at the end with a trailing newline (§12 rule 7's spirit — this file goes through code review).
39. When a step is appended, the document bar shall show dirty, and the editor shall reveal the new
    lines (scrolled into view).

### Execution (tap family only)

40. When the user picks `tapOn`, `doubleTapOn`, or `longPressOn`, the system shall also perform the
    gesture at the element's center through the existing control socket, in stream coordinates
    mapped from the node's bounds; `mirror:input` grows long-press and double-tap forms, expanded
    main-side.
41. When the user picks `inputText`, the system shall open the Dialog; on confirm with non-empty
    text it shall append the filled pair (text YAML-escaped), perform the focusing tap, and inject
    the text through the socket's existing ordered queue; on cancel it shall write and execute
    nothing. Empty text cannot confirm.
42. Assert, Wait, App commands, `scrollUntilVisible`, and `eraseText` shall never execute — they
    insert only.
43. If the gesture fails (control refused or gone), the appended step shall remain — the step is
    the artifact, the gesture a convenience — and the failure surfaces through the existing
    control-error note without touching the picture.
44. While the session has no control channel, the menu shall keep working and tap-family commands
    shall insert without executing.

### Contract & architecture

45. Both new channels shall validate `senderFrame` and parse with their Zod schemas via the
    existing `handle` wrapper, answer `Result` with stable error codes declared in
    `shared/ipc.ts`, and be exposed as named preload functions only.
46. Hover shall cost zero IPC and zero process work — hit-test and highlight run entirely in the
    renderer against the in-memory snapshot; synthesis runs only on right-click.
47. No new module shall create a process; coordinate math and templates shall live in `lib/` as
    pure, directly-tested functions, per the renderer layer rules.

## Constraints

- Mirror performance is untouchable: no per-frame store writes, narrow selectors only, the overlay
  must not force the canvas or the window to re-render at frame rate.
- The snapshot's tree is the **only** source of element truth (§12 rule 1); nothing reads pixels,
  OCR, or the RN component tree.
- Android only, like the mirror today; nothing here may preclude the iOS path (points-vs-pixels is
  why scale is calibrated, §12 rule 14).
- UI copy follows the existing shell's English chrome; command labels are the Maestro YAML keywords
  verbatim (DS rule), which are language-neutral.
- Menu keyboard support: arrows + Enter + Escape (the DS `shortcut` badges like `T` are visual
  only in the mock and out of scope here).
- The `maestro mcp` child stays behind `MaestroMcpService`/`LocalGateway` (§12 rules 9–11); this
  spec adds no Maestro CLI invocation and no `CliRunner`.

## Out of scope

- **Editing, saving, CodeMirror, `flow:save`, the repo layer** — the FlowEditor/repository specs
  (§13 steps 6–7). The flow text lives in memory only.
- **The AI menu item** ("Ask Conductor about this element") — arrives with the AI window spec;
  the menu's item model must simply not preclude it.
- **Running flows** (`maestro test`, RunPanel wiring) and any raw-CLI call — including the recorded
  contention risk with the MCP child.
- **iOS / simctl.**
- **The missing-`testID` report** §5.4 suggests as a subproduct — only the fragility warning ships
  here.
- **RN component-name decoration** (§5.6) on the highlight label.
- **Persisting snapshots for the AI** (§6.1).
- **Image-diff staleness detection** — superseded by event-driven recapture (see *Decisions*).

## Decisions & assumptions

- **Right-click opens the menu; left-click stays a real tap.** (Engineer, after one round of
  confusion each way: "o direito abre o menu e o esquerdo dispara a ação".) The app advances by
  using it — and, complementarily, by the tap family executing from the menu.
- **Tap-family commands execute their gesture; everything else is insert-only.** (Engineer.)
  Execution is via the scrcpy control socket — *driving* the app, not simulating Maestro semantics;
  real Maestro execution is a later spec's.
- **`inputText` collects its text in a Dialog** — the step is born complete and the text is also
  injected on-device. (Engineer; the editor is still read-only, so the DS mock's empty-string
  template would dead-end.)
- **Snapshot recaptures automatically after interactions settle, plus manual refresh.** (Engineer.)
  Consequence: staleness is tracked by interaction events and in-flight state, not by §5.5's
  "screenshot visibly differs" image comparison — deterministic and testable where image diff is
  neither. `.context.md` §5.5 must be amended accordingly in this change (precedent: every spec
  amends the sections it reverses).
- **Menu contents: the DS set plus `scrollUntilVisible` and `eraseText`.** (Engineer.) The engineer
  asked whether "the Maestro integration" could supply the list — it cannot: Maestro exposes no
  command-enumeration API, so the vocabulary is pinned in code from Maestro's documented commands.
- **The screenshot's bytes stay in main** (assumed): the renderer renders the live mirror, not the
  frozen frame; the screenshot exists for calibration. Revisit when the AI needs the file (§6.1).
- **Channel names `maestro:snapshot` and `maestro:synthesize-selector`** — the latter verbatim from
  `AGENTS.md`'s worked example; the former joins the same domain.
- **`flow.store` is introduced now** (assumed, structural): the only sane landing place for an
  appended step while the real editor is another spec — clipboard would break the product promise,
  CodeMirror would swallow this spec whole.
- **`takeScreenshot` is appended bare** (assumed): the mock's `takeScreenshot: pedidos` is fixture
  flavor; a name argument needs product thinking (naming collisions, paths) that belongs to the
  editor spec.
- **Point selectors are emitted as screen percentages** (assumed): survives resolution changes
  better than pixels, and is what the fragility warning already covers.
- **Regex escaping is applied exactly when the snapshot proves it matters** (implementation).
  A value is emitted raw when, compiled as the full-string regex Maestro compiles, it names
  exactly the nodes the literal value names on this snapshot; otherwise it is escaped. Keeps
  `id: "com.vtex.pnp:id/login"` readable in review (§12.7) while `R$ 10` — whose `$` anchors
  instead of matching — escapes. Uniqueness is always counted on the literal set, so the
  emitted selector is validated either way.
- **The floating layers carry their own blur** (implementation). The layout shell's "single
  blur" guard was written when nothing floated; the DS's ContextMenu and Dialog read their
  depth through their own backdrop blur ("Dialogs blur heavier than any other layer"). The
  guard in `styles.test.ts` now pins exactly `App` + the two floating layers — a view or
  region module joining that list still fails.
- **Alt over a boundless parent stays on the node** (implementation). The real root reports
  no bounds; retargeting the hover to it would highlight nothing, which is not "the
  container" §5.5.5 means. One level up when the parent is drawable, otherwise the hit stays.
- **The snapshot cadence lives in `hooks/useInspectSnapshot.ts`** (implementation): the
  debounce/single-flight/trailing machinery is `inspect.store`'s (testable plain TS); the
  wiring from device-store events to it is a view-mounted hook, per the renderer layer rules.
- **`App.tsx` still reads `FLOW_YAML`** (implementation): criterion 36 names the view, and
  App's use is the run-progress denominator — fixture-driven until the run spec, which owns
  that bar.

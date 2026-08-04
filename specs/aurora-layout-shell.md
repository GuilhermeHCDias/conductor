# Aurora layout shell

status: done
created: 2026-08-04

## Goal

Replace the placeholder `App.tsx` with Conductor's real window layout — the Aurora macOS
direction from the design system: a 52px unified toolbar over three adjacent panes (Flows
sidebar · working area · Device inspector), separated by hairlines, on one blurred window.
It matters because every later spec (`DeviceMirror`, `FlowEditor`, `AIPanel`, `RunPanel`) fills
a region that has to already exist, with tokens and layer rules already correct; getting the
chrome right once means those specs only wire behaviour into a slot.

**This spec builds the shell only. It performs no integration**: nothing calls
`window.conductor`, no Maestro, no `adb`, no filesystem, no `claude`. Every region renders from
a fixture module.

## Context

### Files/modules this touches

Created:

```
src/renderer/src/
  App.tsx                                   # rewritten: composes the shell, mounts the theme effect
  App.module.css                            # rewritten: the window + wash + rim + pane grid
  styles/
    tokens/fonts.css                        # ─┐
    tokens/palette.css                      #  │ copied VERBATIM from the design system,
    tokens/typography.css                   #  │ except fonts.css (see Constraints)
    tokens/spacing.css                      #  │
    tokens/radius.css                       #  │
    tokens/elevation.css                    #  │
    tokens/motion.css                       #  │
    tokens/theme-aurora.css                 #  │
    tokens/theme-aurora-dark.css            #  │
    utilities/base.css                      #  │
    utilities/glass.css                     #  │
    utilities/animation.css                 # ─┘
    global.css                              # rewritten: @imports the above, in styles.css order
  lib/
    breakpoints.ts                          # width → { mirror, flows } (pure)
    mirror-fit.ts                           # bay size → { scale, width, height, outerWidth, outerHeight } (pure)
    yaml-tokens.ts                          # YAML line → token spans (pure, ported from YamlEditor.jsx)
  stores/
    ui.store.ts                             # Zustand: theme, sidebar, tabs, lower panel, env
  hooks/
    useWindowShortcuts.ts                   # ⌘B / ⌘J / ⌘\ key handling → store actions
    useElementWidth.ts                      # ResizeObserver → width, for the frame and the device header
  fixtures/
    flows.ts                                # the flow list, the open tabs, the YAML, the thread, the steps, the device
  components/
    Icon/Icon.tsx                           # inline Lucide paths, `currentColor`, stroke 1.75
    IconButton/IconButton.tsx
    StatusDot/StatusDot.tsx
    SegmentedControl/SegmentedControl.tsx
    Tooltip/Tooltip.tsx
  views/
    Toolbar/Toolbar.tsx                     # traffic-light inset, title, env, Run, appearance, save
    FlowList/FlowList.tsx                   # the sidebar: header, search, rows, bottom bar
    FlowEditor/FlowEditor.tsx               # tab strip + YAML body
    RunPanel/RunPanel.tsx                   # step list + empty state
    AIPanel/AIPanel.tsx                     # thread + suggestion pills
    Composer/Composer.tsx                   # the footer input
    DeviceMirror/DeviceMirror.tsx           # device header + bezel + screen + nav/status bars
```

Modified:

- `src/main/window.ts` — `titleBarStyle: 'hiddenInset'`, `trafficLightPosition`, `vibrancy`,
  `backgroundColor`. The only main-process change in this spec.
- `src/renderer/src/main.tsx` — if the stylesheet import path changes.
- `package.json` — add `zustand`.

Every view and component folder carries `<Name>.tsx` + `<Name>.module.css` + `<Name>.test.tsx`,
per AGENTS.md § Naming. No barrels.

### Existing patterns/interfaces to follow

- `AGENTS.md` § Layout, § Architecture → Renderer, § Naming, § Testing, § Code style. The
  renderer's import ladder (`lib` → `components` → `stores` → `hooks` → `views`) is binding.
- `src/renderer/src/App.tsx` and `App.module.css` are the current placeholder and the pattern
  for CSS Modules + token usage. Both are replaced wholesale.
- `electron.vite.config.ts` — `PRODUCTION_CSP` / `DEVELOPMENT_CSP` and the `@renderer` /
  `@shared` aliases.
- `src/main/window.ts` — the single `BrowserWindow` factory carrying the § 9.3 flags; the new
  options are added to the existing object, nothing is relaxed.

### Product & decision docs

- `.context.md` § 9.2 (renderer panels), § 9.3 (Electron security), § 12 (standing rules).
  Note § 9.2 also names `PRPanel`, and § 10 a `Doctor` — neither is designed in the design
  system, and both are out of scope here (see *Out of scope*).

### Design & conventions

`docs/Conductor Design System/` is the binding source. Read in this order:

1. `readme.md` — content register, colour, type, spacing, radii, motion, themes.
2. `ui_kits/conductor-c-aurora/README.md` — **the layout contract**: widths, breakpoints,
   the four `--a-*` materials, the degradation order.
3. `ui_kits/conductor-c-aurora/CShell.jsx` and `CRegions.jsx` — the reference implementation
   of every region in this spec.
4. `ui_kits/conductor-c-aurora/useInspector.jsx` — `useMirrorFit`, ported to `lib/mirror-fit.ts`.
5. `components/studio/*.jsx` + the sibling `.prompt.md` for each component being rebuilt.
6. `screenshots/aurora-macos.png` (light) and `screenshots/02-aurora-macos-2.png` (dark) — the
   two visual targets.

The design system's JSX is a **reference, not a dependency**: no file from
`docs/Conductor Design System/` is imported, and `_ds_bundle.js` is never loaded. The
`tokens/` and `utilities/` CSS *is* copied in, byte-for-byte except `fonts.css`.

### Tests

`vitest.config.ts` project `renderer` (jsdom, `src/renderer/**/*.test.{ts,tsx}`) — already
configured, currently empty. `@testing-library/react`, `@testing-library/user-event`,
`@testing-library/jest-dom` and a jsdom setup file must be added; there is no existing renderer
test to mirror. `src/main/window.test.ts` is the closest existing example of the house test
style, and the pattern for extending it when `window.ts` changes.

---

## Acceptance criteria

### Window and theme

1. The system shall render the app inside one window surface whose background is
   `var(--bg-window)` plus `var(--bg-wash)`, with a single
   `backdrop-filter: blur(var(--a-blur)) saturate(var(--a-saturate))` applied at the window and
   nowhere else — no region declares its own `backdrop-filter`.
2. The system shall lay out the window as a two-row grid — a 52px toolbar row over a
   `minmax(0, 1fr)` pane row — with the pane row a grid of
   `minmax(200px, 268px) 1px minmax(0, 1fr) 1px auto` when the sidebar is shown and
   `minmax(0, 1fr) 1px auto` when it is hidden, the `1px` tracks filled with `var(--a-hair)`.
3. The system shall paint the toolbar `var(--a-chrome)`, the sidebar and inspector
   `var(--a-panel)`, the working area `var(--a-content)`, and every recessed field
   `var(--a-well)`.
4. The system shall set `data-theme="aurora-dark"` on `document.documentElement` while dark
   appearance is selected and `data-theme="aurora"` while light is selected, and shall render
   correctly in both without any component branching on the theme.
5. When the appearance control in the toolbar is activated, the system shall flip the theme and
   persist the choice to `localStorage` under `conductor.aurora.dark`.
6. When the app starts and `localStorage` holds a persisted appearance, the system shall apply
   that appearance before first paint; if none is stored, the system shall follow
   `prefers-color-scheme`.
7. The system shall render the macOS window with `titleBarStyle: 'hiddenInset'` so the OS draws
   the traffic lights, and shall reserve inset space for them at the left of the toolbar such
   that no toolbar control sits underneath them.
8. The system shall mark the toolbar background as a drag region (`-webkit-app-region: drag`)
   and every interactive control inside it as `no-drag`.
9. While `prefers-reduced-motion: reduce` is set, the system shall apply no transition duration
   and no press scale (the token override in `motion.css` carries this; nothing may hardcode a
   duration).

### Toolbar

10. The system shall render, left to right: the traffic-light inset, a sidebar toggle, the
    active document's name in `--type-body-strong` with a `--type-mono-label` subtitle reading
    `<n> commands · saved to suite`, a spacer, an environment chip, the primary Run button, a
    hairline separator, an appearance toggle and a save button.
11. The system shall render the Run button filled `var(--accent)` with `var(--accent-on)` text
    at 28px tall and `var(--a-radius-field)`, carrying `var(--a-refract)`.
12. While the fixture run state is `running`, the system shall show the Run button as `Stop`
    filled `var(--state-fail-quiet)` with `var(--state-fail)` text, and shall show a 2px
    `var(--accent)` progress line along the top edge of the pane row.
13. If the document name is longer than the space available, the system shall truncate it with
    an ellipsis rather than growing the toolbar or wrapping.

### Flows sidebar

14. The system shall render the sidebar as a four-row grid — a 38px header, the search field,
    a scrolling row list, a 34px bottom action bar — with `gridTemplateColumns: minmax(0, 1fr)`.
15. The system shall render the header as the uppercase label `FLOWS` at `--type-label` with
    `letter-spacing: var(--ls-caps)`, followed by `<n> · <m> failing` in `--type-mono-label`,
    a spacer, and a new-flow button.
16. The system shall render each flow row with a 6px state dot coloured by last result
    (`--state-pass` / `--state-fail` / `--state-idle`), the file name in `--type-code-sm`, and
    `<n> steps · <duration>` in `--type-mono-label` beneath it.
17. While a flow row is the selected one, the system shall fill it solid `var(--accent)` and set
    its text to `var(--accent-on)` — an AppKit selection, never a tint.
18. While a flow row is hovered and not selected, the system shall fill it `var(--glass-hover)`
    and reveal its overflow button; a row that is neither hovered nor selected shall show the
    `sparkles` glyph in `var(--ai)` if the fixture marks it AI-authored, and nothing otherwise.
19. When text is typed into the sidebar search field, the system shall filter the rows by
    case-insensitive substring on the file name.
20. If the search matches no flow, the system shall render `Nothing matches “<query>”.` in
    `--type-caption` / `var(--text-disabled)`, centred, in place of the rows.
21. When the search field is focused, the system shall apply `var(--glow-accent)` and set its
    border to `var(--accent-edge)`.

### Working area

22. The system shall render the working area as a five-row grid: tab strip (38px), YAML body
    (`minmax(120px, 0.95fr)`), segmented control row (38px), lower panel (`minmax(0, 1.05fr)`),
    composer footer (auto) — with `gridTemplateColumns: minmax(0, 1fr)`.
23. The system shall render one tab per open document, the active tab filled `var(--a-well)`
    with a `var(--a-hair)` border, a 5px `var(--accent)` dot when the fixture marks it dirty,
    a close button when active or hovered, a new-tab button after the last tab, and the static
    label `YAML` right-aligned in `--type-mono-label`.
24. When a tab is selected, the system shall make it the active document and update the
    toolbar's title and the sidebar's selected row to match.
25. When a tab's close button is activated, the system shall remove that tab, and shall refuse
    to remove the last remaining tab.
26. The system shall render the YAML body from `lib/yaml-tokens.ts`: a right-aligned gutter in
    `var(--editor-gutter)`, and each line's spans coloured `--syn-key` / `--syn-anchor` /
    `--syn-string` / `--syn-number` / `--syn-punct` / `--syn-comment`, at `font: var(--type-code)`.
27. The system shall wash any line listed as AI-authored in `var(--ai-quiet)` with an
    `inset 2px 0 0 0 var(--ai)` left bar, and any error line in `var(--state-fail-quiet)` with
    the `--state-fail` equivalent; an error line wins over an AI line, and both win over the
    active line.
28. The system shall render a blinking caret (`cd-caret`) at the end of the active line.
29. The system shall render a `Run | Assistant` segmented control on a `var(--a-well)` track,
    the selected segment raised with `var(--glass-3)` + `var(--shadow-1)` + a `var(--a-hair)`
    border, and a right-aligned status string in `--type-mono-label`.
30. When a segment is activated, the system shall swap the lower panel between the run report
    and the assistant thread without changing the row heights of the working area.
31. While the fixture step list is empty, the run report shall render the empty state — a `play`
    glyph at 18px in `var(--text-disabled)` above
    `Run the flow and every step reports here as it executes.` — centred.
32. The system shall render each run step as a row with a connector line, a status dot
    (`--state-pass` / `--state-fail` / `--state-running`), the step's human label in
    `--type-code-sm`, and its `m:ss` duration right-aligned in `--type-mono-label`.
33. The system shall render assistant turns unbubbled and user turns bubbled, any YAML block in
    a turn as a `var(--a-well)` code surface with an insert action, and — while the thread holds
    only the opening message — a row of suggestion pills.
34. The system shall render the composer on a hairline-topped footer as a `var(--a-well)`
    surface at `var(--a-radius-region)` with the placeholder
    `Ask Conductor to write a step…`, and shall apply `var(--glow-ai)` — not `--glow-accent` —
    when it takes focus.

### Device inspector

35. The system shall size the inspector `mirror + 40` px wide, where `mirror` comes from the
    active breakpoint, and lay it out as a 38px header over the mirror bay.
36. The system shall render the header as the uppercase label `DEVICE`, a status dot plus the
    device serial in `--type-mono-label`, a spacer, and reload / screenshot / inspect buttons
    with inspect shown selected.
37. While the header is narrower than 250px, the system shall drop the `DEVICE` label; while it
    is narrower than 190px, the system shall additionally drop the reload and screenshot
    buttons. The inspect button shall survive at every width.
38. The system shall render the serial truncated with an ellipsis rather than wrapping or
    overflowing at any width.
39. The system shall render the phone at a fixed logical size of 330×648 with an 8px bezel, and
    fit it to the bay by `transform: scale()` only — never by changing its width or height.
40. The system shall reserve the scaled footprint with a wrapper sized
    `floor((330 + 16) × scale) × floor((648 + 16) × scale)`, so the bay never overflows its
    column.
41. The system shall clamp the mirror scale to `max(0.35, floor(min(cap, byWidth, byHeight) × 100) / 100)`,
    where `cap = mirrorWidth / 330`.
42. The system shall paint the phone's own chrome — bezel, status bar, nav bar — from the fixed
    device palette, unchanged when the app theme changes, and shall give it its own
    `filter: drop-shadow(var(--device-drop))`.
43. The system shall render the phone screen empty in this spec, over an opaque
    `--device-screen` fill, with the centred empty state `No device connected` /
    `Conductor talks to Android over adb. Plug in a phone or start an emulator.`

### Responsiveness

44. While the window is at least 1360px wide, the system shall show the sidebar and size the
    mirror 300px; between 1120px and 1360px, show the sidebar and size the mirror 268px; below
    1120px, hide the sidebar and size the mirror 250px.
45. When the sidebar toggle is activated, the system shall override the breakpoint's decision
    and hold that override until it is toggled again — the toggle wins at any width.
46. The system shall never let a pane overflow its grid column at any width from 960px (the
    window's `minWidth`) upward: no horizontal scrollbar appears on the window, and each pane
    declares `gridTemplateColumns: minmax(0, 1fr)`.

### Keyboard

47. When `⌘B` is pressed, the system shall toggle the sidebar.
48. When `⌘J` is pressed, the system shall flip the lower panel between Run and Assistant.
49. When `Escape` is pressed, the system shall clear the sidebar search if it holds text.
50. The system shall attach these handlers on mount and remove them on unmount.

### Accessibility and structure

51. The system shall give every icon-only control an accessible name, so each is reachable by
    `getByRole('button', { name })`.
52. The system shall expose the segmented control as a `radiogroup` of `radio`s, or as `tab`s in
    a `tablist` with the panel as `tabpanel` — one of the two, consistently.
53. The system shall render the four regions as landmarks or labelled regions distinguishable by
    accessible name (`Flows`, `Editor`, `Device`).
54. The system shall keep every interactive control reachable by `Tab` in visual order, and shall
    render `:focus-visible` as `var(--glow-accent)` (or `var(--glow-ai)` on the composer) — never
    as a suppressed outline.

### Non-negotiables carried forward

55. The system shall make no call to `window.conductor` and shall import nothing from
    `node:*`; the renderer stays sandboxed and integration-free.
56. The system shall load no resource over the network — the CSP in `electron.vite.config.ts`
    is unchanged, and `npm run build` shall produce a renderer that boots with zero CSP
    violations in the console.
57. `npm run lint`, `npm run typecheck` and `npm test` shall pass, with no `any`, no
    `biome-ignore`, and no new barrel file.

---

## Constraints

- **Fonts.** `tokens/fonts.css` is the one token file **not** copied verbatim: its leading
  `@import url("https://fonts.googleapis.com/…")` is dropped. `style-src 'self'` blocks it and
  no `font-src` is granted; the CSP is not to be widened for this. The `--font-ui` /
  `--font-display` / `--font-mono` declarations are kept exactly as written — on the team's Macs
  `-apple-system` and `ui-monospace` already resolve to real SF Pro and SF Mono, which is the
  design system's stated intent. Record the removed line in a comment.
- **One blur.** The window carries the only `backdrop-filter`. Nesting frost inside frost is
  what the design system calls the biggest failure mode; regions are alpha fills.
- **No hardcoded design values.** Every colour, size, radius, duration, easing, weight and
  letter-spacing comes from a token. Pixel values are allowed only for the layout constants the
  kit itself hardcodes (52 / 38 / 34 / 28 / 26 / 268 / 250 / 300 / 330 / 648 / 8 / 40 / 22 / 14
  / 16 / 6 / 5) and for the breakpoint thresholds.
- **CSS Modules only.** No inline `style` objects except where a value is genuinely computed at
  runtime: the mirror's `transform: scale()` and footprint, the progress line's width, and the
  measured highlight rect. Everything else lives in `<Name>.module.css`.
- **Layer discipline.** `lib/` is pure and React-free; `components/` take props and callbacks and
  touch no store; `stores/` hold state and actions; `hooks/` bridge events into stores; `views/`
  compose. A view that reaches past its layer is wrong even if it works.
- **Icons.** `Icon.tsx` inlines the Lucide path data from
  `docs/Conductor Design System/components/core/Icon.jsx` for **only the glyphs this layout
  renders**, at `stroke-width: 1.75`, `currentColor`, 24×24 viewBox, round caps and joins. Do not
  copy all 78. Icons are 14 in dense rows, 16 in buttons and menu items, 18 in toolbars, 18–24 in
  empty states.
- **Copy register.** English chrome, sentence case, no emoji, no exclamation marks. UPPERCASE is
  only for the panel labels `FLOWS` and `DEVICE`. Anything the CLI would read or print stays
  verbatim in mono. Fixture content belonging to the app under test stays in Portuguese,
  untranslated.
- **`window.ts` stays minimal.** Add only `titleBarStyle`, `trafficLightPosition`, `vibrancy` and
  the `backgroundColor` update. `contextIsolation`, `nodeIntegration`, `sandbox`, the window-open
  handler, the permission handler and the navigation guard are untouched. The existing
  `window.test.ts` is extended, not rewritten.
- **Zustand.** Added as a `dependencies` entry. `ui.store.ts` is the only store this spec creates;
  its actions call nothing across IPC. Views select narrowly
  (`useUiStore(s => s.sidebarOpen)`), never the whole store.
- **Fixtures are obviously fixtures.** One module, `fixtures/flows.ts`, exporting typed constants
  ported from `ui_kits/conductor-c-aurora/data.jsx`. No component defines its own inline sample
  data, so deleting one file is all it takes to hand the layout over to real state.

## Out of scope

- Any IPC channel, preload function or main-process service. `shared/ipc.ts` gains nothing.
- `PRPanel` (§ 9.2) and `Doctor` (§ 10) — the design system does not draw either; each needs its
  own design decision and its own spec.
- The floating layers of the kit: the Devices `Dialog`, the mirror's command `ContextMenu`, the
  sidebar row menu, `TestList`, `FileTree`, `Tooltip` *content* beyond an accessible name.
  Only the components the three panes render inline are built.
- The unbuilt half of the design system's inventory: `Button`, `Input`, `Select`, `Checkbox`,
  `Switch`, `Badge`, `Kbd`, `GlassPanel`, `PanelHeader`, `TabStrip`, `Divider`, `EmptyState`,
  `LogStream`, `RunBar`, `DeviceSelector`, `TitleBar`. They arrive with the specs that need them.
- CodeMirror. The YAML body is a read-only, syntax-coloured render; it is not editable, and no
  editor library is installed.
- Hit-testing, hover inspection and element highlighting in the mirror (`lib/hit-test.ts`,
  `useInspector`). The `highlight` prop may exist on the mirror component, but nothing computes
  or passes one.
- `AppUnderTest.jsx` — the fake Portuguese order-list screen inside the phone. The real mirror
  shows real device frames; a fixture app would be built to be deleted.
- Vendoring Manrope / JetBrains Mono, and any change to the CSP.
- E2E / Playwright. `AGENTS.md` § Testing forbids an E2E layer at this stage.
- Window state persistence (size, position), the app menu, and the `⌘S` / `⌘R` / `⌘P` actions —
  the controls render, they do nothing.

## Decisions & assumptions

- **Which regions?** → The Aurora layout only: toolbar, Flows sidebar, working area, Device
  inspector. `PRPanel` and `Doctor` are named in `.context.md` but undesigned in the design
  system; inventing them here would put an unreviewed design into the shell.
- **How does the design system become code?** → `tokens/` and `utilities/` are copied verbatim
  (plain CSS, drop-in); the components are re-authored as TSX + CSS Modules from the reference
  JSX. The alternatives — converting the JSX 1:1 with its inline styles, or vendoring
  `_ds_bundle.js` as a global — both break `AGENTS.md` (CSS Modules, strict TS, no globals).
- **Real macOS chrome or the mock's drawn window?** → Real. The kit draws its own traffic lights
  inside 22px of fake desktop because it is a web mock; in a real Electron window that would be a
  frame inside a frame. `titleBarStyle: 'hiddenInset'` gives the OS lights, and the wash paints
  the window itself.
- **How interactive, given no integration?** → Real UI state, zero IPC: sidebar toggle (⌘B),
  document tab switching and closing, the Run/Assistant segmented control (⌘J), sidebar search
  filtering, theme toggle with persistence, and every hover / focus / press state. Held in
  `stores/ui.store.ts` (Zustand), fed by `fixtures/flows.ts`.
- **Which state layer?** → Zustand now, not `useState` + Context. `AGENTS.md` already contracts
  `stores/<name>.store.ts` as Zustand; adopting it here means views select narrowly from the
  start instead of being rewritten when the first domain store lands.
- **The Google Fonts import.** → Dropped, not replaced. It violates the CSP, and on the target
  machines the system stack already resolves to the intended faces. Off-Mac, Manrope and
  JetBrains Mono simply do not resolve — accepted, since Conductor is a macOS-first tool.
- **The phone's contents.** → Empty screen with a `No device connected` empty state. The kit's
  `AppUnderTest.jsx` fixture would match the screenshots pixel-for-pixel, but it exists only to
  be deleted the moment real frames arrive.
- **The YAML body.** → Read-only, syntax-coloured, ported from the kit's own tokenizer into
  `lib/yaml-tokens.ts` so it is unit-testable. CodeMirror (`.context.md` § 9.2) belongs to the
  `FlowEditor` spec, not to the shell.
- **Test bar.** → RTL per view (structure, toggles, filtering, keyboard, header degradation) and
  plain unit tests for `lib/breakpoints.ts`, `lib/mirror-fit.ts` and `lib/yaml-tokens.ts`. No
  snapshot or visual-regression tests: they would pin the markup this spec exists to iterate on.
  Renderer tests mock nothing — there is no `window.conductor` call to mock.
- (Assumed) **Fixture content** is ported from `ui_kits/conductor-c-aurora/data.jsx`: the same
  seven flows, the same starting YAML, the same opening assistant message and suggestion pills.
  Using different sample content would make the screenshots unusable as a review reference.

### Resolved during implementation

- **Where the design system lives.** → `docs/Conductor Design System/` is untracked in the main
  checkout, so it is not in this worktree. It was read from
  `/Users/gui/Projects/conductor/docs/Conductor Design System/`; only the `tokens/` and
  `utilities/` CSS was copied in, and `biome.json` now excludes those two directories so the
  formatter cannot rewrite files the spec requires byte-for-byte.
- **Fixture state that has two branches.** → `running`, `steps`, `aiLines`, `errorLines` and
  `thread` are seeded into `ui.store.ts` from `fixtures/flows.ts` rather than read from the
  fixture module directly. The fixture values are the ones the screenshots show (idle, no steps,
  no washed lines, one opening turn), and criteria 12, 27, 31–33 describe the *other* branch —
  which is only reachable, and only testable, if a test can seed it.
- **How CSS-shape criteria are proven.** → jsdom applies no stylesheet, so `toHaveStyle` cannot
  see a CSS-Module class. Criteria that are a CSS declaration (1, 2, 3, 8, 9, 13, 21, 34, 38, 46)
  are asserted against the CSS source in `src/renderer/src/styles.test.ts`. Enabling Vitest's CSS
  processing was the alternative and was rejected: jsdom resolves custom properties and attribute
  selectors badly enough that the assertions would be about jsdom, not about the design.
- **Toolbar icon sizing.** → The design system's readme says "18 in toolbars", but its own
  `IconButton` draws 16 in a 30px box and `CShell.jsx` uses it unchanged. The kit and the
  screenshots are the binding reference for this layout, so the toolbar follows them.
- **⌘B / ⌘J are meta-only.** → The criteria name ⌘B and ⌘J. The kit also accepts Ctrl because it
  is a web mock; a window with `titleBarStyle: 'hiddenInset'`, a traffic-light inset and macOS
  vibrancy is not, so the Windows chord would be shortcut for chrome that does not exist there.
- **`backgroundColor` is transparent.** → macOS only renders `vibrancy` through a transparent
  window background. The renderer paints `--bg-window` and the wash over it, so nothing shows
  through in practice, but an opaque colour would make the requested `vibrancy` vestigial.
- **The phone's palette.** → Criterion 42's "fixed device palette" is declared once on
  `.phone` in `DeviceMirror.module.css`, ported from the design system's own `DeviceMirror.jsx`
  constants, so bezel, status bar and nav bar do not repaint when the app theme flips.
  Criterion 43's screen fill uses the `--device-screen` theme token, as it says.
- **Tooltips are used in the toolbar only.** → The region headers clip their overflow so the
  serial can truncate (criterion 38); a tooltip inside one would be clipped with it. Every
  control still carries its own accessible name, which is what criterion 51 asks for.
- **Controls that render but do nothing.** → Run/Stop, Save, the environment chip, New flow,
  Settings, Run whole suite, New tab's document contents, Insert into flow, the suggestion pills
  and Send. Each is drawn by the layout; none has anything to call in a spec with no IPC.
- **The composer's draft is local state.** → It is ephemeral, no other view reads it, and there
  is no assistant to send it to. `ui.store.ts` holds what the window shares, not what one field
  is holding this second.
- **Spacing that has a token uses it.** → Every `gap` / `padding` / `margin` whose value is on the
  `--space-*` scale (2 · 4 · 6 · 8 · 12 · 16 · 20 · 24 · 32) is written as the token. What is left
  as a literal is what the kit itself hardcodes *off* the scale — gaps of 1, 3, 5, 7, 9, 10, 11
  and paddings of 10, 11, 13, 14, 22, 28. Rounding those onto the scale would redraw the layout
  this spec exists to reproduce.
- **The traffic-light inset is 70px.** → Not in the Constraints' list of allowed pixel values
  because the kit had no such constant: it drew fake lights inside 22px of fake desktop. It is
  derived, not chosen — three 12px lights with 8px gaps span 52px, and `trafficLightPosition.x`
  is 18, so nothing of ours may start before 70. `window.test.ts` and `styles.test.ts` assert the
  two halves, because the number only means anything if both sides agree on it.
- **The window is edge to edge; the kit's 22px desktop inset is dropped.** → This one was got
  wrong first and corrected in review. The kit paints a rounded, shadowed window inside 22px of
  drawn desktop because it is a web mock in a browser page. Reproducing that inside a real
  `BrowserWindow` is the "frame inside a frame" the Decisions above already rejected, and it has
  a concrete consequence: `trafficLightPosition` is measured from the *real* window origin, so
  with the inset in place the OS lights landed in the margin above the toolbar rather than
  inside it — breaking criterion 7 while every test stayed green. The renderer now fills the
  window, macOS supplies the corners and the shadow, and `styles.test.ts` asserts that `.desktop`
  carries no padding and `.window` no radius, so the two cannot drift apart again. A side effect
  worth naming: the measured frame width now equals the width the panes actually get, which it
  did not before — the breakpoints were being decided on 44px more than the panes had.
- **The phone's palette is fixed all the way down.** → Also corrected in review. The bezel colour
  was ported from the design system's `DeviceMirror.jsx`, but its border and inner specular were
  left on `--edge-2` and `--shadow-inset-top`, which invert with the theme — so the "fixed device
  palette" repainted after all. Both are now `--phone-*` values declared in the same block, and
  `styles.test.ts` asserts that nothing `.phone` paints reaches for a theme token.

## Verification

`npm run lint`, `npm run typecheck`, `npm test` (463 tests, 24 files) and `npm run build` all
pass, and the suite passes under `--sequence.shuffle`. The packaged renderer was booted with
`ELECTRON_ENABLE_LOGGING=1` and reported no CSP violation and no console error; the built CSS
contains no `url()` at all, so nothing is fetched. It was also captured through
`webContents.capturePage()` at 1440 light, 1440 dark and 1000 light, which is how the
traffic-light and edge-to-edge findings below were confirmed fixed rather than merely asserted.

An independent agent graded the implementation against all 57 criteria; what it found is fixed
above, and the guards it found vacuous — the `biome-ignore` check that stripped comments before
looking for one, the motion check that ignored `animation:`, the rule lookup that read only the
first matching rule — are fixed too. Criteria that name a token are now asserted against the
declaration, not only against the `data-*` attribute the view test reads.

| Criteria | Proven by |
|---|---|
| 1–3, 8, 9, 11–18, 21–23, 26–29, 31, 34, 35, 38, 42, 43, 46 | `src/renderer/src/styles.test.ts` — the declarations the criteria name |
| 4, 12, 44–49, 53 | `src/renderer/src/App.test.tsx` |
| 5, 6, 19, 24, 25, 30, 45 | `src/renderer/src/stores/ui.store.test.ts` |
| 7 | `src/main/window.test.ts` (+ the toolbar inset, in `styles.test.ts`) |
| 10–13 | `src/renderer/src/views/Toolbar/Toolbar.test.tsx` |
| 14–21 | `src/renderer/src/views/FlowList/FlowList.test.tsx` |
| 22–30 | `src/renderer/src/views/FlowEditor/FlowEditor.test.tsx` |
| 26, 27, 37, 39–41, 44 | `src/renderer/src/lib/*.test.ts` — the pure decisions behind them |
| 31, 32 | `src/renderer/src/views/RunPanel/RunPanel.test.tsx` |
| 33 | `src/renderer/src/views/AIPanel/AIPanel.test.tsx` |
| 34 | `src/renderer/src/views/Composer/Composer.test.tsx` |
| 35–43 | `src/renderer/src/views/DeviceMirror/DeviceMirror.test.tsx` |
| 47–50 | `src/renderer/src/hooks/useWindowShortcuts.test.ts` |
| 51, 52 | `src/renderer/src/components/*/*.test.tsx` |
| 55, 57 | `src/renderer/src/sandbox.test.ts` + lint/typecheck |
| 56 | `npm run build` + a clean boot of `out/` |

Not covered by an automated test, and left for visual review against
`screenshots/aurora-macos.png` and `screenshots/02-aurora-macos-2.png`: whether the ported values
*look* right in both themes. The spec rules out snapshot and visual-regression tests, so the
guards above pin the declarations rather than the rendering.

Three things this spec settled that the next one may want to revisit — none of them blocking, all
of them decisions rather than oversights:

- **`1 commands · saved to suite`.** Criterion 10 gives the subtitle verbatim and the design
  system's own screenshot reads the same way, so it ships as specified — but it is a grammar
  error on any single-command flow, which is every new flow. Pluralising it is a copy change,
  which is the reviewer's call, not the implementation's.
- **The progress line's denominator is the command count**, so on a one-command flow the first
  reported step fills it. That is the kit's formula, and criterion 12 specifies only that the
  line exists; a real run reports against a real flow, so this stops mattering the moment
  `RunPanel` is wired to Maestro.
- **`closeTab` activates the first surviving tab, not the neighbouring one.** The kit does the
  same and criterion 25 does not say; with three or more documents open, macOS would activate
  the neighbour.

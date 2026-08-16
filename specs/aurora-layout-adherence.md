# Aurora layout adherence

status: done
created: 2026-08-15

## Goal

The running app has drifted from the design system's C-Aurora kit — the engineer sees several
misaligned elements. Since the shell shipped (2026-08-04), seven feature specs filled its
regions and the kit itself kept evolving; today (2026-08-15) it gained an editor empty state
and a toolbar title fallback, currently uncommitted. Audit every implemented surface against
the current kit, correct every divergence the kit wins, and land today's two kit behaviours —
so that the only divergences left standing are the ones a spec recorded on purpose.

## Context

### The reference — read it from the main checkout

The binding reference is `docs/Conductor Design System/`, but **this worktree's copy is stale**:
today's kit changes exist only as uncommitted edits in the main checkout. Read every reference
file from `/Users/gui/Projects/conductor/docs/Conductor Design System/` (absolute path), never
from this worktree. In particular:

- `ui_kits/conductor-c-aurora/CShell.jsx`, `CRegions.jsx`, `CRepo.jsx` — the reference
  implementation; their inline-style values are the canonical geometry.
- `ui_kits/conductor-c-aurora/README.md` — the layout contract: widths, breakpoints, the four
  `--a-*` materials, degradation order.
- `readme.md`, `guidelines/`, `tokens/` — system-level rules and token sources.
- `screenshots/` — visual targets (light and dark).
- Kit page ↔ app state: `index.html` ↔ workspace · `connect.html` ↔ Connect ·
  `send-changes.html` ↔ PublishSheet open. (`doctor*.html` has no app counterpart — out of scope.)

The reference is read-only: nothing in it is edited, imported or loaded (`_ds_bundle.js`
included), and its six pending uncommitted files are left exactly as they are.

### Files/modules this touches

All under `src/renderer/src/` unless noted:

- `App.module.css`, `styles/global.css` — shell grid and imports, if the audit finds drift.
- Every view and component stylesheet (+ `.tsx` only where composition or behaviour diverges):
  `views/` Toolbar · FlowList · RepoBar · FlowEditor · RunPanel · AIPanel · Composer ·
  DeviceMirror · Connect · AddRepoDialog · PublishSheet; `components/` ContextMenu · Dialog ·
  EmptyState · Icon · IconButton · RepoPopover · RepoResolver · SegmentedControl · SendControl ·
  StatusDot · Tooltip.
- `views/Toolbar/Toolbar.tsx` — the no-flow title fallback (behaviour delta 2).
- `views/FlowEditor/FlowEditor.tsx` — only if its existing empty state's composition diverges
  from the kit's (behaviour delta 1).
- `styles/tokens/`, `styles/utilities/` — re-verified byte-for-byte against the DS sources
  (two permitted deviations; see Decisions).
- `styles.test.ts` — every pinned declaration the audit corrects is re-pinned to the new value.
- Stores only if the toolbar fallback needs a repo field (`org`/`name`/`branch`) no selector
  exposes yet; no new store, no new IPC.

### Existing patterns/interfaces to follow

- `specs/aurora-layout-shell.md` — the constraint vocabulary, the `styles.test.ts` mechanism
  (CSS-source assertions, jsdom applies no stylesheet), and most recorded divergences.
- Later specs whose *Decisions* sections may justify further divergences:
  `repo-connect-workspace`, `local-flow-workspace`, `element-inspect-command-menu`,
  `flow-run-execution`, `device-identity-and-viewer`, `android-device-mirror`,
  `publish-send-changes` — all in `specs/`.
- `AGENTS.md` § Architecture → Renderer (layer ladder), § Naming, § Testing, § Code style.

### Product & decision docs

- `.context.md` § 9.2 (panels), § 12 (standing rules), § 8.0 (user-facing copy register).
- Engineer's request (2026-08-15): several elements misaligned; run a full check of the
  implemented layout against the design system and fix the alignment.

### Tests

- `src/renderer/src/styles.test.ts` — the declaration pins; update in the same change as each
  corrected value, never after.
- `views/Toolbar/Toolbar.test.tsx`, `views/FlowEditor/FlowEditor.test.tsx` — RTL, extended for
  the two behaviour deltas.
- No snapshot or visual-regression infrastructure (recorded shell decision; still binding).

---

## Acceptance criteria

### The audit rule

1. [x] The system shall render every surface listed in Context with the kit's current values for
   geometry (heights, widths, paddings, gaps, grid tracks), radii, typography tokens and colour
   tokens — where "kit's current values" means the inline styles of `CShell.jsx`,
   `CRegions.jsx` and `CRepo.jsx` and the contract in the kit `README.md`, read from the main
   checkout.
2. [x] If the audit finds a divergence from the kit, then the implementation shall either change
   the app to the kit's value, or match the divergence to the recorded spec decision that
   justifies it — and shall append every kept divergence, with its justifying spec, to this
   spec's *Kept divergences* section. No divergence survives silently, and the reference is
   never edited to match the app.
3. [x] While auditing, the system shall treat the recorded structural decisions as binding: one
   document at a time with no tab strip; edge-to-edge window (no 22px drawn desktop, no drawn
   traffic lights, `.desktop` carries no padding and `.window` no radius); the 70px
   traffic-light inset; meta-only shortcuts. The kit's `activeTab`/tab-strip mechanics map onto
   the app's single `openPath`.
4. [x] The system shall keep `styles/tokens/` and `styles/utilities/` byte-identical to the DS
   sources, except the two recorded deviations: the dropped Google-Fonts `@import` in
   `fonts.css`, and the app-side `--glass-dialog` declarations in `theme-aurora.css` /
   `theme-aurora-dark.css`.

### Behaviour delta 1 — editor empty state (kit change of 2026-08-15)

5. [x] While no flow is open (`openPath === null`), the editor column shall render, in the YAML
   row, a centred empty state composed exactly as the kit's: a `file-code` glyph at 18px in
   `var(--text-disabled)` (the kit draws 20; the app's EmptyState scale decides — record which,
   per criterion 2), the caption `No flow open. Pick one in the sidebar, or create the first
   one.` in `--type-caption` / `var(--text-tertiary)`, and a `New flow` button — 26px tall,
   `0 11px` padding, `var(--a-well)` fill, hairline border, `var(--a-radius-field)`, `plus`
   glyph at 12px in `var(--accent)`, label in `--type-caption` / `var(--text-primary)`.
6. [x] While no flow is open, the editor column shall render no YAML body, no gutter and no caret —
   an empty state is not a file.
7. [x] When the empty state's `New flow` button is activated, the system shall start a new flow
   through the same action as the sidebar's new-flow button — same store action, no parallel
   path.

### Behaviour delta 2 — toolbar title fallback (kit change of 2026-08-15)

8. [x] While a flow is open, the toolbar shall title the window with the flow's name in
   `--type-body-strong` and the subtitle `<n> command · ` / `<n> commands · ` followed by
   `running` or `saved on this Mac` in `--type-mono-label` — unchanged from today.
9. [x] While no flow is open and a repo is active, the toolbar shall title the window with the
   repo's name in `--type-body-strong` and the subtitle `<org>/<name> · <branch>` in
   `--type-mono-label`; the `—` placeholder subtitle shall no longer render in any state.
10. [x] If the repo fields needed by criterion 9 are not yet exposed by a store selector, the
    system shall expose them by selector from the existing repo state — no new IPC, no new
    store.

### Verification

11. [x] The system shall pass `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`,
    with every `styles.test.ts` pin matching the corrected declarations and no vacuous
    assertion (a pin that no longer matches any rule fails, it does not silently pass).
12. [x] The implementation shall capture the running app via `webContents.capturePage()` at
    1440px light, 1440px dark and 1000px light, in each of: workspace with a flow open,
    workspace with no flow open, Connect, and the publish sheet open — and compare each
    against its kit page and the `screenshots/`; every visible delta is fixed or lands in
    *Kept divergences* per criterion 2.
13. [x] The system shall keep the window free of horizontal overflow at every width from 960px up,
    and the breakpoint behaviour per the kit README (sidebar shown ≥1120px; mirror 300 / 268 /
    250) shall still hold after every correction.

---

## Constraints

- **Kit value wins; decisions win over the kit.** The precedence for every disputed value:
  a recorded spec decision → the kit's current inline value → nothing else. Taste is not an
  input; if a value looks wrong in both, record it, don't invent a third.
- **No hardcoded design values.** Tokens for everything on a token scale; off-scale pixel
  literals only where the kit itself hardcodes them. The shell spec's allowed list may be
  extended only with literals the kit hardcodes today.
- **CSS Modules only; one blur.** Inline `style` stays limited to genuinely computed values.
  No region gains a `backdrop-filter`; materials stay alpha fills.
- **Layer discipline per AGENTS.md.** A fix that needs logic puts it in the right layer; no
  view reaches past its row.
- **Copy register (§ 8.0).** English chrome, sentence case, no exclamation marks; the two new
  strings (criteria 5, 9) are chrome and follow it. Anything the CLI prints stays verbatim.
- **Scope of change.** No new IPC channel, no preload change, no main-process change, no new
  dependency. This is a renderer-only correction.
- **Formatter.** Biome already excludes the copied `tokens/` and `utilities/`; keep it that
  way so byte-for-byte copies survive `npm run format`.

## Out of scope

- The Doctor view — the kit draws `CDoctor`/`CDoctorB`/`CReview`; the app has no Doctor UI.
  Its own spec.
- Adopting the kit's tab strip, or any revisit of the recorded structural decisions.
- Editing anything in `docs/Conductor Design System/`, or committing its pending changes.
- Visual-regression/snapshot test infrastructure.
- `PRPanel`, and any panel `.context.md` names that the design system does not draw.
- Behaviour changes beyond criteria 5–10. A behaviour divergence the audit finds outside them
  is reported in *Kept divergences* with a note, not fixed here.

## Decisions & assumptions

- **Scope: full check** — all main-window regions plus Connect, dialogs and sheets → engineer,
  2026-08-15.
- **Today's two kit deltas are in scope** (editor empty state; toolbar title fallback) →
  engineer, 2026-08-15.
- **Recorded divergences stand** (no tab strip, edge-to-edge window, 70px inset) → engineer,
  2026-08-15. The audit maps kit tab mechanics onto the one-document model.
- **Verification method** → house pattern from `aurora-layout-shell.md`: declaration pins in
  `styles.test.ts` plus a `capturePage` visual pass. No new test infrastructure.
- **The reference is read from the main checkout** because today's kit edits are uncommitted
  and this worktree predates them. If they get committed to `main` before implementation
  starts, merging `main` into this branch removes the caveat but changes nothing else.
- **Token deviations** → exactly two are legitimate: the `fonts.css` Google-Fonts drop
  (CSP, shell spec) and `--glass-dialog` (dialog legibility, decision 2026-08-08). Anything
  else `diff` reports between `styles/tokens|utilities/` and the DS is drift to fix.
- **"No flow open" definition** → `openPath === null` in the flow store — the state that
  already drives the editor's existing empty state. A repo with an empty `conductor/` and a
  repo where no flow was selected are the same state.
- (Assumed) The audit's working method — extract the kit's values per region, diff against the
  app's module CSS, then the visual pass — is octo-implement's to organise; this spec fixes
  only what must be true when it's done.

### Resolved during implementation, 2026-08-15

- **Criterion 10 needed no new selector.** `selectActiveRepo` in `repo.store.ts` already
  projects `org`, `name` and `branch` off the existing repo state — the sidebar's own `RepoBar`
  reads it. The toolbar reads the same one. No new store, no new IPC, as the constraint asks.
- **A repo with no branch** reports `branch: null` in `ConnectedRepo`, so criterion 9's
  subtitle degrades to `<org>/<name>` — the same shape `RepoBar` already uses for its own
  `branch · bundle` line.
- **The toolbar with no repo at all** renders empty title and subtitle strings. It is
  unreachable in the app — no active repo means the connect window, which draws no toolbar —
  and the empty strings exist only so the component is total.
- **`ContextMenu` gained a `width` prop** (default 232, the DS's own) and the fixed `width` left
  `.menu` in the CSS module. A per-instance width is a computed value, which is what the
  "CSS Modules only" constraint reserves inline `style` for — the menu already positions itself
  inline for the same reason.
- **The visual pass (criterion 12)** was run against the built app with a seeded `userData` —
  a real git clone with three flows under `conductor/`, one dirty so the Send control is live —
  driven by a temporary `webContents.capturePage()` hook in `src/main/index.ts`, guarded by an
  env var and **reverted before the commit**: the "renderer-only" constraint holds for what
  ships. Twelve captures — workspace with and without a flow, and the publish sheet, at 1440 and
  1000 in both themes — plus the connect window in both. Criterion 13 was measured rather than
  eyeballed: `scrollWidth - clientWidth` was 0 at every width from 960 to 1440 in 20px steps,
  with the sidebar appearing at 1120 and the mirror stepping 250 → 268 → 300 at the kit
  README's breakpoints.
- **The connect window's two captures share one theme mechanism.** It carries no appearance
  toggle, so the capture set the root `data-theme` the way the ui store's own layout effect
  does.

## Kept divergences

*Per criterion 2. Format: `<surface> — <app value> vs <kit value> → kept because <spec +
decision>`. Everything the audit found that is **not** on this list was changed to the kit's
value — see *What the audit corrected* below.*

### Window and shell

- **The window** — edge to edge, no drawn 22px desktop, no drawn traffic lights, no window
  radius, and a 70px toolbar inset vs the kit's fake desktop and its own drawn lights → kept
  because `aurora-layout-shell.md`: *"Real. The kit draws its own traffic lights inside 22px of
  fake desktop because it is a web mock; in a real Electron window that would be a frame inside
  a frame."*
- **Shortcuts** — ⌘B / ⌘J / ⌘N meta-only vs the kit's meta-or-Ctrl → kept because
  `aurora-layout-shell.md`: *"The kit also accepts Ctrl because it is a web mock."*
- **`Tooltip`** — no `backdrop-filter` vs the DS `core/Tooltip`'s own frost → kept because the
  single-blur rule (`aurora-layout-shell.md` criterion 1) allows exactly four declaring
  modules, and `styles.test.ts` holds that line.

### Tokens

- **`styles/tokens/fonts.css`** — the leading Google-Fonts `@import` dropped → kept because
  `aurora-layout-shell.md`: *"`style-src 'self'` blocks it and no `font-src` is granted; the CSP
  is not to be widened for this."*
- **`--glass-dialog`** (both themes) — added app-side vs the kit's `--glass-3` → kept because
  `publish-send-changes.md`: *"the kit's `--glass-3` frost let the app behind the modal fight
  the sheet's own text."* These are the two deviations criterion 4 names, and `diff -r` against
  the DS `tokens/` and `utilities/` reports nothing else.

### Working area

- **The document bar** — one named document, no tab fill, no tab border, no close and no "+"
  vs the kit's `CTabStrip` → kept because `aurora-layout-shell.md` criterion 23 and, again,
  `aurora-rehue-toolbar-publish.md`: *"This session's explicit decision is to keep one open
  document and no tab strip."* The kit's `activeTab` maps onto the app's single `openPath`
  (criterion 3).
- **The document bar's `—` with nothing open** — the kit renders no tab at all → kept because
  `local-flow-workspace.md`: *"with nothing open the Toolbar reads … and the DocumentBar goes
  quiet ("—")."* Criterion 9 supersedes only the **toolbar** half of that record; the document
  bar's own placeholder is untouched by this spec.
- **The composer** — one send action vs the kit's `ChatComposer` attachment/regenerate row →
  kept because `aurora-layout-shell.md` lists the DS's studio components as unbuilt.

### Sidebar

- **The header line** — `conductor/ · N flows` vs the kit's `<folder> · N failing` → kept
  because `local-flow-workspace.md` criterion 37: *"a truthful "conductor/ · N flows" — run-result
  dots render as `never` until a future spec persists run history."*
- **The zero-state** — the DS `surface/EmptyState` (44px chip, `--type-title-3` title, its own
  copy, accent-filled action) vs the kit's bare 20px glyph over one caption over a well button
  → kept because `local-flow-workspace.md` wrote it against the DS component rather than the kit:
  *"The kit has no sidebar zero-state, so criterion 35's copy is written fresh in the DS voice."*
  The **editor's** zero-state is not covered by that record — criteria 5–7 replace it, and it is
  now the kit's composition exactly.
- **No change dot on a flow row, and no unsent count on the bottom bar** — the kit draws both →
  reported here rather than fixed, per *Out of scope*: this is behaviour beyond criteria 5–10.
  The unsent set reaches the person through the toolbar's Send control instead
  (`publish-send-changes.md`).
- **Ordering and deep folders** — alphabetical, with a directory nested deeper than one level
  as a compact `a/b` row → kept because `local-flow-workspace.md`: *"the mock's explicit
  `FOLDERS` order has no home on a plain filesystem."*

### Inspector

- **The header's controls** — Back · Refresh · Refresh snapshot · Inspect vs the kit's Reload ·
  Screenshot · Inspect → kept because `device-hierarchy-capture.md` criterion 21 put the
  snapshot's manual refresh beside the mode it serves, and the control socket added Back.
- **A third `auto` row on `.panel`** — the control-failure note under the bay, which the kit has
  no counterpart for → kept because `scrcpy-control-socket.md` criterion 16: a control failure
  is said beside the phone, never over it.
- **The phone draws no app content, status bar or nav bar; the canvas is sized from the stream**
  → kept because `android-device-mirror.md` criterion 37, which *"supersedes criteria 42 and 43
  of `aurora-layout-shell`"*; the bezel, the drop shadow and the fixed `--phone-*` palette stay.

### Sheets and first run

- **The publish sheet** — the app's `Dialog` (520px via its `width` prop, `--radius-lg`, 32px
  badge, DS header padding) vs the kit's bespoke panel (520px, `--a-radius-window`, 30px badge)
  → kept because `publish-send-changes.md` builds *"the kit's `CSendSheet` over the app's
  `Dialog`"*: the design system has one modal treatment, and the app's is the DS's own.
- **The sheet's words** — "your team" not the fixture's reviewer name, "Cancel" not "Not yet",
  and a *Required* note → kept because `publish-send-changes.md` records all three.
- **The connect mark** — `build/icon.png` vs the kit's gradient "C" → kept because
  `repo-connect-workspace.md`: *"The connect screen shall use `build/icon.png` as its mark."*
- **The connect window** — the whole OS window at a fixed 560×520 vs the kit's 560px card on a
  drawn desktop → kept because `repo-connect-workspace.md`: *"Single BrowserWindow, resized."*
- **No Doctor badge in the toolbar** — the kit's `CToolbar` carries one → kept because the app
  has no Doctor UI (this spec's *Out of scope*).
- **The repo switcher's edge** — a 1px `--a-hair` border and `--material-content` fill vs the
  kit's `.a-rim` utility over a white-tinted `--a-content` → kept because
  `repo-connect-workspace.md` builds it as *"the third floating layer, same family as the
  command menu"*, and that menu is the DS's own, which draws a hairline border. The app uses no
  `.a-*` utility class anywhere; the window's rim is its own pseudo-element for the same reason.

### Where the app draws a DS component the kit composes

Criterion 1 binds to *"the inline styles of `CShell.jsx`, `CRegions.jsx` and `CRepo.jsx`"*. Where
the kit reaches for a design-system component instead of drawing inline, the app's own port of
that component is what renders, and several of those ports are smaller than the DS original.
They are listed here rather than fixed, because normalising them is a design decision about the
app's control scale, not an alignment fix — and `aurora-layout-shell.md` records the DS's
`Button`, `Input`, `Select`, `Checkbox`, `Switch`, `Badge`, `Kbd`, `GlassPanel`, `PanelHeader`,
`TabStrip`, `Divider` and `EmptyState` as deliberately unbuilt.

- **Every `RButton`** — `core/Button`'s `md` is 36px / `0 14px` / `--type-body-strong` /
  `--radius-md` / an inset specular. The app draws each one inline instead, and at three
  different heights: `Connect .open` 28, `RepoResolver .connect` 34, `AddRepoDialog .open` and
  `.cancel` 26, `PublishSheet .ghost`/`.primary` 28. Worth a follow-up spec that picks one
  scale; not this one's to choose.
- **`StatusDot`** — the DS gives every non-idle state a `0 0 0 3px` colour-mixed halo. The app's
  has none. Kept as-is deliberately: the kit's own flow rows draw a **bare** 6px span, not a
  `StatusDot` (`CRegions.jsx:48`), so adding the halo to the shared component would put one on
  rows the kit draws without.
- **The inspect highlight's label** — `studio/DeviceMirror` sets `--type-mono-label` at 17px
  high, `0 5px`, anchored `left: -1 / top: -19`; the app uses `--type-code-sm` at 19px high,
  `0 6px`, anchored to the box's own corner. The anchoring is `element-inspect-command-menu.md`'s
  (it counter-scales by `--fit-scale`); the type and box were not recorded, and are now.
- **The publish sheet's badge** — `CSendSheet` swaps it to `--a-well` / `--text-tertiary` once
  sent; the app's `Dialog` hardwires `--accent-quiet` / `--accent`, so "Waiting for review"
  keeps a live-action badge. Follows from the recorded "kit's `CSendSheet` over the app's
  `Dialog`" decision — the badge belongs to the `Dialog` — but the resulting delta is recorded
  here. The sheet's `.required` hint is likewise `--text-tertiary` where the kit's optional hint
  is `--text-disabled`; the copy is a recorded change (`publish-send-changes.md`), the colour
  follows it.
- **The folder row's trailing cell** — the kit fixes a 22×22 cell and cross-fades the count into
  a single "+" *from the count's own centre*, with a comment saying this is so hovering never
  nudges the row. The app swaps the count for two side-by-side `IconButton`s ("+" and the
  ellipsis), so the row does move on hover. The second control is
  `local-flow-workspace.md`'s; the no-nudge mechanic it cost is recorded here.

### Recorded elsewhere, restated here

Two divergences were already written down in `styles.test.ts` rather than in a spec. Criterion 2
wants them in a spec, so:

- **`ContextMenu` fills with `--material-content`, not the DS's `--glass-3`** → the menu floats
  over the mirror's screenshot, and the dark theme's 17%-alpha frost cannot carry text over it.
  This is the same substitution the switcher popover makes, for the same reason.
- **`.display` fills with `--device-screen`, which is themed** → pinned by
  `aurora-layout-shell.md` criterion 43. The *bezel* is what the "fixed device palette" rule
  covers, and `styles.test.ts` proves nothing `.phone` paints reaches a theme token.

### Found and left for another spec

- **`DeviceMirror .panel` declares one `auto` note row, but three `.controlNote`s can render at
  once** — the second and third land in implicit grid rows, which is the failure the kit README
  warns about. It needs a real state at least two control failures deep to appear, and it
  belongs to `scrcpy-control-socket.md`'s surface rather than to this audit.
- **`Icon.tsx`'s `package` path data** differs from the DS's vendored Lucide revision. Path data
  is not geometry, typography or colour, so it is outside criterion 1 — but it is drift.

### Resolved by this spec

- **The editor empty state's glyph is 20px**, not criterion 5's stated 18 → criterion 5 defers
  the number (*"the kit draws 20; the app's EmptyState scale decides"*), and both authorities
  agree on 20: it is the kit's own value and the `md` size of the app's `EmptyState`. 18 was
  the only number neither of them names.

---

## What the audit corrected

Everything below diverged from the kit with no spec decision behind it, so criterion 2 made it
a fix rather than a record. Each is pinned in `styles.test.ts` or in a view test.

| Surface | Was | Now (the kit's value) |
|---|---|---|
| Toolbar title, no flow open | `No flow open` / `—` | repo name / `<org>/<name> · <branch>` (criteria 8–10) |
| Editor empty state | DS `EmptyState`: chip, title, accent-filled action | glyph 20 `--text-disabled` · one `--type-caption` caption · 26px well button with an accent `plus` (criteria 5–7) |
| Environment chip's glyphs | inherited `--text-secondary` | `--text-tertiary` |
| Sidebar "Run whole suite" glyph | inherited `--text-secondary` | `--text-tertiary` |
| Connect's top strip | bare drag region | `--a-chrome` with a hairline under it |
| Connect's body | `padding: 14px 30px 24px` | `padding: 26px 30px 24px` |
| Context-menu widths | 232 everywhere | 188 new-flow · 196 flow row · 206 folder row · 232 command menu |
| Repo switcher popover | `var(--space-2)`, `cd-menu-in var(--dur-base)` | `var(--space-3)` (the kit's 6), `cd-menu-in var(--dur-fast)` — `CRepoPopover`'s own two numbers, not the DS menu's. 6 is on the spacing scale, so it is spelled as the token |
| Repo tiles, both of them | `color: var(--text-inverse)` | `color: oklch(100% 0 0)` — the kit's own literal. `--text-inverse` goes near-black in Aurora dark, and `--grad-aurora` does not theme, so the initial was turning dark on a light mint field |
| Connect mark | `box-shadow: var(--shadow-2)` | `box-shadow: var(--shadow-2), var(--a-refract)` |
| Folder row's trailing inset | `padding-right: 5px` | `padding-right: 6px`, the same as a flow row's |

`styles.test.ts`'s motion guard gained `--dur-fast` as an allowed entrance clock for the last
of those — for `cd-menu-in` alone, so `cd-fade-in` and `cd-dialog-in` still fail if they drift
onto it. What that guard protects is untouched: the clock is still a token, so reduced motion
zeroes it like every other.

The toolbar's title and subtitle are derived by `lib/document-title.ts` rather than inside the
view, per AGENTS.md's renderer ladder — formatting is `lib/`'s row, and the decision is read
without mounting a toolbar.

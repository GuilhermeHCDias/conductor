# Aurora layout adherence

status: todo
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

1. The system shall render every surface listed in Context with the kit's current values for
   geometry (heights, widths, paddings, gaps, grid tracks), radii, typography tokens and colour
   tokens — where "kit's current values" means the inline styles of `CShell.jsx`,
   `CRegions.jsx` and `CRepo.jsx` and the contract in the kit `README.md`, read from the main
   checkout.
2. If the audit finds a divergence from the kit, then the implementation shall either change
   the app to the kit's value, or match the divergence to the recorded spec decision that
   justifies it — and shall append every kept divergence, with its justifying spec, to this
   spec's *Kept divergences* section. No divergence survives silently, and the reference is
   never edited to match the app.
3. While auditing, the system shall treat the recorded structural decisions as binding: one
   document at a time with no tab strip; edge-to-edge window (no 22px drawn desktop, no drawn
   traffic lights, `.desktop` carries no padding and `.window` no radius); the 70px
   traffic-light inset; meta-only shortcuts. The kit's `activeTab`/tab-strip mechanics map onto
   the app's single `openPath`.
4. The system shall keep `styles/tokens/` and `styles/utilities/` byte-identical to the DS
   sources, except the two recorded deviations: the dropped Google-Fonts `@import` in
   `fonts.css`, and the app-side `--glass-dialog` declarations in `theme-aurora.css` /
   `theme-aurora-dark.css`.

### Behaviour delta 1 — editor empty state (kit change of 2026-08-15)

5. While no flow is open (`openPath === null`), the editor column shall render, in the YAML
   row, a centred empty state composed exactly as the kit's: a `file-code` glyph at 18px in
   `var(--text-disabled)` (the kit draws 20; the app's EmptyState scale decides — record which,
   per criterion 2), the caption `No flow open. Pick one in the sidebar, or create the first
   one.` in `--type-caption` / `var(--text-tertiary)`, and a `New flow` button — 26px tall,
   `0 11px` padding, `var(--a-well)` fill, hairline border, `var(--a-radius-field)`, `plus`
   glyph at 12px in `var(--accent)`, label in `--type-caption` / `var(--text-primary)`.
6. While no flow is open, the editor column shall render no YAML body, no gutter and no caret —
   an empty state is not a file.
7. When the empty state's `New flow` button is activated, the system shall start a new flow
   through the same action as the sidebar's new-flow button — same store action, no parallel
   path.

### Behaviour delta 2 — toolbar title fallback (kit change of 2026-08-15)

8. While a flow is open, the toolbar shall title the window with the flow's name in
   `--type-body-strong` and the subtitle `<n> command · ` / `<n> commands · ` followed by
   `running` or `saved on this Mac` in `--type-mono-label` — unchanged from today.
9. While no flow is open and a repo is active, the toolbar shall title the window with the
   repo's name in `--type-body-strong` and the subtitle `<org>/<name> · <branch>` in
   `--type-mono-label`; the `—` placeholder subtitle shall no longer render in any state.
10. If the repo fields needed by criterion 9 are not yet exposed by a store selector, the
    system shall expose them by selector from the existing repo state — no new IPC, no new
    store.

### Verification

11. The system shall pass `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`,
    with every `styles.test.ts` pin matching the corrected declarations and no vacuous
    assertion (a pin that no longer matches any rule fails, it does not silently pass).
12. The implementation shall capture the running app via `webContents.capturePage()` at
    1440px light, 1440px dark and 1000px light, in each of: workspace with a flow open,
    workspace with no flow open, Connect, and the publish sheet open — and compare each
    against its kit page and the `screenshots/`; every visible delta is fixed or lands in
    *Kept divergences* per criterion 2.
13. The system shall keep the window free of horizontal overflow at every width from 960px up,
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

## Kept divergences

*Filled during implementation, per criterion 2. Format: `<surface> — <app value> vs
<kit value> → kept because <spec + decision>`.*

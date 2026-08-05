# Aurora rehue completion and the Toolbar Send control

status: todo
created: 2026-08-05

## Goal

Finish syncing Conductor's renderer to the design system's Aurora refresh — the cyan / mint /
blue / green palette (replacing indigo / periwinkle / teal), the revised glass alphas, the wider
blur and saturation, and the 2px focus ring — which is already partially applied and uncommitted,
and give the Toolbar the Send-for-review affordance that `.context.md` §8.5 calls for now that
the Save button is gone: a three-state control plus the ephemeral `PublishSheet` it opens.
Fixture-only, no IPC — continuing the precedent `specs/aurora-layout-shell.md` set.

It matters because §8.5 is a dated, already-decided product direction (2026-08-05) that the
shipped Toolbar only half-reflects — Save is gone, nothing replaced it — and because the token
rehue is sitting uncommitted and unverified against the rest of the renderer (icons, the device
mirror's fixed palette) rather than only the four files already touched.

**This spec performs no integration**, same as its predecessor: nothing calls
`window.conductor`, no Maestro, no `git`, no `gh`. The Send control and the sheet it opens run
entirely on fixture state in `ui.store.ts`.

## Context

### Files/modules this touches

Modified:

```
src/renderer/src/
  styles/tokens/palette.css               # already rehued (uncommitted) — verify, no strays
  styles/tokens/radius.css                # already --focus-ring-w: 2px — verify
  styles/tokens/theme-aurora.css          # already rehued — verify blur/saturate/alphas
  styles/tokens/theme-aurora-dark.css     # already rehued — verify blur/saturate/alphas
  components/Icon/Icon.tsx                # already dropped `download` — add check, clock,
                                           # pencil, trash-2, folder
  fixtures/flows.ts                       # add `change` to `Flow`, mark a few FLOWS with it,
                                           # add a reviewer name + a "sent at" fixture string
  stores/ui.store.ts                      # sendPhase, sendOpen, seeded+mutable change list,
                                           # sentChanges, unsentChanges selector, open/close/send
  views/Toolbar/Toolbar.tsx               # insert the Send control (Save is already gone)
  views/Toolbar/Toolbar.module.css
  views/Toolbar/Toolbar.test.tsx
  App.tsx                                 # mount <PublishSheet /> at the window root
  App.module.css                          # scrim positioning for the sheet, if needed
  App.test.tsx
  styles.test.ts                          # CSS-declaration assertions, per aurora-layout-shell
```

Created:

```
src/renderer/src/views/PublishSheet/
  PublishSheet.tsx
  PublishSheet.module.css
  PublishSheet.test.tsx
```

Explicitly **not** touched: `FlowList.tsx` stays the flat list it is today (see *Out of scope*),
and `RunPanel` / `AIPanel` / `DeviceMirror` / the Run button are untouched.

### Existing patterns/interfaces to follow

- `AGENTS.md` § Layout, § Architecture → Renderer, § Naming, § Testing, § Code style — the same
  import ladder `specs/aurora-layout-shell.md` followed.
- `specs/aurora-layout-shell.md` itself is the baseline this spec amends. Its criterion 10 gave
  the Toolbar a `<n> commands · saved to suite` subtitle and a save button; both are already
  reversed in the shipped code (subtitle now reads `saved on this Mac` / `running`, no save
  button) per §8.2 — this spec does not touch the subtitle further, only what sits to its right.
- `src/renderer/src/views/Toolbar/Toolbar.tsx` — the environment chip and the Run button are
  already inline elements of this file, not their own component folders; the Send control follows
  the same convention (see *Decisions*).
- `src/renderer/src/stores/ui.store.ts` — Zustand, narrow-selector convention
  (`selectSidebarVisible` etc.). This spec adds to the one store rather than creating a second.
- No modal/sheet exists in the renderer yet — `PublishSheet` is the first. Mount it at the window
  root, not inside a pane, so its scrim covers the toolbar too (the reasoning
  `specs/aurora-layout-shell.md`'s Decisions already recorded for sheets in general).

### Product & decision docs

- `.context.md` §8.5 "Superfície na UI" (2026-08-05, product-owner decision) — the primary
  driver. It reverses the Toolbar's Save button (already done) and specifies a primary
  Send/Publish control carrying a count and a state, plus an ephemeral sheet — "uma folha de
  publicação, não um painel — e sem nenhum campo [obrigatório]" — replacing the old permanent
  `PRPanel`.
- `.context.md` §8.2 "Duas cadências: salvar é local, publicar é remoto" — why there is no Save
  button at all: editing already saves.
- `.context.md` §8.3/§8.4 — the real publish mechanics (branch-per-suite, `gh pr create`, an AI
  skill writing the title/description) that this sheet stands in front of. Not built here — see
  *Out of scope*.
- `.context.md` §9.2 — the renderer process diagram, already updated to read
  `Toolbar — estado + Publicar (8.5)` and to list `PublishSheet` in place of the old `PRPanel`.

### Design & conventions

`docs/Conductor Design System/` — updated by the engineer, currently uncommitted in the main
checkout, copied into this worktree as-is. Read in this order:

1. `readme.md` — the palette section (cyan/mint/blue/green, sampled from the logo) and the
   content register (sentence case, no emoji, English chrome).
2. `tokens/palette.css`, `tokens/theme-aurora.css`, `tokens/theme-aurora-dark.css`,
   `tokens/radius.css` — the four token files with real value changes. The renderer's copies
   already mirror them; this spec verifies and locks that with a test, and finishes the parts
   that were not part of the four-file pass (icons, the mirror's fixed phone palette).
3. `ui_kits/conductor-c-aurora/CShell.jsx`, function `CToolbar` — exactly where the Send control
   sits: immediately after the hairline separator that follows the Run button, immediately
   before the appearance toggle.
4. `ui_kits/conductor-c-aurora/CReview.jsx` — **the binding reference for this spec.** It exports
   `CSendControl` (the toolbar's three states) and `CSendSheet` (the dialog), fully coded, with a
   long header comment on the vocabulary. Copy is taken **verbatim from this file**, not
   translated from §8.5's Portuguese gloss (see *Decisions*).
5. `components/core/Icon.jsx` — source for the five new glyphs.

Note: `docs/Conductor Design System/screenshots/` was not refreshed for the new palette (still
the pre-rehue images `specs/aurora-layout-shell.md` used) — there is no updated pixel reference.
Visual review is by running the app, the same fallback aurora-layout-shell used for anything not
pinned by a token/CSS assertion.

### Tests

`vitest.config.ts` project `renderer`, same as every other view — RTL, querying by role.
`PublishSheet.test.tsx` and the extended `Toolbar.test.tsx` cover the new UI; the
sending → review transition is asserted with `vi.useFakeTimers()` rather than real delays.
CSS-declaration criteria (blur/saturate/focus-ring, no stray old-hue tokens) are asserted in
`styles.test.ts` against the token source, per `specs/aurora-layout-shell.md`'s own resolution
for CSS-shape criteria (jsdom applies no stylesheet, so `toHaveStyle` can't see a CSS Module).

---

## Acceptance criteria

### Palette and tokens

1. The system shall contain no reference to the retired token names (`--indigo-*`, `--peri-*`,
   `--teal-300|400|500` as run-state colours, or ink sampled at hue 265) anywhere under
   `src/renderer/`.
2. The system shall keep `--a-blur` / `--a-saturate` at `52px` / `200%` in Aurora light and
   `54px` / `200%` in Aurora dark, and `--focus-ring-w` at `2px`, matching the design system's
   `tokens/theme-aurora.css`, `tokens/theme-aurora-dark.css` and `tokens/radius.css`.
3. The system shall re-derive `DeviceMirror`'s fixed `--phone-*` bezel / status-bar / nav-bar
   palette from the current design system's phone-chrome values and update any that drifted with
   the rehue, while keeping every `--phone-*` value independent of `data-theme` — carrying
   forward `specs/aurora-layout-shell.md` criterion 42.

### Toolbar — Send control

4. The system shall render a Send control immediately after the existing hairline separator and
   before the appearance toggle — the slot the removed Save button left, per §8.5.
5. While the store's send phase is `'idle'` and the unsent-change count is `0`, the system shall
   render the control as inert text reading `Everything sent`, a `check` glyph in
   `var(--state-pass)`, the label in `var(--text-disabled)`, and no hover or press affordance.
6. While the send phase is `'idle'` or `'sending'` and the unsent-change count is greater than
   `0`, the system shall render a filled `var(--accent)` button reading `Send changes` with a
   pill badge showing the count, a `send` glyph, and a tooltip reading
   `Send 1 change to the team` for a count of 1 or `Send <n> changes to the team` otherwise.
7. While the send phase is `'review'`, the system shall render a quiet `var(--a-well)` pill with
   a `clock` glyph reading `Waiting for review`, a tooltip `Waiting for review · sent <fixture
   time>`, and — while the unsent count is greater than `0` — an additional accent `+<n>` badge.
8. When the Send control is activated in any state, the system shall open `PublishSheet`.

### PublishSheet

9. The system shall mount `PublishSheet` at the window root — covering the toolbar as well as
   the panes — as a centred glass dialog (`role="dialog"`, `aria-modal="true"`) over a blurred
   scrim.
10. While the send phase is `'idle'` or `'sending'`, the system shall title the sheet
    `Send 1 change` / `Send <n> changes` against the live unsent count, subtitle it
    `Your work is already saved on this Mac. Sending puts it in front of <reviewer>, who adds it
    to the shared project.`, and list the live unsent changes.
11. While the send phase is `'review'`, the system shall title the sheet `Waiting for review`,
    subtitle it `<reviewer> will look at these and put them in the shared project. You can keep
    working — new changes join the same review.`, and list the frozen batch that was sent, not
    the current live unsent list.
12. The system shall render each listed change as a glyph — `plus` / `pencil` / `trash-2` for
    new / edited / deleted — coloured `var(--state-pass)` / `var(--accent)` / `var(--state-fail)`
    respectively, the flow's file name, its `conductor/<folder>/` path in
    `--type-mono-label`, and the matching verb (`Added` / `Changed` / `Deleted`) in the same
    colour as its glyph.
13. While the send phase is not `'review'`, the system shall render an optional note
    `<textarea>` labelled `What changed?` with the helper text
    `Optional — it helps the reviewer.` and the placeholder
    `Fixed the checkout test after the button moved`; while the send phase is `'review'`, the
    system shall not render it.
14. The system shall render a footer with the static label `conductor/` on the left; on the
    right, while not yet sent, a ghost `Not yet` button that closes the sheet beside a primary
    button reading `Send for review` (or, while the send phase is `'sending'`, a disabled loading
    button reading `Sending`); once sent, a ghost `View on GitHub` button beside a primary `Done`
    button that closes the sheet.
15. When the primary send button is activated, the system shall set the send phase to
    `'sending'`, and — after a short fixed delay — freeze the current unsent changes as the sent
    batch, clear their `change` markers, and set the send phase to `'review'`.
16. While the send phase is `'sending'`, the system shall disable the note field, hide the close
    (`x`) button, and ignore backdrop clicks and `Escape`.
17. When `Escape` is pressed, or the backdrop is clicked, while the sheet is open and the send
    phase is not `'sending'`, the system shall close the sheet without changing the send phase.
18. The system shall give the close button, the Send control, and every button in the sheet an
    accessible name reachable by `getByRole('button', { name })`.

### Icons and fixture data

19. The system shall add the `check`, `clock`, `pencil`, `trash-2` and `folder` Lucide glyphs to
    `Icon.tsx` at `stroke-width: 1.75`, ported from the current design system `Icon.jsx` — the
    five this feature needs that are not already there (`send`, `plus` and `x` already exist).
20. The system shall extend the `Flow` fixture type with an optional
    `change: 'new' | 'edited' | 'deleted'` field and mark a small subset of `FLOWS` with it, so
    the Send control and `PublishSheet` have non-empty fixture data to render. `FlowList` rows
    continue to render only `lastResult` via `StatusDot` and do not yet surface `change` — that
    lands with the sidebar folder-tree spec (§8.5 point 2).

### Non-negotiables carried forward

21. The system shall make no call to `window.conductor` and import nothing from `node:*`.
22. `npm run lint`, `npm run typecheck` and `npm test` shall pass, with no `any`, no
    `biome-ignore`, and no new barrel file.

---

## Constraints

- **No hardcoded design values** beyond what `CReview.jsx` itself hardcodes. Every colour,
  radius, duration, easing and weight comes from a token; the pixel literals this spec is allowed
  to write are the ones the reference file itself uses for layout math, not for anything a token
  already covers: `520` (sheet width), `32` (scrim padding), `30` (icon-badge box),
  `28` (control height), `16` (count-badge min-width/height), `15` (row leading-icon column),
  `12` / `11` / `9` / `6` (assorted gaps and paddings the reference hardcodes off the `--space-*`
  scale).
- **CSS Modules only.** Unlike the device mirror, nothing in this spec needs a runtime-computed
  inline style — no `style={{...}}` objects.
- **English chrome, taken verbatim from `CReview.jsx`.** Its copy (`Send changes`,
  `Everything sent`, `Waiting for review`, `Send for review`, `View on GitHub`, `Not yet`,
  `Done`) is the binding microcopy, not a translation of §8.5's Portuguese gloss — see
  *Decisions*.
- **Layer discipline**, as in `specs/aurora-layout-shell.md`: `components/` take props and
  callbacks and touch no store; `stores/` hold state and actions; `views/` compose and select
  narrowly (`useUiStore(s => s.sendPhase)`, not the whole store).
- **Fixture-only.** The sending → review delay is a short fixed local timeout (mirroring the
  reference's own `1500ms`), asserted with fake timers — nothing awaits a real network call
  because there isn't one.
- No change to `shared/ipc.ts`, no new IPC channel, no preload function.

## Out of scope

- **The Flows sidebar's flat-list → folder-tree conversion**, and the per-row "changed, not yet
  published" marker (§8.5 point 2). A separate, comparably-sized spec — the marker's exact
  treatment (distinct from `StatusDot`) is defined by whatever reference the tree work reads, not
  by this one.
- **Real publish mechanics.** `PublishService`, `RepoService`, `GhService`, the `gh pr create`
  flow, the AI title/description skill (§8.3, §8.4, §9.2 main process) — every control this spec
  builds renders and transitions on fixture state only; none of it calls anything real. That is
  its own future spec, same as `RunPanel` wiring to Maestro is `specs/flow-run-execution.md`'s.
- **The note textarea's content is never persisted or sent anywhere** — local component state,
  discarded when the sheet closes, mirroring the Composer draft precedent in
  `specs/aurora-layout-shell.md`.
- **The document tab strip** the updated design-system mock now draws. This session's explicit
  decision is to keep one open document and no tab strip, unchanged from
  `specs/aurora-layout-shell.md`.
- **The "ver detalhes técnicos" raw-diff expansion** §8.5's prose mentions. The concrete
  reference (`CReview.jsx`) does not design or implement any such control, so there is nothing to
  build from — flagged here rather than invented.
- Any change to `RunPanel`, `AIPanel`, `DeviceMirror`, or the Run/Stop button.
- E2E / Playwright, per `AGENTS.md` § Testing.

## Decisions & assumptions

- **Vocabulary: "Send", not "Publish".** §8.5's Portuguese gloss says "Publicar"; the concrete,
  deliberately-authored reference (`CReview.jsx`, whose header comment explains the word choice
  at length) says "Send" throughout and never "publish". The design system doc is the binding
  content register (per `specs/aurora-layout-shell.md`'s own precedent, and the engineer's
  instruction to follow the updated doc), and the shipped Toolbar already diverged from a literal
  §8.2 translation once (`saved to suite` → `saved on this Mac`) — so this spec follows
  `CReview.jsx`'s copy verbatim. The view folder is still named `PublishSheet`, matching the name
  `.context.md` §9.2 and `AGENTS.md` reserve for it at the architecture level; the code-level name
  and the on-screen copy are allowed to differ, the same way `Toolbar.tsx` isn't named `SaveBar`.
- **Where the control lives in code.** Inline in `Toolbar.tsx`, not a new component folder —
  matching how the environment chip and Run button are already built there. Its three branches
  are enough logic to warrant a small extracted render function inside the file, not a new file.
- **Fixture state design.** `ui.store.ts` seeds a mutable copy of the fixture's changed flows at
  store creation (mirroring how `specs/aurora-layout-shell.md` seeded `running` / `steps` /
  `thread` from `fixtures/flows.ts` rather than reading the fixture module directly from views),
  so sending can clear markers without mutating the `FLOWS` constant itself.
- **Real state transitions, unlike Run/Stop.** `specs/aurora-layout-shell.md` left Run/Stop fully
  inert because no run report exists yet to transition through. The Send control gets a real
  (fixture-driven) `idle → sending → review` transition on a short timeout, because `CReview.jsx`
  demonstrates exactly that transition and there is enough fixture depth here to make it
  meaningful to build and test.
- **The `review` phase's `+<n>` badge (criterion 7)** is only reachable by seeding new `change`
  markers after a send has already completed — not by any sequence a person can click through in
  this fixture. Proven by seeding the store directly in a test, the same way
  `specs/aurora-layout-shell.md` proved its own otherwise-unreachable branches (its criteria 12,
  27, 31–33).
- **Existing uncommitted edits are this spec's baseline**, per the engineer's decision: the
  already-rehued tokens, `Icon.tsx`'s dropped `download` glyph, and `Toolbar.tsx`'s already-gone
  Save button are kept as-is and carried into this worktree verbatim from the main checkout's
  working tree (not from any commit — they aren't committed anywhere yet). This spec's job is to
  verify them (criteria 1–2) and build the parts they didn't cover.
- **`docs/Conductor Design System/` is tracked in git**, unlike when `specs/aurora-layout-shell.md`
  was written (when it was untracked entirely). Its latest edits are still uncommitted in the
  main checkout, though, so this worktree's copy was synced from that uncommitted state directly
  (not from a commit). Committing the design-system doc update on `main` is the engineer's call,
  independent of this spec.
- (Assumed) **Fixture content for the changed flows** — which of the seven `FLOWS` get marked
  `new` / `edited` / `deleted`, and the reviewer's name / "sent at" string — is chosen freely
  since no source pins it beyond `CReview.jsx`'s own placeholders (`window.REVIEWER.name`,
  "sent 2 min ago"). Using a small, plausible mix (e.g. one new, one edited) is enough to
  exercise every criterion above.

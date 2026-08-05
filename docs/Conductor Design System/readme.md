# Conductor Design System

Conductor is an internal desktop tool for one team: it lets **non-technical people author
end-to-end tests for the team's Android app by clicking a live phone mirror**. Under the hood it
drives the [Maestro](https://maestro.mobile.dev) CLI, so every action a user can take in the UI is
a real Maestro command, and the artifact it produces is a plain `.yaml` flow file.

It ships as an **Electron** app. One window, four regions:

1. **Device mirror** (left) — a live, interactive Android screen. Hovering reads the
   accessibility tree; right-clicking an element opens a menu of Maestro commands.
2. **Flow editor** (centre) — the `.yaml` that the user's clicks produced, syntax-highlighted.
3. **Assistant** (right) — an AI column that writes steps from plain-language requests, so a user
   never has to touch the mirror or the YAML if they'd rather describe the test.
4. **Logs** (bottom, docked under the editor) — how each run behaved, step by step, with the raw
   CLI error text on failures.

There is no project/file-tree region. Flows are reached from the editor's tab strip, or from the
test library — a `TestList` sheet opened by the titlebar flow chip, `⌘P`, or *Run All Tests*.

The visual brief is explicit: **Apple's Liquid Glass** structure — translucent layers, real
backdrop blur, specular hairline edges, damped motion, light and dark themes of equal quality.
The system ships **one direction in two themes: Aurora light and Aurora dark** — an ambient wash
of coloured light with white (or, at night, white-at-low-alpha) frost floating on it. Deliberately
*not* the generic flat chrome of Maestro Studio.

---

## Sources

| Source | What it gave us | Access |
| --- | --- | --- |
| `uploads/Screenshot 2026-07-28 at 12.31.09.png` | The reference layout: device column, YAML tab, Local/Cloud + Run Test / Run All Tests run bar, log rows with `[INSTALL_APP]` error detail, right-hand project file tree, and the app under test (`Pedidos pendentes` order list). | In this project |
| Product brief (chat) | Electron, Android-only for now, Accessibility Tree driven right-click actions, Maestro CLI underneath, AI chat column, light + dark themes, Liquid Glass direction. | Conversation |
| Maestro CLI command vocabulary | The command names used verbatim in menus and generated YAML (`tapOn`, `inputText`, `assertVisible`, `launchApp`, `clearState`, …). | Public docs |
| Layout reference (`uploads/conductor-1.png`) | The Aurora layout: flows column, editor card with a Run pill, Run/Assistant tabs under it, floating composer, phone on the wash. | In this project |
| **The logo** (`assets/logo.png`) | The whole palette: a hexagon whose stroke runs mint (`#91f0bc`) to cyan (`#06d2cf`), a white play triangle, three cyan speed lines, on a near-black ground lit blue (`#2c7099`) in one corner and teal (`#027275`) in the other. Every ramp in `tokens/palette.css` is sampled from it. | In this project |

**No codebase or Figma file was provided.** The layout values in `tokens/` were authored for this
system from the screenshot's proportions and the Liquid Glass brief; the colour is not authored —
it is read off the logo. Two consequences worth flagging:

- **The logo is a raster.** `assets/logo.png` is 1254×1254 with the dark ground baked in. It works
  as an app icon and as the splash mark, but there is no vector, no monochrome lockup, and no
  transparent version — **if the team has the source file, send it.** The wordmark beside it is the
  name *Conductor* in Manrope 800 at −0.05em, filled with `--grad-aurora` on brand surfaces and
  flat `--text-emphasis` in UI chrome. See `guidelines/brand-wordmark.html`.
- **The fonts are substitutes.** See *Typography* below.

---

## Index

| Path | What's there |
| --- | --- |
| `styles.css` | The single entry point consumers link. `@import` list only. |
| `tokens/` | `fonts` · `palette` (ramps sampled from the logo) · `typography` · `spacing` · `radius` · `elevation` · `motion` · `theme-aurora` · `theme-aurora-dark` |
| `utilities/` | `base.css` (resets, links, scrollbars, `kbd`), `glass.css` (`.cd-glass-1/2/3`, `.cd-sunken`, `.cd-sheen`, `.cd-wash`), `animation.css` (all keyframes components need) |
| `components/core/` | Icon · Button · IconButton · Input · Select · Checkbox · Switch · Badge · StatusDot · Kbd · SegmentedControl · Tooltip |
| `components/surface/` | GlassPanel · PanelHeader · Toolbar · TabStrip · Divider · ContextMenu · Dialog · EmptyState |
| `components/studio/` | TitleBar · DeviceSelector · DeviceMirror · YamlEditor · TestList · FileTree · RunBar · LogStream · ChatMessage · ChatComposer |
| `ui_kits/conductor-c-aurora/` | **Conductor Studio.** The layout — the full interactive window, in both themes. |
| `guidelines/` | Specimen cards — colours, type, spacing, glass, motion, brand. |
| `assets/icons/` | 78 vendored Lucide SVGs. |
| `SKILL.md` | Agent-skill wrapper so this folder works inside Claude Code. |

### Components

**Core** — `Icon`, `Button`, `IconButton`, `Input`, `Select`, `Checkbox`, `Switch`, `Badge`,
`StatusDot`, `Kbd`, `SegmentedControl`, `Tooltip`.

**Surface** — `GlassPanel`, `PanelHeader`, `Toolbar`, `TabStrip`, `Divider`, `ContextMenu`,
`Dialog`, `EmptyState`.

**Studio** — `TitleBar`, `DeviceSelector`, `DeviceMirror`, `YamlEditor`, `TestList`, `FileTree`,
`RunBar`, `LogStream`, `ChatMessage`, `ChatComposer`.

`TestList` is the project's test suite — the metadata that decides which flow you open (last
result, step count, when it last ran, duration), not a filesystem tree. It belongs in a sheet or
dialog, never as a permanent column: managing the suite is an occasional mode, authoring one flow
is constant.

Every component has a sibling `.d.ts` (props contract) and `.prompt.md` (what & when, usage
example, variants). Read the `.prompt.md` before using a component — the rules there are not
guessable from the props.

**Intentional additions.** No source defined a component inventory, so the set above was authored
from the product surface itself. Three entries deserve a note: `Icon` exists as a wrapper so the
Lucide glyph set is never pasted as raw SVG; `StatusDot` exists because run state appears in five
different places and must look identical in all of them; `Kbd` exists because Conductor is
keyboard-first and shortcuts are shown, never hidden.

---

## CONTENT FUNDAMENTALS

Conductor's audience is a **QA analyst or product person who does not write code**. The copy's
whole job is to keep that person confident. It is plain, short, and never performatively technical
— except where a string is literally a Maestro token, in which case it is exact.

**Two registers, strictly separated.**

1. **Machine register** — anything the CLI reads or writes is reproduced verbatim, in mono type:
   `tapOn`, `clearState: true`, `com.example.app`, `R9QYC01EMXL`, `[INSTALL_APP] Failed to launch
   app com.example.app: Package com.example.app is not installed`. Never paraphrase, never
   sentence-case, never translate. Command names appear in menus exactly as they appear in YAML —
   that's how a non-technical user learns the vocabulary by osmosis.
2. **Human register** — everything Conductor says in its own voice. Sentence case, no jargon, no
   period on labels, one idea per line.
   - Step description: `Launch app "com.example.app" with clear state`
   - Empty state: `No runs yet` / `Press Run Test and every step will report here as it executes on the device.`
   - Dialog: `Devices` / `Conductor talks to Android over adb. Plug in a phone or start an emulator.`
   - Flag hint: `Wipes app data before launchApp`

**Person.** Conductor speaks as *I* only in the assistant column, and it is specific about what it
did: “I matched a text node in the first order card. This taps it by visible text.” Elsewhere the
product is impersonal — buttons are verbs (`Run Test`, `Clear history`, `Insert into flow`),
never “Let's…”, never “Your test”.

**Casing.** Sentence case everywhere. Title Case only for product-level proper nouns:
`Run Test`, `Run All Tests`, `Clear history`, `Conductor`. UPPERCASE is reserved for panel titles
(`FLOW`, `LOGS`, `CONDUCTOR`, `PROJECT`) at 11px/600 with 0.09em tracking — nothing else in the
product is ever uppercase.

**Portuguese and English.** The chrome is English (the team's tooling language). Content that
belongs to the app under test stays in its own language, untranslated: `Pedidos pendentes`,
`Preparar até 3:30 PM`, `Entrega · FedEx`, `4 produtos · 9 unidades`. Selectors and assertions
quote that text exactly, so translating it would break the test.

**Numbers and time.** Durations are `m:ss` (`0:04`). Timestamps read as the CLI prints them
(`Jul 28, 12:29 pm`). Counts are bare and mono (`4 steps`, `11`, `9 nodes`).

**Errors.** Two lines, never one. First the human sentence naming what Conductor tried
(`Launch app "com.example.app" with clear state`), then the raw CLI output underneath in mono
coral. Never a code, never “Something went wrong”, never an apology.

**Never used.** Emoji — anywhere, in any surface. Exclamation marks. “Oops”. “Simply”, “just”,
“easily”. Marketing adjectives. Loading copy that jokes. Personified AI (“I'm thinking…” is fine;
“Let me put my thinking cap on” is not — the real string is `Reading the accessibility tree…`).

---

## VISUAL FOUNDATIONS

### Reading as macOS, not as Apple-ish

Conductor is an Electron window on someone's Mac, so it follows AppKit's actual conventions rather
than a general impression of Apple design. The ones that do the work:

- **The system font.** `--font-ui` starts with `-apple-system`, which resolves to real **SF Pro** on
  a Mac — the face every native window is set in, and the cheapest possible win. Manrope follows as
  the cross-platform fallback and stays the display face. `--font-mono` resolves to **SF Mono**.
- **Two materials, not one.** A macOS window is not uniformly translucent: chrome is *vibrant*
  (`--material-vibrant`, saturation 210%, the desktop visible through it) and content is
  *near-opaque* (`--material-content`) so text has a still background. `GlassPanel` takes
  `material="vibrant" | "content"`. Getting this wrong is the single biggest tell.
- **0.5px hairlines.** `--border-hair` is half a pixel — crisp on Retina, softening to a light 1px
  elsewhere. AppKit separators are hairlines, never 1px rules.
- **A 3px focus halo,** not a ring plus a bloom: `--glow-accent` is one soft accent halo at ~42%.
- **Traffic lights that are dim until you hover the window,** then colourise and reveal their
  ×, −, + glyphs — a detail people notice without being able to name it.
- **A 52px unified titlebar** (macOS 11+ merges titlebar and toolbar) with the document's identity
  centred in it.
- **Solid accent fills on menu highlights** — AppKit turns the whole row accent and the label white,
  it does not tint.
- **A raised puck on a recessed track** for segmented controls.
- **Sheets drop out of the titlebar** rather than fading in centred, and are square along their top
  edge because they are attached to the window.
- **Overlay scrollbars:** no track, thin thumb, invisible until the area is hovered.
- **6px controls, 10px cards, 12px window** — Big Sur's radii, not arbitrary roundness.

### The core idea

Every surface is **glass over a tinted wash**. Depth is communicated by *blur radius first* and
shadow second — a floating menu blurs 40px, a panel blurs 12px, and that difference is what the
eye reads as distance. Remove the blur and the whole system collapses into flat cards.

Three glass depths, one recess:

| Layer | Fill (dark) | Blur | Border | Use |
| --- | --- | --- | --- | --- |
| **L1** `--glass-1` | white 4.5% | 12px | `--edge-1` | Layout regions: mirror bay, editor, logs, chat |
| **L2** `--glass-2` | white 7% | 22px | `--edge-2` | Cards and controls sitting on a region |
| **L3** `--glass-3` | ink-800 at 72% | 40px | `--edge-2` | Menus, tooltips, popovers |
| **Sunken** `--glass-sunken` | black 22% | — | `--edge-sunken` | Content wells: editor body, inputs, log stream, segmented tracks |

The rule that makes it read as glass: **every raised surface carries `--shadow-inset-top`** — a
1px white specular line along its top edge. Panels wider than ~320px add `.cd-sheen` /
`sheen`, a 1px diagonal gradient rim. Sunken surfaces get the inverse (`--shadow-inset-sunken`)
and never get a specular top.

Saturation is lifted on every glass layer (`saturate(180%)`) so the wash behind it stays colourful
through the frost instead of going grey.

### Backgrounds

No photography, no illustration, no repeating texture, no noise/grain. The window background is
`--bg-window` plus **`--bg-wash`**: four soft radial fields — sky top-right, lavender top-left,
warm haze bottom-left, teal bottom-right. In dark they keep their hues and only drop in lightness,
because a flat near-black would leave the backdrop blur with nothing to refract. It is never loud
enough to be perceived as a gradient background. Apply it with `.cd-wash` on the app root.

This is the only gradient in the system. **Buttons, panels, badges and text are never
gradient-filled.** Full-bleed imagery does not appear anywhere; the closest thing is the device
mirror, which shows the real app.

### Colour vibe

**The palette comes off the logo.** The mark is a mint-to-cyan hexagon on a near-black ground lit
blue in one corner and teal in the other, and that is the whole system: cyan acts, blue speaks for
the assistant, mint is paint, and the ground is the ink ramp. The window background is four soft
radial fields — sky, blue, cyan, and a cool vertical fall — with frost floating on it. The ramps
are consequently all slightly blue; nothing in the chrome is truly grey.

- **Cyan — `--accent`.** Hue 196–200, the lower half of the mark: primary action, focus,
  selection, active state, links, and the element highlight in the mirror. The only colour that
  means *"this does something."* Light uses `--cyan-500`, held down to 47% lightness so white
  text on a filled button clears AA; dark moves up to `--cyan-300`, the mark's own cyan, because
  the light value disappears into the night wash.
- **Blue — `--ai`.** Hue 255–259, the light behind the mark: the assistant's byline, the focus
  ring on the composer, the wash on YAML lines it authored, `Button variant="ai"`. Family to cyan,
  so it reads as related, but it never fills a button that performs work.
- **Mint — paint, never a signal.** Hue 158–165, the top of the mark. It appears in
  `--grad-aurora` and nowhere else in the chrome: a mint fill next to a cyan button would read as
  a second accent, and next to a green pass dot it would read as a state.
- **Cool ink.** The 15-step neutral ramp sits at hue 240 — the logo's ground — with chroma rising
  toward the dark end, so text and chrome belong to the wash rather than sitting on top of it.
- **One gradient, one job.** `--grad-aurora` runs mint → cyan at 135°, the same run as the
  hexagon's stroke. Brand-surface only — wordmark, app icon, splash. Buttons, panels, badges and
  text are never gradient-filled.

Run states: green pass, red fail, amber running, ink idle — each with a `-quiet` translucent fill
and a `-edge` hairline. **Pass is a true green, not the brand's mint or cyan** — the accent means
"this does something" and pass means "this worked", and the two must never be confused. **Every
flat signal sits at least 30° from its neighbour in oklch hue** — red 22, amber 62, green 146,
cyan 200, blue 259 — so no two states can be confused, and none of them can be mistaken for the
accent.

Imagery colour vibe, for the record: there is no imagery. Screenshots of the device are shown
as-is, unfiltered, never tinted.

### Typography

- **SF Pro** (via `-apple-system`) — the whole UI. Manrope is the fallback off-Mac, and the display
  face everywhere, where its tighter geometry does more for the brand than SF's neutrality.
- **SF Mono** (JetBrains Mono off-Mac) — YAML, logs, device serials, durations, key hints.

> **⚠️ Font notes.** `--font-ui` and `--font-mono` now lead with the *system* stack, so on the
> team's Macs the UI is set in real **SF Pro** and code in **SF Mono** — no substitution, no
> license problem, and exactly what a native window looks like. Manrope and JetBrains Mono are the
> cross-platform fallbacks, and Manrope remains the display face.
>
> **VTEX Trust** is still missing: VTEX's custom family is not publicly licensed. **If the team has
> it, send the files** — it would replace `--font-display` in one line. Note VTEX uses only Trust's
> Regular weight, so that swap also needs a decision about what carries the 600/700/800 weights
> this UI relies on.

Scale: 11 · 12 · 13 · 14 · 16 · 19 · 23 · 28 · 34 · 44 (≈1.20 ratio). **Base is 13px** — this is
a dense desktop tool, not a webpage. Nothing in the chrome goes below 11px, and 11px is mono or
uppercase-label only. Tracking tightens as size grows (−0.006em body → −0.028em display) and the
one place it opens up is the uppercase panel label (+0.09em). Line height: 1.5 body, 1.3 titles,
1.55 code.

Text colour is a four-step ladder — primary / secondary / tertiary / disabled — and the ladder is
the only way hierarchy is expressed in type colour. Never tint body copy with the accent.

### Spacing and layout

4px base with a 2px half-step for hairline-tight chrome. Panel padding is **12px**, panel gap
**8px** — deliberately dense; 24px paddings belong to marketing pages, not to a tool where the
mirror, the code, the chat and the logs must be visible simultaneously.

The window is a **fixed frame, not a fluid layout**: titlebar 38px; mirror column ~340px; editor
fluid; assistant 372px; logs docked at 232px, collapsing to 40px. Rows are 28px (dense lists) or
34px (log entries). Controls are 30px or 36px tall.

It is not responsive in the web sense, but it never clips either. **Regions degrade in priority
order** at a few window-width breakpoints: the assistant folds away first (its work can wait),
then the mirror narrows a step at a time, and the logs stay collapsible by hand at any width. A
toggle whose region cannot fit disables itself and says why in a tooltip — it never silently does
nothing. Each UI kit's README lists its breakpoints.

The titlebar centre carries the **open flow's name**, not a filesystem path: it is the document
identity, the way a native titlebar works.

### Radii

5 · 7 · 10 · 14 · 18 · 24, plus 30 for the device bezel and `999px` for pills and dots.
**Concentric rule: a nested element's radius = parent radius − its inset.** A 10px control inside
a 14px panel with 4px padding is correct; a 14px control inside a 14px panel is not.

Cards, concretely: `--radius-lg` (14px) for regions and `--radius-md` (10px) for cards; a
translucent fill; a 1px hairline (`--edge-1` at L1, `--edge-2` at L2); the specular inset; and a
soft wide shadow (`--shadow-1` at L2, `--shadow-3` when floating). No card in Conductor has a
coloured left border, and no card has a heavy 2px outline.

### Borders, shadows, scrims

One hairline weight — 1px — in four strengths (`--edge-1` 9% → `--edge-strong` 22% white; plus
`--edge-sunken`, a *black* hairline for wells). Importance is expressed with spacing and fill,
never with a thicker rule. The only 1.5px stroke in the system is the mirror's element highlight.

Shadows are soft, wide and low-opacity, always two-layer (a tight contact shadow plus a broad
ambient one). `--shadow-3` reaches 56px of blur at 32% — big and diffuse, never a hard drop.
Focus does not use an outline ring: it uses **`--glow-accent`** (a violet ring plus a soft bloom),
or **`--glow-ai`** — the blue equivalent — in assistant surfaces.

`--scrim-top` / `--scrim-bottom` are the protection gradients for text over the mirror or the
wash. Capsules (a small `--glass-3` chip behind the text) are preferred for short labels; scrims
are for edges of scrolling content.

### Transparency and blur — when

Blur when a surface **overlaps content that must stay legible underneath**: every panel over the
wash, every floating layer, the paused-mirror scrim, the dialog scrim. Do **not** blur inside a
scrolling list, on individual rows, or on anything that repeats more than ~20 times — it is
expensive and it muddies text. Row hover/selection uses a flat translucent fill
(`--glass-hover`, `--glass-selected`), no blur.

### Motion

Fluid and damped: glass is heavy. `--ease-glass` (0.32, 0.72, 0, 1) for panels, knobs and layer
entrances; `--ease-out` for hover and fades; `--ease-spring` — the only overshoot in the system —
exists solely for popovers opening. Durations 80 / 140 / 220 / 340 / 600ms.

- **Hover** — background lightens one glass step and border goes one edge step stronger; text
  moves secondary → primary. 140ms. Never a scale, never a translate.
- **Press** — `scale(0.975)` (`--press-scale-lg` 0.99 for large panels), 80ms. That's the only
  transform a click produces.
- **Selected** — accent text + `--accent-quiet` fill, no animation.
- **Appear** — menus `cd-menu-in` (scale 0.96 → 1 with the spring), dialogs `cd-dialog-in`
  (slide 8px + scale 0.97 on `--ease-glass`), tooltips fade only.
- **Ongoing** — `cd-spin` for spinners, `cd-pulse` for live status dots, `cd-caret` for the editor
  caret. Nothing else loops.
- `prefers-reduced-motion` zeroes every duration and the press scale.

### Themes

Two themes, one direction: **Aurora light** (`:root`, or `data-theme="aurora"`) and **Aurora dark**
(`data-theme="aurora-dark"`). Components read semantic tokens only, so nothing in `components/`
needs a theme branch.

Dark is not the light theme inverted — the mapping changes:

- The wash keeps its four colour fields and only drops in lightness. A flat near-black would kill
  the backdrop blur, which is the whole direction.
- **Frost becomes white at low alpha (6–13%), never black.** A dark panel over a dark wash reads
  as a hole; panels must stay lighter than what is behind them, exactly as in light.
- The specular top edge becomes the main depth cue, since shadows barely read on dark. Every
  panel and pill carries `--shadow-inset-top`.
- Accent and the semantic hues move up in lightness to hold contrast against the wash.

Layout tokens are shared by both: `--a-chrome` / `--a-well` / `--a-panel` / `--a-content` are the
two frost levels plus the well, `--a-hair` the near-invisible hairline, and
`--a-radius-region` (18) / `--a-radius-surface` (12) the two radii. **Frost is never nested inside
frost** — that is what turns glass muddy.

One thing does **not** follow the theme: the device mirror's own chrome (bezel, status bar, nav
bar). A mirrored phone is a photograph of hardware, and hardware does not repaint when the tool
switches modes — `DeviceMirror` takes a separate `deviceTheme` prop for that.

---

## ICONOGRAPHY

**Lucide v0.577.0 (ISC), vendored.** 78 glyphs live in `assets/icons/*.svg` as real files; the
same path data is inlined in `components/core/Icon.jsx` so `<Icon>` renders inline SVG that takes
`currentColor` — no CDN at runtime, no icon font, no sprite sheet.

> **⚠️ Icon substitution.** No icon set was supplied. The reference screenshot uses a thin
> outline set consistent with Lucide, so Lucide was adopted as the closest match at Conductor's
> stroke weight. If the team has its own glyph set, drop the SVGs in `assets/icons/` and
> regenerate the map in `Icon.jsx`.

- **Style** — outline only, 24×24 viewBox, round caps and joins, **stroke 1.75** (Lucide ships
  2.0; Conductor lightens it so glyphs sit correctly beside Manrope). Never filled, never
  duotone, never two weights in one view.
- **Sizes** — 14 in dense rows and log entries · 16 in buttons and menu items · 18 in toolbars
  and the titlebar · 20–24 in empty states. Icons inherit text colour by default; only state
  icons take a `--state-*` colour.
- **Command mapping** — `ACTION_ICONS` in `Icon.jsx` maps every Maestro command to one glyph
  (`tapOn` → `mouse-pointer-click`, `inputText` → `text-cursor-input`, `assertVisible` → `eye`,
  `clearState` → `trash-2`, `runFlow` → `git-branch`, …). Menus, generated step rows and log rows
  all read from that map, so one command never appears with two different glyphs.
- **Reserved glyphs** — `sparkles` is AI and nothing else. `crosshair` is element inspection and
  nothing else.
- **No emoji, ever.** No unicode pictographs as icons. The only non-Latin characters used as
  glyphs are keyboard symbols inside `Kbd` (`⌘ ⇧ ↵ ⌥`), which are typographic, not decorative.
- **Android nav bar** in the mirror is drawn from vendored glyphs plus two 1.6px-stroke primitive
  shapes (circle, square) — matching the platform, not invented.

---

## Using this system

```html
<link rel="stylesheet" href="styles.css">
<script src="_ds_bundle.js"></script>
```

```jsx
const { GlassPanel, PanelHeader, Button, YamlEditor } = window.ConductorDesignSystem_527814;
```

Aurora light is `:root`, so a page with no `data-theme` is already correct; set
`data-theme="aurora-dark"` on `<html>` for dark. Put `class="cd-wash"` on the app root (or paint
`var(--bg-wash), var(--bg-window)` yourself) so the glass has something to refract.
`utilities/animation.css` (already imported by `styles.css`) carries every keyframe the components
reference.

---

## The layout

`ui_kits/conductor-c-aurora/` is Conductor's window: a flows column, the editor with the
conversation and run report under it, and the device mirror on the right — no title bar, every
region a frosted panel on the ambient wash. The phone is the one opaque object, floating on the
wash rather than sitting in a panel. See that folder's README for breakpoints and the reasoning.

The earlier directions (the Firefox-palette glass layouts, and the matte Graphite theme) have been
removed; Aurora light and Aurora dark are the system.

# Conductor Studio — macOS liquid glass

Conductor Studio as a macOS app: one window on a quiet desktop, a unified toolbar, and three
adjacent panes — sidebar (flows) · working area (editor + assistant) · inspector (device).
Aurora light and Aurora dark are the design system's two themes.

## What changed from the previous pass

The earlier version read as a 2000s Flash site: saturated aurora gradients that *moved*, every
region a floating card with a hue-shifting gradient rim, 18px radii, its own blur and its own
shadow. That is glass-as-decoration. This pass is glass-as-material, the way macOS uses it:

| before | now |
| --- | --- |
| animated 4-colour wash, chroma .08 | static wallpaper, chroma ≤ .03 |
| floating cards on the wash, 18px radii | one window, panes divided by hairlines, 14/10/7/6 radii |
| gradient rim on every panel | hairlines + one white specular line at the top of the window |
| blur per panel (nested frost) | one blur, at the window |
| pill controls loose on the wash | system-sized 26–28px controls, radius 6 |

## The theme

`tokens/theme-aurora.css` is `:root` (and `[data-theme="aurora"]`), so it is the default, and
it is a full theme scope — every component works in it unchanged.

- **Desktop, not a light show.** `--bg-wash` is a static, desaturated wallpaper. Colour comes
  from content: the accent on the primary action and the sidebar selection, plus the semantic
  state hues. Nothing animates.
- **One blur.** The window carries `blur(var(--a-blur)) saturate(var(--a-saturate))`
  (42px / 180%). Panes are alpha fills over it, never their own frost:
  - `--a-chrome` toolbar · `--a-panel` sidebar and inspector (translucent — vibrancy) ·
    `--a-content` working area (near-opaque, so code and chat text sit still) ·
    `--a-well` recessed fields and segmented controls.
- **Edges.** `.a-rim` on the window only: a white specular line along the top fading out by a
  third of the way down, then the faintest ink hairline round the rest. Inside the window,
  separation is a 1px `--a-hair` divider — never a shadow, never a gradient.
- **Radii** `--a-radius-window` 14 · `region` 10 · `surface` 7 · `field` 6. Small and
  system-like; large radii on inner panels read as web cards.
- The phone is the one physical object in the window and keeps its own `drop-shadow`.

## Dark

`tokens/theme-aurora-dark.css`, `data-theme="aurora-dark"` — the moon button in the toolbar
switches it and the choice persists. Not the light theme inverted:

- The desktop drops in lightness but keeps a trace of hue; flat near-black would kill the
  backdrop blur.
- Sidebar and inspector frost is **white at low alpha** (5–7%) — a dark panel over a dark
  window reads as a hole. The working area is a tinted near-opaque graphite instead.
- The specular top edge is the main depth cue, since shadows barely read on dark.
- Accent moves up to periwinkle and the semantic hues brighten with it.

## Structure

- **Unified toolbar** (52px): traffic lights, sidebar toggle, document title with a quiet
  subtitle, then env, the filled primary **Run**, appearance and Save. Run state is a 2px
  accent line under the toolbar plus a dot on the Run segment. The Doctor badge sits left of
  env: an amber count while anything needs the user, a quiet icon button once nothing does.
- **Sidebar**: 38px header, search field, flow rows (selection = accent fill, macOS style), and
  a bottom action bar — persistent actions belong on a bar, not on a floating pill.
- **Working area**: document tabs, the YAML editor, a **segmented control** for Run /
  Assistant, the panel, and the composer on a hairline-topped footer.
- **Inspector**: device header + the phone, same vibrancy as the sidebar.

Widths: sidebar 268 (floor 200) · working area flex (floor 260) · inspector mirror + 40 (floor
168). ≥1120 everything visible; below that the sidebar collapses (⌘B forces it back at any
width). ⌘J flips the lower panel between Run and Assistant.

**Every pane shrinks, and its header shrinks with it.** Because the toggles win at any width,
every pane needs an explicit `gridTemplateColumns: minmax(0, 1fr)` — an implicit grid track
resolves to min-content and overflows the column it was given. The device header degrades in
priority order: the serial truncates, then the DEVICE label goes, then reload and screenshot
go. Inspect always survives — it is the mode the whole window is in.

## Doctor

Doctor is two surfaces built from one dataset (`CDoctor.jsx`), split by what Conductor can
honestly do on the user's behalf.

**First run — `doctor-first-run.html`.** A 520×360 installer window on the empty desktop, before
the app exists. It handles the single dependency Conductor can install by itself: Maestro. Close
is live, minimise and zoom are dead — that is how a macOS installer window renders. One bar, one
step label (`Downloading maestro 1.39.9` → `Extracting to ~/.maestro` → `Adding maestro to PATH`
→ `Verifying installation`), a percentage, and no log: the user did not ask for this and cannot
help with it. The bar turns teal on `maestro 1.39.9 is ready`, then the window is gone.

**Continuous — `doctor.html`.** Everything else is a person's job. adb, the JDK, Xcode CLT and
`gh` are installed by hand; a GitHub login is *always* a user action, never something a tool
performs silently. So Conductor reports and steps back: a sheet that drops out from under the
toolbar, square along its top edge because it is attached to the window, grouped by who owns the
item — *Managed by Conductor* / *Android* / *Command line* / *Accounts*. Each row is a status
glyph, the name, the exact CLI string in mono (`java -version → command not found`), and one word
of state. Teal `Installed`, red `Not found`, amber `Signed out`.

**A missing dependency does not block the app.** The user gets into their flows and Doctor lives
as an amber count in the toolbar until it reads zero, at which point it becomes a plain quiet
button like any other window action. The sheet has no per-item fix or copy-command actions in
this version — deliberately. Naming the state precisely is the whole job; a `Fix` button that
shells out to Homebrew is a separate decision.

**Two readings of the same sheet.** `doctor.html` (A) groups by owner — *Managed by Conductor* /
*Android* / *Command line* / *Accounts* — four cards, every row two lines, ownership stated
before state. It reads as an inventory. `doctor-b.html` (B) leads with the verdict in a coloured
band (*2 things need you*) and then puts everything in one table ordered by who has to act:
**Needs you** above **Ready**. Healthy rows carry only a version; the full CLI string shows where
something is broken and a person actually has to read it, and ownership drops to one line under
the table. A answers "what is installed"; B answers "is there anything I have to do".

## Files

`CRegions.jsx` (sidebar, working area, inspector) · `CShell.jsx` (state, window + toolbar,
menus, dialog) · `CDoctor.jsx` (first-run installer, diagnostic sheet A, toolbar badge) ·
`CDoctorB.jsx` (diagnostic sheet B) · fixtures `data.jsx`, `AppUnderTest.jsx`,
`useInspector.jsx`.

`StudioC` takes `doctor` (open the sheet on mount) and `doctorVariant="a" | "b"`. Both sheets
read the same `DOCTOR_GROUPS`.

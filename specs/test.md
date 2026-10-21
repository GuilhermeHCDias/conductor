# Teste button and TESTEI alert

status: todo
created: 2026-10-21
type: feat
depends-on: none

## Goal

Add a giant "Teste" button to the Conductor window. Clicking it shows a giant alert reading
"TESTEI" that the user dismisses. It is a throwaway UI probe: it proves a button and an alert
render and respond in the real app. Done means the button is visible, clicking it shows the
alert, and the alert closes.

## Context

- `src/renderer/src/views/Toolbar/Toolbar.tsx` is the window's top bar. The button goes in it, on
  the right, as a self-contained element with no store changes.
- `src/renderer/src/App.tsx` is the layout shell. The alert is mounted there, on the window, next to
  `PublishSheet`, so its scrim covers the toolbar too.
- `src/renderer/src/views/PublishSheet/PublishSheet.tsx` is the existing modal sheet mounted on the
  window (scrim and panel). It is the pattern to follow for the alert's overlay: a fixed-position
  scrim and a centred panel, mounted on the window, not inside a pane.
- Conventions (`AGENTS.md`): CSS Modules next to the component, a sibling `*.test.tsx`, no
  `window.conductor` calls, no Node APIs in the renderer, tokens from `styles/tokens/`.
- Nothing in this run touches the main process, preload, IPC or Maestro.

## Acceptance criteria

- [ ] C1. When the Conductor window renders, the system shall show a button whose visible text is
  "Teste", sized at display scale (large, far bigger than the toolbar controls).
- [ ] C2. When the user clicks the "Teste" button, the system shall show an alert whose visible
  text is "TESTEI", at display scale, centred over the window.
- [ ] C3. While the alert is shown, the system shall cover the window with a scrim that blocks
  clicks on the content behind it.
- [ ] C4. When the user dismisses the alert (its close button, or the Escape key), the system shall
  hide the alert and leave the "Teste" button available to click again.
- [ ] C5. The alert shall have `role="alertdialog"` and an accessible name, and move focus to its
  dismiss control when it opens.

## Out of scope

- Any behavior beyond showing and hiding the alert: no state persisted, no IPC, no logging.
- Visual polish beyond "giant": no animation requirements, no dark-mode-specific tuning beyond
  using existing tokens.
- Removing the probe afterwards. It is a test artifact; deleting it is a separate change.

## Decisions & assumptions

- Button in the top bar (Toolbar), on the right → C1. Why: the user chose it in the questions; it
  is visible at all times and needs no pane change.
- Alert is an in-window overlay, not the native `window.alert()` → C2, C3, C5. Why: the user chose
  it; the native dialog cannot be styled to "giant", and the existing sheet pattern already covers a
  centred overlay on the window.
- Dismiss by a close control and Escape → C4. Why: standard alert behavior; Escape is already
  used by the sheets (`useWindowShortcuts`).
- `depends-on: none`. The snapshot shows no other run in progress touching `App.tsx`.

## Verification

- Run the app (`npm run dev`), click the giant "Teste" button, see "TESTEI" in the centred alert,
  dismiss it with the close control and again with Escape, and confirm the button works a second
  time.

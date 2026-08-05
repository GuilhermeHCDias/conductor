# scrcpy control socket

status: done
created: 2026-08-04

## Goal

Turn the device mirror from a picture into a surface: tap the canvas and the device receives a
touch; focus it and type, and the device receives the keystrokes; a back control sends the
device's back action. This is scrcpy's control channel, which `android-device-mirror` opened the
door for and deliberately did not build (`control=false`) — it matters because it is what makes
the panel a place to *drive* the app under test while authoring a flow, not just watch it, which
is `.context.md` §5.5's whole premise for putting a live picture in the panel at all.

## Context

- **Files this touches:**
  - `src/main/maestro/ScrcpySource.ts` — drops `control=false` from `serverCommand` (§17 of the
    mirror spec's numbering; it is the one flag there that differs from scrcpy's own default, so
    removing it *shortens* the command line rather than costing budget against the 255-char
    ceiling `MAX_COMMAND_LENGTH` guards). `Session` grows a second socket, opened and torn down
    alongside the video one.
  - `src/main/maestro/scrcpy-protocol.ts` or a new sibling module for the **control** wire — the
    outbound message encoding (touch, key, text) is a different shape from `ScrcpyParser`'s
    inbound video framing, and probably wants its own file: `scrcpy-control-protocol.ts`, pure,
    tested the same way `scrcpy-protocol.ts` already is (bytes in, bytes out, no socket, no
    device).
  - `src/main/maestro/MaestroGateway.ts` — `MirrorSession`/`MirrorHandlers` (or a sibling type)
    grows whatever surface lets a caller send a tap, a key, or text at the open session.
  - `src/main/services/device.service.ts` — forwards the new capability the same way it forwards
    `startMirror`/`stopMirror` today.
  - `src/shared/ipc.ts` — new channel(s) for sending input, validated the same way `mirror:start`
    is.
  - `src/renderer/src/views/DeviceMirror/DeviceMirror.tsx` — the canvas gets pointer and keyboard
    handlers; a back control joins the header's existing `IconButton`s (`Refresh`, `Inspect`).
  - `src/renderer/src/lib/` — a new pure module translating a canvas-space click into a
    device-pixel touch coordinate, using `mirror-fit.ts`'s own scale — **not** a new hit-test; see
    *Decisions* for why this is a different thing from the future element hit-test.
  - `src/renderer/src/hooks/useMirrorStream.ts` — read for the shape of an existing mirror-session
    hook; the new input path likely wants a sibling hook or an extension of this one.

- **Existing patterns to follow:**
  - `ScrcpySource.ts`'s `Session` class owns the video socket's whole lifecycle (open, retry past
    the forward-tunnel race, teardown) — the control socket joins the *same* session and the *same*
    `stop()`, not a session of its own. One `mirror:start` still means one scrcpy process.
  - `scrcpy-protocol.ts`'s `ScrcpyParser` is the model for the new outbound protocol module: pure,
    no I/O, exhaustively unit-testable from captured/derived bytes, its own `*ProtocolError` type
    reusing the `ErrorCode` pattern.
  - `mirror-fit.ts` is pure and already does one coordinate transform (device size → rendered
    size, by `scale`); the new module does the *inverse* (rendered click → device pixel) and
    should sit right beside it in `lib/`.
  - The header's `IconButton` (`Refresh`, `Inspect`) is the existing pattern for a small control in
    `DeviceMirror`'s chrome — a `Back` control follows the same shape.

- **Local reference material:** scrcpy 3.3.4 is installed on this machine (`/opt/homebrew/Cellar/scrcpy/3.3.4`,
  `scrcpy --help`), matching the pinned jar's version exactly. Its own client speaks this exact
  protocol and is the reference implementation to check behavior against on hardware. `scrcpy
  --help` confirms the client supports three input-delivery modes — `sdk` (Android system API,
  the classic per-message `INJECT_KEYCODE` / `INJECT_TEXT` / `INJECT_TOUCH_EVENT` control
  messages), `uhid` (simulated HID device via the Linux UHID kernel module) and `aoa` (Android Open
  Accessory, for `--otg`). **This spec is `sdk` mode** — the other two solve problems Conductor
  does not have (no adb, or OS-level device emulation) and would add a second class of
  device-side permission/setup this spec does not need.
  - ⚠️ **The exact byte layout of each control message is not pinned in this spec.** The same
    discipline the mirror spec used applies: read it out of the installed `scrcpy-server` for this
    exact pinned version (3.3.4) and confirm on the connected hardware during implementation,
    not from memory — the mirror spec's own criterion 15/17a traps (the version string, the
    255-char ceiling) were caught exactly that way and would not have been caught by assuming a
    remembered format.

- **Product & decision docs:** `.context.md` §5.5 (the product loop this unlocks), §4.4 (why the
  mirror exists at all). No PRD beyond `.context.md`; no Figma for this — the interaction is
  "click and type on the existing mirror," not a new visual surface.

- **Tests:** Vitest, both projects. The new control-protocol module is pure and gets
  `scrcpy-protocol.ts`-grade unit tests (message encoding from known inputs). The coordinate
  translation is pure and gets `mirror-fit.test.ts`-grade unit tests. `ScrcpySource.test.ts` grows
  cases for the second socket's lifecycle (opens with the video socket, closes with it, a control
  failure does not kill an otherwise-working picture — see criterion below). `DeviceMirror.test.tsx`
  grows cases for pointer/keyboard wiring, mocking only `window.conductor` per the established
  renderer rule. No device is needed for any of the above; a real Galaxy A07 is needed once, by a
  person, to confirm the wire format assumptions the way the mirror spec's own hardware spike did.

## Acceptance criteria

### Wire and session

1. The system shall omit `control=false` from `serverCommand`, so the server starts with control
   enabled (scrcpy's own default) — a **shorter** command line than today's, verified against
   `MAX_COMMAND_LENGTH` the same way criterion 17a already does.
2. When a mirror session starts, the system shall open a second socket to the same forwarded
   `scrcpy_<scid>` name for control, alongside the existing video socket, in whatever connection
   order the installed scrcpy-server 3.3.4 actually expects (verify against source/hardware; do
   not assume video-then-control without checking).
3. The system shall tear down the control socket whenever the video socket or the session as a
   whole is torn down (`stop()`, a device disconnect, an app quit) — one session, one lifecycle,
   never a control socket that outlives its video.
4. If the control socket fails to open while the video socket succeeds, then the system shall keep
   the picture streaming and report control as unavailable, rather than ending the whole mirror
   session over a capability the person may not need every time.

   > ⚠️ **Half of this criterion is unreachable, and trap 1 below is why.** The video handshake
   > cannot complete until the control socket connects, so "control fails to open while the video
   > socket succeeds" describes a state the server never produces: with no control connection there
   > is no codec header, hence no size and no session to report anything about — the start deadline
   > expires and it surfaces as `mirror/start-failed`. What criterion 4 does govern, and what the
   > implementation and its tests cover, is control lost **mid-session**: the socket ends under a
   > live stream, `this.control` goes back to `null`, and the picture carries on while the next
   > `send` reports the loss. Written before trap 1 was measured; kept as-is rather than rewritten,
   > because the surviving half is the behaviour that matters.
5. The system shall encode every outbound control message as a byte buffer built from an argument
   list of typed fields (never a composed string), consistent with `.context.md` §12.19's rule for
   process invocation, applied here to wire encoding.

### Tap

6. When the person clicks the mirror canvas, the system shall send the device a touch-down
   immediately followed by a touch-up at the corresponding device-pixel coordinate.
7. The system shall translate a click's canvas-space position to a device-pixel position using the
   mirror's own current scale (the same scale `mirror-fit.ts` computes for rendering), as a pure
   function with no access to the DOM, in `lib/`.
8. If a click lands outside the canvas's own drawn area (padding, letterboxing), then the system
   shall not send a touch for it.
9. The system shall clamp a translated coordinate to the stream's own bounds, so a click at the
   canvas's extreme edge cannot round outside `[0, width)` × `[0, height)` and produce a coordinate
   the device rejects or misinterprets.

### Keyboard

10. The system shall make the mirror canvas focusable, and shall route keyboard input to the
    device only while it holds focus.
11. When a printable character is typed while the canvas is focused, the system shall send it as
    text input, batching a contiguous run of characters where scrcpy's protocol allows rather than
    one message per keystroke, if that batching is available in this wire version (verify at
    implementation time; a per-keystroke fallback is acceptable if not).
12. When a non-printable key (backspace, enter, tab, arrow keys, escape, delete) is pressed while
    the canvas is focused, the system shall send it as a keycode event rather than as text.
13. The system shall prevent the browser's own default handling of a key routed to the device
    (e.g. arrow-key scroll of the panel), without intercepting keys that are not meant for the
    device — application- and OS-level shortcuts (e.g. quitting Conductor) must keep working.

### Back

14. The system shall provide a control, in the same header chrome as the existing `Refresh` and
    `Inspect` buttons, that sends the device's back action when clicked.
15. The system shall disable or hide the tap, keyboard and back controls whenever the mirror is
    not in a streaming state (no device, not yet connected, session ended) — control has no target
    to reach in any of those states.

### Errors

16. The system shall report a control-specific failure (the socket refused, the wire rejected a
    message) with its own stable error code, distinct from `mirror/device-lost` and the other
    codes `ERROR_CODES` already declares for the video path.

## Constraints

- No change to the video path's behavior, framing, or the criteria `android-device-mirror.md`
  already established — this spec only adds a second socket and outbound messages.
- Every new outbound-message type this spec implements must be exercised by a unit test built from
  bytes the implementer actually captured or derived from the pinned server version, the same
  discipline the mirror spec's `scrcpy-protocol.test.ts` already sets.
- `sandbox: true` / `contextIsolation: true` stay untouched; input still crosses the preload bridge
  as a named function, never as raw `ipcRenderer`.

## Out of scope

- **UHID and AOA input modes, and `--otg`.** `sdk` mode only, per *Context*. Nothing here needs a
  virtual HID device or a cable-only connection.
- **Multi-touch, pinch, and drag/swipe gestures.** A tap is one touch-down-then-up pair at one
  point. Scrollable lists and drag interactions are a natural next spec, not this one.

  ⏸️ **Amendment (2026-08-05): the swipe half of this landed, in place, without a spec of its
  own** (engineer's call — the change is one gesture, and the machinery this spec built took it
  whole). Dragging on the mirror now drives the device, **live**: `mirror:input` grows a `touch`
  form — one phase at a time, `down`/`move`/`up`, each carrying one point and the stream size —
  and the renderer streams the gesture as the hand draws it: touch-down on the press, a move per
  pointer sample deduped to whole device pixels, touch-up on the release, with the travel and
  the release watched at the window so a drag that leaves the panel still ends. `controlSteps`
  maps each phase to a single unpaused `INJECT_TOUCH_EVENT`; `ACTION_MOVE = 2` was read out of
  the platform `android.jar` beside the DOWN and UP already here, and a MOVE keeps full
  pressure — at zero the app under test watches a hover, not a drag. No gesture timing crosses
  the boundary and none is composed in main: the pacing Android reads the fling from is the
  hand's own arrival times, and Android's own touch slop decides what the gesture was — a still
  press its tap, a held one its long press, a travelled one its scroll. The renderer owns the
  wire's ordering invariant (`PointersState` opens a slot only on a DOWN): every drag opens with
  the down phase and always closes with an up — a cancel releases at the last point sent, a
  right-click mid-drag opens no menu, and a session teardown takes the finger down with the
  server it pressed. Multi-touch and pinch stay out of scope, and are what this entry now covers.

  The first cut replayed the gesture instead: the release crossed as one `swipe` input — both
  ends plus `durationMs` — expanded main-side into a paced DOWN/MOVEs/UP run. Replaced the same
  day, after use: the screen followed the finger only once the finger had stopped moving, which
  reads as lag on every scroll. The live phases made the replay redundant, and the `swipe` form
  left the contract with them.

  Two things deliberately did **not** land with it. A drag writes no step — the mirror's left
  button drives and does not author, and only the command menu writes (engineer's call). And when
  a `swipe` step is eventually authored, it takes the element-anchored form — `from:` over the
  synthesised selector plus `direction:` — rather than `start:`/`end:` percentages, which would
  be fragile in the same way §5.4's `point:` rung is (engineer's call, recorded here because it
  has no code to live beside yet).
- **Clipboard sync (`SET_CLIPBOARD` / `GET_CLIPBOARD`).** Not needed for tap-and-type.
- **Rotate-device requests, notification-panel expand/collapse, screen power mode.** scrcpy's
  control protocol carries these; none of them serve authoring a flow.
- **The Maestro Viewer footer control.** Handled by `device-hierarchy-capture`, not here — see
  *Decisions* for why the two specs, written to run in parallel, do not both touch it.
- **Recording, or any new screenshot capability.** Unaffected and untouched.
- **iOS.** scrcpy is Android-only; this whole spec is Android-only by inheritance from the mirror
  it extends.
- **A visible "interactive vs. read-only" mode toggle.** Once control lands, the mirror is
  interactive whenever it is streaming — there is no separate view-only mode to switch out of.

## Decisions & assumptions

- **The Viewer footer button is not this spec's job**, even though the mirror spec named the
  control socket as "the one that decides the Viewer's fate." Mid-scoping this pair of specs, the
  engineer chose to source the device's view hierarchy from Maestro's own `maestro mcp` /
  `inspect_screen` (see `device-hierarchy-capture.md`) rather than the raw CLI — measured at ~14×
  faster in steady state (271ms vs. 3.83s) on this hardware. That means the `maestro mcp` child
  `ViewerService` already owns is being **kept and repurposed**, not deleted, so the button's
  removal — and the rename of the service that serves it — belongs to whichever spec understands
  that session's new shape end to end. That is `device-hierarchy-capture`, not this one. This spec
  changes nothing about `ViewerService`, `McpClient`, or the `viewer:open` channel.
- **"sdk" input mode**, not `uhid`/`aoa` → decided in *Context* above; recorded here because it is
  a real fork in scrcpy's own design, not an accident of not knowing the alternatives existed.
- **A pure coordinate-translation function, not a new hit-test.** `.context.md` §5.4–5.5 describe a
  *different*, future hit-test: hovering the mirror to highlight and select an element from the
  view hierarchy, entirely local against a frozen snapshot. This spec's coordinate math answers a
  narrower question — "where on the device did this pixel land" — and has no opinion about which
  UI element that is. The two will likely share the scale math but are not the same feature; do not
  conflate them when `device-hierarchy-capture` or its hit-test successor lands.
- **(Engineer's call) Scope for v1**: tap, keyboard passthrough, and a back control — not swipe,
  not clipboard, not rotate-device. Chosen over a tap-only MVP because filling a form and
  navigating back covers most of what authoring a flow actually needs; chosen over a wider scope
  (adding swipe) to keep this spec to one implementation session.

## The wire, as read and as measured (2026-08-04)

Read out of `resources/scrcpy/scrcpy-server-3.3.4.jar` with `dexdump` (`ControlMessageReader`,
`Controller`, `PositionMapper`, `DesktopConnection`), the keycodes out of the platform
`android.jar`, and every claim below then confirmed against a Galaxy A07 (SM-A075M, Android 16,
stream 464x1024 from a 720x1600 panel). Nothing here is from memory.

**Message layout** — first byte is the type; everything is big-endian (`DataInputStream`):

| Type | Name | Body |
|---|---|---|
| 0 | `INJECT_KEYCODE` | `u8 action, i32 keycode, i32 repeat, i32 metaState` (14 bytes total) |
| 1 | `INJECT_TEXT` | `u32 length, length bytes UTF-8` (5 + n) |
| 2 | `INJECT_TOUCH_EVENT` | `u8 action, i64 pointerId, i32 x, i32 y, u16 screenWidth, u16 screenHeight, u16 pressure, i32 actionButton, i32 buttons` (32 bytes total) |
| 4 | `BACK_OR_SCREEN_ON` | `u8 action` (2 bytes total) |

**The four traps, each verified on hardware:**

1. ⚠️ **`DesktopConnection.open()` blocks in `accept()` for the control socket *before*
   `sendDeviceMeta`.** So with control enabled the video handshake **cannot complete until the
   control socket connects** — measured: the video socket sat at exactly 1 byte for 700 ms, then
   completed within 900 ms of the control connect. The accept order is video → audio → control, and
   the dummy byte goes to the **first** socket only. This inverts the obvious design: the control
   socket must be opened *without* waiting for the handshake, and the dummy byte is the signal that
   the video socket was really accepted (so control cannot be mistaken for it).
2. ⚠️ **`PositionMapper.map` returns `null`, silently, unless the touch's declared
   `screenWidth`/`screenHeight` exactly equal the current video size.** Verified: the same tap that
   pressed a dialer key landed nothing when its declared width was `w + 1`. The renderer holds the
   only fresh size after a rotation (main's session size is the codec header's and goes stale), so
   the size travels with the tap.
3. **`pointerId = -1` is reserved for the mouse** (`toolType` mouse, `SOURCE_MOUSE`). Anything else
   is a finger on `SOURCE_TOUCHSCREEN`, where `actionButton`/`buttons` are never read. `-2` is
   scrcpy's own generic-finger id.
4. **Pressure is `u16` fixed point**, `0xFFFF` meaning exactly 1.0 (`Binary.u16FixedPointToFloat`
   special-cases it); down carries `0xFFFF`, up carries 0.

**Confirmed behaviours:** `INJECT_TEXT` batches — the server iterates the whole string char by char
(`Controller.injectText`), and `'0123'` arrived as one message; the cap is
`INJECT_TEXT_MAX_LENGTH = 300`. `BACK_OR_SCREEN_ON` maps to a `KeyEvent` with the action it carries,
so it needs a down **and** an up. Tapping all ten dialer keys in turn produced exactly `1234567890`,
so the per-axis scale (464/720 for x, 1024/1600 for y — they differ) is right. A tap in the first
moment after the handshake can be dropped while the `PositionMapper` is still being built; the UI
gates control on `streaming`, so a person cannot reach it.

**Command line:** dropping `control=false` takes it from 165 to **151** characters, 104 under the
255-character ceiling — shorter, as criterion 1 requires.

**Side note, cost paid twice:** `cleanup=true` (the default) makes the server delete
`/data/local/tmp/s.jar` on shutdown, and a missing jar aborts `app_process` with a bare `Aborted` —
indistinguishable at a glance from criterion 17a's stack-corruption abort. `ScrcpySource.start`
already pushes on every start, so this bites spikes, not the app.

### The finished code, run against the phone

The suite needs no device, so the end-to-end check was a throwaway that drove the **real**
`ScrcpySource`, `connectLoopback` and `scrcpy-control-protocol` against the Galaxy A07 once and was
then deleted. What it printed:

```
[hardware] SM-A075M h264 464x1024 control=true
[hardware] after tapping 5 then 8 the field reads "58"
[hardware] after one INJECT_TEXT of "0246" it reads "580246"
[hardware] after KEYCODE_DEL it reads "58024"
[hardware] BACK: field "580-24" -> ""
[hardware] 242 frames arrived while all of that happened
```

— the session opened with control, taps landed on the keys they were aimed at, a whole run of text
travelled as one message, a keycode deleted one digit, back reached the device, the picture never
stopped while any of it happened (criterion 4), and `session.stop()` left no `app_process` behind
(criterion 3).

⚠️ One thing to know before running such a check again: a scrcpy server left alive on this phone
starves `uiautomator dump`, which then dies with exit 137 and no output. That looks like a broken
dump and is actually an orphaned server from a previous run — `kill -9` it first.

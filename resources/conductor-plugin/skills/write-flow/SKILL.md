---
name: write-flow
description: Turn a described journey into a Maestro flow that runs — walk the journey on the device, inspect each live screen, prove every selector matches exactly one element, write the .yml file and run it. Use when someone asks to write, generate, add, extend or fix an end-to-end test or flow for a journey such as logging in, checking out or searching.
---

# write-flow

Someone describes a journey through an app in ordinary words — "log in and
check the welcome message" — and what has to come out is a Maestro flow whose
every step names an element that really exists on the screen it runs against.
Getting the commands right is the easy half. The hard half is that a selector
which merely looks correct fails at run time with a message the person cannot
read, so the whole discipline below exists to make each selector *provably*
name one element before it is ever written down.

## Non-negotiables

Six rules. Everything after them is craft; these six are the difference
between a flow that runs and a flow that looks right and fails.

**1. The live view hierarchy is the only source of selector truth.**
`mcp__maestro__inspect_screen` returns the tree of what is on the screen right
now. Every selector comes from a node in that tree and from nowhere else —
never from a screenshot, never from the app's source code however plainly that
source declares a `testID`, never from memory of what this screen usually holds. An icon that reads as "Favorite" in a picture
is often a node with no text at all, and a selector built from what the picture
seemed to say is the classic hallucinated selector.

**2. Tree keys are not selector keys.** The tree's field names and Maestro's
selector keys are two different vocabularies, and mixing them is the most
common way to write a selector that matches nothing:

| The tree reports | The selector uses |
|---|---|
| `rid` — resource id | `id:` |
| `txt` — text | `text:` |
| `a11y` — accessibility label or content description | `text:` — never `a11y:` |
| `cls`, `hint`, `val`, `scroll` | nothing. They help tell two nodes apart and they help describe one in the report. None of them is a selector. |

The valid selector keys are `id`, `text`, `index`, `point`, and the relational
ones — `below`, `above`, `leftOf`, `rightOf`.

**3. `text:` is a full-string, case-insensitive regular expression.** Partial
matching does not happen. `text: "RNR 352"` does **not** find an element whose
real text is `"RNR 352 - Expo Launch"`; that needs the whole string, or an
explicit anchor: `text: "RNR 352.*"`. Two consequences that follow every time:

- Copy the value **literally** from the tree, character for character.
- Escape the regex specials the value contains — `$ . * + ? ( ) [ ] { } | ^ \`
  — because unescaped they stop matching the text they came from.
  `text: "Total: R$ 10,00"` matches nothing at all: the `$` anchors the end of
  the string instead of standing for a currency sign.

**4. Count the matches before writing the selector.** Take the candidate,
count the nodes in the inspected tree it would match, and act on the count:

- **Exactly one** — write it.
- **More than one** — do not write it. Climb the ladder below.
- **Zero** — the selector is wrong, not the app. Go back to the tree.

A selector that is never counted is a guess, however plausible it looks.

**5. Walk the journey yourself.** The tree describes the screen that is
showing, so reaching the right screen is part of the job — never something to
ask the person to do. `mcp__maestro__run` drives the device from inline `yaml`:
launch the app, tap, type, scroll, one short move at a time, inspecting again
after every move. Asking someone to open the app, navigate to a screen, press a
button or read an error message back is asking them to run the test by hand,
which is the whole thing this product exists to spare them.

**6. Run the finished flow before calling it done.** `mcp__maestro__run` takes
the file as well as inline commands. A flow that has never been run is a draft,
however carefully each selector was counted: a step can be right about the
element and wrong about the order, the wait, or what the app does next. Run it,
read what happened, fix what broke, run it again.

## The ladder to exactly one element

Climb only when the rung below cannot name the target on its own:

1. **`id:`** — from the node's `rid`. The best case: stable across platforms,
   immune to copy changes and to translation.
2. **`text:`** — from `txt` or `a11y`, the whole string, escaped.
3. **`text:` with `index:`** — for legitimate duplicates, such as the same row
   repeated down a list.
4. **Relational** — `below:`, `above:`, `leftOf:`, `rightOf:`, anchored on a
   neighbour that is itself unique. Useful inside cards and lists, where the
   field has nothing of its own but its label does. One trap worth knowing:
   when several elements sit in that direction from the anchor, the runner
   takes the first one it finds, **not** the nearest one. A direction is not a
   promise of proximity, so anchor on the neighbour that has nothing relevant
   between it and the target.
5. **`point:`** — the last resort, and the only rung that is a coordinate
   rather than a description of an element. It breaks with any change of
   layout or screen size.

Landing on `point:` is **reported to the person**, never written in silence:
say plainly that this one step is tied to a position on the screen and will
need attention when the screen changes. Everything else is invisible to them;
this one is not, because it is the step that will fail first.

## Walking the journey

Every step the flow will take, taken live first — because a selector can only
come from a screen that is actually showing, and the only way to make a screen
show is to go there.

- **Start from a known state.** Launch the app, resetting its state when the
  journey assumes a fresh one, so the walk begins where the flow will begin.
- **Move in small steps.** One tap, one field, one scroll per call. A long
  inline sequence that fails says only that something in it failed.
- **Inspect after every move.** The tree that was true before the tap says
  nothing about the screen after it, and a selector taken from the stale one is
  the classic invisible mistake.
- **Expect the app to answer slowly.** A screen that is still loading reports a
  tree that is missing the very element being looked for. Move on when the
  element is there, not when the call returns.
- **Stay inside the journey.** Only the screens this journey passes through get
  touched. Nothing else on the device is any of this work's business.

Walking is also how the unknowns get settled: which of two buttons is the real
one, what the app says when a field is wrong, whether a step needs a wait. Those
answers come from the app, not from asking the person to guess with you.

## Proving it runs

The last step before reporting back, always: run the file that was just written
with `mcp__maestro__run`, and read the result.

- **It passed** — say so when reporting back, in the same plain language
  everything else is reported in.
- **It failed** — this is normal, and it is the point. Read which step failed
  and what the screen held at that moment, inspect if needed, fix the flow and
  run it again. A wrong selector, a missing wait and a step in the wrong order
  all look identical until the flow is run.
- **It keeps failing, and the flow is right** — then the app did something the
  journey did not expect, and that is a finding, not a failure to hide. Say
  plainly what was expected and what the app did instead: "the test signs in
  and expects the order list, but the app answers that the user name or
  password is wrong." **Never report a test as finished when it was watched
  failing, and never delete the file** — the file is the work, and the person
  decides what to do about what it found.

Reporting a flow as done without running it is the same failure as writing a
selector without counting it: it looks like finished work, and only the person
finds out otherwise.

## Command syntax comes from the cheat sheet

`mcp__maestro__cheat_sheet` is the single source of truth for the exact syntax
of a Maestro command — its keys, its options, their spelling. It comes from the
Maestro installed on this machine, so it is always the syntax that will
actually run.

**Call it before writing any command whose exact options are not certain.**
Command *names* are stable and are worth knowing by heart; their options are
not, and this repository deliberately keeps no copy of Maestro's syntax. A copy
goes out of date silently, and the failure it produces — a flow written in
last year's syntax — reads like a broken app rather than a stale reference.

## Intent to command

What the person says, and which command to reach for. This is a map of
*choices*, not a syntax reference: take the exact shape and options of each
from `mcp__maestro__cheat_sheet` before writing it.

| What the person describes | Command |
|---|---|
| "open the app", "start from a clean app" | `launchApp` — its state-reset option is what makes the second one true |
| "tap it", "press the button" | `tapOn` |
| "press and hold" | `longPressOn` |
| "type the e-mail into the field" | `inputText` |
| "clear what is in the field" | `eraseText` |
| "close the keyboard" | `hideKeyboard` |
| "hit enter", "press the back key" | `pressKey` |
| "go back a screen" | `back` |
| "scroll down until the item shows up" | `scrollUntilVisible` |
| "swipe the card away" | `swipe` |
| "check that it is on the screen" | `assertVisible` |
| "check that it is gone" | `assertNotVisible` |
| "this screen takes a while to load" | `extendedWaitUntil` |
| "log in first, like the other tests do" | `runFlow` |

## The workflow

Follow it in order; each step depends on the one before it.

1. **Understand the journey.** Restate it as the list of screens and actions it
   passes through. When something is genuinely ambiguous — which of two login
   buttons, what should be true at the end — **ask**. A guessed journey
   produces a test that passes while checking the wrong thing, which is worse
   than no test.
2. **Gather context**, in the order set out below.
3. **Walk the journey on the device** with `mcp__maestro__run`, launching the
   app and moving one step at a time, and **inspect each screen** with
   `mcp__maestro__inspect_screen` as it arrives. Those trees are where every
   selector comes from.
4. **Plan the steps** as intent to command, straight down the journey, before
   writing anything.
5. **Synthesize and validate each selector** — the ladder, then the count.
   Exactly one match, or climb.
6. **Write the file.** The flow lands on disk, never in the chat.
7. **Run the file** with `mcp__maestro__run`. Fix and run again until it passes,
   or until what is left is the app disagreeing with the journey.
8. **Report back in plain language** — what the test now does, what happened
   when it ran, and any step known to be fragile.

## Gathering context, in order

1. **Existing flows in `conductor/` come first.** They carry the suite's own
   conventions: how a session is started, which prelude is reused, what test
   data is used, how files are named and organised. A new flow that matches
   them is a flow the team can read; one that invents its own style is friction
   at review even when it runs.
2. **Then the live screen** — the inspected tree. This is where selectors come
   from, always.
3. **The app's own source, when the project is the app under test** — reachable
   with `Glob`, `Grep` and `Read`. Use it as the *map*: which screen a journey
   lives on, what route reaches it, which fields it has, and which `testID`
   values were written into them. It shortens the walk enormously — knowing the
   login screen exists and what it declares beats tapping around to find it.

   It is still never a source of selectors. What the source declares and what
   the running app reports can differ: a `testID` may not survive to the
   platform, a component may be swapped at run time, a screen may be behind a
   flag. **A `testID` read from the source is a hypothesis to confirm in the
   tree**, and only the tree it appears in makes it a selector. When the source
   is out of reach, nothing here changes — steps 1 and 2 are the whole job.

## The quality bar

Rules, each with the reason it exists:

- **One journey per flow.** A file that logs in, checks out and edits a profile
  cannot report which of the three broke, and cannot be reused by any of them.
- **A deterministic start.** Every flow begins by launching the app. When the
  journey assumes a fresh app — a first-run screen, an empty cart, a logged-out
  state — reset the state as part of that launch, or the flow passes alone and
  fails right after another test.
- **End by asserting the outcome, not the mechanics.** The last step proves the
  journey worked: the welcome message, the order number, the empty basket. A
  flow that ends on the tap that should have caused the outcome tests only that
  the button was tappable.
- **Prefer `id:` over `text:`.** Copy changes and translations break text
  selectors, and neither shows up as a code change anyone thought to test.
- **Never a fixed sleep.** Waiting for a number of seconds passes on a fast
  machine and fails on a slow one, which is the definition of a flaky test.
  Wait for the thing itself — an assertion, or an explicit wait command.
- **No conditional branching to paper over flakiness.** A step that runs "only
  if the banner is there" hides the very inconsistency the test exists to
  catch, and it makes a green run mean two different things.
- **Extract a shared prelude and reuse it.** When a journey has to log in
  before it can start, that prelude belongs in its own flow, called from the
  ones that need it. Copied steps drift apart, and then a login change breaks
  eleven files instead of one.

## Test data is never invented

Credentials, e-mail addresses, card numbers, national identity numbers, phone
numbers: **never make one up**, not even an obviously fake one. A plausible
value can hit a real account, and a fake one that reaches a real environment
produces a failure nobody can explain.

- Reuse whatever an existing flow in `conductor/` already does for test data —
  the same account, the same fixture, the same helper flow.
- When nothing exists to copy, **ask the person** which account or data to use.
  Waiting for an answer is cheap; a test built on invented data is not.
- **Data the person already gave is data to use.** An address, a card, a login
  named in the conversation is the answer to that question — use it, walk the
  journey with it, and report what the app did. Asking them to confirm it, or
  asking them to type it in themselves, is asking the same question twice.
  Credentials that turn out to be wrong are a finding to report in plain
  language, not a reason to have withheld the attempt.

## Worked example: logging in

The request: *"write me a test for the login flow — it should end on the
welcome message."*

**Getting there.** The source in the clone showed a sign-in screen as the app's
first route, so the walk was short: `mcp__maestro__run` with inline `yaml`
launched the app with its state reset, and the screen that came up was the one
the journey starts on. No one was asked to open anything.

**What was inspected.** On that sign-in screen,
`mcp__maestro__inspect_screen` reported, among others:

- a node with `txt: "Sign in"` — the screen's title
- a node with `rid: "com.example.app:id/email_input"`, `hint: "E-mail"`
- a node with `rid: "com.example.app:id/password_input"`
- a node with `txt: "Sign in"`, clickable, no `rid` — the button

**Which node, and why that selector.**

- The two inputs both carry a resource id, and each id matches exactly one node
  in the tree. Rung 1 settles both: `id: "email_input"`.
- `hint: "E-mail"` was **not** used to select. It is not a selector key —
  it only helped confirm which input is which while reading the tree.
- The button carries no id, so it drops to rung 2 — and `text: "Sign in"`
  matches **two** nodes: the title says exactly the same thing. That is the
  count doing its job; written as it stands, this selector taps whichever of
  the two the runner reaches first.
- Rung 3 settles it. The matches are counted down the screen, so the title is
  the first and the button is the second: `text: "Sign in"` with `index: 1`.
- The welcome message is `txt: "Welcome back, Ana"` and matches once — rung 2,
  and the assertion the whole journey exists to make.
- The journey only makes sense on a logged-out app, so the launch resets state
  rather than trusting whatever the last test left behind. The spelling of that
  option came from `mcp__maestro__cheat_sheet`, not from memory.

**The resulting flow.** Test data — the account below — came from the sibling
flow `conductor/checkout/pix.yml`, which already logs in with it:

```yaml
appId: com.example.app
---
- launchApp:
    clearState: true
- tapOn:
    id: "email_input"
- inputText: "qa.team@example.com"
- tapOn:
    id: "password_input"
- inputText: "correct-horse-battery"
- hideKeyboard
- tapOn:
    text: "Sign in"
    index: 1
- assertVisible: "Welcome back, Ana"
```

**What happened when it ran.** The file was run once with `mcp__maestro__run`
before anything was reported. The first attempt failed on the last step: the
welcome message needs a moment to arrive, and the assertion arrived first. An
explicit wait fixed it, and the second run passed.

**What was reported back:** *"The login test now signs in with the QA account
and checks that the welcome message appears on the home screen. I ran it and it
passes."* No mention of selectors, of the tree, or of the file — none of it is
the person's business.

Two more worked examples — one that has to scroll to reach its element, one
that extends a flow that already exists — are in
[flow-examples.md](references/flow-examples.md).

## Anti-patterns

Each of these produces a flow that looks finished and is not:

- **A selector taken from a screenshot.** The rendered text of a button in an
  image is not what the tree reports, and a picture cannot show which node is
  the tappable one. Selectors come from the inspected tree, always.
- **A `text:` selector that assumes partial matching.** `text: "Add to"` will
  not find "Add to basket". Full string, or an explicit `.*`.
- **An unescaped special character.** `text: "Total: R$ 10,00"` and
  `text: "Delete (2)"` both match nothing until their specials are escaped.
- **A fixed sleep standing in for a wait.** It is not a wait; it is a bet on
  how fast the machine is today.
- **The flow pasted into the chat.** A flow that only exists in a reply was
  never delivered — nothing was written, nothing will run. Write the file.
- **Writing a selector without counting its matches.** Two matches means the
  runner picks one of them, and it will not always be the one intended.
- **Asking the person to be the hands.** "Open the app and go to the login
  screen", "tap Enter and tell me what it says" — every one of those is a step
  this session can take itself, and asking turns a finished test into homework.
- **Handing over a flow that was never run.** It is a draft described as a
  test. Run it first; if it fails and cannot be fixed, say what the app did.

# Worked examples

Two journeys end to end, each written the way the skill asks: what was
inspected, which node was chosen, why that selector and not another, and the
flow that came out. The login example lives in `SKILL.md` itself.

- [Example: an item further down a long list](#example-an-item-further-down-a-long-list)
  — the target is not on the screen yet, so the tree cannot see it.
- [Example: adding a check to a flow that already exists](#example-adding-a-check-to-a-flow-that-already-exists)
  — the file is edited around what is already in it, not rewritten.

## Example: an item further down a long list

The request: *"add a test that opens the Bluetooth headphones from the
Electronics list and checks the price is on the product page."*

### What was inspected

The Electronics list was already on the screen. `mcp__maestro__inspect_screen`
reported a scrollable container holding six product rows. Each row looked
like this one:

- a container node with `rid: "com.example.shop:id/product_row"`, clickable
- inside it, a node with `txt: "Wireless mouse"`
- inside it, a node with `txt: "R$ 89,90"`

The tree held no node whose text was "Bluetooth headphones". That absence is
the whole point of this example: **the element is not off-screen in the tree,
it is absent from it.** The hierarchy describes what is rendered, and a list
row that has not been reached yet is not rendered.

### Which node, and why that selector

- Selecting the row by `id:` is impossible: `product_row` matches six nodes,
  one per row. Rung 1 fails the count immediately — the same id repeated down
  a list is the single most common reason rung 1 does not settle it.
- `text: "Bluetooth headphones"` cannot be counted at all against this tree,
  because the node is not in it. Guessing it — writing the selector from the
  request's own wording and hoping the row exists — is exactly the guess the
  count exists to prevent.
- The way out is not a cleverer selector. It is `scrollUntilVisible`, which
  scrolls until the element it is given appears and *then* stops. It is the one
  command that legitimately names an element the current tree cannot show,
  because scrolling is what makes the element exist.
- After scrolling, the screen was inspected **again** — a new tree, with the
  row in it. There, `txt: "Bluetooth headphones"` matched exactly one node, so
  the tap that follows is a counted rung 2.
- On the product page, a third inspection: `txt: "R$ 899,90"` matched once.
  Its `$` is escaped in the selector: left alone it anchors the end of the
  string instead of standing for a currency sign, and the assertion that looks
  the most obviously correct on the page is the one that matches nothing.

### The resulting flow

```yaml
appId: com.example.shop
---
- launchApp
- tapOn: "Electronics"
- scrollUntilVisible:
    element:
      text: "Bluetooth headphones"
- tapOn: "Bluetooth headphones"
- assertVisible: "R\\$ 899,90"
```

The exact options `scrollUntilVisible` takes — how far it scrolls, in which
direction, when it gives up — came from `mcp__maestro__cheat_sheet`, not from
memory.

### What was reported back

*"The new test opens Electronics, scrolls down to the Bluetooth headphones and
checks that the price shows on the product page."*

## Example: adding a check to a flow that already exists

The request: *"the checkout test should also check that the confirmation
e-mail notice appears at the end."*

There is no new file here. `conductor/checkout/pix.yml` already covers this
journey, and the work is one assertion added at the end of it.

### What was already in the file

```yaml
appId: com.example.shop
---
# Runs against the shared QA account — see conductor/login.yml
- runFlow: ../login.yml
- tapOn:
    id: "basket_button"
- tapOn: "Checkout"
- tapOn: "Pix"
- assertVisible: "Payment confirmed"
```

Three things in it decide how the edit is made:

- The prelude is a **reused flow**, not copied steps. A journey that needs a
  logged-in app calls the login flow rather than repeating it.
- The comment above it explains the account to a human reader. It survives the
  edit untouched.
- The `appId` is already there and correct. It is never re-derived, never
  replaced, never copied in from another project.

### What was inspected

The confirmation screen, reached by walking the journey by hand first. The tree
held a node with `txt: "A confirmation was sent to qa.team@example.com"`, and
one other node containing that same address in a footer.

### Which node, and why that selector

- The node carries no `rid`, so rung 1 is out.
- The full string matched exactly one node — the footer node's text is
  different, even though it contains the same address. Rung 2 settles it.
- The e-mail address inside the string carries a `.`, which is a regex special.
  It is escaped, and the string is used **whole**: a shortened
  `text: "A confirmation was sent"` matches nothing at all, because matching is
  full-string.
- No test data was invented. The address is the one the file's own prelude
  already signs in with.

### The resulting edit

One step appended, everything else byte for byte as it was:

```yaml
appId: com.example.shop
---
# Runs against the shared QA account — see conductor/login.yml
- runFlow: ../login.yml
- tapOn:
    id: "basket_button"
- tapOn: "Checkout"
- tapOn: "Pix"
- assertVisible: "Payment confirmed"
- assertVisible: "A confirmation was sent to qa\\.team@example\\.com"
```

The comment is still there, the key order is unchanged, the indentation matches
the lines around it, and the file reads as one person wrote it. These files are
read by a human reviewer, and a rewritten file is a review nobody can do.

### What was reported back

*"The checkout test now also checks that the notice about the confirmation
e-mail appears after paying."*

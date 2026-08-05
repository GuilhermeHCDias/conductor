Top chrome of the Conductor window. One per app.

```jsx
<TitleBar projectPath="/Users/guilherme.dias/Projects/pnp/pnp-fast-mode"
  actions={<><IconButton icon="moon" label="Theme" size="lg" /><IconButton icon="settings" label="Settings" size="lg" /></>} />
```

The path chip is mono and truncates from the left (`direction: rtl`) — the trailing folder name is what matters.

The titlebar is a three-part flex row: traffic lights, a flexible centring cell, then the actions.
The centre is centred **within the space the actions leave** and ellipsises rather than overlapping
them, so a wide action group (device chip + Run + Run All) is safe.

Pass `center` for the current document's identity — in Conductor that's the open flow chip. Pass
`projectPath` only when the path itself is the thing worth showing; `center` wins if both are set.
A machine path in the chrome is noise most of the time: the user knows which project they opened,
and they need to know which *flow* they're editing.

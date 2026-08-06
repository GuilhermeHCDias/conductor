The right-click command menu over the device mirror — Conductor's signature interaction.

```jsx
<ContextMenu
  title='Text "Pedidos pendentes"'
  items={[
    { type: "label", label: "Interact" },
    { label: "tapOn", icon: ACTION_ICONS.tapOn, mono: true, shortcut: "T" },
    { label: "inputText", icon: ACTION_ICONS.inputText, mono: true },
    { type: "separator" },
    { type: "label", label: "Assert" },
    { label: "assertVisible", icon: ACTION_ICONS.assertVisible, mono: true },
    { label: "Ask Conductor about this element", icon: "sparkles", ai: true },
  ]}
  onSelect={append}
/>
```

Group items with `type: "label"` sections — Interact, Assert, Wait, App, AI. Command labels are mono because they are written verbatim into the .yaml. Needs the `cd-menu-in` keyframe on the page.

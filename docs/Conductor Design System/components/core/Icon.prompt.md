Renders one Lucide glyph as inline SVG — use it for every icon in Conductor; never paste raw SVG or emoji.

```jsx
<Icon name="mouse-pointer-click" size={16} />
<Icon name={ACTION_ICONS.assertVisible} size={14} color="var(--state-pass)" />
```

- `ACTION_ICONS` maps Maestro commands (`tapOn`, `inputText`, `assertVisible`, …) to glyphs so command menus, generated YAML step rows, and log rows all agree.
- Default `strokeWidth` is 1.75, not Lucide's 2 — do not raise it.
- Sizes in use: 14 (dense list rows, log rows), 16 (buttons, menu items), 18 (toolbar/titlebar), 20–24 (empty states).
- `ICON_NAMES` lists everything vendored; ask before introducing a glyph that isn't in the set.

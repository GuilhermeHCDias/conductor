Glyph-only button for chrome. `label` is mandatory.

```jsx
<IconButton icon="refresh-cw" label="Reload mirror" />
<IconButton icon="panel-bottom" label="Toggle logs" selected size="lg" />
<IconButton icon="crosshair" label="Inspect element" variant="glass" />
```

Use `variant="glass"` only when the button floats over content (mirror overlay); inside panels use the default ghost so chrome stays quiet.

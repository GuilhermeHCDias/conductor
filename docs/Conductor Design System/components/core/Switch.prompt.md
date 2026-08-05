Toggle for state that changes the moment you flip it.

```jsx
<Switch checked label="Follow logs" onChange={...} />
<Switch size="sm" checked={live} />
```

The knob slides on `--ease-glass` over `--dur-base` — no bounce, no colour flash.

The label never wraps (`white-space: nowrap`) and the control never shrinks (`flex: none`), so a
switch is safe as a flex child in a crowded toolbar. Keep labels to two or three words.

Titles a panel. Panel titles are the only uppercase text in Conductor.

```jsx
<PanelHeader icon="scroll-text" title="Logs" meta="12 steps" actions={<IconButton icon="trash-2" label="Clear history" size="sm" />} />
```

Never title-case the `title` prop text expecting title case — the component uppercases it.

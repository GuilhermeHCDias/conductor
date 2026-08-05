The standard action control — glass by default, one `primary` per region at most.

```jsx
<Button variant="primary" icon="play">Run Test</Button>
<Button icon="cloud">Cloud</Button>
<Button variant="ghost" size="sm" icon="refresh-cw">Reload mirror</Button>
<Button variant="ai" icon="sparkles">Generate flow</Button>
```

- `variant="ai"` is a semantic promise: use it only where Conductor's assistant does the work.
- Buttons press by scaling to `--press-scale`; never add a translate or a bounce.
- Requires the `cd-spin` keyframe on the page when `loading` is set (it ships in the UI kit and in every card).

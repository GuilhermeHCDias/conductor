Bottom panel of Conductor Studio. Runs collapse; the selected run's steps sit under it.

```jsx
<LogStream runs={runs} selectedRunId="r1" steps={steps} onSelectRun={select}
  footer={<Toolbar align="center" height={36} divider="top"><Button variant="ghost" size="sm" icon="trash-2">Clear history</Button></Toolbar>} />
```

- Step `label` is written in plain language for a non-technical author; `detail` holds the raw CLI error.
- Failing steps get a coral row wash and open their detail by default.
- Needs the `cd-spin` keyframe for running steps.

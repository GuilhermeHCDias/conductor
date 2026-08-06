Run controls. `Run Test` is the only `primary` button on the screen.

```jsx
<RunBar env={env} onEnvChange={e => setEnv(e.target.value)} envOptions={["staging","prod"]}
  running={isRunning} onRun={run} onRunAll={runAll} onStop={stop}
  extra={<Switch size="sm" checked={follow} onChange={toggle} label="Follow logs" />} />
```

While running, Run Test becomes a danger Stop — never show both.

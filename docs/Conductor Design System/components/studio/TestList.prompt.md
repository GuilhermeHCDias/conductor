The project's test suite. Use it wherever the user picks *which* test to work on — never as a
permanent column beside the editor; managing the suite and authoring one flow are different modes.

```jsx
<TestList tests={tests} selectedId={sel} checkedIds={checked}
  onSelect={setSel} onOpen={openInEditor} onCheck={toggle} onCheckAll={setChecked}
  onAction={(id, e) => openRowMenu(id, e)}
  emptyState={<EmptyState icon="scroll-text" title="No tests yet"
    description="Right-click anything on the phone and Conductor writes your first flow."
    action={<Button variant="primary" icon="plus">New flow</Button>} />} />
```

Rules:

- `name` is the real file name in mono — that is what the CLI runs and what lives in git.
- Column headers are lowercase mono, not uppercase labels. UPPERCASE is reserved for panel titles.
- Never sort by name by default; sort by last run, most recent first. People come back to what
  they just broke.
- A failing `duration` is tinted coral, because in a long list the time column is where the eye
  lands when scanning for the run that went wrong.
- Row actions stay behind an `ellipsis` button rather than appearing on hover alone, so they are
  reachable by keyboard and on a trackpad without hover.

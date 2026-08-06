Foot of the assistant column.

```jsx
<ChatComposer value={draft} onChange={e => setDraft(e.target.value)} onSubmit={ask}
  context='Text · "Pedidos pendentes"' busy={streaming} />
```

Everything AI-facing focuses blue (`--glow-ai`); everything else focuses the violet accent (`--glow-accent`). The `context` pill is how a mirror selection travels into a prompt.

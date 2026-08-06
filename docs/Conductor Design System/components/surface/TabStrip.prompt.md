Open .yaml flows across the top of the editor.

```jsx
<TabStrip tabs={[{ id: "a", label: "checkout.yaml", dirty: true }]} activeId="a" onSelect={setId} onClose={close} onAdd={create} />
```

Close buttons appear on hover or on the active tab only — never on all tabs at once.

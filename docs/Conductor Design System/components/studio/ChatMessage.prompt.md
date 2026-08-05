A turn in the right-hand assistant column.

```jsx
<ChatMessage role="user">Add a step that taps the first pending order</ChatMessage>
<ChatMessage code={"- tapOn:\n    text: \"Preparar até 3:30 PM\""} onInsert={insert}>
  I found a text node in the first order card. This taps it by visible text.
</ChatMessage>
```

Assistant prose is unbubbled so long answers stay readable; only user turns get a bubble. Any YAML the assistant proposes must be insertable — never make the user retype it.

Sunken single-line field. Focus paints an accent hairline plus a 2px `--glow-accent` ring — no inset highlight in either state.

```jsx
<Input icon="search" placeholder="Filter elements" />
<Input mono value="id=checkout-cta" suffix="selector" />
```

Inputs use `--glass-sunken`, never a glass fill — sunken means "you type here". Keep `mono` on for any value the Maestro CLI will consume verbatim.

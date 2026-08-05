Static label. Tone carries the meaning, so never restyle a badge's colour by hand.

```jsx
<Badge tone="pass" icon="circle-check">Passed</Badge>
<Badge tone="fail" mono>0:04</Badge>
<Badge tone="ai" icon="sparkles">Generated</Badge>
<Badge mono>tapOn</Badge>
```

`tone="ai"` marks anything the assistant produced — always pair it with the `sparkles` glyph.

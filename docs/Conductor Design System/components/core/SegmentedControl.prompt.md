Exclusive mode switch — the sunken track is the tell that only one option can win.

```jsx
<SegmentedControl value="local" options={[{value:"local",label:"Local",icon:"hard-drive"},{value:"cloud",label:"Cloud",icon:"cloud"}]} onChange={setTarget} />
```

Cap it at four segments. Beyond that use `Select`.

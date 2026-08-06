Centre column of Conductor Studio — the .yaml the user's clicks produced.

```jsx
<YamlEditor value={"appId: com.example.app\n---\n- launchApp:\n    clearState: true"} activeLine={4} aiLines={[3,4]} errorLines={[]} />
```

- Keys render in `--syn-key` (violet); flow anchors in `--syn-anchor` (blue), strings green, numbers amber.
- `aiLines` is how Conductor shows authorship: blue `--ai-quiet` wash plus a 2px `--ai` left bar. Keep it until the user edits or runs.
- Needs the `cd-caret` keyframe on the page.

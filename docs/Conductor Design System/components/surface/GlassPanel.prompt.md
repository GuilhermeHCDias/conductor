Every region, card and floating layer in Conductor is a GlassPanel. Do not hand-roll glass.

```jsx
<GlassPanel depth={1} radius="lg" sheen style={{ display: "grid" }}>…</GlassPanel>
<GlassPanel sunken radius="md" padding={12}>…</GlassPanel>
```

Rules: never nest depth 1 inside depth 1; a sunken well never sits inside another sunken well; keep radii concentric (child radius = parent radius − padding).

**Materials.** On macOS a window is not uniformly translucent. Chrome is *vibrant* — translucent,
heavily saturated, the desktop visible through it. Content is *near-opaque*, so text has a still
background to sit on. Pass `material="vibrant"` to the mirror bay and the assistant, and
`material="content"` to the editor and log regions. Depth still controls the border and shadow.

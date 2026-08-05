Left-hand column of Conductor Studio — the live phone. Cursor is a crosshair when a context handler is attached.

```jsx
<DeviceMirror
  width={300} height={620}
  highlight={{ x: 16, y: 120, width: 268, height: 96 }}
  highlightLabel='Text · "Pedidos pendentes"'
  onContextMenu={openCommandMenu}
>
  <AppUnderTest />
</DeviceMirror>
```

- Highlights are accent-tinted fills with a 1.5px accent border and a mono label above — never a dashed marquee.
- Only Android is mirrored today; the nav bar is drawn from vendored glyphs.
- Device chrome does **not** follow `data-theme` — it is a photograph of a real phone. Pass `deviceTheme` to match the device's own OS theme (default `"dark"`), and make the screen children paint their own opaque background edge to edge.
- Pass `live={false}` to show the paused scrim when adb drops.

**Highlighting the right thing.** Don't hand-write `highlight` coordinates — they drift the moment
the mirror is resized. Give the screen's nodes `data-a11y-*` attributes, take `contentRef`, and
measure on hover:

```jsx
const box = contentRef.current.getBoundingClientRect();
const r = target.getBoundingClientRect();
setHighlight({ x: r.left - box.left, y: r.top - box.top, width: r.width, height: r.height });
```

That is exact at any scale and needs no overlay hit areas.

**Scale, never reflow.** A mirror shows the device's own pixels. Give it a FIXED logical
`width`/`height` (Conductor uses 330×648) and fit it with `transform: scale()` on the component —
never by shrinking `width`, which re-lays-out the live app inside and wraps text that is single-line
on a real phone. Reserve the scaled footprint with a wrapper div sized `outer × scale`. The shared
`useMirrorFit` hook in the UI kits does all of this.

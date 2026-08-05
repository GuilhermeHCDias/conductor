Modal layer. Positioned absolute, so give the app shell `position: relative`.

```jsx
<Dialog open icon="smartphone" title="Connect a device" subtitle="Conductor talks to Android over adb." onClose={close}
  footer={<><Button variant="ghost" onClick={close}>Cancel</Button><Button variant="primary" icon="refresh-cw">Scan again</Button></>} />
```

Requires `cd-fade-in` and `cd-dialog-in` keyframes. Dialogs blur heavier than any other layer — that is how depth is read.

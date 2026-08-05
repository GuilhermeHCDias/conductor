Glass dropdown for short, closed sets (device, environment, run target).

```jsx
<Select icon="smartphone" value="R9QYC01EMXL" options={["R9QYC01EMXL", "emulator-5554"]} />
<Select size="sm" value="staging" options={[{ value: "staging", label: "Env · staging" }]} />
```

For picking a device use `DeviceSelector` instead — it carries the connection status dot.

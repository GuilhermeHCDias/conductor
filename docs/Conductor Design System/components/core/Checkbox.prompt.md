Multi-select / flag control. Reach for it when a YAML command takes a boolean.

```jsx
<Checkbox checked label="clearState" hint="Wipes app data before launchApp" />
```

Use `Switch` instead when the change takes effect immediately (theme, live mirror); a checkbox implies it applies on the next run.

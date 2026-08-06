import React from "react";
import { Icon } from "./Icon.jsx";

export function Checkbox({ checked = false, onChange, label, hint, disabled = false, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "inline-flex",
        alignItems: hint ? "flex-start" : "center",
        gap: "var(--space-4)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        userSelect: "none",
        ...style,
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, margin: -1 }}
        {...rest}
      />
      <span
        style={{
          display: "grid",
          placeItems: "center",
          width: 16,
          height: 16,
          flex: "none",
          marginTop: hint ? 2 : 0,
          borderRadius: "var(--radius-xs)",
          background: checked ? "var(--accent)" : "var(--glass-sunken)",
          border: "var(--border-hair) solid " + (checked ? "transparent" : hover ? "var(--edge-strong)" : "var(--edge-sunken)"),
          boxShadow: checked ? "var(--shadow-1)" : "var(--shadow-inset-sunken)",
          transition: "var(--t-hover)",
        }}
      >
        {checked ? <Icon name="check" size={11} strokeWidth={3} color="var(--accent-on)" /> : null}
      </span>
      {label ? (
        <span style={{ display: "grid", gap: 1 }}>
          <span style={{ font: "var(--type-body)", color: "var(--text-primary)", whiteSpace: "nowrap" }}>{label}</span>
          {hint ? <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)" }}>{hint}</span> : null}
        </span>
      ) : null}
    </label>
  );
}

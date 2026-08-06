import React from "react";

export function Switch({ checked = false, onChange, label, disabled = false, size = "md", style, ...rest }) {
  const w = size === "sm" ? 30 : 38;
  const h = size === "sm" ? 18 : 22;
  const knob = h - 6;
  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        flex: "none",
        gap: "var(--space-5)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        userSelect: "none",
        ...style,
      }}
    >
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        style={{ position: "absolute", opacity: 0, width: 1, height: 1, margin: -1 }}
        {...rest}
      />
      <span
        style={{
          position: "relative",
          width: w,
          height: h,
          flex: "none",
          borderRadius: "var(--radius-pill)",
          background: checked ? "var(--accent)" : "var(--glass-sunken)",
          border: "var(--border-hair) solid " + (checked ? "transparent" : "var(--edge-sunken)"),
          boxShadow: checked ? "var(--shadow-1)" : "var(--shadow-inset-sunken)",
          transition: "background var(--dur-base) var(--ease-glass), border-color var(--dur-base) var(--ease-glass)",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 2,
            left: checked ? w - knob - 4 : 2,
            width: knob,
            height: knob,
            borderRadius: "var(--radius-pill)",
            background: checked ? "var(--accent-on)" : "var(--text-secondary)",
            boxShadow: "0 1px 2px oklch(0% 0 0 / 0.30)",
            transition: "left var(--dur-base) var(--ease-glass), background var(--dur-base) var(--ease-glass)",
          }}
        />
      </span>
      {label ? <span style={{ font: "var(--type-body)", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>{label}</span> : null}
    </label>
  );
}

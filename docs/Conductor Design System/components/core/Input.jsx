import React from "react";
import { Icon } from "./Icon.jsx";

export function Input({
  value,
  onChange,
  placeholder,
  icon,
  suffix,
  mono = false,
  size = "md",
  invalid = false,
  disabled = false,
  fullWidth = true,
  onKeyDown,
  style,
  inputStyle,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const [hover, setHover] = React.useState(false);
  const h = size === "sm" ? "var(--control-h)" : "var(--control-h-lg)";
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: fullWidth ? "flex" : "inline-flex",
        alignItems: "center",
        gap: "var(--space-4)",
        width: fullWidth ? "100%" : undefined,
        height: h,
        padding: "0 10px",
        borderRadius: "var(--radius-sm)",
        background: "var(--glass-sunken)",
        border: "var(--border-hair) solid " + (invalid ? "var(--state-fail)" : focus ? "var(--accent)" : hover ? "var(--edge-2)" : "var(--edge-sunken)"),
        boxShadow: focus ? "var(--glow-accent)" : "none",
        color: "var(--text-primary)",
        opacity: disabled ? 0.45 : 1,
        transition: "var(--t-hover), box-shadow var(--dur-fast) var(--ease-out)",
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={14} color={focus ? "var(--accent)" : "var(--text-tertiary)"} /> : null}
      <input
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        onKeyDown={onKeyDown}
        style={{
          flex: 1,
          minWidth: 0,
          background: "none",
          border: "none",
          outline: "none",
          padding: 0,
          font: mono ? "var(--type-code-sm)" : size === "sm" ? "var(--type-caption)" : "var(--type-body)",
          letterSpacing: mono ? "var(--ls-mono)" : "var(--ls-body)",
          color: "inherit",
          ...inputStyle,
        }}
        {...rest}
      />
      {suffix ? <span style={{ font: "var(--type-mono-label)", color: "var(--text-tertiary)", flex: "none" }}>{suffix}</span> : null}
    </div>
  );
}

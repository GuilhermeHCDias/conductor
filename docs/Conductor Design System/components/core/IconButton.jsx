import React from "react";
import { Icon } from "./Icon.jsx";

const SIZES = { sm: 24, md: 30, lg: 36 };
const GLYPH = { sm: 14, md: 16, lg: 18 };

export function IconButton({
  icon,
  label,
  size = "md",
  variant = "ghost",
  selected = false,
  disabled = false,
  pill = false,
  onClick,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const box = SIZES[size] || SIZES.md;
  const on = selected || active;
  const tint =
    variant === "danger" ? "var(--state-fail)" : variant === "ai" ? "var(--text-ai)" : selected ? "var(--accent)" : hover ? "var(--text-primary)" : "var(--text-secondary)";
  const bg = selected
    ? "var(--accent-quiet)"
    : active
    ? "var(--glass-active)"
    : hover
    ? "var(--glass-hover)"
    : variant === "glass"
    ? "var(--glass-1)"
    : "transparent";
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={selected || undefined}
      title={label}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: box,
        height: box,
        flex: "none",
        padding: 0,
        borderRadius: pill ? "var(--radius-pill)" : size === "sm" ? "var(--radius-xs)" : "var(--radius-sm)",
        background: bg,
        color: tint,
        border: "var(--border-hair) solid " + (variant === "glass" || selected ? "var(--edge-2)" : "transparent"),
        boxShadow: variant === "glass" ? "var(--shadow-inset-top)" : "none",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1,
        transition: "var(--t-hover), var(--t-press)",
        transform: on && !disabled ? "scale(var(--press-scale))" : "scale(1)",
        ...style,
      }}
      {...rest}
    >
      <Icon name={icon} size={GLYPH[size] || 16} />
    </button>
  );
}

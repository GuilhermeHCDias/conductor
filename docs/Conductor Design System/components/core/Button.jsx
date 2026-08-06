import React from "react";
import { Icon } from "./Icon.jsx";

const SIZES = {
  sm: { h: "var(--control-h)", pad: "0 10px", gap: "6px", font: "var(--type-caption)", radius: "var(--radius-sm)", icon: 14 },
  md: { h: "var(--control-h-lg)", pad: "0 14px", gap: "7px", font: "var(--type-body-strong)", radius: "var(--radius-md)", icon: 16 },
  lg: { h: "42px", pad: "0 18px", gap: "8px", font: "var(--w-semibold) var(--size-14) / 1.3 var(--font-ui)", radius: "var(--radius-md)", icon: 18 },
};

function fill(variant, hover, active) {
  switch (variant) {
    case "primary":
      return {
        background: active ? "var(--accent-strong)" : "var(--accent)",
        color: "var(--accent-on)",
        border: "var(--border-hair) solid transparent",
        boxShadow: hover ? "var(--glow-accent)" : "inset 0 1px 0 0 oklch(100% 0 0 / 0.28), var(--shadow-1)",
      };
    case "glass":
      return {
        background: active ? "var(--glass-active)" : hover ? "var(--glass-2)" : "var(--glass-1)",
        color: "var(--text-primary)",
        border: "var(--border-hair) solid " + (hover ? "var(--edge-strong)" : "var(--edge-2)"),
        boxShadow: "var(--shadow-inset-top), var(--shadow-1)",
        backdropFilter: "blur(var(--blur-2)) saturate(var(--saturate-glass))",
        WebkitBackdropFilter: "blur(var(--blur-2)) saturate(var(--saturate-glass))",
      };
    case "ghost":
      return {
        background: active ? "var(--glass-active)" : hover ? "var(--glass-hover)" : "transparent",
        color: hover ? "var(--text-primary)" : "var(--text-secondary)",
        border: "var(--border-hair) solid transparent",
        boxShadow: "none",
      };
    case "ai":
      return {
        background: hover ? "var(--ai-quiet-hover)" : "var(--ai-quiet)",
        color: "var(--text-ai)",
        border: "var(--border-hair) solid var(--ai-edge)",
        boxShadow: hover ? "var(--glow-ai)" : "var(--shadow-inset-top)",
      };
    case "danger":
      return {
        background: hover ? "var(--state-fail-quiet-hover)" : "var(--state-fail-quiet)",
        color: "var(--state-fail)",
        border: "var(--border-hair) solid var(--state-fail-edge)",
        boxShadow: "var(--shadow-inset-top)",
      };
    default:
      return {};
  }
}

export function Button({
  children,
  variant = "glass",
  size = "md",
  icon,
  iconEnd,
  loading = false,
  disabled = false,
  fullWidth = false,
  pill = false,
  onClick,
  type = "button",
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [active, setActive] = React.useState(false);
  const s = SIZES[size] || SIZES.md;
  const off = disabled || loading;
  return (
    <button
      type={type}
      disabled={off}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setActive(false); }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      style={{
        display: fullWidth ? "flex" : "inline-flex",
        width: fullWidth ? "100%" : undefined,
        alignItems: "center",
        justifyContent: "center",
        gap: s.gap,
        height: s.h,
        padding: s.pad,
        font: s.font,
        letterSpacing: "var(--ls-body)",
        borderRadius: pill ? "var(--radius-pill)" : s.radius,
        cursor: off ? "not-allowed" : "pointer",
        whiteSpace: "nowrap",
        transition: "var(--t-hover), var(--t-press), box-shadow var(--dur-fast) var(--ease-out)",
        transform: active && !off ? "scale(var(--press-scale))" : "scale(1)",
        opacity: off ? 0.45 : 1,
        ...fill(variant, hover && !off, active && !off),
        ...style,
      }}
      {...rest}
    >
      {loading ? (
        <Icon name="loader-circle" size={s.icon} style={{ animation: "cd-spin 700ms linear infinite" }} />
      ) : icon ? (
        <Icon name={icon} size={s.icon} />
      ) : null}
      {children}
      {iconEnd ? <Icon name={iconEnd} size={s.icon} /> : null}
    </button>
  );
}

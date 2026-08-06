import React from "react";
import { Icon } from "../core/Icon.jsx";

function Row({ item, onSelect }) {
  const [hover, setHover] = React.useState(false);
  if (item.type === "separator") return <div style={{ height: 1, margin: "4px 6px", background: "var(--edge-1)" }} />;
  if (item.type === "label")
    return (
      <div style={{ padding: "6px 10px 3px", font: "var(--type-label)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-disabled)" }}>
        {item.label}
      </div>
    );
  const off = item.disabled;
  const tint = item.destructive ? "var(--state-fail)" : item.ai ? "var(--text-ai)" : "var(--text-primary)";
  return (
    <button
      type="button"
      disabled={off}
      onClick={() => !off && onSelect && onSelect(item)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        width: "100%",
        height: "var(--row-h)",
        padding: "0 8px",
        borderRadius: "var(--radius-xs)",
        border: "none",
        /* AppKit highlights a menu row with a solid accent fill, not a tint — the row goes
           accent and its text goes white. Destructive and AI rows keep their own hue. */
        background: hover && !off ? (item.destructive ? "var(--state-fail)" : item.ai ? "var(--ai)" : "var(--accent)") : "transparent",
        color: hover && !off ? "var(--accent-on)" : tint,
        font: "var(--type-body)",
        textAlign: "left",
        cursor: off ? "not-allowed" : "pointer",
        opacity: off ? 0.4 : 1,
        transition: "background-color var(--dur-instant) var(--ease-out)",
      }}
    >
      {item.icon ? <Icon name={item.icon} size={14} color={hover && !off ? "var(--accent-on)" : item.destructive || item.ai ? tint : "var(--text-tertiary)"} /> : <span style={{ width: 14 }} />}
      <span style={{ flex: 1, whiteSpace: "nowrap", font: item.mono ? "var(--type-code-sm)" : undefined }}>{item.label}</span>
      {item.shortcut ? <span style={{ font: "var(--type-mono-label)", color: hover && !off ? "oklch(100% 0 0 / 0.70)" : "var(--text-disabled)" }}>{item.shortcut}</span> : null}
      {item.submenu ? <Icon name="chevron-right" size={12} color={hover && !off ? "var(--accent-on)" : "var(--text-disabled)"} /> : null}
    </button>
  );
}

export function ContextMenu({ items = [], x, y, width = 232, title, onSelect, style, ...rest }) {
  const positioned = x != null && y != null;
  return (
    <div
      role="menu"
      style={{
        position: positioned ? "fixed" : "relative",
        left: positioned ? x : undefined,
        top: positioned ? y : undefined,
        zIndex: 80,
        width,
        padding: 4,
        borderRadius: "var(--radius-md)",
        background: "var(--glass-3)",
        backdropFilter: "blur(var(--blur-3)) saturate(var(--saturate-vibrant))",
        WebkitBackdropFilter: "blur(var(--blur-3)) saturate(var(--saturate-vibrant))",
        border: "var(--border-hair) solid var(--edge-2)",
        boxShadow: "var(--shadow-inset-top), var(--shadow-3)",
        animation: "cd-menu-in var(--dur-base) var(--ease-spring)",
        transformOrigin: "top left",
        ...style,
      }}
      {...rest}
    >
      {title ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "5px 8px 7px", borderBottom: "var(--border-hair) solid var(--edge-1)", marginBottom: 4 }}>
          <Icon name="crosshair" size={12} color="var(--accent)" />
          <span style={{ font: "var(--type-code-sm)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title}</span>
        </div>
      ) : null}
      {items.map((item, i) => (
        <Row key={item.id || i} item={item} onSelect={onSelect} />
      ))}
    </div>
  );
}

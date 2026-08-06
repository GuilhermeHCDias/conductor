import React from "react";

export function Tooltip({ children, content, side = "top", shortcut, style, ...rest }) {
  const [open, setOpen] = React.useState(false);
  const pos =
    side === "bottom"
      ? { top: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" }
      : side === "left"
      ? { right: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" }
      : side === "right"
      ? { left: "calc(100% + 6px)", top: "50%", transform: "translateY(-50%)" }
      : { bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)" };
  return (
    <span
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      style={{ position: "relative", display: "inline-flex", ...style }}
      {...rest}
    >
      {children}
      <span
        role="tooltip"
        style={{
          position: "absolute",
          zIndex: 60,
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          padding: "5px 8px",
          borderRadius: "var(--radius-sm)",
          background: "var(--glass-3)",
          backdropFilter: "blur(var(--blur-3)) saturate(var(--saturate-glass))",
          WebkitBackdropFilter: "blur(var(--blur-3)) saturate(var(--saturate-glass))",
          border: "var(--border-hair) solid var(--edge-2)",
          boxShadow: "var(--shadow-inset-top), var(--shadow-2)",
          color: "var(--text-primary)",
          font: "var(--type-caption)",
          whiteSpace: "nowrap",
          pointerEvents: "none",
          opacity: open ? 1 : 0,
          transition: "opacity var(--dur-fast) var(--ease-out)",
          ...pos,
        }}
      >
        {content}
        {shortcut ? <span style={{ font: "var(--type-mono-label)", color: "var(--text-tertiary)" }}>{shortcut}</span> : null}
      </span>
    </span>
  );
}

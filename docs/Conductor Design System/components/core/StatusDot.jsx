import React from "react";

const COLORS = {
  pass: "var(--state-pass)",
  fail: "var(--state-fail)",
  running: "var(--state-running)",
  idle: "var(--state-idle)",
  connected: "var(--state-pass)",
  offline: "var(--state-idle)",
};

export function StatusDot({ state = "idle", size = 8, pulse = false, label, style, ...rest }) {
  const c = COLORS[state] || COLORS.idle;
  const dot = (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: size,
        height: size,
        flex: "none",
        borderRadius: "var(--radius-pill)",
        background: c,
        boxShadow: state === "idle" || state === "offline" ? "none" : "0 0 0 3px color-mix(in oklch, " + c + " 22%, transparent)",
        animation: pulse ? "cd-pulse 1.4s var(--ease-in-out) infinite" : undefined,
        ...style,
      }}
      {...rest}
    />
  );
  if (!label) return dot;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "var(--space-3)" }}>
      {dot}
      <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>{label}</span>
    </span>
  );
}

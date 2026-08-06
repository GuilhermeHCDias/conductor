import React from "react";
import { Icon } from "./Icon.jsx";

const TONES = {
  neutral: { bg: "var(--glass-2)", fg: "var(--text-secondary)", edge: "var(--edge-2)" },
  accent: { bg: "var(--accent-quiet)", fg: "var(--text-accent)", edge: "var(--accent-edge)" },
  ai: { bg: "var(--ai-quiet)", fg: "var(--text-ai)", edge: "var(--ai-edge)" },
  pass: { bg: "var(--state-pass-quiet)", fg: "var(--state-pass)", edge: "var(--state-pass-edge)" },
  fail: { bg: "var(--state-fail-quiet)", fg: "var(--state-fail)", edge: "var(--state-fail-edge)" },
  running: { bg: "var(--state-running-quiet)", fg: "var(--state-running)", edge: "var(--state-running-edge)" },
  idle: { bg: "var(--state-idle-quiet)", fg: "var(--text-tertiary)", edge: "var(--edge-1)" },
};

export function Badge({ children, tone = "neutral", icon, mono = false, size = "md", uppercase = false, style, ...rest }) {
  const t = TONES[tone] || TONES.neutral;
  const sm = size === "sm";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: sm ? 3 : 4,
        height: sm ? 17 : 20,
        padding: sm ? "0 5px" : "0 7px",
        borderRadius: "var(--radius-xs)",
        background: t.bg,
        color: t.fg,
        border: "var(--border-hair) solid " + t.edge,
        font: mono ? "var(--type-mono-label)" : "var(--type-label)",
        letterSpacing: uppercase ? "var(--ls-caps)" : mono ? "var(--ls-mono)" : "var(--ls-body)",
        textTransform: uppercase ? "uppercase" : "none",
        whiteSpace: "nowrap",
        flex: "none",
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={sm ? 10 : 11} strokeWidth={2} /> : null}
      {children}
    </span>
  );
}

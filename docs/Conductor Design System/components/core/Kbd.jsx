import React from "react";

export function Kbd({ children, keys, style, ...rest }) {
  const list = keys || (typeof children === "string" ? children.split("+").map((k) => k.trim()) : [children]);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, ...style }} {...rest}>
      {list.map((k, i) => (
        <span
          key={i}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: 18,
            height: 18,
            padding: "0 4px",
            borderRadius: "var(--radius-xs)",
            background: "var(--glass-2)",
            border: "var(--border-hair) solid var(--edge-2)",
            boxShadow: "var(--shadow-inset-top)",
            font: "var(--type-mono-label)",
            color: "var(--text-tertiary)",
          }}
        >
          {k}
        </span>
      ))}
    </span>
  );
}

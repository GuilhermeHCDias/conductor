import React from "react";
import { Icon } from "./Icon.jsx";

export function SegmentedControl({ value, options = [], onChange, size = "md", fullWidth = false, style, ...rest }) {
  const sm = size === "sm";
  return (
    <div
      role="tablist"
      style={{
        display: fullWidth ? "flex" : "inline-flex",
        alignItems: "center",
        gap: 2,
        padding: 2,
        borderRadius: "var(--radius-sm)",
        background: "var(--glass-sunken)",
        border: "var(--border-hair) solid var(--edge-sunken)",
        boxShadow: "var(--shadow-inset-sunken)",
        ...style,
      }}
      {...rest}
    >
      {options.map((o) => {
        const opt = typeof o === "string" ? { value: o, label: o } : o;
        const on = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange && onChange(opt.value)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 5,
              flex: fullWidth ? 1 : "none",
              height: sm ? 22 : 26,
              padding: sm ? "0 8px" : "0 11px",
              borderRadius: "var(--radius-xs)",
              /* AppKit's segmented control is a raised puck sliding on a recessed track: the
                 selected segment is lighter than its surroundings and casts a small shadow. */
              background: on ? "var(--glass-3)" : "transparent",
              border: "var(--border-hair) solid " + (on ? "var(--edge-2)" : "transparent"),
              boxShadow: on ? "inset 0 0.5px 0 var(--specular), 0 1px 2px oklch(0% 0 0 / 0.22)" : "none",
              color: on ? "var(--text-primary)" : "var(--text-tertiary)",
              font: sm ? "var(--type-label)" : "var(--type-caption)",
              cursor: "pointer",
              whiteSpace: "nowrap",
              transition: "var(--t-hover), box-shadow var(--dur-fast) var(--ease-out)",
            }}
          >
            {opt.icon ? <Icon name={opt.icon} size={sm ? 12 : 13} /> : null}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

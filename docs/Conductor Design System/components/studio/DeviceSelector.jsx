import React from "react";
import { Icon } from "../core/Icon.jsx";
import { StatusDot } from "../core/StatusDot.jsx";

export function DeviceSelector({ device, platform = "Android", state = "connected", onClick, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-4)",
        width: "100%",
        height: "var(--control-h-lg)",
        padding: "0 var(--space-4) 0 var(--space-5)",
        borderRadius: "var(--radius-md)",
        background: hover ? "var(--glass-2)" : "var(--glass-1)",
        border: "var(--border-hair) solid " + (hover ? "var(--edge-strong)" : "var(--edge-2)"),
        boxShadow: "var(--shadow-inset-top)",
        cursor: "pointer",
        transition: "var(--t-hover)",
        ...style,
      }}
      {...rest}
    >
      <StatusDot state={state} size={7} pulse={state === "running"} />
      <span style={{ display: "flex", alignItems: "baseline", gap: "var(--space-3)", flex: 1, minWidth: 0 }}>
        <span style={{ font: "var(--type-code-sm)", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{device}</span>
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", flex: "none" }}>· {platform}</span>
      </span>
      <Icon name="chevrons-up-down" size={13} color="var(--text-tertiary)" />
    </button>
  );
}

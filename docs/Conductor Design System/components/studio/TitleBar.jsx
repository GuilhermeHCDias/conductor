import React from "react";
import { Icon } from "../core/Icon.jsx";

const LIGHTS = [
  { key: "close", fill: "oklch(65% 0.190 22)", glyph: "M3 3l4 4M7 3l-4 4" },
  { key: "minimise", fill: "oklch(80% 0.150 85)", glyph: "M2.5 5h5" },
  { key: "zoom", fill: "oklch(72% 0.165 145)", glyph: "M3 5h4M5 3v4" },
];

export function TitleBar({ projectPath, leading, center, actions, showTrafficLights = true, style, ...rest }) {
  const [hover, setHover] = React.useState(false);
  const [lightsLive, setLightsLive] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setLightsLive(true)}
      onMouseLeave={() => setLightsLive(false)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--space-5)",
        height: "var(--titlebar-h)",
        padding: "0 var(--space-5)",
        flex: "none",
        borderBottom: "var(--border-hair) solid var(--edge-1)",
        WebkitAppRegion: "drag",
        ...style,
      }}
      {...rest}
    >
      {showTrafficLights ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: "none", WebkitAppRegion: "no-drag" }}>
          {LIGHTS.map((l) => (
            <span
              key={l.key}
              aria-label={l.key}
              style={{
                display: "grid",
                placeItems: "center",
                width: 12,
                height: 12,
                borderRadius: "var(--radius-pill)",
                background: lightsLive ? l.fill : "oklch(100% 0 0 / 0.16)",
                boxShadow: lightsLive ? "inset 0 0 0 0.5px oklch(0% 0 0 / 0.18)" : "none",
                transition: "background var(--dur-fast) var(--ease-out)",
              }}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" style={{ opacity: lightsLive ? 0.55 : 0, transition: "opacity var(--dur-fast) var(--ease-out)" }}>
                <path d={l.glyph} stroke="oklch(18% 0.010 265)" strokeWidth="1.3" strokeLinecap="round" fill="none" />
              </svg>
            </span>
          ))}
        </div>
      ) : null}
      {leading ? <div style={{ display: "flex", alignItems: "center", gap: 2, flex: "none", WebkitAppRegion: "no-drag" }}>{leading}</div> : null}
      <div style={{ flex: "1 1 auto", minWidth: 0, display: "grid", justifyContent: "center", WebkitAppRegion: "no-drag" }}>
        {center}
        {!center && projectPath ? (
        <div
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          style={{
            display: "flex",
            alignItems: "center",
            justifySelf: "center",
            gap: "var(--space-3)",
            minWidth: 0,
            height: 24,
            padding: "0 var(--space-4)",
            borderRadius: "var(--radius-sm)",
            background: hover ? "var(--glass-hover)" : "transparent",
            transition: "var(--t-hover)",
            cursor: "pointer",
          }}
        >
          <span
            style={{
              font: "var(--type-code-sm)",
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              direction: "rtl",
              textAlign: "left",
            }}
          >
            {projectPath}
          </span>
          <Icon name="chevron-down" size={12} color="var(--text-disabled)" />
        </div>
        ) : null}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 2, flex: "none", WebkitAppRegion: "no-drag" }}>{actions}</div>
    </div>
  );
}

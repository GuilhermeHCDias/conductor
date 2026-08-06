import React from "react";

const BLUR = { 1: "var(--blur-1)", 2: "var(--blur-2)", 3: "var(--blur-3)" };
const FILL = { 1: "var(--glass-1)", 2: "var(--glass-2)", 3: "var(--glass-3)" };
/* AppKit's two materials. `vibrant` for chrome the desktop shows through (sidebars, toolbars);
   `content` for regions holding text that must sit still (editors, logs). */
const MATERIAL = {
  vibrant: { background: "var(--material-vibrant)", blur: "var(--blur-2)", saturate: "var(--saturate-vibrant)" },
  content: { background: "var(--material-content)", blur: "var(--blur-1)", saturate: "120%" },
};
const SHADOW = { 1: "var(--shadow-inset-top)", 2: "var(--shadow-inset-top), var(--shadow-1)", 3: "var(--shadow-inset-top), var(--shadow-3)" };

export function GlassPanel({ children, depth = 1, radius = "lg", padding, sunken = false, sheen = false, material, as: Tag = "div", style, ...rest }) {
  const r = "var(--radius-" + radius + ")";
  const m = MATERIAL[material];
  const base = sunken
    ? {
        background: "var(--glass-sunken)",
        border: "var(--border-hair) solid var(--edge-sunken)",
        boxShadow: "var(--shadow-inset-sunken)",
      }
    : m
    ? {
        background: m.background,
        backdropFilter: "blur(" + m.blur + ") saturate(" + m.saturate + ")",
        WebkitBackdropFilter: "blur(" + m.blur + ") saturate(" + m.saturate + ")",
        border: "var(--border-hair) solid " + (depth === 1 ? "var(--edge-1)" : "var(--edge-2)"),
        boxShadow: SHADOW[depth],
      }
    : {
        background: FILL[depth],
        backdropFilter: "blur(" + BLUR[depth] + ") saturate(var(--saturate-glass))",
        WebkitBackdropFilter: "blur(" + BLUR[depth] + ") saturate(var(--saturate-glass))",
        border: "var(--border-hair) solid " + (depth === 1 ? "var(--edge-1)" : "var(--edge-2)"),
        boxShadow: SHADOW[depth],
      };
  return (
    <Tag
      style={{
        position: "relative",
        borderRadius: r,
        padding: padding,
        minWidth: 0,
        minHeight: 0,
        ...base,
        ...style,
      }}
      {...rest}
    >
      {sheen && !sunken ? (
        <span
          aria-hidden="true"
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "inherit",
            padding: 1,
            background: "linear-gradient(160deg, var(--specular), transparent 38%, transparent 62%, var(--edge-1))",
            WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            WebkitMaskComposite: "xor",
            mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
            maskComposite: "exclude",
            pointerEvents: "none",
          }}
        />
      ) : null}
      {children}
    </Tag>
  );
}

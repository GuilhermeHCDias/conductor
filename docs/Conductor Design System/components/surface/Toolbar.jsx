import React from "react";

export function Toolbar({ children, align = "left", height, glass = false, divider = "none", padding = "0 var(--space-5)", style, ...rest }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : align === "between" ? "space-between" : "flex-start",
        gap: "var(--space-4)",
        height: height || "var(--toolbar-h)",
        padding,
        flex: "none",
        background: glass ? "var(--glass-1)" : "transparent",
        backdropFilter: glass ? "blur(var(--blur-1)) saturate(var(--saturate-glass))" : undefined,
        WebkitBackdropFilter: glass ? "blur(var(--blur-1)) saturate(var(--saturate-glass))" : undefined,
        borderTop: divider === "top" || divider === "both" ? "var(--border-hair) solid var(--edge-1)" : undefined,
        borderBottom: divider === "bottom" || divider === "both" ? "var(--border-hair) solid var(--edge-1)" : undefined,
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}

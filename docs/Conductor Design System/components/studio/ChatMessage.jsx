import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Button } from "../core/Button.jsx";

export function ChatMessage({ role = "assistant", children, code, codeLabel = "flow.yaml", onInsert, onCopy, pending = false, style, ...rest }) {
  const user = role === "user";
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: user ? "flex-end" : "stretch", gap: "var(--space-4)", ...style }} {...rest}>
      {!user ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <span style={{ display: "grid", placeItems: "center", width: 18, height: 18, borderRadius: "var(--radius-xs)", background: "var(--ai-quiet)", color: "var(--text-ai)", flex: "none" }}>
            <Icon name="sparkles" size={11} />
          </span>
          <span style={{ font: "var(--type-label)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-ai)" }}>Conductor</span>
        </div>
      ) : null}
      <div
        style={{
          maxWidth: user ? "88%" : "100%",
          padding: user ? "8px 11px" : 0,
          borderRadius: user ? "var(--radius-md)" : 0,
          background: user ? "var(--glass-2)" : "transparent",
          border: user ? "var(--border-hair) solid var(--edge-2)" : "none",
          boxShadow: user ? "var(--shadow-inset-top)" : "none",
          font: "var(--type-body)",
          color: user ? "var(--text-primary)" : "var(--text-secondary)",
          textWrap: "pretty",
        }}
      >
        {pending ? (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 5, color: "var(--text-ai)" }}>
            <Icon name="loader-circle" size={13} style={{ animation: "cd-spin 700ms linear infinite" }} />
            Reading the accessibility tree…
          </span>
        ) : (
          children
        )}
      </div>
      {code ? (
        <div
          style={{
            borderRadius: "var(--radius-md)",
            background: "var(--glass-sunken)",
            border: "var(--border-hair) solid var(--ai-edge)",
            boxShadow: "var(--shadow-inset-sunken)",
            overflow: "hidden",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", height: 26, padding: "0 var(--space-4)", borderBottom: "var(--border-hair) solid var(--edge-1)" }}>
            <Icon name="file-code" size={12} color="var(--text-ai)" />
            <span style={{ font: "var(--type-mono-label)", color: "var(--text-tertiary)", flex: 1 }}>{codeLabel}</span>
            {onCopy ? <Icon name="copy" size={12} color="var(--text-disabled)" style={{ cursor: "pointer" }} onClick={onCopy} /> : null}
          </div>
          <pre style={{ margin: 0, padding: "var(--space-4) var(--space-5)", font: "var(--type-code-sm)", color: "var(--text-primary)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{code}</pre>
          {onInsert ? (
            <div style={{ padding: "0 var(--space-4) var(--space-4)" }}>
              <Button variant="ai" size="sm" icon="plus" onClick={onInsert} fullWidth>Insert into flow</Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

import React from "react";
import { Icon } from "../core/Icon.jsx";
import { IconButton } from "../core/IconButton.jsx";
import { Kbd } from "../core/Kbd.jsx";

export function ChatComposer({
  value = "",
  onChange,
  onSubmit,
  placeholder = "Ask Conductor to write a step…",
  context,
  disabled = false,
  busy = false,
  style,
  ...rest
}) {
  const [focus, setFocus] = React.useState(false);
  const send = () => value.trim() && onSubmit && onSubmit(value);
  return (
    <div
      style={{
        display: "grid",
        gap: "var(--space-4)",
        padding: "var(--space-5)",
        borderTop: "var(--border-hair) solid var(--edge-1)",
        flex: "none",
        ...style,
      }}
      {...rest}
    >
      {context ? (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)", padding: "4px 7px", borderRadius: "var(--radius-xs)", background: "var(--accent-quiet)", border: "var(--border-hair) solid var(--accent-edge)", width: "fit-content", maxWidth: "100%" }}>
          <Icon name="crosshair" size={11} color="var(--accent)" />
          <span style={{ font: "var(--type-mono-label)", color: "var(--text-accent)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{context}</span>
          <Icon name="x" size={11} color="var(--text-tertiary)" style={{ cursor: "pointer" }} />
        </div>
      ) : null}
      <div
        style={{
          display: "grid",
          gap: "var(--space-4)",
          padding: "var(--space-4)",
          borderRadius: "var(--radius-md)",
          background: "var(--glass-sunken)",
          border: "var(--border-hair) solid " + (focus ? "var(--ai)" : "var(--edge-sunken)"),
          boxShadow: focus ? "var(--glow-ai)" : "none",
          transition: "border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)",
        }}
      >
        <textarea
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              send();
            }
          }}
          style={{
            width: "100%",
            resize: "none",
            background: "none",
            border: "none",
            outline: "none",
            padding: 0,
            font: "var(--type-body)",
            color: "var(--text-primary)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <IconButton icon="paperclip" label="Attach screenshot" size="sm" />
          <IconButton icon="crosshair" label="Pick an element" size="sm" />
          <span style={{ flex: 1 }} />
          <Kbd>⌘ + ↵</Kbd>
          <button
            type="button"
            aria-label="Send"
            onClick={send}
            disabled={disabled || busy || !value.trim()}
            style={{
              display: "grid",
              placeItems: "center",
              width: 26,
              height: 26,
              borderRadius: "var(--radius-xs)",
              background: value.trim() ? "var(--ai)" : "var(--glass-2)",
              border: "var(--border-hair) solid " + (value.trim() ? "transparent" : "var(--edge-2)"),
              color: value.trim() ? "var(--text-inverse)" : "var(--text-disabled)",
              cursor: value.trim() ? "pointer" : "not-allowed",
              transition: "var(--t-hover)",
            }}
          >
            <Icon name={busy ? "loader-circle" : "send"} size={13} style={{ animation: busy ? "cd-spin 700ms linear infinite" : undefined }} />
          </button>
        </div>
      </div>
    </div>
  );
}

import React from "react";
import { Icon } from "../core/Icon.jsx";

function Node({ node, depth, expanded, selectedId, onToggle, onSelect }) {
  const [hover, setHover] = React.useState(false);
  const isDir = node.type === "dir";
  const open = !!expanded[node.id];
  const on = node.id === selectedId;
  return (
    <>
      <div
        onClick={() => (isDir ? onToggle(node.id) : onSelect && onSelect(node.id))}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          height: "var(--row-h)",
          paddingLeft: 8 + depth * 14,
          paddingRight: 8,
          borderRadius: "var(--radius-xs)",
          background: on ? "var(--glass-selected)" : hover ? "var(--glass-hover)" : "transparent",
          color: on ? "var(--text-primary)" : "var(--text-secondary)",
          cursor: "pointer",
          userSelect: "none",
          transition: "background-color var(--dur-instant) var(--ease-out)",
        }}
      >
        <span style={{ width: 12, display: "grid", placeItems: "center", flex: "none", color: "var(--text-disabled)" }}>
          {isDir ? <Icon name={open ? "chevron-down" : "chevron-right"} size={12} /> : null}
        </span>
        <Icon
          name={isDir ? (open ? "folder-open" : "folder") : node.icon || "file-code"}
          size={13}
          color={isDir ? "var(--text-tertiary)" : on ? "var(--accent)" : "var(--text-disabled)"}
        />
        <span style={{ font: "var(--type-code-sm)", letterSpacing: "var(--ls-mono)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.name}</span>
        {node.badge ? <span style={{ marginLeft: "auto", font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>{node.badge}</span> : null}
      </div>
      {isDir && open && node.children
        ? node.children.map((c) => (
            <Node key={c.id} node={c} depth={depth + 1} expanded={expanded} selectedId={selectedId} onToggle={onToggle} onSelect={onSelect} />
          ))
        : null}
    </>
  );
}

export function FileTree({ nodes = [], selectedId, defaultExpanded = [], onSelect, style, ...rest }) {
  const [expanded, setExpanded] = React.useState(() => Object.fromEntries(defaultExpanded.map((id) => [id, true])));
  const toggle = (id) => setExpanded((e) => ({ ...e, [id]: !e[id] }));
  return (
    <div style={{ display: "grid", alignContent: "start", gap: 1, padding: "var(--space-3)", overflow: "auto", ...style }} {...rest}>
      {nodes.map((n) => (
        <Node key={n.id} node={n} depth={0} expanded={expanded} selectedId={selectedId} onToggle={toggle} onSelect={onSelect} />
      ))}
    </div>
  );
}

import React from "react";
import { Icon } from "../core/Icon.jsx";
import { IconButton } from "../core/IconButton.jsx";
import { Checkbox } from "../core/Checkbox.jsx";
import { StatusDot } from "../core/StatusDot.jsx";

const COLS = "26px 14px 1fr 62px 116px 52px 28px";

function Row({ test, selected, checked, onOpen, onSelect, onCheck, onAction }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={() => onSelect && onSelect(test.id)}
      onDoubleClick={() => onOpen && onOpen(test.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "grid",
        gridTemplateColumns: COLS,
        alignItems: "center",
        gap: "var(--space-4)",
        height: "var(--row-h-lg)",
        padding: "0 var(--space-6)",
        background: selected ? "var(--glass-selected)" : hover ? "var(--glass-hover)" : "transparent",
        cursor: "default",
        transition: "background-color var(--dur-instant) var(--ease-out)",
      }}
    >
      <Checkbox checked={!!checked} onChange={() => onCheck && onCheck(test.id)} style={{ pointerEvents: "auto" }} />
      <StatusDot state={test.lastResult === "never" ? "idle" : test.lastResult} size={7} pulse={test.lastResult === "running"} />
      <span style={{ display: "flex", alignItems: "center", gap: "var(--space-4)", minWidth: 0 }}>
        <span style={{ font: "var(--type-code-sm)", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{test.name}</span>
        {test.open ? <span title="Open in the editor" style={{ width: 5, height: 5, borderRadius: "var(--radius-pill)", background: "var(--accent)", flex: "none" }} /> : null}
        {test.aiAuthored ? <Icon name="sparkles" size={11} color="var(--text-ai)" title="Drafted by Conductor" /> : null}
      </span>
      <span style={{ font: "var(--type-mono-label)", color: "var(--text-tertiary)", textAlign: "right" }}>{test.steps}</span>
      <span style={{ font: "var(--type-mono-label)", color: test.lastResult === "never" ? "var(--text-disabled)" : "var(--text-tertiary)" }}>
        {test.lastResult === "never" ? "never run" : test.lastRun}
      </span>
      <span style={{ font: "var(--type-mono-label)", color: test.lastResult === "fail" ? "var(--state-fail)" : "var(--text-tertiary)", textAlign: "right" }}>{test.duration || "—"}</span>
      <span style={{ opacity: hover || selected ? 1 : 0, transition: "opacity var(--dur-fast) var(--ease-out)" }}>
        <IconButton icon="ellipsis" label={"Actions for " + test.name} size="sm" onClick={(e) => { e.stopPropagation(); onAction && onAction(test.id, e); }} />
      </span>
    </div>
  );
}

export function TestList({
  tests = [],
  selectedId,
  checkedIds = [],
  onOpen,
  onSelect,
  onCheck,
  onCheckAll,
  onAction,
  emptyState,
  style,
  ...rest
}) {
  const allChecked = tests.length > 0 && checkedIds.length === tests.length;
  if (!tests.length && emptyState) return <div style={{ display: "grid", minHeight: 0, ...style }} {...rest}>{emptyState}</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: 0, ...style }} {...rest}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: COLS,
          alignItems: "center",
          gap: "var(--space-4)",
          height: "var(--row-h)",
          padding: "0 var(--space-6)",
          flex: "none",
          borderBottom: "var(--border-hair) solid var(--edge-1)",
          font: "var(--type-mono-label)",
          color: "var(--text-disabled)",
        }}
      >
        <Checkbox checked={allChecked} onChange={() => onCheckAll && onCheckAll(allChecked ? [] : tests.map((t) => t.id))} />
        <span />
        <span>flow</span>
        <span style={{ textAlign: "right" }}>steps</span>
        <span>last run</span>
        <span style={{ textAlign: "right" }}>time</span>
        <span />
      </div>
      <div style={{ overflow: "auto", minHeight: 0, flex: 1 }}>
        {tests.map((t) => (
          <Row
            key={t.id}
            test={t}
            selected={t.id === selectedId}
            checked={checkedIds.includes(t.id)}
            onOpen={onOpen}
            onSelect={onSelect}
            onCheck={onCheck}
            onAction={onAction}
          />
        ))}
      </div>
    </div>
  );
}

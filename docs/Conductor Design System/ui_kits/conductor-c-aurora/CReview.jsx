/* AURORA — sending work to the team.

   Conductor writes to one folder in the repository: conductor/. Every edit is saved to disk the
   instant it happens, so there is no save step and no unsaved state. What DOES need a deliberate
   act is putting the work in front of the team, and that is what this file designs.

   The person using Conductor is not a developer. So the words here are never "pull request",
   "branch", "commit", or "merge" — the whole model is:

     you change tests        (already saved, instantly, on this Mac)
     you send them           (one button, one optional note)
     someone looks at them   (waiting for review)
     they go in              (in the project)

   Underneath, sending runs the GitHub CLI and opens a pull request against the repository. The
   only place that word appears is the "View on GitHub" link, because that leads somewhere the
   word is written anyway.

   One open request at a time. If more changes pile up after sending, they join the request that
   is already open rather than starting a second one — two open requests is a concept this user
   should never have to hold. */
const RevNS = window.ConductorDesignSystem_527814;
const { Icon: RevIcon, Button: RevButton, IconButton: RevIconButton, Tooltip: RevTooltip } = RevNS;

const CHANGE_KIND = {
  new: { verb: "Added", icon: "plus", color: "var(--state-pass)" },
  edited: { verb: "Changed", icon: "pencil", color: "var(--accent)" },
  deleted: { verb: "Deleted", icon: "trash-2", color: "var(--state-fail)" },
};

function revChanges(tests) {
  return (tests || []).filter((t) => t.change).map((t) => ({ ...t, kind: CHANGE_KIND[t.change] }));
}

/* ── Toolbar control ───────────────────────────────────────────────────────────────────────
   Three states, one slot. Nothing to send: a quiet, non-alarming confirmation. Changes waiting:
   a filled accent button, because sending is the one thing on the screen the person came to do
   after editing. Already sent: a neutral pill, not amber — waiting for a colleague is normal,
   not a warning. */
function CSendControl({ count, phase, onClick }) {
  const [hover, setHover] = React.useState(false);
  const base = { display: "flex", alignItems: "center", gap: 6, height: 28, padding: "0 11px", borderRadius: "var(--a-radius-field)", cursor: "pointer", font: "var(--type-caption)", transition: "background var(--dur-fast) var(--ease-out)" };
  if (phase === "review")
    return (
      <RevTooltip content="Waiting for review · sent 2 min ago">
        <button type="button" onClick={onClick} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} style={{ ...base, background: hover ? "var(--glass-hover)" : "var(--a-well)", border: "1px solid var(--a-hair)", color: "var(--text-secondary)" }}>
          <RevIcon name="clock" size={13} color="var(--text-tertiary)" />
          Waiting for review
          {count ? <span style={{ font: "var(--type-mono-label)", color: "var(--accent)" }}>+{count}</span> : null}
        </button>
      </RevTooltip>
    );
  if (!count)
    return (
      <span style={{ ...base, cursor: "default", background: "transparent", border: "1px solid transparent", color: "var(--text-disabled)" }}>
        <RevIcon name="check" size={13} color="var(--state-pass)" />
        Everything sent
      </span>
    );
  return (
    <RevTooltip content={count === 1 ? "Send 1 change to the team" : "Send " + count + " changes to the team"}>
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{ ...base, font: "var(--type-body-strong)", background: hover ? "var(--accent-strong)" : "var(--accent)", border: "1px solid transparent", color: "var(--accent-on)", boxShadow: "var(--a-refract)" }}
      >
        <RevIcon name="send" size={13} color="var(--accent-on)" />
        Send changes
        <span style={{ display: "grid", placeItems: "center", minWidth: 16, height: 16, padding: "0 4px", borderRadius: 999, background: "oklch(100% 0 0 / 0.24)", font: "var(--type-mono-label)" }}>{count}</span>
      </button>
    </RevTooltip>
  );
}

/* ── The sheet ─────────────────────────────────────────────────────────────────────────────
   Same centred glass panel as Doctor: this design system has one modal treatment, not two. */
function CSendRow({ c, last }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "15px minmax(0,1fr) auto", alignItems: "center", columnGap: 10, padding: "9px 12px", borderBottom: last ? "none" : "1px solid var(--a-hair)" }}>
      <RevIcon name={c.kind.icon} size={13} color={c.kind.color} />
      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <span style={{ font: "var(--type-code-sm)", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
        <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>conductor/{c.folder ? c.folder + "/" : ""}</span>
      </span>
      <span style={{ font: "var(--type-caption)", color: c.kind.color }}>{c.kind.verb}</span>
    </div>
  );
}

function CSendSheet({ open, phase, changes, note, setNote, onSend, onClose }) {
  if (!open) return null;
  const sending = phase === "sending";
  const sent = phase === "review";
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: "oklch(16% 0.020 265 / 0.46)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", animation: "cd-fade-in var(--dur-base) var(--ease-out)" }} onClick={sending ? undefined : onClose}>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 32, pointerEvents: "none" }}>
        <div
          onClick={(e) => e.stopPropagation()}
          className="a-rim"
          role="dialog"
          aria-modal="true"
          style={{
            display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", width: 520, maxWidth: "100%", maxHeight: "100%", pointerEvents: "auto", overflow: "hidden",
            background: "linear-gradient(0deg, oklch(100% 0 0 / 0.13), oklch(100% 0 0 / 0.13)), var(--a-content)",
            backdropFilter: "blur(var(--a-blur)) saturate(var(--a-saturate))", WebkitBackdropFilter: "blur(var(--a-blur)) saturate(var(--a-saturate))",
            borderRadius: "var(--a-radius-window)", boxShadow: "var(--a-refract), var(--shadow-window)",
            animation: "cd-dialog-in var(--dur-slow) var(--ease-glass)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "16px 16px 14px" }}>
            <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, flex: "none", borderRadius: "var(--a-radius-field)", background: sent ? "var(--a-well)" : "var(--accent-quiet)", color: sent ? "var(--text-tertiary)" : "var(--accent)" }}>
              <RevIcon name={sent ? "clock" : "send"} size={15} />
            </span>
            <div style={{ display: "grid", gap: 3, flex: 1, minWidth: 0 }}>
              <h2 style={{ font: "var(--type-title-3)", color: "var(--text-primary)" }}>{sent ? "Waiting for review" : changes.length === 1 ? "Send 1 change" : "Send " + changes.length + " changes"}</h2>
              <p style={{ font: "var(--type-body)", color: "var(--text-secondary)", textWrap: "pretty" }}>
                {sent
                  ? window.REVIEWER.name + " will look at these and put them in the shared project. You can keep working — new changes join the same review."
                  : "Your work is already saved on this Mac. Sending puts it in front of " + window.REVIEWER.name + ", who adds it to the shared project."}
              </p>
            </div>
            {sending ? null : <RevIconButton icon="x" label="Close" size="sm" onClick={onClose} />}
          </div>
          <div className="a-scroll" style={{ overflowY: "auto", display: "grid", gap: 12, padding: 16, borderTop: "1px solid var(--a-hair)" }}>
            <div style={{ background: "var(--a-well)", border: "1px solid var(--a-hair)", borderRadius: "var(--a-radius-surface)", overflow: "hidden" }}>
              {changes.map((c, i) => <CSendRow key={c.id} c={c} last={i === changes.length - 1} />)}
            </div>
            {sent ? null : (
              <label style={{ display: "grid", gap: 6 }}>
                <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>What changed? <span style={{ color: "var(--text-disabled)" }}>Optional — it helps the reviewer.</span></span>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  placeholder="Fixed the checkout test after the button moved"
                  disabled={sending}
                  style={{ width: "100%", boxSizing: "border-box", resize: "none", padding: "8px 10px", borderRadius: "var(--a-radius-field)", background: "var(--a-well)", border: "1px solid var(--a-hair)", outline: "none", font: "var(--type-body)", color: "var(--text-primary)" }}
                />
              </label>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderTop: "1px solid var(--a-hair)", background: "var(--a-well)" }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>
              <RevIcon name="folder" size={12} color="var(--text-disabled)" />
              conductor/
            </span>
            {sent ? (
              <>
                <RevButton variant="ghost">View on GitHub</RevButton>
                <RevButton variant="primary" onClick={onClose}>Done</RevButton>
              </>
            ) : (
              <>
                <RevButton variant="ghost" onClick={onClose} disabled={sending}>Not yet</RevButton>
                <RevButton variant="primary" icon={sending ? undefined : "send"} loading={sending} onClick={onSend}>{sending ? "Sending" : "Send for review"}</RevButton>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CSendControl, CSendSheet, revChanges, CHANGE_KIND });

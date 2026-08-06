/* AURORA — Doctor. One dataset, two surfaces.

   1. CDoctorInstaller — the blocking first-run window. Maestro is the only dependency Conductor
      can install by itself, so it is the only thing this window talks about. Small, centred,
      no full traffic lights: it is an installer, not a document window.
   2. CDoctorSheet — the continuous diagnostic. A macOS sheet: it drops out from under the
      toolbar, square along its top edge because it is attached to the window. Everything the
      user must install or sign into themselves is reported here and nowhere else.

   The sheet reports state and does not act. Logins and installs happen in the terminal, by the
   person — Conductor never pretends it can do them. */
const DocNS = window.ConductorDesignSystem_527814;
const { Icon: DocIcon, Button: DocButton, IconButton: DocIconButton, Tooltip: DocTooltip } = DocNS;

const DOCTOR_STATES = {
  ok: { icon: "circle-check", color: "var(--state-pass)" },
  warn: { icon: "circle-alert", color: "var(--state-running)" },
  fail: { icon: "circle-x", color: "var(--state-fail)" },
};

/* Detail lines are machine register — the exact string the CLI printed — so a developer who is
   asked for help reads the same text they would have typed. */
const DOCTOR_GROUPS = [
  {
    label: "Managed by Conductor",
    note: "Installed on first launch and kept current. Nothing here needs you.",
    rows: [{ name: "Maestro", detail: "1.39.9 · ~/.maestro/bin/maestro", short: "1.39.9", status: "ok", label: "Installed" }],
  },
  {
    label: "Android",
    rows: [
      { name: "Android platform-tools", detail: "adb 35.0.2 · /opt/homebrew/bin/adb", short: "adb 35.0.2", status: "ok", label: "Ready" },
      { name: "Java Development Kit", detail: "java -version → command not found", short: "not on PATH", status: "fail", label: "Not found" },
    ],
  },
  {
    label: "Command line",
    rows: [
      { name: "Xcode command line tools", detail: "16.2 · /Library/Developer/CommandLineTools", short: "16.2", status: "ok", label: "Installed" },
      { name: "GitHub CLI", detail: "gh 2.62.0 · /opt/homebrew/bin/gh", short: "gh 2.62.0", status: "ok", label: "Installed" },
    ],
  },
  {
    label: "Accounts",
    note: "Signing in is always yours to do. Conductor reads the state, it never logs in for you.",
    rows: [{ name: "GitHub", detail: "gh auth status → not logged in", short: "not logged in", status: "warn", label: "Signed out" }],
  },
];

const DOCTOR_ISSUES = DOCTOR_GROUPS.reduce((n, g) => n + g.rows.filter((r) => r.status !== "ok").length, 0);

/* Motion comes from the system: cd-dialog-in is the centred-modal entrance, and its
   reduced-motion handling ships with it. No bespoke keyframe here. */

const DOCTOR_LABEL = { font: "var(--type-label)", letterSpacing: "0.09em", textTransform: "uppercase", color: "var(--text-tertiary)" };

function CDoctorRow({ row, last }) {
  const s = DOCTOR_STATES[row.status];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "15px minmax(0,1fr) auto", alignItems: "center", columnGap: 10, padding: "9px 11px", borderBottom: last ? "none" : "1px solid var(--a-hair)" }}>
      <DocIcon name={s.icon} size={15} color={s.color} />
      <span style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <span style={{ font: "var(--type-body-strong)", color: "var(--text-primary)" }}>{row.name}</span>
        <span style={{ font: "var(--type-mono-label)", color: row.status === "ok" ? "var(--text-disabled)" : "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.detail}</span>
      </span>
      <span style={{ font: "var(--type-caption)", color: row.status === "ok" ? "var(--text-tertiary)" : s.color }}>{row.label}</span>
    </div>
  );
}

function CDoctorSheet({ open, onClose }) {
  if (!open) return null;
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 60, background: "oklch(16% 0.020 265 / 0.46)", backdropFilter: "blur(3px)", WebkitBackdropFilter: "blur(3px)", animation: "cd-fade-in var(--dur-base) var(--ease-out)" }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 32, pointerEvents: "none" }}>
        <div
          data-cd-sheet
          className="a-rim"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          style={{
            display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto", width: 520, maxWidth: "100%", maxHeight: "100%", pointerEvents: "auto", overflow: "hidden",
            /* Frontmost layer in the window, so it sits a clear step above the panes behind it:
               --a-content alone lands within a few points of the window fill in dark. A white
               lift over it separates the two in both themes. */
            background: "linear-gradient(0deg, oklch(100% 0 0 / 0.13), oklch(100% 0 0 / 0.13)), var(--a-content)",
            backdropFilter: "blur(var(--a-blur)) saturate(var(--a-saturate))", WebkitBackdropFilter: "blur(var(--a-blur)) saturate(var(--a-saturate))",
            borderRadius: "var(--a-radius-window)",
            boxShadow: "var(--a-refract), var(--shadow-window)",
            animation: "cd-dialog-in var(--dur-slow) var(--ease-glass)",
          }}
        >
          <div style={{ display: "flex", alignItems: "flex-start", gap: 11, padding: "16px 16px 12px" }}>
            <span style={{ display: "grid", placeItems: "center", width: 30, height: 30, flex: "none", borderRadius: "var(--a-radius-field)", background: "var(--accent-quiet)", color: "var(--accent)" }}>
              <DocIcon name="activity" size={16} />
            </span>
            <div style={{ display: "grid", gap: 2, flex: 1, minWidth: 0 }}>
              <h2 style={{ font: "var(--type-title-3)", color: "var(--text-primary)" }}>Doctor</h2>
              <p style={{ font: "var(--type-body)", color: "var(--text-secondary)" }}>What Conductor needs on this Mac. Checked at every launch.</p>
            </div>
            <DocIconButton icon="x" label="Close" size="sm" onClick={onClose} />
          </div>
          <div className="a-scroll" style={{ overflowY: "auto", display: "grid", gap: 14, padding: "16px", borderTop: "1px solid var(--a-hair)" }}>
            {DOCTOR_GROUPS.map((g) => (
              <section key={g.label} style={{ display: "grid", gap: 6 }}>
                <h3 style={{ ...DOCTOR_LABEL, padding: "0 2px" }}>{g.label}</h3>
                <div style={{ background: "var(--a-well)", border: "1px solid var(--a-hair)", borderRadius: "var(--a-radius-surface)", overflow: "hidden" }}>
                  {g.rows.map((r, i) => <CDoctorRow key={r.name} row={r} last={i === g.rows.length - 1} />)}
                </div>
                {g.note ? <p style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", padding: "0 2px", textWrap: "pretty" }}>{g.note}</p> : null}
              </section>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderTop: "1px solid var(--a-hair)", background: "var(--a-well)" }}>
            <span style={{ font: "var(--type-mono-label)", color: "var(--text-tertiary)", flex: 1 }}>Checked Aug 4, 9:12 am</span>
            <DocButton variant="ghost" icon="refresh-cw">Check again</DocButton>
            <DocButton variant="primary" onClick={onClose}>Done</DocButton>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Toolbar affordance. Nothing blocks the app, so the count lives in the chrome until it is zero,
   at which point Doctor is a plain, quiet button like any other window action. */
function CDoctorBadge({ count, onClick, selected }) {
  if (!count)
    return (
      <DocTooltip content="Doctor">
        <DocIconButton icon="activity" label="Doctor" selected={selected} onClick={onClick} />
      </DocTooltip>
    );
  const name = count === 1 ? "Doctor · 1 item needs you" : "Doctor · " + count + " items need you";
  return (
    <DocTooltip content={name}>
      <button
        type="button"
        aria-label={name}
        title={name}
        onClick={onClick}
        style={{ display: "flex", alignItems: "center", gap: 5, height: 28, padding: "0 9px", borderRadius: "var(--a-radius-field)", cursor: "pointer", font: "var(--type-caption)", background: "var(--state-running-quiet)", border: "1px solid var(--state-running-edge)", color: "var(--state-running)" }}
      >
        <DocIcon name="triangle-alert" size={13} color="var(--state-running)" />
        {count}
      </button>
    </DocTooltip>
  );
}

/* ── First run ─────────────────────────────────────────────────────────────────────────────── */

const INSTALL_STEPS = [
  { at: 0, label: "Downloading maestro 1.39.9" },
  { at: 46, label: "Extracting to ~/.maestro" },
  { at: 72, label: "Adding maestro to PATH" },
  { at: 90, label: "Verifying installation" },
];

function useInstallProgress() {
  const [pct, setPct] = React.useState(4);
  React.useEffect(() => {
    const id = setInterval(() => setPct((p) => (p >= 118 ? 4 : p + 1)), 90);
    return () => clearInterval(id);
  }, []);
  const done = pct >= 100;
  const step = [...INSTALL_STEPS].reverse().find((s) => pct >= s.at) || INSTALL_STEPS[0];
  return { pct: Math.min(pct, 100), done, step: step.label };
}

function CDoctorInstaller() {
  const { pct, done, step } = useInstallProgress();
  return (
    <div
      className="a-rim"
      style={{
        position: "relative", zIndex: 1, width: 520, height: 360, boxSizing: "border-box", display: "grid", gridTemplateRows: "auto minmax(0,1fr)",
        borderRadius: "var(--a-radius-window)", background: "var(--a-panel)",
        backdropFilter: "blur(var(--a-blur)) saturate(var(--a-saturate))", WebkitBackdropFilter: "blur(var(--a-blur)) saturate(var(--a-saturate))",
        boxShadow: "var(--shadow-window)", overflow: "hidden",
      }}
    >
      {/* Close is live; minimise and zoom are dead, the way a macOS installer window renders them. */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", background: "var(--a-chrome)", borderBottom: "1px solid var(--a-hair)" }}>
        <span style={{ width: 12, height: 12, borderRadius: 999, background: "oklch(65% 0.200 24)", boxShadow: "inset 0 0 0 0.5px oklch(52% 0.180 24)" }} />
        <span style={{ width: 12, height: 12, borderRadius: 999, background: "var(--a-hair-strong)" }} />
        <span style={{ width: 12, height: 12, borderRadius: 999, background: "var(--a-hair-strong)" }} />
      </div>
      <div style={{ display: "grid", alignContent: "center", justifyItems: "center", gap: 0, padding: "0 44px", textAlign: "center" }}>
        <span style={{ display: "grid", placeItems: "center", width: 54, height: 54, borderRadius: 14, background: "var(--grad-aurora)", boxShadow: "var(--shadow-2), var(--a-refract)" }}>
          <span style={{ font: "var(--type-title-1)", color: "oklch(100% 0 0)", letterSpacing: "-0.05em" }}>C</span>
        </span>
        <h1 style={{ font: "var(--type-title-2)", color: "var(--text-primary)", marginTop: 18 }}>Setting up Conductor</h1>
        <p style={{ font: "var(--type-body)", color: "var(--text-secondary)", marginTop: 6, textWrap: "pretty" }}>Installing Maestro, the runner behind every test. This happens once.</p>
        <div style={{ width: "100%", height: 4, marginTop: 26, borderRadius: 999, background: "var(--a-hair-strong)", overflow: "hidden" }}>
          <div style={{ width: pct + "%", height: "100%", borderRadius: 999, background: done ? "var(--state-pass)" : "var(--accent)", transition: "width var(--dur-base) linear, background var(--dur-base) var(--ease-out)" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", marginTop: 10 }}>
          {done ? <DocIcon name="check" size={13} color="var(--state-pass)" /> : null}
          <span style={{ font: "var(--type-mono-label)", color: done ? "var(--state-pass)" : "var(--text-tertiary)", flex: 1, textAlign: "left" }}>{done ? "maestro 1.39.9 is ready" : step}</span>
          <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>{pct}%</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CDoctorSheet, CDoctorBadge, CDoctorInstaller, DOCTOR_GROUPS, DOCTOR_ISSUES });

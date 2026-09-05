/* AURORA — Doctor installer, variation B (spec managed-tools, 2026-09-04).

   The first-run window grew from one bar to four rows: the JDK, Maestro, the GitHub CLI and
   Android platform-tools, in install order. Same chrome as CDoctorInstaller (close live,
   minimise and zoom dead), the mark and the title side by side now, then one row per tool in
   the sheet's row shape — glyph, name, mono state — and one method line under them. Three
   moments, one layout: the plan and its single click; the rows moving one at a time, the
   active one carrying the 4 px bar under its name; the sign-in card in the method line's place.
   520 × 480 fixed. No log: the person did not ask for this and cannot help with it. */
const DocINS = window.ConductorDesignSystem_527814;
const { Icon: DocIIcon, Button: DocIButton, Checkbox: DocICheckbox } = DocINS;

const INSTALLER_GLYPHS = {
  present: { icon: "circle-check", color: "var(--state-pass)" },
  install: { icon: "circle-dashed", color: "var(--text-tertiary)" },
  alert: { icon: "circle-alert", color: "var(--state-running)" },
  fail: { icon: "circle-x", color: "var(--state-fail)" },
  active: { icon: "loader-circle", color: "var(--accent)" },
};

/* The three moments as data — the view derives exactly these from the store. */
const INSTALLER_MOMENTS = {
  plan: {
    rows: [
      { name: "Zulu JDK 21", glyph: "present", mono: "Installed · java 21.0.4" },
      { name: "Maestro", glyph: "install", mono: "Will download" },
      { name: "GitHub CLI", glyph: "install", mono: "Will install with Homebrew" },
      { name: "Android platform-tools", glyph: "alert", mono: "Accept the terms to install" },
    ],
    method: "Homebrew found at /opt/homebrew/bin/brew — GitHub CLI and platform-tools install through it. The JDK downloads from Azul.",
    terms: true,
    footer: ["Install"],
  },
  progress: {
    rows: [
      { name: "Zulu JDK 21", glyph: "present", mono: "Installed · java 21.0.12.1" },
      { name: "Maestro", glyph: "present", mono: "Installed · 2.10.0" },
      { name: "GitHub CLI", glyph: "active", mono: "Installing gh with Homebrew", bar: null },
      { name: "Android platform-tools", glyph: "install", mono: "Waiting" },
    ],
    method: null,
    terms: false,
    footer: [],
  },
  download: {
    rows: [
      { name: "Zulu JDK 21", glyph: "active", mono: "Downloading Zulu JDK 21 · 43%", bar: 43 },
      { name: "Maestro", glyph: "install", mono: "Waiting" },
      { name: "GitHub CLI", glyph: "install", mono: "Waiting" },
      { name: "Android platform-tools", glyph: "install", mono: "Waiting" },
    ],
    method: null,
    terms: false,
    footer: [],
  },
  failed: {
    rows: [
      { name: "Zulu JDK 21", glyph: "present", mono: "Installed · java 21.0.12.1" },
      { name: "Maestro", glyph: "present", mono: "Installed · 2.10.0" },
      { name: "GitHub CLI", glyph: "fail", mono: "Homebrew couldn't install the GitHub CLI. You can try again, or Conductor can download it instead." },
      { name: "Android platform-tools", glyph: "present", mono: "Installed · adb 37.0.1" },
    ],
    method: null,
    terms: false,
    footer: ["Try again"],
  },
  signin: {
    rows: [
      { name: "Zulu JDK 21", glyph: "present", mono: "Installed · java 21.0.12.1" },
      { name: "Maestro", glyph: "present", mono: "Installed · 2.10.0" },
      { name: "GitHub CLI", glyph: "present", mono: "Installed · gh 2.100.0" },
      { name: "Android platform-tools", glyph: "present", mono: "Installed · adb 37.0.1" },
    ],
    method: null,
    terms: false,
    footer: [],
    card: { code: "1234-ABCD" },
  },
};

function CInstallerRow({ row, last }) {
  const g = INSTALLER_GLYPHS[row.glyph];
  const active = row.glyph === "active";
  return (
    <div style={{ display: "grid", gridTemplateColumns: "15px minmax(0,1fr)", alignItems: "center", columnGap: 10, padding: "7px 12px", borderBottom: last ? "none" : "1px solid var(--a-hair)" }}>
      <DocIIcon name={g.icon} size={15} color={g.color} style={active ? { animation: "cd-spin var(--dur-lazy) linear infinite" } : undefined} />
      <span style={{ display: "grid", gap: 4, minWidth: 0 }}>
        <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, minWidth: 0 }}>
          <span style={{ font: "var(--type-body-strong)", color: "var(--text-primary)" }}>{row.name}</span>
          {active ? null : (
            <span style={{ font: "var(--type-mono-label)", color: row.glyph === "present" ? "var(--text-disabled)" : row.glyph === "install" ? "var(--text-tertiary)" : g.color, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: row.glyph === "fail" ? "normal" : "nowrap" }}>{row.mono}</span>
          )}
        </span>
        {active ? (
          <>
            {/* The kit's 4 px bar: determinate for a download, a shimmer for Homebrew, which prints no progress. */}
            <div style={{ width: "100%", height: 4, borderRadius: 999, background: "var(--a-hair-strong)", overflow: "hidden" }}>
              <div style={{ width: row.bar === null ? "40%" : row.bar + "%", height: "100%", borderRadius: 999, background: "var(--accent)", animation: row.bar === null ? "cd-shimmer calc(var(--dur-lazy) * 2) var(--ease-in-out) infinite" : undefined }} />
            </div>
            <span style={{ font: "var(--type-mono-label)", color: "var(--text-tertiary)" }}>{row.mono}</span>
          </>
        ) : null}
      </span>
    </div>
  );
}

/* Criterion 40 — the sign-in card, in the method line's place. */
function CInstallerSignIn({ code }) {
  return (
    <div style={{ display: "grid", gap: 8, padding: "12px 14px", background: "var(--a-well)", border: "1px solid var(--a-hair)", borderRadius: "var(--a-radius-surface)" }}>
      <span style={{ font: "var(--type-body-strong)", color: "var(--text-primary)" }}>Sign in to GitHub</span>
      {code ? (
        <>
          <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ font: "var(--type-title-2)", fontFamily: "var(--font-mono)", letterSpacing: "0.06em", color: "var(--text-primary)" }}>{code}</span>
            <DocIButton variant="ghost">Copy code</DocIButton>
          </span>
          <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>Enter it at github.com/login/device <a href="#" style={{ color: "var(--accent)" }}>Open GitHub</a></span>
          <span style={{ display: "flex", justifyContent: "flex-end" }}><DocIButton variant="ghost">Cancel</DocIButton></span>
        </>
      ) : (
        <>
          <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)", textWrap: "pretty" }}>Conductor sends your tests to GitHub through the GitHub CLI. Sign in happens in your browser — Conductor never sees your password or token.</span>
          <span style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}><DocIButton variant="primary">Sign in with GitHub</DocIButton></span>
        </>
      )}
    </div>
  );
}

function CDoctorInstallerB({ moment = "plan" }) {
  const m = INSTALLER_MOMENTS[moment] || INSTALLER_MOMENTS.plan;
  const [terms, setTerms] = React.useState(false);
  return (
    <div
      className="a-rim"
      style={{
        position: "relative", zIndex: 1, width: 520, height: 480, boxSizing: "border-box", display: "grid", gridTemplateRows: "auto minmax(0,1fr)",
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
      <div style={{ display: "grid", alignContent: "start", gap: 12, padding: "18px 28px 16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ display: "grid", placeItems: "center", width: 44, height: 44, flex: "none", borderRadius: 11, background: "var(--grad-aurora)", boxShadow: "var(--shadow-2), var(--a-refract)" }}>
            <span style={{ font: "var(--type-title-2)", color: "oklch(100% 0 0)", letterSpacing: "-0.05em" }}>C</span>
          </span>
          <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
            <h1 style={{ font: "var(--type-title-3)", color: "var(--text-primary)" }}>Setting up Conductor</h1>
            <p style={{ font: "var(--type-body)", color: "var(--text-secondary)", textWrap: "pretty" }}>Conductor needs a few tools to run tests on this Mac. It installs what's missing — no password needed.</p>
          </span>
        </div>
        <div style={{ background: "var(--a-well)", border: "1px solid var(--a-hair)", borderRadius: "var(--a-radius-surface)", overflow: "hidden" }}>
          {m.rows.map((r, i) => <CInstallerRow key={r.name} row={r} last={i === m.rows.length - 1} />)}
        </div>
        {m.card ? <CInstallerSignIn code={m.card.code} /> : null}
        {m.method ? <p style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", textWrap: "pretty" }}>{m.method}</p> : null}
        {m.terms ? (
          <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <DocICheckbox checked={terms} onChange={(e) => setTerms(e.target.checked)} label="I accept the Android SDK Platform-Tools terms" />
            <a href="#" style={{ font: "var(--type-caption)", color: "var(--accent)" }}>Read the terms</a>
          </span>
        ) : null}
        {m.footer.length ? (
          <span style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
            {/* One primary button: the four tools are mandatory, so there is nothing to
                continue without; Install waits on the Android terms. */}
            <DocIButton variant="primary" disabled={m.terms && !terms}>{m.footer[0]}</DocIButton>
          </span>
        ) : null}
      </div>
    </div>
  );
}

Object.assign(window, { CDoctorInstallerB, INSTALLER_MOMENTS });

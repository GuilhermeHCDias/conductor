/* AURORA — the repository IS the configuration.

   Conductor asks for one thing, once: the address of the repo being tested. Everything else is
   read from it — which app to launch (so the bundle id is never typed), which branch is
   checked out, and the conductor/ folder the flows live in. Two surfaces share one resolver:

   1. CConnectWindow — first run. A small window, same family as the Doctor installer: Doctor
      sets up the Mac, this points Conductor at a project. Nothing else stands between the
      person and the app.
   2. CRepoPopover — the switcher at the top of the sidebar. Repos are a list, not a setting;
      switching one swaps the whole workspace, and "Add repository…" reopens the same resolver
      as a sheet.

   The resolver never asks for anything it can read. If it cannot read the repo, it says so in
   the terms the developer will act on — the gh command, verbatim. */
const RepoNS = window.ConductorDesignSystem_527814;
const { Icon: RIcon, Button: RButton, IconButton: RIconButton, Dialog: RDialog, Tooltip: RTooltip } = RepoNS;

const R_HAIR = "1px solid var(--a-hair)";
const R_WELL = { background: "var(--a-well)", border: R_HAIR, borderRadius: "var(--a-radius-surface)" };

/* People paste three different strings meaning the same repository: the browser URL (often with
   /tree/main on the end), the https clone URL, and the SSH remote. All three are accepted. */
function parseRepo(raw) {
  const t = (raw || "").trim().replace(/\s+/g, "");
  const m = t.match(/^(?:https?:\/\/)?(?:git@)?(github\.com|gitlab\.com|bitbucket\.org)[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i);
  return m ? { host: m[1].toLowerCase(), org: m[2], name: m[3] } : null;
}

const titleFrom = (name) => name.split(/[-_]/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/* A repo Conductor has never seen resolves too — it just has nothing in conductor/ yet. That is
   a normal state, not an error: the folder is created with the first flow. */
function repoFromUrl(p) {
  const known = (window.REPO_LIBRARY || []).find((r) => r.name.toLowerCase() === p.name.toLowerCase());
  if (known) return { ...known, id: "r-" + p.name.toLowerCase() };
  return {
    id: "r-" + p.name.toLowerCase(), host: p.host, org: p.org, name: p.name, branch: "main",
    app: titleFrom(p.name), bundle: "com." + p.org.replace(/[-_.]/g, "") + "." + p.name.replace(/[-_.]/g, ""),
    platform: "Android", folder: "conductor/", opened: "Now", tests: [], folders: [],
  };
}

const RESOLVE_STEPS = ["Reading the repository", "Finding the app module", "Looking for conductor/"];

function useRepoConnect(repos = [], onDone) {
  const [url, setUrl] = React.useState("");
  const [phase, setPhase] = React.useState("idle");
  const [step, setStep] = React.useState(0);
  const [found, setFound] = React.useState(null);
  const [error, setError] = React.useState(null);
  const timers = React.useRef([]);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const reset = () => { clear(); setPhase("idle"); setStep(0); setFound(null); setError(null); };
  const fail = (title, body, cmd) => { setError({ title, body, cmd }); setPhase("error"); };
  const submit = () => {
    const p = parseRepo(url);
    if (!p) return fail("That is not a repository address", "Paste the address you would clone from — github.com/org/app. The browser URL and the SSH remote both work.");
    if (repos.some((r) => r.name.toLowerCase() === p.name.toLowerCase()))
      return fail("Already connected", p.org + "/" + p.name + " is in your list. Switch to it from the sidebar.");
    clear();
    setPhase("resolving");
    setStep(0);
    [1, 2, 3].forEach((i) => timers.current.push(setTimeout(() => setStep(i), 620 * i)));
    timers.current.push(setTimeout(() => {
      if (p.host !== "github.com") return fail("Conductor reads GitHub only, for now", p.host + " repositories are not supported yet.");
      if (/private|privado|interno/i.test(p.name))
        return fail("Conductor cannot read this repository", "gh could not reach " + p.org + "/" + p.name + ". Sign in with an account that has access, then try again.", "gh auth login");
      const repo = repoFromUrl(p);
      setFound(repo);
      setPhase("found");
    }, 2240));
  };
  return { url, setUrl, phase, step, found, error, submit, reset, confirm: () => found && onDone && onDone(found) };
}

/* ── Resolver body, shared by the first-run window and the add sheet ─────────────────────── */

function CRepoField({ c, autoFocus }) {
  const ref = React.useRef(null);
  const [focus, setFocus] = React.useState(false);
  React.useEffect(() => { if (autoFocus && ref.current) ref.current.focus(); }, [autoFocus]);
  const busy = c.phase === "resolving";
  const invalid = c.phase === "error";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          display: "flex", alignItems: "center", gap: 8, flex: 1, minWidth: 0, height: 34, padding: "0 11px",
          background: "var(--a-well)", borderRadius: "var(--a-radius-field)",
          border: "1px solid " + (invalid ? "var(--state-fail)" : focus ? "var(--accent-edge)" : "var(--a-hair)"),
          boxShadow: focus && !invalid ? "var(--glow-accent)" : "none",
          transition: "box-shadow var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out)",
        }}
      >
        <RIcon name="git-branch" size={14} color={invalid ? "var(--state-fail)" : focus ? "var(--accent)" : "var(--text-tertiary)"} />
        <input
          ref={ref}
          value={c.url}
          disabled={busy}
          onChange={(e) => { c.setUrl(e.target.value); if (c.phase !== "idle") c.reset(); }}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); c.submit(); } }}
          placeholder="github.com/org/app"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", font: "var(--type-code-sm)", color: "var(--text-primary)" }}
        />
        {/* Reads the clipboard in the real app; in this prototype it fills the demo repo. */}
        {c.url ? (
          <RIconButton icon="x" label="Clear" size="sm" onClick={() => { c.setUrl(""); c.reset(); }} />
        ) : (
          <button
            type="button"
            onClick={() => c.setUrl("https://github.com/loja-verde/pnp-fast-mode")}
            style={{ display: "flex", alignItems: "center", gap: 5, height: 22, padding: "0 8px", background: "none", border: R_HAIR, borderRadius: "var(--a-radius-field)", cursor: "pointer", font: "var(--type-caption)", color: "var(--text-secondary)" }}
          >
            <RIcon name="clipboard" size={11} color="var(--text-tertiary)" />
            Paste
          </button>
        )}
      </div>
      <RButton variant="primary" loading={busy} disabled={!c.url.trim()} onClick={c.submit}>Connect</RButton>
    </div>
  );
}

function CResolveSteps({ step }) {
  return (
    <div style={{ ...R_WELL, display: "grid", gap: 9, padding: "12px 13px" }}>
      {RESOLVE_STEPS.map((label, i) => {
        const done = step > i;
        const active = step === i;
        return (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 9, font: "var(--type-caption)", color: done ? "var(--text-secondary)" : active ? "var(--text-primary)" : "var(--text-disabled)" }}>
            {done ? (
              <RIcon name="check" size={13} color="var(--state-pass)" />
            ) : active ? (
              <span style={{ display: "flex", animation: "cd-spin 900ms linear infinite" }}><RIcon name="loader-circle" size={13} color="var(--accent)" /></span>
            ) : (
              <span style={{ width: 13, height: 13, display: "grid", placeItems: "center" }}><span style={{ width: 4, height: 4, borderRadius: 999, background: "var(--a-hair-strong)" }} /></span>
            )}
            {label}
          </span>
        );
      })}
    </div>
  );
}

/* What was read, in the order it matters: the app that will launch, the branch, the folder.
   The bundle id is shown because it is the thing the person would otherwise have had to find. */
function CRepoFound({ repo }) {
  const rows = [
    { icon: "package", label: "App", value: repo.app, mono: false, note: repo.bundle },
    { icon: "git-branch", label: "Branch", value: repo.branch },
    { icon: "folder", label: repo.folder, value: repo.tests.length ? repo.tests.length + (repo.tests.length === 1 ? " flow" : " flows") : "empty for now", quiet: !repo.tests.length },
  ];
  return (
    <div style={{ ...R_WELL, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 13px", borderBottom: R_HAIR }}>
        <RIcon name="circle-check" size={15} color="var(--state-pass)" />
        <span style={{ font: "var(--type-body-strong)", color: "var(--text-primary)", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo.org}/{repo.name}</span>
        <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>{repo.platform}</span>
      </div>
      <div style={{ display: "grid", gap: 8, padding: "11px 13px" }}>
        {rows.map((r) => (
          <span key={r.label} style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
            <RIcon name={r.icon} size={13} color="var(--text-tertiary)" />
            <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", width: 62, flex: "none" }}>{r.label}</span>
            <span style={{ font: "var(--type-caption)", color: r.quiet ? "var(--text-disabled)" : "var(--text-primary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.value}</span>
            {r.note ? <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.note}</span> : null}
          </span>
        ))}
      </div>
      {repo.tests.length ? null : (
        <p style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", padding: "0 13px 11px", textWrap: "pretty" }}>Conductor creates conductor/ with your first flow.</p>
      )}
    </div>
  );
}

function CRepoError({ error, onRetry }) {
  return (
    <div style={{ display: "grid", gap: 9, padding: "12px 13px", background: "var(--state-fail-quiet)", border: "1px solid var(--state-fail-edge)", borderRadius: "var(--a-radius-surface)" }}>
      <span style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
        <RIcon name="circle-x" size={15} color="var(--state-fail)" style={{ marginTop: 1, flex: "none" }} />
        <span style={{ display: "grid", gap: 3, minWidth: 0 }}>
          <span style={{ font: "var(--type-body-strong)", color: "var(--text-primary)" }}>{error.title}</span>
          <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)", textWrap: "pretty" }}>{error.body}</span>
        </span>
      </span>
      {error.cmd ? (
        <span style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: "var(--a-well)", border: R_HAIR, borderRadius: "var(--a-radius-field)" }}>
          <span style={{ font: "var(--type-mono-label)", color: "var(--text-tertiary)" }}>$</span>
          <span style={{ font: "var(--type-code-sm)", color: "var(--text-primary)", flex: 1 }}>{error.cmd}</span>
          <RTooltip content="Copy"><RIconButton icon="copy" label="Copy command" size="sm" /></RTooltip>
        </span>
      ) : null}
      {onRetry ? <span style={{ display: "flex" }}><RButton variant="ghost" size="sm" icon="refresh-cw" onClick={onRetry}>Try again</RButton></span> : null}
    </div>
  );
}

function CRepoResolver({ c, autoFocus }) {
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <CRepoField c={c} autoFocus={autoFocus} />
      {c.phase === "resolving" ? <CResolveSteps step={c.step} /> : null}
      {c.phase === "found" ? <CRepoFound repo={c.found} /> : null}
      {c.phase === "error" ? <CRepoError error={c.error} onRetry={c.error.cmd ? c.submit : null} /> : null}
    </div>
  );
}

/* ── First run ─────────────────────────────────────────────────────────────────────────── */

function CConnectWindow({ onDone }) {
  const c = useRepoConnect([], onDone);
  return (
    <div
      className="a-rim"
      style={{
        position: "relative", zIndex: 1, width: 560, boxSizing: "border-box", display: "grid", gridTemplateRows: "auto minmax(0,1fr) auto",
        borderRadius: "var(--a-radius-window)", background: "var(--a-panel)",
        backdropFilter: "blur(var(--a-blur)) saturate(var(--a-saturate))", WebkitBackdropFilter: "blur(var(--a-blur)) saturate(var(--a-saturate))",
        boxShadow: "var(--shadow-window)", overflow: "hidden",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 14px", background: "var(--a-chrome)", borderBottom: R_HAIR }}>
        <span style={{ width: 12, height: 12, borderRadius: 999, background: "oklch(65% 0.200 24)", boxShadow: "inset 0 0 0 0.5px oklch(52% 0.180 24)" }} />
        <span style={{ width: 12, height: 12, borderRadius: 999, background: "var(--a-hair-strong)" }} />
        <span style={{ width: 12, height: 12, borderRadius: 999, background: "var(--a-hair-strong)" }} />
      </div>
      <div style={{ display: "grid", alignContent: "start", gap: 16, padding: "26px 30px 24px" }}>
        <div style={{ display: "grid", gap: 6 }}>
          {/* Same mark as the Doctor installer: this is the second and last step of first run. */}
          <span style={{ display: "grid", placeItems: "center", width: 38, height: 38, borderRadius: 11, background: "var(--grad-aurora)", boxShadow: "var(--shadow-2), var(--a-refract)", marginBottom: 6 }}>
            <span style={{ font: "var(--type-title-3)", color: "oklch(100% 0 0)", letterSpacing: "-0.05em" }}>C</span>
          </span>
          <h1 style={{ font: "var(--type-title-2)", color: "var(--text-primary)" }}>Point Conductor at a repository</h1>
          <p style={{ font: "var(--type-body)", color: "var(--text-secondary)", textWrap: "pretty" }}>
            Everything comes from the repo: the app to launch, its bundle id, and the conductor/ folder your flows live in. You can add more later.
          </p>
        </div>
        <CRepoResolver c={c} autoFocus />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 16px", borderTop: R_HAIR, background: "var(--a-well)" }}>
        <span style={{ font: "var(--type-mono-label)", color: "var(--text-tertiary)", flex: 1 }}>Nothing is pushed without you</span>
        <RButton variant="primary" disabled={c.phase !== "found"} onClick={c.confirm}>
          {c.phase === "found" ? "Open " + c.found.app : "Open project"}
        </RButton>
      </div>
    </div>
  );
}

/* ── Switcher ──────────────────────────────────────────────────────────────────────────── */

function CRepoRow({ repo, active, onSelect }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onSelect(repo.id)}
      style={{
        display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 9, width: "100%",
        padding: "7px 9px", textAlign: "left", cursor: "pointer", borderRadius: "var(--a-radius-field)",
        background: hover ? "var(--glass-hover)" : "transparent", border: "1px solid transparent",
      }}
    >
      <span style={{ display: "grid", placeItems: "center", width: 24, height: 24, borderRadius: 7, background: active ? "var(--grad-aurora)" : "var(--a-well)", border: active ? "none" : R_HAIR, font: "var(--type-body-strong)", color: active ? "oklch(100% 0 0)" : "var(--text-tertiary)" }}>
        {repo.app.charAt(0)}
      </span>
      <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
        <span style={{ font: "var(--type-caption)", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo.name}</span>
        <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo.bundle}</span>
      </span>
      {active ? <RIcon name="check" size={13} color="var(--accent)" /> : <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>{repo.tests.length || ""}</span>}
    </button>
  );
}

/* A project picker, not a menu: each row carries the bundle id, which is how people tell two
   builds of the same app apart. */
function CRepoPopover({ at, repos, activeId, onSelect, onAdd, onClose }) {
  if (!at) return null;
  return (
    <>
      <div style={{ position: "fixed", inset: 0, zIndex: 70 }} onClick={onClose} onContextMenu={(e) => { e.preventDefault(); onClose(); }} />
      <div
        className="a-rim"
        style={{
          position: "fixed", left: at.x, top: at.y, width: 282, zIndex: 71, display: "grid", gap: 2, padding: 6,
          background: "linear-gradient(0deg, oklch(100% 0 0 / 0.13), oklch(100% 0 0 / 0.13)), var(--a-content)",
          backdropFilter: "blur(var(--a-blur)) saturate(var(--a-saturate))", WebkitBackdropFilter: "blur(var(--a-blur)) saturate(var(--a-saturate))",
          borderRadius: "var(--a-radius-surface)", boxShadow: "var(--a-refract), var(--shadow-window)",
          animation: "cd-menu-in var(--dur-fast) var(--ease-out)",
        }}
      >
        <span style={{ font: "var(--type-label)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-tertiary)", padding: "6px 9px 4px" }}>Repositories</span>
        {repos.map((r) => <CRepoRow key={r.id} repo={r} active={r.id === activeId} onSelect={onSelect} />)}
        <span style={{ height: 1, background: "var(--a-hair)", margin: "4px 0" }} />
        <button
          type="button"
          onClick={onAdd}
          style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "7px 9px", textAlign: "left", cursor: "pointer", background: "none", border: "none", borderRadius: "var(--a-radius-field)", font: "var(--type-caption)", color: "var(--text-secondary)" }}
        >
          <RIcon name="plus" size={13} color="var(--text-tertiary)" />
          Add repository…
        </button>
      </div>
    </>
  );
}

/* The sidebar's top bar. It names the project the whole sidebar belongs to, and carries the two
   facts that change under you: the branch and the app being launched. */
function CRepoBar({ repo, repos, activeId, onSelect, onAdd }) {
  const [at, setAt] = React.useState(null);
  const [hover, setHover] = React.useState(false);
  return (
    <div style={{ display: "flex", alignItems: "center", height: 44, padding: "0 8px", borderBottom: R_HAIR, flex: "none", minWidth: 0 }}>
      <button
        type="button"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setAt(at ? null : { x: Math.round(r.left), y: Math.round(r.bottom + 5) });
        }}
        style={{
          display: "grid", gridTemplateColumns: "auto minmax(0,1fr) auto", alignItems: "center", gap: 9, flex: 1, minWidth: 0,
          height: 34, padding: "0 7px", textAlign: "left", cursor: "pointer", borderRadius: "var(--a-radius-field)",
          background: at || hover ? "var(--glass-hover)" : "transparent", border: "1px solid " + (at ? "var(--a-hair)" : "transparent"),
        }}
      >
        <span style={{ display: "grid", placeItems: "center", width: 22, height: 22, borderRadius: 6, background: "var(--grad-aurora)", boxShadow: "var(--a-refract)", font: "var(--type-body-strong)", color: "oklch(100% 0 0)" }}>{repo.app.charAt(0)}</span>
        <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
          <span style={{ font: "var(--type-body-strong)", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo.name}</span>
          <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{repo.branch} · {repo.bundle}</span>
        </span>
        <RIcon name="chevrons-up-down" size={13} color="var(--text-tertiary)" />
      </button>
      <CRepoPopover
        at={at}
        repos={repos}
        activeId={activeId}
        onSelect={(id) => { onSelect(id); setAt(null); }}
        onAdd={() => { setAt(null); onAdd(); }}
        onClose={() => setAt(null)}
      />
    </div>
  );
}

/* Adding a repo later is the same act as the first one, so it is the same resolver — only the
   container changes, from a window to a sheet. */
function CAddRepoDialog({ open, repos, onAdd, onClose }) {
  const c = useRepoConnect(repos, onAdd);
  React.useEffect(() => { if (open) { c.setUrl(""); c.reset(); } }, [open]);
  return (
    <RDialog
      open={open}
      icon="git-branch"
      title="Add repository"
      subtitle="Conductor reads the app, its bundle id and the conductor/ folder from the repo."
      width={520}
      onClose={onClose}
      footer={
        <>
          <RButton variant="ghost" onClick={onClose}>Cancel</RButton>
          <RButton variant="primary" disabled={c.phase !== "found"} onClick={c.confirm}>{c.phase === "found" ? "Open " + c.found.app : "Open project"}</RButton>
        </>
      }
    >
      <CRepoResolver c={c} autoFocus={open} />
    </RDialog>
  );
}

Object.assign(window, { CConnectWindow, CRepoBar, CAddRepoDialog, CRepoPopover, parseRepo, repoFromUrl });

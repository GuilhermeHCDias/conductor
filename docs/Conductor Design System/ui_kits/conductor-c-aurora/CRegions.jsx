/* AURORA — regions, laid out like a macOS app window.
   sidebar (flows) │ working area (editor + assistant) │ inspector (device)

   The difference from the previous pass: regions are not floating cards on a colourful wash.
   They are ADJACENT AREAS of one window, separated by 1px hairlines, and they differ only in
   how much of the window's blur they let through:

     sidebar / inspector  --a-panel    translucent, the wallpaper reads through (vibrancy)
     working area         --a-content  near-opaque, so code and chat text sit still
     fields / wells       --a-well     recessed controls inside either

   No gaps, no per-panel shadows, no gradient rims, no nested blurs. Controls are small and
   system-sized (26–28px), radii are 6–10, and the only saturated colour is the accent on the
   primary action and the sidebar selection. */
const NS = window.ConductorDesignSystem_527814;
const { DeviceMirror, YamlEditor, Icon, IconButton, Tooltip, ChatMessage, ChatComposer, StatusDot, ContextMenu } = NS;

const A_HAIR = "1px solid var(--a-hair)";
const PANEL = { background: "var(--a-panel)", minHeight: 0 };
const PILL = { background: "var(--a-well)", border: A_HAIR, borderRadius: "var(--a-radius-field)" };
const DOT = { pass: "var(--state-pass)", fail: "var(--state-fail)", never: "var(--state-idle)", running: "var(--state-running)" };
const CAPS = { font: "var(--type-label)", letterSpacing: "var(--ls-caps)", textTransform: "uppercase", color: "var(--text-tertiary)" };
/* Region headers: same height everywhere, hairline underneath, nothing else. */
const HEADER = { display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 8px 0 12px", borderBottom: A_HAIR, flex: "none", minWidth: 0, overflow: "hidden" };

/* ── Sidebar: the conductor/ folder ──────────────────────────────────────────────────────
   A macOS source list, not a file browser: one level of disclosure per folder, 12px of indent
   per level, and the row is the whole hit area. Flows live in conductor/ and in subfolders of
   it, which is the only part of the repository Conductor ever writes to.

   An accent dot on a row means "changed here, and the team has not seen it yet". It is the same
   dot the document tabs use for the same idea, and it rolls up to the folder when collapsed. */
function CFlowRow({ test, selected, depth = 0, onOpen, onMenu }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(test.id)}
      onContextMenu={(e) => { e.preventDefault(); onMenu(test.id, e); }}
      style={{
        display: "grid", gridTemplateColumns: "auto minmax(0, 1fr) auto", alignItems: "center", gap: 9,
        padding: "6px 6px 6px " + (9 + depth * 14) + "px", borderRadius: "var(--a-radius-surface)", cursor: "pointer",
        background: selected ? "var(--accent)" : hover ? "var(--glass-hover)" : "transparent",
        transition: "background var(--dur-fast) var(--ease-out)",
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: selected ? "var(--accent-on)" : DOT[test.lastResult], flex: "none", opacity: selected ? 0.8 : 1 }} />
      <span style={{ display: "grid", gap: 1, minWidth: 0 }}>
        <span style={{ font: "var(--type-code-sm)", color: selected ? "var(--accent-on)" : "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{test.name}</span>
        <span style={{ font: "var(--type-mono-label)", color: selected ? "var(--accent-on)" : "var(--text-disabled)", opacity: selected ? 0.72 : 1 }}>{test.steps} steps · {test.duration || "never run"}</span>
      </span>
      {hover || selected ? (
        <IconButton icon="ellipsis" label="Flow actions" size="sm" onClick={(e) => { e.stopPropagation(); onMenu(test.id, e); }} />
      ) : test.change ? (
        <Tooltip content={test.change === "new" ? "New — not sent yet" : "Changed — not sent yet"}>
          <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--accent)", flex: "none", marginRight: 5 }} />
        </Tooltip>
      ) : test.aiAuthored ? (
        <Icon name="sparkles" size={12} color="var(--ai)" />
      ) : null}
    </div>
  );
}

function CFolderRow({ name, count, unsent, open, onToggle, onMenu, onNew }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onToggle}
      onContextMenu={(e) => { e.preventDefault(); onMenu(e); }}
      style={{ display: "grid", gridTemplateColumns: "12px auto minmax(0,1fr) auto", alignItems: "center", gap: 6, padding: "5px 6px 5px 5px", borderRadius: "var(--a-radius-surface)", cursor: "pointer", background: hover ? "var(--glass-hover)" : "transparent" }}
    >
      <span style={{ display: "flex", transform: open ? "rotate(90deg)" : "none", transition: "transform var(--dur-base) var(--ease-spring)" }}>
        <Icon name="chevron-right" size={12} color="var(--text-tertiary)" />
      </span>
      <Icon name={open ? "folder-open" : "folder"} size={13} color={hover ? "var(--text-secondary)" : "var(--text-tertiary)"} />
      <span style={{ font: "var(--type-code-sm)", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
      {/* The count and the + share one cell and cross-fade, so hovering a folder never nudges
         the row. The + scales up from the count's centre rather than appearing beside it. */}
      <span style={{ position: "relative", width: 22, height: 22, flex: "none" }}>
        <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", opacity: hover ? 0 : 1, transition: "opacity var(--dur-fast) var(--ease-out)" }}>
          {!open && unsent ? (
            <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--accent)" }} />
          ) : (
            <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>{count}</span>
          )}
        </span>
        <span
          style={{
            position: "absolute", inset: 0, display: "grid", placeItems: "center",
            opacity: hover ? 1 : 0, transform: hover ? "scale(1)" : "scale(0.72)",
            pointerEvents: hover ? "auto" : "none",
            transition: "opacity var(--dur-fast) var(--ease-out), transform var(--dur-base) var(--ease-spring)",
          }}
        >
          <Tooltip content={"New flow in " + name}><IconButton icon="plus" label={"New flow in " + name} size="sm" onClick={(e) => { e.stopPropagation(); onNew(); }} /></Tooltip>
        </span>
      </span>
    </div>
  );
}

/* Disclosure animates a MEASURED height, not `0fr → 1fr`: the fr trick under-resolves here
   because the wrapper is a grid item whose own intrinsic size feeds back into the track. Even a
   measured `max-height` is not enough: `overflow:hidden` zeroes the item's automatic minimum
   size, so the scroller's grid shrinks the track and a cap alone gives it no floor to resist
   with. The measured value therefore goes on BOTH `height` and `min-height`. A ResizeObserver
   on the inner content keeps the number honest when a flow is added, renamed or a draft row
   appears. Children stay mounted while closed (clipped, so untabbable) — that is what makes the
   close animate too. */
function CDisclosure({ open, children }) {
  const inner = React.useRef(null);
  const [h, setH] = React.useState(0);
  React.useEffect(() => {
    const el = inner.current;
    if (!el) return;
    const measure = () => setH(el.scrollHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div style={{ overflow: "hidden", height: open ? h + "px" : 0, minHeight: open ? h + "px" : 0, transition: "height var(--dur-base) var(--ease-out), min-height var(--dur-base) var(--ease-out)" }}>
      <div ref={inner} style={{ display: "grid", gap: 1, alignContent: "start", opacity: open ? 1 : 0, transform: open ? "none" : "translateY(-3px)", transition: "opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-out)" }}>
        {children}
      </div>
    </div>
  );
}

/* ── The row that does not exist yet ──────────────────────────────────────────────────────
   Creating and renaming are the same interaction: the row becomes a field in place, the name
   is pre-selected, Return commits, Escape abandons, clicking away commits (Finder's rule —
   nobody expects to lose a typed name by looking elsewhere). A name that collides keeps the
   field open with the reason under it, rather than replacing the row with an alert. */
function CDraftRow({ kind, depth = 0, value, error, onChange, onCommit, onCancel }) {
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) { ref.current.focus(); ref.current.select(); } }, []);
  return (
    <div style={{ display: "grid", gap: 3, padding: "1px 0" }}>
      <div
        style={{
          display: "grid", gridTemplateColumns: "auto minmax(0,1fr)", alignItems: "center", gap: 8,
          padding: "5px 7px 5px " + (7 + depth * 14) + "px", borderRadius: "var(--a-radius-surface)",
          background: "var(--a-well)", border: "1px solid " + (error ? "var(--state-fail)" : "var(--accent-edge)"),
          boxShadow: error ? "none" : "var(--glow-accent)",
        }}
      >
        <Icon name={kind === "folder" ? "folder" : "file-code"} size={13} color={error ? "var(--state-fail)" : "var(--accent)"} />
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); onCommit(); }
            if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); }
          }}
          onBlur={onCommit}
          placeholder={kind === "folder" ? "folder name" : "nome-do-fluxo"}
          spellCheck={false}
          style={{ minWidth: 0, background: "none", border: "none", outline: "none", font: "var(--type-code-sm)", color: "var(--text-primary)" }}
        />
      </div>
      {error ? <span style={{ font: "var(--type-caption)", color: "var(--state-fail)", padding: "0 8px 2px " + (8 + depth * 14) + "px" }}>{error}</span> : null}
    </div>
  );
}

function CFlows({ s }) {
  const [query, setQuery] = React.useState("");
  const [focus, setFocus] = React.useState(false);
  const [newMenu, setNewMenu] = React.useState(null);
  const [folderMenu, setFolderMenu] = React.useState(null);
  const collapsed = s.collapsed;
  const q = query.trim().toLowerCase();
  const match = (t) => !q || t.name.toLowerCase().includes(q) || (t.folder || "").toLowerCase().includes(q);
  const shown = s.tests.filter(match);
  const failing = s.tests.filter((t) => t.lastResult === "fail").length;
  const unsent = s.tests.filter((t) => t.change).length;
  /* Empty folders stay in the tree — a folder you just made must be visible, or making one
     looks like it failed. */
  const folders = s.folders.map((f) => ({ name: f, items: shown.filter((t) => t.folder === f) })).filter((f) => f.items.length || !q);
  const loose = shown.filter((t) => !t.folder);
  const draft = s.newItem;
  const draftRow = (folder) =>
    draft && draft.folder === folder ? (
      <CDraftRow
        key={"draft-" + folder}
        kind={draft.kind}
        depth={folder ? 1 : 0}
        value={draft.value}
        error={draft.error}
        onChange={(v) => s.setNewItem({ ...draft, value: v, error: null })}
        onCommit={s.commitNew}
        onCancel={() => s.setNewItem(null)}
      />
    ) : null;
  const row = (t, depth) =>
    s.renameItem && s.renameItem.kind === "flow" && s.renameItem.id === t.id ? (
      <CDraftRow
        key={t.id}
        kind="flow"
        depth={depth}
        value={s.renameItem.value}
        error={s.renameItem.error}
        onChange={(v) => s.setRenameItem({ ...s.renameItem, value: v, error: null })}
        onCommit={s.commitRename}
        onCancel={() => s.setRenameItem(null)}
      />
    ) : (
      <CFlowRow key={t.id} test={t} depth={depth} selected={t.id === s.activeTab} onOpen={s.openTest} onMenu={(id, e) => s.setRowMenu({ id, x: e.clientX, y: e.clientY })} />
    );
  const folderRow = (f) =>
    s.renameItem && s.renameItem.kind === "folder" && s.renameItem.id === f.name ? (
      <CDraftRow
        kind="folder"
        value={s.renameItem.value}
        error={s.renameItem.error}
        onChange={(v) => s.setRenameItem({ ...s.renameItem, value: v, error: null })}
        onCommit={s.commitRename}
        onCancel={() => s.setRenameItem(null)}
      />
    ) : (
      <CFolderRow
        name={f.name}
        count={f.items.length}
        unsent={f.items.some((t) => t.change)}
        open={!collapsed[f.name]}
        onToggle={() => s.toggleFolder(f.name)}
        onNew={() => s.startNew("flow", f.name)}
        onMenu={(e) => setFolderMenu({ name: f.name, x: e.clientX, y: e.clientY })}
      />
    );
  return (
    <div style={{ ...PANEL, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "auto auto auto minmax(0, 1fr) auto" }}>
      {/* The repository the whole sidebar belongs to. It sits above the Flows header because
          everything below it — folders, flows, the suite run — comes out of that one repo. */}
      <window.CRepoBar repo={s.repo} repos={s.repos} activeId={s.repo.id} onSelect={s.switchRepo} onAdd={() => s.setAddRepo(true)} />
      <div style={HEADER}>
        <span style={CAPS}>Flows</span>
        <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.repo.folder} · {failing} failing</span>
        <span style={{ flex: 1 }} />
        <Tooltip content="New flow or folder" shortcut="⌘N">
          <IconButton
            icon="plus"
            label="New flow or folder"
            size="sm"
            selected={!!newMenu}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setNewMenu({ x: Math.round(r.right - 188), y: Math.round(r.bottom + 5) });
            }}
          />
        </Tooltip>
      </div>
      <div style={{ padding: "10px 10px 6px" }}>
        <div style={{ ...PILL, display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 8px", boxShadow: focus ? "var(--glow-accent)" : "none", borderColor: focus ? "var(--accent-edge)" : "var(--a-hair)", transition: "box-shadow var(--dur-fast) var(--ease-out)" }}>
          <Icon name="search" size={13} color={focus ? "var(--accent)" : "var(--text-tertiary)"} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder="Search"
            style={{ flex: 1, minWidth: 0, background: "none", border: "none", outline: "none", font: "var(--type-caption)", color: "var(--text-primary)" }}
          />
        </div>
      </div>
      <div className="a-scroll" style={{ overflow: "auto", minHeight: 0, display: "grid", gap: 1, alignContent: "start", padding: "0 8px 8px" }}>
        {/* Searching flattens the tree: matches matter more than where they live. */}
        {q
          ? shown.map((t) => row(t, 0))
          : (
            <>
              {folders.map((f) => (
                <React.Fragment key={f.name}>
                  {folderRow(f)}
                  <CDisclosure open={!collapsed[f.name]}>
                    {f.items.map((t) => row(t, 1))}
                    {draftRow(f.name)}
                    {f.items.length || (draft && draft.folder === f.name) ? null : (
                      <button type="button" onClick={() => s.startNew("flow", f.name)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "5px 6px 5px 23px", background: "none", border: "none", borderRadius: "var(--a-radius-surface)", cursor: "pointer", font: "var(--type-caption)", color: "var(--text-disabled)", textAlign: "left" }}>
                        <Icon name="plus" size={11} color="var(--text-disabled)" />
                        Empty — add a flow
                      </button>
                    )}
                  </CDisclosure>
                </React.Fragment>
              ))}
              {loose.map((t) => row(t, 0))}
              {draftRow("")}
            </>
          )}
        {!shown.length && q ? <div style={{ padding: "20px 12px", font: "var(--type-caption)", color: "var(--text-disabled)", textAlign: "center" }}>Nothing matches “{query}”.</div> : null}
        {/* A freshly connected repo lands here. The folder does not exist yet, so the empty state
            is the one action that creates it. */}
        {!s.tests.length && !draft ? (
          <div style={{ display: "grid", justifyItems: "center", gap: 10, padding: "28px 16px", textAlign: "center" }}>
            <Icon name="file-code" size={20} color="var(--text-disabled)" />
            <span style={{ display: "grid", gap: 3 }}>
              <span style={{ font: "var(--type-caption)", color: "var(--text-secondary)" }}>No flows in {s.repo.folder} yet</span>
              <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)", textWrap: "pretty" }}>Conductor creates the folder with the first one.</span>
            </span>
            <button type="button" onClick={() => s.startNew("flow", "")} style={{ display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 11px", background: "var(--a-well)", border: A_HAIR, borderRadius: "var(--a-radius-field)", cursor: "pointer", font: "var(--type-caption)", color: "var(--text-primary)" }}>
              <Icon name="plus" size={12} color="var(--accent)" />
              New flow
            </button>
          </div>
        ) : null}
      </div>
      {/* macOS puts persistent actions on a bottom bar of the sidebar, not on a floating pill. */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, height: 34, padding: "0 8px", borderTop: A_HAIR, flex: "none" }}>
        <button type="button" onClick={s.run} style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, height: 24, padding: "0 6px", background: "none", border: "none", borderRadius: "var(--a-radius-field)", cursor: "pointer", font: "var(--type-caption)", color: "var(--text-secondary)" }}>
          <Icon name="play" size={12} color="var(--text-tertiary)" />
          Run whole suite
        </button>
        {unsent ? <Tooltip content={unsent === 1 ? "1 change not sent yet" : unsent + " changes not sent yet"}><span style={{ display: "flex", alignItems: "center", gap: 5, font: "var(--type-mono-label)", color: "var(--accent)" }}><span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--accent)" }} />{unsent}</span></Tooltip> : null}
        <Tooltip content="Settings"><IconButton icon="settings" label="Settings" size="sm" /></Tooltip>
      </div>
      {newMenu ? (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 70 }} onClick={() => setNewMenu(null)} onContextMenu={(e) => { e.preventDefault(); setNewMenu(null); }} />
          <ContextMenu
            x={newMenu.x}
            y={newMenu.y}
            width={188}
            items={[
              { id: "flow", label: "New flow", icon: "file-code", shortcut: "⌘N" },
              { id: "folder", label: "New folder", icon: "folder-plus", shortcut: "⇧⌘N" },
            ]}
            onSelect={(item) => { s.startNew(item.id, ""); setNewMenu(null); }}
          />
        </>
      ) : null}
      {folderMenu ? (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 70 }} onClick={() => setFolderMenu(null)} onContextMenu={(e) => { e.preventDefault(); setFolderMenu(null); }} />
          <ContextMenu
            x={folderMenu.x}
            y={folderMenu.y}
            width={206}
            title={folderMenu.name + "/"}
            items={[
              { id: "flow", label: "New flow here", icon: "file-code" },
              { id: "rename", label: "Rename folder…", icon: "pencil" },
              { type: "separator" },
              { id: "delete", label: "Delete folder", icon: "trash-2", destructive: true },
            ]}
            onSelect={(item) => {
              if (item.id === "flow") s.startNew("flow", folderMenu.name);
              if (item.id === "rename") s.startRename("folder", folderMenu.name);
              if (item.id === "delete") s.askDelete("folder", folderMenu.name);
              setFolderMenu(null);
            }}
          />
        </>
      ) : null}
    </div>
  );
}

/* ── Working area ──────────────────────────────────────────────────────────────────────── */
/* Document tabs, macOS style: a strip of the window, active tab filled and lifted by a
   hairline rather than by a shadow. */
function CTab({ tab, active, onSelect, onClose }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onSelect(tab.id)}
      style={{
        display: "flex", alignItems: "center", gap: 7, height: 26, padding: "0 6px 0 10px", borderRadius: "var(--a-radius-field)", cursor: "pointer",
        minWidth: 0, maxWidth: 190, flex: "0 1 auto",
        background: active ? "var(--a-well)" : hover ? "var(--glass-hover)" : "transparent",
        border: "1px solid " + (active ? "var(--a-hair)" : "transparent"),
      }}
    >
      <Icon name="file-code" size={12} color={active ? "var(--accent)" : "var(--text-tertiary)"} style={{ flex: "none" }} />
      <span style={{ font: "var(--type-code-sm)", color: active ? "var(--text-primary)" : "var(--text-secondary)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab.label}</span>
      {tab.dirty ? <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--accent)", flex: "none" }} /> : null}
      {active || hover ? <span style={{ display: "flex", flex: "none" }}><IconButton icon="x" label="Close tab" size="sm" onClick={(e) => { e.stopPropagation(); onClose(tab.id); }} /></span> : null}
    </div>
  );
}

function CTabStrip({ s }) {
  return (
    <div style={{ ...HEADER, padding: "0 8px", gap: 4 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 3, minWidth: 0, overflow: "hidden", flex: "0 1 auto" }}>
        {s.tabs.map((t) => (
          <CTab key={t.id} tab={t} active={t.id === s.activeTab} onSelect={s.setActiveTab} onClose={s.closeTab} />
        ))}
        <IconButton icon="plus" label="New tab" size="sm" onClick={s.newTab} />
      </div>
      <span style={{ flex: 1 }} />
      <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>YAML</span>
    </div>
  );
}

/* Run / Assistant as a segmented control — the macOS way to switch a pane's content. */
function CSubTabs({ value, onChange, running }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, height: 38, padding: "0 10px", borderTop: A_HAIR, borderBottom: A_HAIR, flex: "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 2, padding: 2, background: "var(--a-well)", border: A_HAIR, borderRadius: "var(--a-radius-surface)" }}>
        {[{ id: "run", label: "Run" }, { id: "assistant", label: "Assistant" }].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 6, height: 22, padding: "0 12px", cursor: "pointer",
              borderRadius: 5, border: "1px solid " + (value === t.id ? "var(--a-hair)" : "transparent"),
              background: value === t.id ? "var(--glass-3)" : "transparent",
              boxShadow: value === t.id ? "var(--shadow-1)" : "none",
              font: value === t.id ? "var(--type-body-strong)" : "var(--type-body)",
              color: value === t.id ? "var(--text-primary)" : "var(--text-secondary)",
            }}
          >
            {t.label}
            {t.id === "run" && running ? <span style={{ width: 5, height: 5, borderRadius: 999, background: "var(--state-running)" }} /> : null}
          </button>
        ))}
      </div>
      <span style={{ flex: 1 }} />
      <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>{value === "run" ? "adb · logcat attached" : "Conductor 1.4"}</span>
    </div>
  );
}

const STEP_TINT = { pass: "var(--state-pass)", fail: "var(--state-fail)", running: "var(--state-running)" };

function CRunPanel({ s }) {
  if (!s.steps.length) {
    return (
      <div style={{ display: "grid", placeItems: "center", padding: 32, gap: 8, alignContent: "center" }}>
        <Icon name="play" size={18} color="var(--text-disabled)" />
        <span style={{ font: "var(--type-caption)", color: "var(--text-tertiary)", textAlign: "center" }}>Run the flow and every step reports here as it executes.</span>
      </div>
    );
  }
  return (
    <div style={{ display: "grid", alignContent: "start", padding: "8px 16px 16px" }}>
      {s.steps.map((step, i) => (
        <div key={step.id || i} style={{ position: "relative", display: "grid", gridTemplateColumns: "16px minmax(0, 1fr) auto", alignItems: "center", gap: 11, minHeight: 32 }}>
          <span style={{ position: "absolute", left: 7, top: i ? 0 : "50%", bottom: i === s.steps.length - 1 ? "50%" : 0, width: 1, background: "var(--a-hair-strong)" }} />
          <span style={{ position: "relative", display: "grid", placeItems: "center", width: 16, height: 16 }}>
            <span style={{ width: step.status === "running" ? 8 : 6, height: step.status === "running" ? 8 : 6, borderRadius: 999, background: STEP_TINT[step.status] || "var(--text-disabled)", boxShadow: step.status === "running" ? "0 0 0 4px var(--state-running-quiet)" : "0 0 0 3px var(--a-content)" }} />
          </span>
          <span style={{ font: "var(--type-code-sm)", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.label}</span>
          <span style={{ font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>{step.duration || ""}</span>
        </div>
      ))}
    </div>
  );
}

function CAssistantPanel({ s }) {
  return (
    <div style={{ display: "grid", alignContent: "start", gap: 16, padding: "16px 16px 8px" }}>
      {s.thread.map((m, i) => (
        <ChatMessage key={i} role={m.role} code={m.code} onInsert={m.code ? () => s.insert(m.code) : undefined} onCopy={m.code ? () => {} : undefined}>
          {m.body}
        </ChatMessage>
      ))}
      {s.busy ? <ChatMessage pending /> : null}
      {s.thread.length === 1 ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {["Open the first pending order", "Assert both order cards are visible", "Screenshot after checkout"].map((p) => (
            <button key={p} type="button" onClick={() => s.ask(p)} style={{ ...PILL, height: 26, padding: "0 12px", cursor: "pointer", font: "var(--type-caption)", color: "var(--text-secondary)" }}>{p}</button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CEditorColumn({ s }) {
  const scroller = React.useRef(null);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; });
    return () => cancelAnimationFrame(id);
  }, [s.thread.length, s.busy, s.steps.length, s.lower]);
  const activeLine = s.yaml.replace(/\n$/, "").split("\n").length;
  return (
    <div style={{ background: "var(--a-content)", display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "auto minmax(120px, 0.95fr) auto minmax(0, 1.05fr) auto", minHeight: 0, minWidth: 0 }}>
      <CTabStrip s={s} />
      <div className="a-scroll" style={{ display: "grid", overflow: "auto", minHeight: 0 }}>
        <YamlEditor value={s.yaml} activeLine={activeLine} aiLines={s.aiLines} />
      </div>
      <CSubTabs value={s.lower} onChange={s.setLower} running={s.running} />
      <div ref={scroller} className="a-scroll" style={{ overflow: "auto", minHeight: 0 }}>
        {s.lower === "run" ? <CRunPanel s={s} /> : <CAssistantPanel s={s} />}
      </div>
      <div style={{ borderTop: A_HAIR, padding: 10, flex: "none" }}>
        <ChatComposer
          style={{ background: "var(--a-well)", border: A_HAIR, borderRadius: "var(--a-radius-region)" }}
          value={s.draft}
          onChange={(e) => s.setDraft(e.target.value)}
          onSubmit={(v) => { s.setLower("assistant"); s.ask(v); }}
          busy={s.busy}
          placeholder="Ask Conductor to write a step…"
          context={s.inspector.node ? s.inspector.node.kind + " · " + s.inspector.node.text : undefined}
        />
      </div>
    </div>
  );
}

/* ── Inspector: device ─────────────────────────────────────────────────────────────────── */
/* The right pane is an inspector, so it takes the same vibrancy as the sidebar. The phone is
   the one physical object in the window and keeps its own drop shadow.
   INVARIANT: the header degrades in priority order as the pane narrows — serial truncates,
   then the caps label goes, then reload/screenshot go. Inspect always survives: it is the
   mode the whole window is in. */
function CDevice({ s }) {
  const ins = s.inspector;
  const fit = window.useMirrorFit({ maxWidth: s.frame.mirror });
  const [headW, setHeadW] = React.useState(999);
  const headRef = React.useRef(null);
  React.useEffect(() => {
    const el = headRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeadW(el.clientWidth));
    ro.observe(el);
    setHeadW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const roomy = headW >= 250;
  const tools = headW >= 190;
  return (
    <div style={{ ...PANEL, display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gridTemplateRows: "auto minmax(0, 1fr)", width: s.frame.mirror + 40 }}>
      <div ref={headRef} style={HEADER}>
        {roomy ? <span style={{ ...CAPS, flex: "none" }}>Device</span> : null}
        <button type="button" onClick={() => s.setDeviceDialog(true)} style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, overflow: "hidden", background: "none", border: "none", padding: 0, cursor: "pointer", font: "var(--type-mono-label)", color: "var(--text-disabled)" }}>
          <span style={{ display: "flex", flex: "none" }}><StatusDot state={s.running ? "running" : s.device.state} size={7} /></span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.device.serial}</span>
        </button>
        <span style={{ flex: 1 }} />
        {tools ? <Tooltip content="Reload" shortcut="⌘R"><IconButton icon="refresh-cw" label="Reload mirror" size="sm" /></Tooltip> : null}
        {tools ? <Tooltip content="Screenshot"><IconButton icon="camera" label="Screenshot" size="sm" /></Tooltip> : null}
        <Tooltip content="Inspect elements"><IconButton icon="crosshair" label="Inspect" size="sm" selected /></Tooltip>
      </div>
      <div style={{ display: "grid", minHeight: 0, minWidth: 0, padding: 14 }}>
        <div ref={fit.bayRef} style={{ display: "grid", placeItems: "center", minHeight: 0, minWidth: 0, overflow: "hidden" }}>
          <div style={{ width: fit.outerWidth, height: fit.outerHeight, position: "relative" }}>
            <DeviceMirror
              style={fit.transform}
              width={fit.width}
              height={fit.height}
              live={s.device.state === "connected"}
              contentRef={ins.contentRef}
              onMouseOver={ins.onMouseOver}
              onMouseOut={ins.onMouseOut}
              highlight={ins.node ? ins.node.rect : undefined}
              highlightLabel={ins.node ? ins.node.kind + " · " + ins.node.text : undefined}
              onContextMenu={(e) => ins.onContext(e, s.setMenu)}
            >
              <window.AppUnderTest />
            </DeviceMirror>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CFlows, CEditorColumn, CDevice, A_HAIR, A_PANEL: PANEL, A_PILL: PILL, A_HEADER: HEADER, A_CAPS: CAPS });

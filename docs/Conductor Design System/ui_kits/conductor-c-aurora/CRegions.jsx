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
const {
  DeviceMirror,
  YamlEditor,
  Icon,
  IconButton,
  Tooltip,
  ChatMessage,
  ChatComposer,
  StatusDot,
} = NS;

const A_HAIR = '1px solid var(--a-hair)';
const PANEL = { background: 'var(--a-panel)', minHeight: 0 };
const PILL = { background: 'var(--a-well)', border: A_HAIR, borderRadius: 'var(--a-radius-field)' };
const DOT = {
  pass: 'var(--state-pass)',
  fail: 'var(--state-fail)',
  never: 'var(--state-idle)',
  running: 'var(--state-running)',
};
const CAPS = {
  font: 'var(--type-label)',
  letterSpacing: 'var(--ls-caps)',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
};
/* Region headers: same height everywhere, hairline underneath, nothing else. */
const HEADER = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 38,
  padding: '0 8px 0 12px',
  borderBottom: A_HAIR,
  flex: 'none',
  minWidth: 0,
  overflow: 'hidden',
};

/* ── Sidebar: flows ────────────────────────────────────────────────────────────────────── */
function CFlowRow({ test, selected, onOpen, onMenu }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={() => onOpen(test.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onMenu(test.id, e);
      }}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
        alignItems: 'center',
        gap: 9,
        padding: '6px 6px 6px 9px',
        borderRadius: 'var(--a-radius-surface)',
        cursor: 'pointer',
        background: selected ? 'var(--accent)' : hover ? 'var(--glass-hover)' : 'transparent',
        transition: 'background var(--dur-fast) var(--ease-out)',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 999,
          background: selected ? 'var(--accent-on)' : DOT[test.lastResult],
          flex: 'none',
          opacity: selected ? 0.8 : 1,
        }}
      />
      <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <span
          style={{
            font: 'var(--type-code-sm)',
            color: selected ? 'var(--accent-on)' : 'var(--text-secondary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {test.name}
        </span>
        <span
          style={{
            font: 'var(--type-mono-label)',
            color: selected ? 'var(--accent-on)' : 'var(--text-disabled)',
            opacity: selected ? 0.72 : 1,
          }}
        >
          {test.steps} steps · {test.duration || 'never run'}
        </span>
      </span>
      {hover || selected ? (
        <IconButton
          icon="ellipsis"
          label="Flow actions"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onMenu(test.id, e);
          }}
        />
      ) : test.aiAuthored ? (
        <Icon name="sparkles" size={12} color="var(--ai)" />
      ) : null}
    </div>
  );
}

function CFlows({ s }) {
  const [query, setQuery] = React.useState('');
  const [focus, setFocus] = React.useState(false);
  const shown = s.tests.filter((t) => !query || t.name.toLowerCase().includes(query.toLowerCase()));
  const failing = s.tests.filter((t) => t.lastResult === 'fail').length;
  return (
    <div
      style={{
        ...PANEL,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: 'auto auto minmax(0, 1fr) auto',
      }}
    >
      <div style={HEADER}>
        <span style={CAPS}>Flows</span>
        <span style={{ font: 'var(--type-mono-label)', color: 'var(--text-disabled)' }}>
          {s.tests.length} · {failing} failing
        </span>
        <span style={{ flex: 1 }} />
        <Tooltip content="New flow">
          <IconButton icon="plus" label="New flow" size="sm" />
        </Tooltip>
      </div>
      <div style={{ padding: '10px 10px 6px' }}>
        <div
          style={{
            ...PILL,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            height: 26,
            padding: '0 8px',
            boxShadow: focus ? 'var(--glow-accent)' : 'none',
            borderColor: focus ? 'var(--accent-edge)' : 'var(--a-hair)',
            transition: 'box-shadow var(--dur-fast) var(--ease-out)',
          }}
        >
          <Icon name="search" size={13} color={focus ? 'var(--accent)' : 'var(--text-tertiary)'} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setFocus(false)}
            placeholder="Search"
            style={{
              flex: 1,
              minWidth: 0,
              background: 'none',
              border: 'none',
              outline: 'none',
              font: 'var(--type-caption)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
      </div>
      <div
        className="a-scroll"
        style={{
          overflow: 'auto',
          minHeight: 0,
          display: 'grid',
          gap: 1,
          alignContent: 'start',
          padding: '0 8px 8px',
        }}
      >
        {shown.map((t) => (
          <CFlowRow
            key={t.id}
            test={t}
            selected={t.id === s.activeTab}
            onOpen={s.openTest}
            onMenu={(id, e) => s.setRowMenu({ id, x: e.clientX, y: e.clientY })}
          />
        ))}
        {!shown.length ? (
          <div
            style={{
              padding: '20px 12px',
              font: 'var(--type-caption)',
              color: 'var(--text-disabled)',
              textAlign: 'center',
            }}
          >
            Nothing matches “{query}”.
          </div>
        ) : null}
      </div>
      {/* macOS puts persistent actions on a bottom bar of the sidebar, not on a floating pill. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          height: 34,
          padding: '0 8px',
          borderTop: A_HAIR,
          flex: 'none',
        }}
      >
        <button
          type="button"
          onClick={s.run}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            flex: 1,
            height: 24,
            padding: '0 6px',
            background: 'none',
            border: 'none',
            borderRadius: 'var(--a-radius-field)',
            cursor: 'pointer',
            font: 'var(--type-caption)',
            color: 'var(--text-secondary)',
          }}
        >
          <Icon name="play" size={12} color="var(--text-tertiary)" />
          Run whole suite
        </button>
        <Tooltip content="Settings">
          <IconButton icon="settings" label="Settings" size="sm" />
        </Tooltip>
      </div>
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
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        height: 26,
        padding: '0 6px 0 10px',
        borderRadius: 'var(--a-radius-field)',
        cursor: 'pointer',
        background: active ? 'var(--a-well)' : hover ? 'var(--glass-hover)' : 'transparent',
        border: '1px solid ' + (active ? 'var(--a-hair)' : 'transparent'),
      }}
    >
      <Icon name="file-code" size={12} color={active ? 'var(--accent)' : 'var(--text-tertiary)'} />
      <span
        style={{
          font: 'var(--type-code-sm)',
          color: active ? 'var(--text-primary)' : 'var(--text-secondary)',
        }}
      >
        {tab.label}
      </span>
      {tab.dirty ? (
        <span style={{ width: 5, height: 5, borderRadius: 999, background: 'var(--accent)' }} />
      ) : null}
      {active || hover ? (
        <IconButton
          icon="x"
          label="Close tab"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onClose(tab.id);
          }}
        />
      ) : null}
    </div>
  );
}

function CTabStrip({ s }) {
  return (
    <div style={{ ...HEADER, padding: '0 8px', gap: 4 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 3,
          minWidth: 0,
          overflow: 'hidden',
          flex: '0 1 auto',
        }}
      >
        {s.tabs.map((t) => (
          <CTab
            key={t.id}
            tab={t}
            active={t.id === s.activeTab}
            onSelect={s.setActiveTab}
            onClose={s.closeTab}
          />
        ))}
        <IconButton icon="plus" label="New tab" size="sm" onClick={s.newTab} />
      </div>
      <span style={{ flex: 1 }} />
      <span style={{ font: 'var(--type-mono-label)', color: 'var(--text-disabled)' }}>YAML</span>
    </div>
  );
}

/* Run / Assistant as a segmented control — the macOS way to switch a pane's content. */
function CSubTabs({ value, onChange, running }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        height: 38,
        padding: '0 10px',
        borderTop: A_HAIR,
        borderBottom: A_HAIR,
        flex: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 2,
          padding: 2,
          background: 'var(--a-well)',
          border: A_HAIR,
          borderRadius: 'var(--a-radius-surface)',
        }}
      >
        {[
          { id: 'run', label: 'Run' },
          { id: 'assistant', label: 'Assistant' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              height: 22,
              padding: '0 12px',
              cursor: 'pointer',
              borderRadius: 5,
              border: '1px solid ' + (value === t.id ? 'var(--a-hair)' : 'transparent'),
              background: value === t.id ? 'var(--glass-3)' : 'transparent',
              boxShadow: value === t.id ? 'var(--shadow-1)' : 'none',
              font: value === t.id ? 'var(--type-body-strong)' : 'var(--type-body)',
              color: value === t.id ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {t.label}
            {t.id === 'run' && running ? (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 999,
                  background: 'var(--state-running)',
                }}
              />
            ) : null}
          </button>
        ))}
      </div>
      <span style={{ flex: 1 }} />
      <span style={{ font: 'var(--type-mono-label)', color: 'var(--text-disabled)' }}>
        {value === 'run' ? 'adb · logcat attached' : 'Conductor 1.4'}
      </span>
    </div>
  );
}

const STEP_TINT = {
  pass: 'var(--state-pass)',
  fail: 'var(--state-fail)',
  running: 'var(--state-running)',
};

function CRunPanel({ s }) {
  if (!s.steps.length) {
    return (
      <div
        style={{
          display: 'grid',
          placeItems: 'center',
          padding: 32,
          gap: 8,
          alignContent: 'center',
        }}
      >
        <Icon name="play" size={18} color="var(--text-disabled)" />
        <span
          style={{
            font: 'var(--type-caption)',
            color: 'var(--text-tertiary)',
            textAlign: 'center',
          }}
        >
          Run the flow and every step reports here as it executes.
        </span>
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', alignContent: 'start', padding: '8px 16px 16px' }}>
      {s.steps.map((step, i) => (
        <div
          key={step.id || i}
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: '16px minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: 11,
            minHeight: 32,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 7,
              top: i ? 0 : '50%',
              bottom: i === s.steps.length - 1 ? '50%' : 0,
              width: 1,
              background: 'var(--a-hair-strong)',
            }}
          />
          <span
            style={{
              position: 'relative',
              display: 'grid',
              placeItems: 'center',
              width: 16,
              height: 16,
            }}
          >
            <span
              style={{
                width: step.status === 'running' ? 8 : 6,
                height: step.status === 'running' ? 8 : 6,
                borderRadius: 999,
                background: STEP_TINT[step.status] || 'var(--text-disabled)',
                boxShadow:
                  step.status === 'running'
                    ? '0 0 0 4px var(--state-running-quiet)'
                    : '0 0 0 3px var(--a-content)',
              }}
            />
          </span>
          <span
            style={{
              font: 'var(--type-code-sm)',
              color: 'var(--text-secondary)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {step.label}
          </span>
          <span style={{ font: 'var(--type-mono-label)', color: 'var(--text-disabled)' }}>
            {step.duration || ''}
          </span>
        </div>
      ))}
    </div>
  );
}

function CAssistantPanel({ s }) {
  return (
    <div style={{ display: 'grid', alignContent: 'start', gap: 16, padding: '16px 16px 8px' }}>
      {s.thread.map((m, i) => (
        <ChatMessage
          key={i}
          role={m.role}
          code={m.code}
          onInsert={m.code ? () => s.insert(m.code) : undefined}
          onCopy={m.code ? () => {} : undefined}
        >
          {m.body}
        </ChatMessage>
      ))}
      {s.busy ? <ChatMessage pending /> : null}
      {s.thread.length === 1 ? (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {[
            'Open the first pending order',
            'Assert both order cards are visible',
            'Screenshot after checkout',
          ].map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => s.ask(p)}
              style={{
                ...PILL,
                height: 26,
                padding: '0 12px',
                cursor: 'pointer',
                font: 'var(--type-caption)',
                color: 'var(--text-secondary)',
              }}
            >
              {p}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function CEditorColumn({ s }) {
  const scroller = React.useRef(null);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [s.thread.length, s.busy, s.steps.length, s.lower]);
  const activeLine = s.yaml.replace(/\n$/, '').split('\n').length;
  return (
    <div
      style={{
        background: 'var(--a-content)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: 'auto minmax(120px, 0.95fr) auto minmax(0, 1.05fr) auto',
        minHeight: 0,
        minWidth: 0,
      }}
    >
      <CTabStrip s={s} />
      <div className="a-scroll" style={{ display: 'grid', overflow: 'auto', minHeight: 0 }}>
        <YamlEditor value={s.yaml} activeLine={activeLine} aiLines={s.aiLines} />
      </div>
      <CSubTabs value={s.lower} onChange={s.setLower} running={s.running} />
      <div ref={scroller} className="a-scroll" style={{ overflow: 'auto', minHeight: 0 }}>
        {s.lower === 'run' ? <CRunPanel s={s} /> : <CAssistantPanel s={s} />}
      </div>
      <div style={{ borderTop: A_HAIR, padding: 10, flex: 'none' }}>
        <ChatComposer
          style={{
            background: 'var(--a-well)',
            border: A_HAIR,
            borderRadius: 'var(--a-radius-region)',
          }}
          value={s.draft}
          onChange={(e) => s.setDraft(e.target.value)}
          onSubmit={(v) => {
            s.setLower('assistant');
            s.ask(v);
          }}
          busy={s.busy}
          placeholder="Ask Conductor to write a step…"
          context={
            s.inspector.node ? s.inspector.node.kind + ' · ' + s.inspector.node.text : undefined
          }
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
    <div
      style={{
        ...PANEL,
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gridTemplateRows: 'auto minmax(0, 1fr)',
        width: s.frame.mirror + 40,
      }}
    >
      <div ref={headRef} style={HEADER}>
        {roomy ? <span style={{ ...CAPS, flex: 'none' }}>Device</span> : null}
        <button
          type="button"
          onClick={() => s.setDeviceDialog(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            minWidth: 0,
            overflow: 'hidden',
            background: 'none',
            border: 'none',
            padding: 0,
            cursor: 'pointer',
            font: 'var(--type-mono-label)',
            color: 'var(--text-disabled)',
          }}
        >
          <StatusDot state={s.running ? 'running' : s.device.state} size={7} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {s.device.serial}
          </span>
        </button>
        <span style={{ flex: 1 }} />
        {tools ? (
          <Tooltip content="Reload" shortcut="⌘R">
            <IconButton icon="refresh-cw" label="Reload mirror" size="sm" />
          </Tooltip>
        ) : null}
        {tools ? (
          <Tooltip content="Screenshot">
            <IconButton icon="camera" label="Screenshot" size="sm" />
          </Tooltip>
        ) : null}
        <Tooltip content="Inspect elements">
          <IconButton icon="crosshair" label="Inspect" size="sm" selected />
        </Tooltip>
      </div>
      <div style={{ display: 'grid', minHeight: 0, minWidth: 0, padding: 14 }}>
        <div
          ref={fit.bayRef}
          style={{
            display: 'grid',
            placeItems: 'center',
            minHeight: 0,
            minWidth: 0,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: fit.outerWidth,
              height: fit.outerHeight,
              position: 'relative',
              filter: 'drop-shadow(var(--device-drop))',
            }}
          >
            <DeviceMirror
              style={fit.transform}
              width={fit.width}
              height={fit.height}
              live={s.device.state === 'connected'}
              contentRef={ins.contentRef}
              onMouseOver={ins.onMouseOver}
              onMouseOut={ins.onMouseOut}
              highlight={ins.node ? ins.node.rect : undefined}
              highlightLabel={ins.node ? ins.node.kind + ' · ' + ins.node.text : undefined}
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

Object.assign(window, {
  CFlows,
  CEditorColumn,
  CDevice,
  A_HAIR,
  A_PANEL: PANEL,
  A_PILL: PILL,
  A_HEADER: HEADER,
  A_CAPS: CAPS,
});

/* AURORA — shell. One macOS window on a quiet desktop: a unified toolbar (traffic lights,
   document title, window actions) over three adjacent panes divided by hairlines. The window
   owns the single blur; nothing inside it floats.

   Run state is reported by a hairline progress line under the toolbar and by the dot on the
   Run segment. Nothing else moves. */
const NS = window.ConductorDesignSystem_527814;
const {
  ContextMenu,
  Dialog,
  Button,
  IconButton,
  Icon,
  StatusDot,
  Checkbox,
  Tooltip,
  ACTION_ICONS,
} = NS;
const { CFlows, CEditorColumn, CDevice, A_HAIR } = window;

const C_BREAKPOINTS = [
  { min: 1360, mirror: 300, flows: true },
  { min: 1120, mirror: 268, flows: true },
  { min: 0, mirror: 250, flows: false },
];

function useCFrame() {
  const ref = React.useRef(null);
  const [w, setW] = React.useState(1440);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setW(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const bp = C_BREAKPOINTS.find((b) => w >= b.min) || C_BREAKPOINTS[C_BREAKPOINTS.length - 1];
  return { ...bp, ref, width: w };
}

function useStudioC(opts = {}) {
  const frame = useCFrame();
  const [doctor, setDoctor] = React.useState(!!opts.doctor);
  const inspector = window.useInspector();
  const [flowsPref, setFlowsPref] = React.useState('auto');
  const flows = flowsPref === 'auto' ? frame.flows : flowsPref;
  const [yaml, setYaml] = React.useState(window.FLOW_START);
  const [aiLines, setAiLines] = React.useState([]);
  const [menu, setMenu] = React.useState(null);
  const [rowMenu, setRowMenu] = React.useState(null);
  const [tests, setTests] = React.useState(window.TESTS);
  const [tabs, setTabs] = React.useState([{ id: 'f-teste', label: 'teste.yaml', dirty: true }]);
  const [activeTab, setActiveTab] = React.useState('f-teste');
  const [lower, setLower] = React.useState('assistant');
  const [env, setEnv] = React.useState('staging');
  const [running, setRunning] = React.useState(false);
  const [steps, setSteps] = React.useState([]);
  const [draft, setDraft] = React.useState('');
  const HELLO = {
    role: 'assistant',
    body: "Right-click anything on the device and I'll write the step. Or just tell me what the test should do.",
  };
  const [thread, setThread] = React.useState([HELLO]);
  const [busy, setBusy] = React.useState(false);
  const [deviceDialog, setDeviceDialog] = React.useState(false);
  const [device, setDevice] = React.useState({ serial: 'R9QYC01EMXL', state: 'connected' });
  const timers = React.useRef([]);
  React.useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn, ms) => timers.current.push(setTimeout(fn, ms));

  React.useEffect(() => {
    const onKey = (e) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        setFlowsPref((p) => !(p === 'auto' ? frame.flows : p));
      }
      if (meta && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setLower((l) => (l === 'assistant' ? 'run' : 'assistant'));
      }
      if (e.key === 'Escape') {
        setMenu(null);
        setRowMenu(null);
        setDoctor(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [frame.flows]);

  const commandCount = () => yaml.split('\n').filter((l) => /^- /.test(l)).length;

  const flash = (next) => {
    const before = yaml.replace(/\n$/, '').split('\n').length;
    const added = [];
    for (let i = before + 1; i <= next.replace(/\n$/, '').split('\n').length; i++) added.push(i);
    setYaml(next);
    setAiLines(added);
    later(() => setAiLines([]), 2600);
  };

  const run = () => {
    const commands = yaml
      .split('\n')
      .filter((l) => /^- /.test(l))
      .map((l) => l.replace(/^- /, '').replace(/:$/, '').trim());
    setLower('run');
    setRunning(true);
    setSteps([]);
    commands.forEach((c, i) => {
      later(
        () => {
          setSteps((s) => [
            ...s.map((x) =>
              x.status === 'running'
                ? { ...x, status: 'pass', duration: '0:0' + (1 + (i % 2)) }
                : x,
            ),
            { id: c + i, label: window.STEP_LABELS[c] || c, status: 'running' },
          ]);
          if (i === commands.length - 1)
            later(() => {
              setSteps((s) =>
                s.map((x) =>
                  x.status === 'running' ? { ...x, status: 'pass', duration: '0:01' } : x,
                ),
              );
              setRunning(false);
            }, 700);
        },
        600 * (i + 1),
      );
    });
  };

  const ask = (text) => {
    setThread((t) => [...t, { role: 'user', body: text }]);
    setDraft('');
    setBusy(true);
    setLower('assistant');
    later(() => {
      const node = inspector.node || window.A11Y_FALLBACK;
      setThread((t) => [
        ...t,
        {
          role: 'assistant',
          body: 'I matched a text node in the first order card. This taps it by visible text, then waits for the detail screen.',
          code:
            '- tapOn:\n    ' +
            node.selector +
            '\n- extendedWaitUntil:\n    visible:\n      text: "Detalhes do pedido"\n    timeout: 10000',
        },
      ]);
      setBusy(false);
    }, 1400);
  };

  return {
    frame,
    inspector,
    yaml,
    aiLines,
    menu,
    setMenu,
    rowMenu,
    setRowMenu,
    tests,
    setTests,
    flows,
    toggleFlows: () => setFlowsPref((p) => !(p === 'auto' ? frame.flows : p)),
    tabs,
    setTabs,
    activeTab,
    setActiveTab,
    lower,
    setLower,
    openTest: (id) => {
      const test = tests.find((t) => t.id === id);
      if (!test) return;
      setTabs((t) => (t.some((x) => x.id === id) ? t : [...t, { id, label: test.name }]));
      setActiveTab(id);
    },
    closeTab: (id) => {
      setTabs((t) => (t.length > 1 ? t.filter((x) => x.id !== id) : t));
      if (tabs.length > 1 && id === activeTab) setActiveTab(tabs.filter((x) => x.id !== id)[0].id);
    },
    newTab: () => {
      const id = 'f-new' + tabs.length;
      setTabs((t) => [...t, { id, label: 'novo-' + t.length + '.yaml' }]);
      setActiveTab(id);
    },
    env,
    setEnv,
    running,
    steps,
    doctor,
    setDoctor,
    draft,
    setDraft,
    thread,
    busy,
    ask,
    insert: (code) => flash(yaml.replace(/\n$/, '') + '\n' + code + '\n'),
    appendStep: (command, node) =>
      flash(yaml.replace(/\n$/, '') + '\n' + window.SNIPPETS[command](node) + '\n'),
    run,
    commandCount,
    deviceDialog,
    setDeviceDialog,
    device,
    setDevice,
  };
}

function CCommandMenu({ s }) {
  if (!s.menu) return null;
  const node = s.menu.node;
  const items = [];
  window.COMMAND_GROUPS.forEach((g, gi) => {
    if (gi) items.push({ type: 'separator' });
    items.push({ type: 'label', label: g.label });
    g.commands.forEach((c) => items.push({ id: c, label: c, icon: ACTION_ICONS[c], mono: true }));
  });
  items.push({ type: 'separator' });
  items.push({ id: '__ai', label: 'Ask Conductor about this element', icon: 'sparkles', ai: true });
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 70 }}
        onClick={() => s.setMenu(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          s.setMenu(null);
        }}
      />
      <ContextMenu
        x={s.menu.x}
        y={s.menu.y}
        title={node.kind + ' · "' + node.text + '"'}
        items={items}
        onSelect={(item) => {
          if (item.id === '__ai') s.ask('What can I assert about ' + node.selector + '?');
          else s.appendStep(item.id, node);
          s.setMenu(null);
        }}
      />
    </>
  );
}

function CFlowMenu({ s }) {
  if (!s.rowMenu) return null;
  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 70 }}
        onClick={() => s.setRowMenu(null)}
        onContextMenu={(e) => {
          e.preventDefault();
          s.setRowMenu(null);
        }}
      />
      <ContextMenu
        x={s.rowMenu.x}
        y={s.rowMenu.y}
        width={196}
        items={[
          { id: 'open', label: 'Open in editor', icon: 'file-code' },
          { id: 'rename', label: 'Rename…', icon: 'pencil' },
          { id: 'duplicate', label: 'Duplicate', icon: 'copy' },
          { type: 'separator' },
          { id: 'run', label: 'Run now', icon: 'play' },
          { type: 'separator' },
          { id: 'delete', label: 'Delete flow', icon: 'trash-2', destructive: true },
        ]}
        onSelect={(item) => {
          if (item.id === 'open') s.openTest(s.rowMenu.id);
          if (item.id === 'run') {
            s.openTest(s.rowMenu.id);
            s.run();
          }
          if (item.id === 'delete') s.setTests((t) => t.filter((x) => x.id !== s.rowMenu.id));
          if (item.id === 'duplicate') {
            const src = s.tests.find((x) => x.id === s.rowMenu.id);
            if (src)
              s.setTests((t) => [
                {
                  ...src,
                  id: src.id + '-copy',
                  name: src.name.replace('.yaml', '-copy.yaml'),
                  lastResult: 'never',
                  duration: undefined,
                },
                ...t,
              ]);
          }
          s.setRowMenu(null);
        }}
      />
    </>
  );
}

function CDevices({ s }) {
  const [scan, setScan] = React.useState(false);
  return (
    <Dialog
      open={s.deviceDialog}
      icon="smartphone"
      title="Devices"
      subtitle="Conductor talks to Android over adb. Plug in a phone or start an emulator."
      onClose={() => s.setDeviceDialog(false)}
      footer={
        <>
          <Button variant="ghost" onClick={() => s.setDeviceDialog(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="refresh-cw"
            loading={scan}
            onClick={() => {
              setScan(true);
              setTimeout(() => setScan(false), 900);
            }}
          >
            Scan again
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gap: 8 }}>
        {[
          { serial: 'R9QYC01EMXL', model: 'Galaxy S23 · Android 14', state: 'connected' },
          { serial: 'emulator-5554', model: 'Pixel 7 API 34 · Android 14', state: 'offline' },
        ].map((d) => (
          <button
            key={d.serial}
            type="button"
            onClick={() => {
              s.setDevice({ serial: d.serial, state: d.state });
              s.setDeviceDialog(false);
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-5)',
              padding: '11px 14px',
              textAlign: 'left',
              borderRadius: 'var(--a-radius-surface)',
              background: d.serial === s.device.serial ? 'var(--accent-quiet)' : 'var(--a-well)',
              border:
                '1px solid ' +
                (d.serial === s.device.serial ? 'var(--accent-edge)' : 'var(--a-hair)'),
              cursor: 'pointer',
            }}
          >
            <StatusDot state={d.state} size={8} />
            <span style={{ display: 'grid', gap: 2, flex: 1 }}>
              <span style={{ font: 'var(--type-code-sm)', color: 'var(--text-primary)' }}>
                {d.serial}
              </span>
              <span style={{ font: 'var(--type-caption)', color: 'var(--text-tertiary)' }}>
                {d.model}
              </span>
            </span>
            {d.serial === s.device.serial ? (
              <Icon name="check" size={14} color="var(--accent)" />
            ) : null}
          </button>
        ))}
        <Checkbox
          checked
          label="Reconnect automatically"
          hint="Conductor re-attaches when the device reappears on adb."
        />
      </div>
    </Dialog>
  );
}

/* Light/dark is a property of the window, so it lives with the window controls, not in a
   settings screen. Persisted, because nobody wants to re-pick it every launch. */
function useAuroraTheme() {
  const [dark, setDark] = React.useState(
    () => localStorage.getItem('conductor.aurora.dark') === '1',
  );
  React.useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'aurora-dark' : 'aurora';
    localStorage.setItem('conductor.aurora.dark', dark ? '1' : '0');
  }, [dark]);
  return [dark, setDark];
}

/* Real traffic lights: fixed macOS hues, 12px, with a faint darker rim so they read on glass. */
const LIGHTS = [
  { key: 'close', fill: 'oklch(65% 0.200 24)', rim: 'oklch(52% 0.180 24)' },
  { key: 'min', fill: 'oklch(82% 0.150 85)', rim: 'oklch(66% 0.140 78)' },
  { key: 'max', fill: 'oklch(76% 0.170 145)', rim: 'oklch(60% 0.150 145)' },
];

function CToolbar({ s, dark, setDark }) {
  const active = s.tabs.find((t) => t.id === s.activeTab);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        height: 52,
        padding: '0 10px 0 14px',
        background: 'var(--a-chrome)',
        borderBottom: A_HAIR,
        flex: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {LIGHTS.map((l) => (
          <span
            key={l.key}
            style={{
              width: 12,
              height: 12,
              borderRadius: 999,
              background: l.fill,
              boxShadow: 'inset 0 0 0 0.5px ' + l.rim,
            }}
          />
        ))}
      </div>
      <Tooltip content={s.flows ? 'Hide sidebar' : 'Show sidebar'} shortcut="⌘B">
        <IconButton
          icon="panel-left"
          label="Toggle sidebar"
          selected={s.flows}
          onClick={s.toggleFlows}
        />
      </Tooltip>
      {/* Document title, macOS-style: name plus a quiet subtitle, left of centre. */}
      <div style={{ display: 'grid', gap: 1, minWidth: 0, marginLeft: 4 }}>
        <span
          style={{
            font: 'var(--type-body-strong)',
            color: 'var(--text-primary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {active ? active.label : 'Conductor'}
        </span>
        <span style={{ font: 'var(--type-mono-label)', color: 'var(--text-disabled)' }}>
          {s.commandCount()} commands · {s.running ? 'running' : 'saved to suite'}
        </span>
      </div>
      <span style={{ flex: 1 }} />
      <window.CDoctorBadge
        count={window.DOCTOR_ISSUES}
        selected={s.doctor}
        onClick={() => s.setDoctor((v) => !v)}
      />
      <button
        type="button"
        onClick={() => s.setEnv(s.env === 'staging' ? 'prod' : 'staging')}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 28,
          padding: '0 11px',
          background: 'var(--a-well)',
          border: A_HAIR,
          borderRadius: 'var(--a-radius-field)',
          cursor: 'pointer',
          font: 'var(--type-caption)',
          color: 'var(--text-secondary)',
        }}
      >
        <Icon name="variable" size={12} color="var(--text-tertiary)" />
        {s.env}
        <Icon name="chevron-down" size={12} color="var(--text-tertiary)" />
      </button>
      <button
        type="button"
        onClick={s.running ? undefined : s.run}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          height: 28,
          padding: '0 13px',
          borderRadius: 'var(--a-radius-field)',
          cursor: 'pointer',
          font: 'var(--type-body-strong)',
          border: '1px solid transparent',
          background: s.running ? 'var(--state-fail-quiet)' : 'var(--accent)',
          color: s.running ? 'var(--state-fail)' : 'var(--accent-on)',
          boxShadow: s.running ? 'none' : 'var(--a-refract)',
        }}
      >
        <Icon
          name={s.running ? 'circle-stop' : 'play'}
          size={13}
          color={s.running ? 'var(--state-fail)' : 'var(--accent-on)'}
        />
        {s.running ? 'Stop' : 'Run'}
      </button>
      <span style={{ width: 1, height: 20, background: 'var(--a-hair)' }} />
      <Tooltip content={dark ? 'Light appearance' : 'Dark appearance'}>
        <IconButton
          icon={dark ? 'sun' : 'moon'}
          label="Toggle dark mode"
          onClick={() => setDark((v) => !v)}
        />
      </Tooltip>
      <Tooltip content="Save flow" shortcut="⌘S">
        <IconButton icon="download" label="Save flow" />
      </Tooltip>
    </div>
  );
}

function StudioC({ doctor = false, doctorVariant = 'a' }) {
  const s = useStudioC({ doctor });
  const DoctorSheet =
    doctorVariant === 'b' && window.CDoctorSheetB ? window.CDoctorSheetB : window.CDoctorSheet;
  const [dark, setDark] = useAuroraTheme();
  const total = s.commandCount() || 1;
  const pct = s.running ? Math.min(100, Math.round((s.steps.length / total) * 100)) : 0;
  const cols = s.flows
    ? 'minmax(200px, 268px) 1px minmax(0, 1fr) 1px auto'
    : 'minmax(0, 1fr) 1px auto';
  return (
    <div
      ref={s.frame.ref}
      style={{
        position: 'relative',
        height: '100vh',
        overflow: 'hidden',
        background: 'var(--bg-window)',
        display: 'grid',
        padding: 22,
        boxSizing: 'border-box',
      }}
    >
      <div className="a-wash"></div>
      <div
        className="a-rim"
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateRows: 'auto minmax(0, 1fr)',
          minHeight: 0,
          overflow: 'hidden',
          borderRadius: 'var(--a-radius-window)',
          background: 'var(--a-panel)',
          backdropFilter: 'blur(var(--a-blur)) saturate(var(--a-saturate))',
          WebkitBackdropFilter: 'blur(var(--a-blur)) saturate(var(--a-saturate))',
          boxShadow: 'var(--shadow-window)',
        }}
      >
        <CToolbar s={s} dark={dark} setDark={setDark} />
        <div
          style={{ position: 'relative', display: 'grid', gridTemplateColumns: cols, minHeight: 0 }}
        >
          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: 2,
              background: 'var(--accent)',
              width: pct + '%',
              opacity: s.running ? 1 : 0,
              transition:
                'width var(--dur-slow) var(--ease-out), opacity var(--dur-base) var(--ease-out)',
              zIndex: 5,
            }}
          />
          {s.flows ? (
            <>
              <CFlows s={s} />
              <span style={{ background: 'var(--a-hair)' }} />
            </>
          ) : null}
          <CEditorColumn s={s} />
          <span style={{ background: 'var(--a-hair)' }} />
          <CDevice s={s} />
          <DoctorSheet open={s.doctor} onClose={() => s.setDoctor(false)} />
        </div>
      </div>
      <CCommandMenu s={s} />
      <CFlowMenu s={s} />
      <CDevices s={s} />
    </div>
  );
}

Object.assign(window, { StudioC, useStudioC });

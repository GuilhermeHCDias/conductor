/* AURORA — Doctor, variation B. Same sheet, same placement, different reading order.

   A reads as a form: four equal group cards, every row two lines, ownership stated before state.
   B leads with the verdict — a status band naming what is wrong — and then one continuous table
   ordered by who has to act: NEEDS YOU first, READY under it. Healthy rows carry only a version;
   the full CLI string appears where something is broken and a person has to read it.

   Same data (window.DOCTOR_GROUPS), so the two stay in sync. */
const DocBNS = window.ConductorDesignSystem_527814;
const { Icon: DocBIcon, Button: DocBButton, IconButton: DocBIconButton } = DocBNS;

const DOC_B_STATES = {
  ok: { icon: 'circle-check', color: 'var(--state-pass)' },
  warn: { icon: 'circle-alert', color: 'var(--state-running)' },
  fail: { icon: 'circle-x', color: 'var(--state-fail)' },
};

function docBRows() {
  const all = [];
  (window.DOCTOR_GROUPS || []).forEach((g) =>
    g.rows.forEach((r) => all.push({ ...r, group: g.label })),
  );
  return {
    issues: all.filter((r) => r.status !== 'ok'),
    ready: all.filter((r) => r.status === 'ok'),
  };
}

function CDoctorRowB({ row, last, full }) {
  const s = DOC_B_STATES[row.status];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '15px minmax(0,1fr) auto',
        alignItems: 'center',
        columnGap: 10,
        padding: full ? '8px 14px' : '7px 14px',
        borderBottom: last ? 'none' : '1px solid var(--a-hair)',
      }}
    >
      <DocBIcon name={s.icon} size={15} color={s.color} />
      <span style={{ display: 'grid', gap: 1, minWidth: 0 }}>
        <span style={{ font: 'var(--type-body-strong)', color: 'var(--text-primary)' }}>
          {row.name}
        </span>
        <span
          style={{
            font: 'var(--type-mono-label)',
            color: row.status === 'ok' ? 'var(--text-disabled)' : s.color,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {full ? row.detail : row.short}
        </span>
      </span>
      <span
        style={{
          font: 'var(--type-caption)',
          color: row.status === 'ok' ? 'var(--text-tertiary)' : s.color,
        }}
      >
        {row.label}
      </span>
    </div>
  );
}

function CDoctorSectionB({ label, children }) {
  return (
    <>
      <div
        style={{
          padding: '7px 14px 6px',
          background: 'var(--a-well)',
          borderBottom: '1px solid var(--a-hair)',
          font: 'var(--type-label)',
          letterSpacing: '0.09em',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
        }}
      >
        {label}
      </div>
      {children}
    </>
  );
}

function CDoctorSheetB({ open, onClose }) {
  if (!open) return null;
  const { issues, ready } = docBRows();
  const verdict =
    issues.length === 0
      ? {
          icon: 'circle-check',
          color: 'var(--state-pass)',
          fill: 'var(--state-pass-quiet)',
          edge: 'var(--state-pass-edge)',
          title: 'Everything is ready',
          body: 'Conductor has what it needs on this Mac.',
        }
      : {
          icon: 'triangle-alert',
          color: 'var(--state-running)',
          fill: 'var(--state-running-quiet)',
          edge: 'var(--state-running-edge)',
          title: issues.length === 1 ? '1 thing needs you' : issues.length + ' things need you',
          body: 'Conductor runs without them, and cannot install or sign in on your behalf.',
        };
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 60,
        background: 'oklch(16% 0.020 265 / 0.46)',
        backdropFilter: 'blur(3px)',
        WebkitBackdropFilter: 'blur(3px)',
        animation: 'cd-fade-in var(--dur-base) var(--ease-out)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 560,
          maxWidth: 'calc(100% - 32px)',
          overflow: 'hidden',
          borderRadius: '0 0 var(--a-radius-region) var(--a-radius-region)',
        }}
      >
        <div
          data-cd-sheet
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          style={{
            display: 'grid',
            gridTemplateRows: 'auto auto minmax(0,1fr) auto',
            maxHeight: 'min(680px, calc(100vh - 140px))',
            background:
              'linear-gradient(0deg, oklch(100% 0 0 / 0.13), oklch(100% 0 0 / 0.13)), var(--a-content)',
            backdropFilter: 'blur(30px) saturate(var(--a-saturate))',
            WebkitBackdropFilter: 'blur(30px) saturate(var(--a-saturate))',
            borderRadius: '0 0 var(--a-radius-region) var(--a-radius-region)',
            boxShadow: 'var(--a-refract), 0 0 0 1px var(--a-hair-strong), var(--shadow-3)',
            animation: 'cd-sheet-in var(--dur-slow) var(--ease-glass)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '11px 12px 11px 16px',
              borderBottom: '1px solid var(--a-hair)',
            }}
          >
            <span
              style={{ font: 'var(--type-body-strong)', color: 'var(--text-primary)', flex: 1 }}
            >
              Doctor
            </span>
            <span style={{ font: 'var(--type-mono-label)', color: 'var(--text-tertiary)' }}>
              checked 9:12 am
            </span>
            <DocBIconButton icon="x" label="Close" size="sm" onClick={onClose} />
          </div>
          {/* The verdict, before the evidence. In A you counted the red rows yourself. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 11,
              padding: '14px 16px',
              background: verdict.fill,
              borderBottom: '1px solid ' + verdict.edge,
            }}
          >
            <DocBIcon
              name={verdict.icon}
              size={19}
              color={verdict.color}
              style={{ marginTop: 1 }}
            />
            <span style={{ display: 'grid', gap: 3, minWidth: 0 }}>
              <span style={{ font: 'var(--type-title-3)', color: 'var(--text-primary)' }}>
                {verdict.title}
              </span>
              <span
                style={{
                  font: 'var(--type-body)',
                  color: 'var(--text-secondary)',
                  textWrap: 'pretty',
                }}
              >
                {verdict.body}
              </span>
            </span>
          </div>
          <div className="a-scroll" style={{ overflowY: 'auto', padding: 16 }}>
            <div
              style={{
                background: 'var(--a-well)',
                border: '1px solid var(--a-hair)',
                borderRadius: 'var(--a-radius-surface)',
                overflow: 'hidden',
              }}
            >
              {issues.length ? (
                <CDoctorSectionB label="Needs you">
                  {issues.map((r, i) => (
                    <CDoctorRowB key={r.name} row={r} full last={i === issues.length - 1} />
                  ))}
                </CDoctorSectionB>
              ) : null}
              <CDoctorSectionB label="Ready">
                {ready.map((r, i) => (
                  <CDoctorRowB key={r.name} row={r} last={i === ready.length - 1} />
                ))}
              </CDoctorSectionB>
            </div>
            <p
              style={{
                font: 'var(--type-caption)',
                color: 'var(--text-tertiary)',
                padding: '10px 2px 0',
                textWrap: 'pretty',
              }}
            >
              Maestro is the only one Conductor installs and updates by itself. The rest live on
              your machine, and signing in is always yours to do.
            </p>
          </div>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '10px 16px',
              borderTop: '1px solid var(--a-hair)',
              background: 'var(--a-well)',
            }}
          >
            <DocBButton variant="ghost" icon="refresh-cw">
              Check again
            </DocBButton>
            <DocBButton variant="primary" onClick={onClose}>
              Done
            </DocBButton>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { CDoctorSheetB });

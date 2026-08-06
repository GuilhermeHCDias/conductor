import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { StatusDot } from '../core/StatusDot.jsx';

const ICONS = {
  pass: 'circle-check',
  fail: 'triangle-alert',
  running: 'loader-circle',
  skipped: 'minus',
  info: 'info',
};
const TINTS = {
  pass: 'var(--state-pass)',
  fail: 'var(--state-fail)',
  running: 'var(--state-running)',
  skipped: 'var(--text-disabled)',
  info: 'var(--text-tertiary)',
};

function Entry({ run, onSelect, selected }) {
  const [hover, setHover] = React.useState(false);
  return (
    <div
      onClick={() => onSelect && onSelect(run.id)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-5)',
        height: 'var(--row-h-lg)',
        padding: '0 var(--space-6)',
        background: selected
          ? 'var(--glass-selected)'
          : hover
            ? 'var(--glass-hover)'
            : 'transparent',
        cursor: 'pointer',
        transition: 'background-color var(--dur-instant) var(--ease-out)',
      }}
    >
      <StatusDot
        state={run.status === 'skipped' ? 'idle' : run.status}
        size={7}
        pulse={run.status === 'running'}
      />
      <span style={{ font: 'var(--type-mono-label)', color: 'var(--text-tertiary)', flex: 'none' }}>
        {run.startedAt}
      </span>
      <span
        style={{
          font: 'var(--type-body-strong)',
          color: 'var(--text-primary)',
          flex: 1,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {run.flow}
      </span>
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          font: 'var(--type-mono-label)',
          color: TINTS[run.status],
        }}
      >
        <Icon name={ICONS[run.status] || 'info'} size={12} />
        {run.duration}
      </span>
    </div>
  );
}

function Step({ step }) {
  const [open, setOpen] = React.useState(!!step.detail);
  const tint = TINTS[step.status] || TINTS.info;
  return (
    <div
      style={{
        borderTop: 'var(--border-hair) solid var(--edge-1)',
        background: step.status === 'fail' ? 'var(--state-fail-quiet)' : 'transparent',
      }}
    >
      <div
        onClick={() => step.detail && setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 'var(--space-5)',
          minHeight: 'var(--row-h-lg)',
          padding: '7px var(--space-6)',
          cursor: step.detail ? 'pointer' : 'default',
        }}
      >
        <Icon
          name={ICONS[step.status] || 'info'}
          size={13}
          color={tint}
          style={{
            marginTop: 2,
            animation: step.status === 'running' ? 'cd-spin 700ms linear infinite' : undefined,
          }}
        />
        <span style={{ flex: 1, display: 'grid', gap: 3, minWidth: 0 }}>
          <span
            style={{
              font: 'var(--type-body)',
              color: step.status === 'fail' ? 'var(--text-primary)' : 'var(--text-secondary)',
            }}
          >
            {step.label}
          </span>
          {open && step.detail ? (
            <span
              style={{
                font: 'var(--type-code-sm)',
                color: tint,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {step.detail}
            </span>
          ) : null}
        </span>
        {step.duration ? (
          <span
            style={{
              font: 'var(--type-mono-label)',
              color: 'var(--text-disabled)',
              flex: 'none',
              marginTop: 2,
            }}
          >
            {step.duration}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function LogStream({
  runs = [],
  steps = [],
  selectedRunId,
  onSelectRun,
  footer,
  style,
  ...rest
}) {
  return (
    <div
      style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%', ...style }}
      {...rest}
    >
      <div style={{ overflow: 'auto', minHeight: 0, flex: 1 }}>
        {runs.map((r) => (
          <React.Fragment key={r.id}>
            <Entry run={r} onSelect={onSelectRun} selected={r.id === selectedRunId} />
            {r.id === selectedRunId ? steps.map((s, i) => <Step key={s.id || i} step={s} />) : null}
          </React.Fragment>
        ))}
      </div>
      {footer}
    </div>
  );
}

import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function PanelHeader({
  icon,
  title,
  meta,
  actions,
  dense = false,
  divider = true,
  style,
  ...rest
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        height: dense ? 32 : 'var(--toolbar-h)',
        padding: dense ? '0 var(--space-4) 0 var(--space-5)' : '0 var(--space-5)',
        borderBottom: divider ? 'var(--border-hair) solid var(--edge-1)' : 'none',
        flex: 'none',
        ...style,
      }}
      {...rest}
    >
      {icon ? <Icon name={icon} size={14} color="var(--text-tertiary)" /> : null}
      <span
        style={{
          font: 'var(--type-label)',
          letterSpacing: 'var(--ls-caps)',
          textTransform: 'uppercase',
          color: 'var(--text-tertiary)',
          whiteSpace: 'nowrap',
        }}
      >
        {title}
      </span>
      {meta ? (
        <span
          style={{
            font: 'var(--type-mono-label)',
            color: 'var(--text-disabled)',
            whiteSpace: 'nowrap',
          }}
        >
          {meta}
        </span>
      ) : null}
      <span style={{ flex: 1 }} />
      {actions ? (
        <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>{actions}</span>
      ) : null}
    </div>
  );
}

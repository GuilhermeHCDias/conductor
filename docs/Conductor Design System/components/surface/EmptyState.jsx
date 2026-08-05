import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function EmptyState({
  icon = 'layers',
  title,
  description,
  action,
  size = 'md',
  style,
  ...rest
}) {
  const sm = size === 'sm';
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        alignContent: 'center',
        gap: sm ? 'var(--space-4)' : 'var(--space-5)',
        height: '100%',
        padding: 'var(--space-8)',
        textAlign: 'center',
        ...style,
      }}
      {...rest}
    >
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: sm ? 34 : 44,
          height: sm ? 34 : 44,
          borderRadius: 'var(--radius-md)',
          background: 'var(--glass-1)',
          border: 'var(--border-hair) solid var(--edge-1)',
          boxShadow: 'var(--shadow-inset-top)',
          color: 'var(--text-tertiary)',
        }}
      >
        <Icon name={icon} size={sm ? 16 : 20} />
      </span>
      <div style={{ display: 'grid', gap: 4, maxWidth: 300 }}>
        <span
          style={{
            font: sm ? 'var(--type-body-strong)' : 'var(--type-title-3)',
            color: 'var(--text-secondary)',
          }}
        >
          {title}
        </span>
        {description ? (
          <span
            style={{
              font: 'var(--type-caption)',
              color: 'var(--text-tertiary)',
              textWrap: 'pretty',
            }}
          >
            {description}
          </span>
        ) : null}
      </div>
      {action}
    </div>
  );
}

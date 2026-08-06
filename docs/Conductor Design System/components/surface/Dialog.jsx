import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { IconButton } from '../core/IconButton.jsx';

export function Dialog({
  open = true,
  title,
  subtitle,
  icon,
  children,
  footer,
  width = 460,
  onClose,
  style,
  ...rest
}) {
  if (!open) return null;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 90,
        display: 'grid',
        placeItems: 'center',
        padding: 'var(--space-8)',
        background: 'oklch(0% 0 0 / 0.34)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        animation: 'cd-fade-in var(--dur-base) var(--ease-out)',
      }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        style={{
          width,
          maxWidth: '100%',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--glass-3)',
          backdropFilter: 'blur(var(--blur-heavy)) saturate(var(--saturate-glass))',
          WebkitBackdropFilter: 'blur(var(--blur-heavy)) saturate(var(--saturate-glass))',
          border: 'var(--border-hair) solid var(--edge-2)',
          boxShadow: 'var(--shadow-inset-top), var(--shadow-3)',
          animation: 'cd-dialog-in var(--dur-slow) var(--ease-glass)',
          overflow: 'hidden',
          ...style,
        }}
        {...rest}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-5)',
            padding: 'var(--space-6) var(--space-6) var(--space-5)',
          }}
        >
          {icon ? (
            <span
              style={{
                display: 'grid',
                placeItems: 'center',
                width: 32,
                height: 32,
                flex: 'none',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-quiet)',
                color: 'var(--accent)',
              }}
            >
              <Icon name={icon} size={16} />
            </span>
          ) : null}
          <div style={{ flex: 1, display: 'grid', gap: 3, minWidth: 0 }}>
            <h2 style={{ font: 'var(--type-title-3)', color: 'var(--text-primary)' }}>{title}</h2>
            {subtitle ? (
              <p style={{ font: 'var(--type-body)', color: 'var(--text-secondary)' }}>{subtitle}</p>
            ) : null}
          </div>
          {onClose ? <IconButton icon="x" label="Close" size="sm" onClick={onClose} /> : null}
        </div>
        {children ? (
          <div style={{ padding: '0 var(--space-6) var(--space-6)' }}>{children}</div>
        ) : null}
        {footer ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 'var(--space-4)',
              padding: 'var(--space-5) var(--space-6)',
              borderTop: 'var(--border-hair) solid var(--edge-1)',
              background: 'var(--glass-sunken)',
            }}
          >
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}

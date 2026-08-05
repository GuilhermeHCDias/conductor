import React from 'react';

export function Divider({
  orientation = 'horizontal',
  label,
  spacing = 'var(--space-5)',
  style,
  ...rest
}) {
  if (label) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4)',
          margin: spacing + ' 0',
          ...style,
        }}
        {...rest}
      >
        <span style={{ height: 1, flex: 1, background: 'var(--edge-1)' }} />
        <span
          style={{
            font: 'var(--type-label)',
            letterSpacing: 'var(--ls-caps)',
            textTransform: 'uppercase',
            color: 'var(--text-disabled)',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <span style={{ height: 1, flex: 1, background: 'var(--edge-1)' }} />
      </div>
    );
  }
  const vertical = orientation === 'vertical';
  return (
    <span
      aria-hidden="true"
      style={{
        flex: 'none',
        width: vertical ? 1 : 'auto',
        height: vertical ? '60%' : 1,
        alignSelf: vertical ? 'center' : undefined,
        margin: vertical ? '0 ' + spacing : spacing + ' 0',
        background: 'var(--edge-1)',
        ...style,
      }}
      {...rest}
    />
  );
}

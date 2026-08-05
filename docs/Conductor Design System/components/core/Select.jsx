import React from 'react';
import { Icon } from './Icon.jsx';

export function Select({
  value,
  options = [],
  onChange,
  icon,
  size = 'md',
  disabled = false,
  fullWidth = false,
  style,
  ...rest
}) {
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const h = size === 'sm' ? 'var(--control-h)' : 'var(--control-h-lg)';
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: 'relative',
        display: fullWidth ? 'flex' : 'inline-flex',
        alignItems: 'center',
        gap: 'var(--space-4)',
        width: fullWidth ? '100%' : undefined,
        height: h,
        padding: '0 8px 0 10px',
        borderRadius: 'var(--radius-sm)',
        background: hover ? 'var(--glass-2)' : 'var(--glass-1)',
        border:
          'var(--border-hair) solid ' +
          (focus ? 'var(--accent)' : hover ? 'var(--edge-strong)' : 'var(--edge-2)'),
        boxShadow: 'var(--shadow-inset-top)',
        color: 'var(--text-primary)',
        opacity: disabled ? 0.45 : 1,
        transition: 'var(--t-hover)',
        ...style,
      }}
    >
      {icon ? <Icon name={icon} size={14} color="var(--text-tertiary)" /> : null}
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          appearance: 'none',
          WebkitAppearance: 'none',
          flex: 1,
          minWidth: 0,
          background: 'none',
          border: 'none',
          outline: 'none',
          padding: 0,
          paddingRight: 'var(--space-5)',
          font: size === 'sm' ? 'var(--type-caption)' : 'var(--type-body)',
          color: 'inherit',
          cursor: disabled ? 'not-allowed' : 'pointer',
        }}
        {...rest}
      >
        {options.map((o) => {
          const opt = typeof o === 'string' ? { value: o, label: o } : o;
          return (
            <option
              key={opt.value}
              value={opt.value}
              style={{ background: 'var(--ink-900)', color: 'var(--text-primary)' }}
            >
              {opt.label}
            </option>
          );
        })}
      </select>
      <Icon
        name="chevrons-up-down"
        size={13}
        color="var(--text-tertiary)"
        style={{ position: 'absolute', right: 8, pointerEvents: 'none' }}
      />
    </div>
  );
}

import React from 'react';
import { Icon } from '../core/Icon.jsx';

export function TabStrip({ tabs = [], activeId, onSelect, onClose, onAdd, style, ...rest }) {
  const [hoverId, setHoverId] = React.useState(null);
  return (
    <div
      role="tablist"
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: 2,
        height: 34,
        padding: '0 var(--space-3)',
        borderBottom: 'var(--border-hair) solid var(--edge-1)',
        flex: 'none',
        ...style,
      }}
      {...rest}
    >
      {tabs.map((t) => {
        const on = t.id === activeId;
        const hot = hoverId === t.id;
        return (
          <div
            key={t.id}
            role="tab"
            aria-selected={on}
            onClick={() => onSelect && onSelect(t.id)}
            onMouseEnter={() => setHoverId(t.id)}
            onMouseLeave={() => setHoverId(null)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              alignSelf: 'center',
              height: 26,
              padding: '0 var(--space-3) 0 var(--space-4)',
              borderRadius: 'var(--radius-xs)',
              background: on ? 'var(--glass-2)' : hot ? 'var(--glass-hover)' : 'transparent',
              border: 'var(--border-hair) solid ' + (on ? 'var(--edge-2)' : 'transparent'),
              boxShadow: on ? 'var(--shadow-inset-top)' : 'none',
              color: on ? 'var(--text-primary)' : 'var(--text-tertiary)',
              cursor: 'pointer',
              transition: 'var(--t-hover)',
            }}
          >
            <Icon
              name={t.icon || 'file-code'}
              size={13}
              color={on ? 'var(--accent)' : 'var(--text-disabled)'}
            />
            <span style={{ font: 'var(--type-code-sm)', letterSpacing: 'var(--ls-mono)' }}>
              {t.label}
            </span>
            {t.dirty ? (
              <span
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: 'var(--radius-pill)',
                  background: 'var(--accent)',
                }}
              />
            ) : null}
            {onClose ? (
              <span
                role="button"
                aria-label={'Close ' + t.label}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(t.id);
                }}
                style={{
                  display: 'grid',
                  placeItems: 'center',
                  width: 16,
                  height: 16,
                  borderRadius: 'var(--radius-xs)',
                  color: 'var(--text-tertiary)',
                  opacity: on || hot ? 1 : 0,
                  transition: 'opacity var(--dur-fast) var(--ease-out)',
                }}
              >
                <Icon name="x" size={11} />
              </span>
            ) : null}
          </div>
        );
      })}
      {onAdd ? (
        <div
          role="button"
          aria-label="New flow"
          onClick={onAdd}
          style={{
            display: 'grid',
            placeItems: 'center',
            alignSelf: 'center',
            width: 24,
            height: 24,
            marginLeft: 2,
            borderRadius: 'var(--radius-xs)',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
          }}
        >
          <Icon name="plus" size={14} />
        </div>
      ) : null}
    </div>
  );
}

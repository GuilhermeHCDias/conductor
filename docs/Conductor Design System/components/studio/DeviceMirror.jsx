import React from 'react';
import { Icon } from '../core/Icon.jsx';

/* Device chrome is fixed, never themed: the mirror shows a real phone, and a phone does
   not repaint itself when Conductor switches to light mode. */
const CHROME = {
  dark: {
    bezel: 'oklch(16% 0.010 260)',
    screen: 'oklch(11% 0.008 262)',
    bar: 'oklch(0% 0 0 / 0.28)',
    glyph: 'oklch(100% 0 0 / 0.60)',
    text: 'oklch(88% 0.006 254)',
  },
  light: {
    bezel: 'oklch(88% 0.006 254)',
    screen: 'oklch(97% 0.003 250)',
    bar: 'oklch(100% 0 0 / 0.55)',
    glyph: 'oklch(38% 0.010 258 / 0.70)',
    text: 'oklch(30% 0.012 258)',
  },
};

/** Android nav bar, drawn from the vendored glyph set. */
function NavBar({ chrome }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        height: 34,
        flex: 'none',
        background: chrome.bar,
        color: chrome.glyph,
      }}
    >
      <Icon name="chevron-left" size={15} />
      <span
        style={{
          width: 13,
          height: 13,
          borderRadius: 'var(--radius-pill)',
          border: '1.6px solid currentColor',
        }}
      />
      <span
        style={{ width: 12, height: 12, borderRadius: 2, border: '1.6px solid currentColor' }}
      />
    </div>
  );
}

export function DeviceMirror({
  children,
  width = 300,
  height = 640,
  highlight,
  highlightLabel,
  showNavBar = true,
  showStatusBar = true,
  overlay,
  onContextMenu,
  onMouseOver,
  onMouseOut,
  contentRef,
  live = true,
  deviceTheme = 'dark',
  style,
  ...rest
}) {
  const chrome = CHROME[deviceTheme] || CHROME.dark;
  return (
    <div
      style={{
        position: 'relative',
        width,
        padding: 8,
        borderRadius: 'var(--radius-device)',
        background: chrome.bezel,
        border: 'var(--border-hair) solid var(--edge-2)',
        boxShadow: 'var(--shadow-inset-top), var(--shadow-2)',
        flex: 'none',
        ...style,
      }}
      {...rest}
    >
      <div
        onContextMenu={onContextMenu}
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          height,
          borderRadius: 'calc(var(--radius-device) - 8px)',
          background: chrome.screen,
          overflow: 'hidden',
          cursor: onContextMenu ? 'crosshair' : 'default',
        }}
      >
        {showStatusBar ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              height: 22,
              padding: '0 12px',
              flex: 'none',
              font: 'var(--type-mono-label)',
              color: chrome.text,
            }}
          >
            <span>12:29</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon name="wifi" size={11} />
              <Icon name="battery-medium" size={13} />
            </span>
          </div>
        ) : null}
        <div
          ref={contentRef}
          onMouseOver={onMouseOver}
          onMouseOut={onMouseOut}
          style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}
        >
          {children}
          {highlight ? (
            <div
              style={{
                position: 'absolute',
                left: highlight.x,
                top: highlight.y,
                width: highlight.width,
                height: highlight.height,
                borderRadius: highlight.radius != null ? highlight.radius : 'var(--radius-xs)',
                background: 'var(--device-highlight)',
                border: 'var(--border-thick) solid var(--device-highlight-edge)',
                boxShadow: '0 0 0 1px oklch(0% 0 0 / 0.35), 0 0 18px var(--device-highlight-glow)',
                pointerEvents: 'none',
                transition: 'all var(--dur-fast) var(--ease-out)',
              }}
            >
              {highlightLabel ? (
                <span
                  style={{
                    position: 'absolute',
                    left: -1,
                    top: -19,
                    display: 'inline-flex',
                    alignItems: 'center',
                    height: 17,
                    padding: '0 5px',
                    borderRadius: 'var(--radius-xs)',
                    background: 'var(--device-highlight-edge)',
                    color: 'var(--ink-1000)',
                    font: 'var(--type-mono-label)',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {highlightLabel}
                </span>
              ) : null}
            </div>
          ) : null}
          {overlay}
        </div>
        {showNavBar ? <NavBar chrome={chrome} /> : null}
        {!live ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'grid',
              placeItems: 'center',
              background: 'oklch(0% 0 0 / 0.55)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
            }}
          >
            <span style={{ font: 'var(--type-caption)', color: 'oklch(72% 0.010 252)' }}>
              Mirror paused
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

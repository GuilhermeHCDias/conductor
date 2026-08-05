import { type JSX, type KeyboardEvent, useEffect, useRef } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './ContextMenu.module.css';

/**
 * The right-click command menu — the design system calls it the core
 * interaction of Conductor. Ported from `surface/ContextMenu`: groups via
 * label and separator items, mono command labels with their glyphs, fixed
 * positioning at the cursor, an AppKit-style solid accent highlight.
 *
 * Presentational: items in, one id out. Criterion 26's exits are both here —
 * Escape and any click outside close it through `onClose`, writing nothing —
 * and the keyboard walks the commands with the arrows, Enter picking the
 * focused one.
 */

export type ContextMenuItem =
  | { readonly type: 'label'; readonly label: string }
  | { readonly type: 'separator' }
  | {
      readonly type: 'command';
      readonly id: string;
      readonly label: string;
      readonly icon?: IconName;
      /** Command labels are written verbatim into the .yaml, so they read in
       * the code face (DS rule). */
      readonly mono?: boolean;
    };

export type ContextMenuProps = {
  /** Client px — the menu opens at the cursor, fixed. */
  readonly x: number;
  readonly y: number;
  /** Names the element the menu is about: `Kind · "text"`. */
  readonly title?: string;
  /** Criterion 27 — shown above the commands when the selector is fragile. */
  readonly warning?: string;
  readonly items: readonly ContextMenuItem[];
  readonly onSelect: (id: string) => void;
  readonly onClose: () => void;
};

export function ContextMenu({
  x,
  y,
  title,
  warning,
  items,
  onSelect,
  onClose,
}: ContextMenuProps): JSX.Element {
  const menu = useRef<HTMLDivElement>(null);

  // Keyboard-first: the first command holds focus the moment the menu opens.
  useEffect(() => {
    commandButtons(menu.current)[0]?.focus();
  }, []);

  const moveFocus = (delta: 1 | -1): void => {
    const buttons = commandButtons(menu.current);
    if (buttons.length === 0) {
      return;
    }
    const active = document.activeElement;
    const index = active instanceof HTMLButtonElement ? buttons.indexOf(active) : -1;
    buttons[(index + delta + buttons.length) % buttons.length]?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveFocus(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveFocus(-1);
    }
  };

  // Stable keys without index arithmetic: a command has its id, a label its
  // text, and a separator sits after exactly one group.
  let lastLabel = 'top';
  const rows = items.map((item) => {
    if (item.type === 'label') {
      lastLabel = item.label;
      return { key: `label-${item.label}`, item };
    }
    if (item.type === 'separator') {
      return { key: `separator-${lastLabel}`, item };
    }
    return { key: item.id, item };
  });

  return (
    <>
      {/* Criterion 26: the click lands here instead of on the app, and a
          right-click out must not summon the browser's own menu either. A real
          button, out of the tab order — dismissing is an action. */}
      <button
        aria-label="Dismiss menu"
        className={styles.backdrop}
        data-testid="menu-backdrop"
        onClick={onClose}
        onContextMenu={(event) => {
          event.preventDefault();
          onClose();
        }}
        tabIndex={-1}
        type="button"
      />
      <div
        className={styles.menu}
        onKeyDown={handleKeyDown}
        ref={menu}
        role="menu"
        style={{ left: x, top: y }}
      >
        {title !== undefined ? (
          <div className={styles.title}>
            <Icon className={styles.titleGlyph} name="crosshair" size={12} />
            <span className={styles.titleText}>{title}</span>
          </div>
        ) : null}
        {warning !== undefined ? (
          <div className={styles.warning}>
            <Icon className={styles.warningGlyph} name="triangle-alert" size={12} />
            <span>{warning}</span>
          </div>
        ) : null}
        {rows.map(({ key, item }) => {
          if (item.type === 'separator') {
            return <div className={styles.separator} key={key} />;
          }
          if (item.type === 'label') {
            return (
              <div className={styles.label} key={key}>
                {item.label}
              </div>
            );
          }
          return (
            <button
              className={styles.item}
              key={key}
              onClick={() => {
                onSelect(item.id);
              }}
              role="menuitem"
              type="button"
            >
              {item.icon !== undefined ? (
                <Icon
                  className={styles.glyph}
                  data-testid="menu-glyph"
                  name={item.icon}
                  size={14}
                />
              ) : (
                <span className={styles.glyphGap} />
              )}
              <span className={item.mono === true ? styles.mono : styles.itemLabel}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function commandButtons(menu: HTMLDivElement | null): HTMLButtonElement[] {
  return [...(menu?.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]') ?? [])];
}

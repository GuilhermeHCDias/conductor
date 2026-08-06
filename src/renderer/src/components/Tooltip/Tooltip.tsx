import type { JSX, ReactNode } from 'react';
import styles from './Tooltip.module.css';

export type TooltipProps = {
  readonly content: string;
  /** Rendered quietly after the label, e.g. `⌘B`. */
  readonly shortcut?: string;
  readonly children: ReactNode;
};

/**
 * A hover label for a control that already carries its own accessible name.
 * `aria-hidden`, because a screen reader would otherwise read the label twice —
 * once from the control, once from here.
 *
 * Used in the toolbar only. The region headers clip their overflow so the
 * serial can truncate, and a tooltip inside one would be clipped with it.
 */
export function Tooltip({ content, shortcut, children }: TooltipProps): JSX.Element {
  return (
    <span className={styles.wrap}>
      {children}
      <span aria-hidden="true" className={styles.tip}>
        {content}
        {shortcut === undefined ? null : <span className={styles.shortcut}>{shortcut}</span>}
      </span>
    </span>
  );
}

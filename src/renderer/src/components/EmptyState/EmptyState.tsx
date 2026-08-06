import type { JSX, ReactNode } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './EmptyState.module.css';

/**
 * Zero-state for empty panels, ported from the DS `surface/EmptyState`: no
 * flows, no flow open, no runs yet. The description is written as an
 * instruction to the user, not a description of the emptiness — and never an
 * error code (DS rule).
 */
export type EmptyStateProps = {
  readonly icon: IconName;
  readonly title: string;
  /** One sentence saying what to do next, in plain language. */
  readonly description?: string;
  /** Usually one button — the action the instruction names. */
  readonly action?: ReactNode;
  readonly size?: 'sm' | 'md';
};

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
}: EmptyStateProps): JSX.Element {
  return (
    <div className={styles.empty} data-size={size} data-testid="empty-state">
      <span className={styles.chip}>
        <Icon name={icon} size={size === 'sm' ? 16 : 20} />
      </span>
      <div className={styles.text}>
        <span className={styles.title}>{title}</span>
        {description !== undefined ? (
          <span className={styles.description}>{description}</span>
        ) : null}
      </div>
      {action}
    </div>
  );
}

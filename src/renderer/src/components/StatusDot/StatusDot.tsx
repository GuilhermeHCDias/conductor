import type { JSX } from 'react';
import styles from './StatusDot.module.css';

export type DotState = 'pass' | 'fail' | 'running' | 'idle' | 'never' | 'connected' | 'offline';

export type StatusDotProps = {
  readonly state: DotState;
  /** `sm` in a flow row, `md` in the device header, `lg` on a running step. */
  readonly size?: 'sm' | 'md' | 'lg';
  readonly className?: string;
  readonly 'data-testid'?: string;
};

/**
 * A coloured dot. Decorative: whatever it reports is always spelled out in the
 * text beside it, so the state travels as a data attribute and the module CSS
 * turns it into a `--state-*` token rather than an inline colour.
 */
export function StatusDot({
  state,
  size = 'sm',
  className,
  'data-testid': testId,
}: StatusDotProps): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={className === undefined ? styles.dot : `${styles.dot} ${className}`}
      data-size={size}
      data-state={state}
      data-testid={testId}
    />
  );
}

import type { JSX } from 'react';
import { Icon } from '../Icon/Icon';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './SendControl.module.css';

/**
 * The toolbar's send control (spec criteria 1–4) — the kit's `CSendControl`:
 * one slot, three states. "Everything sent" is deliberately not a button — a
 * state, not an action — while both interactive states open the publish
 * sheet. Presentational: props in, callbacks out, no store, no
 * `window.conductor`.
 */

export type SendControlPhase = 'sent-all' | 'unsent' | 'review';

export type SendControlProps = {
  readonly phase: SendControlPhase;
  /** The unsent count — the badge on Send changes, the +N on the pill. */
  readonly count: number;
  readonly onClick: () => void;
};

export function SendControl({ phase, count, onClick }: SendControlProps): JSX.Element {
  if (phase === 'sent-all') {
    return (
      <span className={styles.control} data-phase="sent-all">
        <Icon className={styles.pass} name="check" size={13} />
        Everything sent
      </span>
    );
  }

  if (phase === 'review') {
    return (
      <Tooltip content="Sent for review — new changes join the same review">
        <button className={styles.control} data-phase="review" onClick={onClick} type="button">
          <Icon className={styles.quiet} name="clock" size={13} />
          Waiting for review
          {count > 0 ? <span className={styles.plus}>+{count}</span> : null}
        </button>
      </Tooltip>
    );
  }

  return (
    <Tooltip
      content={count === 1 ? 'Send 1 change to the team' : `Send ${count} changes to the team`}
    >
      {/* Criterion 2: the one filled accent beside Run — the kit draws both. */}
      <button className={styles.control} data-phase="unsent" onClick={onClick} type="button">
        <Icon name="send" size={13} />
        Send changes
        <span className={styles.count}>{count}</span>
      </button>
    </Tooltip>
  );
}

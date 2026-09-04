import type { JSX } from 'react';
import { Icon } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './DoctorBadge.module.css';

export type DoctorBadgeProps = {
  /** Rows of the last report that are not ok. */
  readonly issues: number;
  /** The sheet is open. */
  readonly selected: boolean;
  readonly onClick: () => void;
};

/**
 * The toolbar's doctor badge (doctor criteria 34–35), the kit's
 * `CDoctorBadge`: a quiet `activity` icon button while nothing needs the
 * person, an amber count while something does. Presentational — nothing
 * here reads a store or talks to main.
 */
export function DoctorBadge({ issues, selected, onClick }: DoctorBadgeProps): JSX.Element {
  if (issues <= 0) {
    return (
      <Tooltip content="Doctor">
        <IconButton icon="activity" label="Doctor" onClick={onClick} selected={selected} />
      </Tooltip>
    );
  }
  const name = issues === 1 ? 'Doctor · 1 item needs you' : `Doctor · ${issues} items need you`;
  return (
    <Tooltip content={name}>
      <button
        aria-label={name}
        aria-pressed={selected}
        className={styles.pill}
        data-issues="true"
        onClick={onClick}
        title={name}
        type="button"
      >
        <Icon name="triangle-alert" size={13} />
        {issues}
      </button>
    </Tooltip>
  );
}

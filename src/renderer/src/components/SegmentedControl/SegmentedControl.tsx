import type { JSX } from 'react';
import styles from './SegmentedControl.module.css';

export type Segment = {
  readonly id: string;
  readonly label: string;
  /** Draws the small state dot on the segment — the Run segment while running. */
  readonly badge?: boolean;
};

export type SegmentedControlProps = {
  /** Accessible name of the group as a whole. */
  readonly label: string;
  readonly value: string;
  readonly options: readonly Segment[];
  readonly onChange: (id: string) => void;
  /** `id` of the panel the segments swap — criterion 52's `tabpanel`. */
  readonly controls: string;
};

/**
 * AppKit's segmented control: a raised puck sliding on a recessed track.
 * Exposed as a `tablist` of `tab`s (criterion 52) over the one panel it swaps.
 *
 * Deliberately not a roving tabindex, the usual ARIA tab pattern: criterion 54
 * requires every control to stay reachable by Tab in visual order.
 */
export function SegmentedControl({
  label,
  value,
  options,
  onChange,
  controls,
}: SegmentedControlProps): JSX.Element {
  return (
    <div aria-label={label} className={styles.track} role="tablist">
      {options.map((option) => {
        const selected = option.id === value;
        return (
          <button
            aria-controls={controls}
            aria-selected={selected}
            className={styles.segment}
            data-badge={option.badge === true ? 'true' : undefined}
            data-selected={selected ? 'true' : undefined}
            id={`${controls}-tab-${option.id}`}
            key={option.id}
            onClick={() => {
              onChange(option.id);
            }}
            role="tab"
            type="button"
          >
            {option.label}
            {option.badge === true ? <span className={styles.badge} /> : null}
          </button>
        );
      })}
    </div>
  );
}

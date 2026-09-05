import type { JSX, ReactNode } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './Checkbox.module.css';

/**
 * The design system's `Checkbox`: a real `<input type="checkbox">` behind a
 * drawn box, the label beside it. Props in, one callback out; it knows no
 * store. Used by the installer's Android terms line (criterion 37) and the
 * doctor sheet's adb row (criterion 42).
 */
export type CheckboxProps = {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly label: ReactNode;
  readonly disabled?: boolean;
};

export function Checkbox({
  checked,
  onChange,
  label,
  disabled = false,
}: CheckboxProps): JSX.Element {
  return (
    <label className={styles.checkbox} data-disabled={disabled ? 'true' : undefined}>
      <input
        checked={checked}
        className={styles.input}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.currentTarget.checked);
        }}
        type="checkbox"
      />
      <span aria-hidden="true" className={styles.box} data-checked={checked ? 'true' : undefined}>
        {checked ? <Icon name="check" size={11} /> : null}
      </span>
      <span className={styles.label}>{label}</span>
    </label>
  );
}

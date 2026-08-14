import type { JSX, MouseEvent } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import styles from './IconButton.module.css';

/** Box size, and the glyph the design system draws inside it. */
const GLYPH = { sm: 14, md: 16 } as const;

export type IconButtonProps = {
  readonly icon: IconName;
  /** The control's accessible name (criterion 51). Never optional. */
  readonly label: string;
  readonly size?: keyof typeof GLYPH;
  /** Overrides the glyph the size implies, keeping the box — the device
   * header's tools draw md glyphs in sm boxes. */
  readonly glyph?: number;
  readonly variant?: 'ghost' | 'ai';
  /** A toggle that is currently on. Renders as `aria-pressed`. */
  readonly selected?: boolean;
  readonly disabled?: boolean;
  readonly onClick?: (event: MouseEvent<HTMLButtonElement>) => void;
  readonly className?: string;
};

/**
 * The shell's only icon-only control. It exists so no view has to remember that
 * an icon on its own still needs a name a screen reader can read out.
 */
export function IconButton({
  icon,
  label,
  size = 'md',
  glyph,
  variant = 'ghost',
  selected,
  disabled,
  onClick,
  className,
}: IconButtonProps): JSX.Element {
  return (
    <button
      aria-label={label}
      aria-pressed={selected === undefined ? undefined : selected}
      className={className === undefined ? styles.button : `${styles.button} ${className}`}
      data-selected={selected === true ? 'true' : undefined}
      data-size={size}
      data-variant={variant}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon name={icon} size={glyph ?? GLYPH[size]} />
    </button>
  );
}

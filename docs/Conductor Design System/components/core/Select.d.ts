import type { ChangeEventHandler, CSSProperties } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

/** Glass dropdown. Always trails a chevrons-up-down glyph — that pairing is how Conductor marks a picker. */
export interface SelectProps {
  value?: string;
  /** Strings are used as both value and label. */
  options?: Array<string | SelectOption>;
  onChange?: ChangeEventHandler<HTMLSelectElement>;
  icon?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  fullWidth?: boolean;
  style?: CSSProperties;
}

export declare function Select(props: SelectProps): JSX.Element;

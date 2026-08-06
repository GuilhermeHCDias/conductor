import type { CSSProperties, ChangeEventHandler, KeyboardEventHandler } from "react";

/** Single-line text field. Inputs are sunken in Conductor — they recede, they never float. */
export interface InputProps {
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  placeholder?: string;
  /** Leading Icon name — "search" for filters, "variable" for env keys. */
  icon?: string;
  /** Trailing static text, rendered mono-caps: units, key hints, counts. */
  suffix?: string;
  /** Monospace value. Use for selectors, ids, file paths, env values. */
  mono?: boolean;
  size?: "sm" | "md";
  invalid?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  style?: CSSProperties;
  inputStyle?: CSSProperties;
}

export declare function Input(props: InputProps): JSX.Element;

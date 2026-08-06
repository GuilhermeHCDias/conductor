import type { CSSProperties, ChangeEventHandler } from "react";

/** Checkbox for command flags (clearState, stopApp) and settings lists. */
export interface CheckboxProps {
  checked?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  label?: string;
  /** Second line under the label, for what the flag does to the run. */
  hint?: string;
  disabled?: boolean;
  style?: CSSProperties;
}

export declare function Checkbox(props: CheckboxProps): JSX.Element;

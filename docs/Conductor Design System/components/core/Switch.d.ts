import type { CSSProperties, ChangeEventHandler } from "react";

/** Immediate-effect toggle: theme, live mirror, follow-logs, autoscroll. */
export interface SwitchProps {
  checked?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  style?: CSSProperties;
}

export declare function Switch(props: SwitchProps): JSX.Element;

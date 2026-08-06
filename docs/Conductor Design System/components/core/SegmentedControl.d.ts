import type { CSSProperties } from "react";

export interface SegmentedOption {
  value: string;
  label: string;
  icon?: string;
}

/**
 * Two-to-four exclusive modes in a sunken track. The selected segment rises as glass.
 * Used for Local/Cloud run target and for the log stream's filter.
 */
export interface SegmentedControlProps {
  value?: string;
  options?: Array<string | SegmentedOption>;
  onChange?: (value: string) => void;
  size?: "sm" | "md";
  fullWidth?: boolean;
  style?: CSSProperties;
}

export declare function SegmentedControl(props: SegmentedControlProps): JSX.Element;

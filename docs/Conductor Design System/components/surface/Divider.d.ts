import type { CSSProperties } from "react";

/** 1px hairline at --edge-1. Vertical dividers span 60% height so they read as separators, not borders. */
export interface DividerProps {
  orientation?: "horizontal" | "vertical";
  /** Adds a centred uppercase caption between two rules — for grouping menu sections. */
  label?: string;
  spacing?: string;
  style?: CSSProperties;
}

export declare function Divider(props: DividerProps): JSX.Element;

import type { CSSProperties, ReactNode } from "react";

/** Zero-state for empty panels: no device, no flow open, no runs yet, no messages. */
export interface EmptyStateProps {
  icon?: string;
  title?: string;
  /** One sentence saying what to do next, in plain language — never an error code. */
  description?: string;
  action?: ReactNode;
  size?: "sm" | "md";
  style?: CSSProperties;
}

export declare function EmptyState(props: EmptyStateProps): JSX.Element;

import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

/**
 * Conductor's button. Glass is the default — primary is reserved for the single
 * most consequential action in a region (Run Test, Send, Save).
 */
export interface ButtonProps {
  children?: ReactNode;
  /** glass = default surface action · primary = the one accent action per region · ghost = toolbar/row action · ai = anything Conductor's assistant performs · danger = destructive */
  variant?: "glass" | "primary" | "ghost" | "ai" | "danger";
  /** sm 30px · md 36px · lg 42px */
  size?: "sm" | "md" | "lg";
  /** Leading Icon name. */
  icon?: string;
  /** Trailing Icon name — chevrons, external links. */
  iconEnd?: string;
  /** Swaps the leading icon for a spinner and blocks interaction. */
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  /** Fully rounded. Used for filter/mode chips, never for form submits. */
  pill?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  type?: "button" | "submit" | "reset";
  style?: CSSProperties;
}

export declare function Button(props: ButtonProps): JSX.Element;

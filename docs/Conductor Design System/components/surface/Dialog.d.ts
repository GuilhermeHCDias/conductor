import type { CSSProperties, ReactNode } from "react";

/** Modal on heavy glass (--blur-heavy) over a dimming scrim. For device pairing, settings, destructive confirms. */
export interface DialogProps {
  open?: boolean;
  title?: string;
  subtitle?: string;
  /** Leading glyph in an accent-quiet tile. */
  icon?: string;
  children?: ReactNode;
  /** Right-aligned action row on a sunken footer. */
  footer?: ReactNode;
  width?: number;
  onClose?: () => void;
  style?: CSSProperties;
}

export declare function Dialog(props: DialogProps): JSX.Element;

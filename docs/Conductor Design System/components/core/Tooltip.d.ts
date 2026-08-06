import type { CSSProperties, ReactNode } from 'react';

/** Hover explanation on a floating L3 glass chip. Fades only — it never scales or slides in. */
export interface TooltipProps {
  children?: ReactNode;
  content?: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  /** Mono shortcut hint appended after the label. */
  shortcut?: string;
  style?: CSSProperties;
}

export declare function Tooltip(props: TooltipProps): JSX.Element;

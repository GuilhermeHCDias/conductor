import type { CSSProperties, ReactNode } from 'react';

/** The uppercase eyebrow bar that titles every panel. Title is always caps + wide tracking, tertiary. */
export interface PanelHeaderProps {
  icon?: string;
  title: string;
  /** Mono secondary fact: file path, count, elapsed time. */
  meta?: string;
  /** Right-aligned IconButtons. */
  actions?: ReactNode;
  /** 32px instead of 44px — for stacked sub-panels. */
  dense?: boolean;
  divider?: boolean;
  style?: CSSProperties;
}

export declare function PanelHeader(props: PanelHeaderProps): JSX.Element;

import type { CSSProperties, ReactNode } from 'react';

/** Small static label: run outcome, command name, device platform, AI attribution. */
export interface BadgeProps {
  children?: ReactNode;
  /** Run-state tones map 1:1 to --state-* tokens. */
  tone?: 'neutral' | 'accent' | 'ai' | 'pass' | 'fail' | 'running' | 'idle';
  icon?: string;
  /** Monospace — for command names, selectors, durations, device ids. */
  mono?: boolean;
  size?: 'sm' | 'md';
  /** Uppercase + wide tracking. Reserve for section eyebrows, not run states. */
  uppercase?: boolean;
  style?: CSSProperties;
}

export declare function Badge(props: BadgeProps): JSX.Element;

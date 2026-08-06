import type { CSSProperties } from 'react';

/** 8px state dot — device connection, run outcome, step status in the log stream. */
export interface StatusDotProps {
  state?: 'pass' | 'fail' | 'running' | 'idle' | 'connected' | 'offline';
  size?: number;
  /** Breathing opacity. Only for genuinely in-progress states. */
  pulse?: boolean;
  /** Renders the dot with a caption to its right. */
  label?: string;
  style?: CSSProperties;
}

export declare function StatusDot(props: StatusDotProps): JSX.Element;

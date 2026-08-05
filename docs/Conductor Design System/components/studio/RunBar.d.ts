import type { CSSProperties, ReactNode } from 'react';

/**
 * The run strip between editor and logs: which env the flow runs against, and the single
 * primary action in the whole window.
 */
export interface RunBarProps {
  env?: string;
  /** Empty array hides the env picker. */
  envOptions?: Array<string | { value: string; label: string }>;
  onEnvChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  /** Swaps Run Test for a danger Stop button. */
  running?: boolean;
  onRun?: () => void;
  onRunAll?: () => void;
  onStop?: () => void;
  /** Left-aligned slot — flow name, step count, follow-logs switch. */
  extra?: ReactNode;
  style?: CSSProperties;
}

export declare function RunBar(props: RunBarProps): JSX.Element;

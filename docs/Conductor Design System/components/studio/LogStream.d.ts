import type { CSSProperties, ReactNode } from "react";

export interface RunEntry {
  id: string;
  /** Human timestamp exactly as the CLI prints it, e.g. "Jul 28, 12:29 pm". */
  startedAt: string;
  /** Flow name without the .yaml extension. */
  flow: string;
  status: "pass" | "fail" | "running" | "skipped";
  /** m:ss, e.g. "0:04". */
  duration: string;
}

export interface RunStep {
  id?: string;
  /** Plain-language description of the command, e.g. 'Launch app "com.example.app" with clear state'. */
  label: string;
  status: "pass" | "fail" | "running" | "skipped" | "info";
  duration?: string;
  /** Raw CLI output for failures — shown expanded by default on failed steps. */
  detail?: string;
}

/**
 * Bottom panel: run history, and the selected run's steps expanded beneath it.
 */
export interface LogStreamProps {
  runs?: RunEntry[];
  /** Steps of the selected run. */
  steps?: RunStep[];
  selectedRunId?: string;
  onSelectRun?: (id: string) => void;
  /** Sticky footer slot — "Clear history", follow-logs switch. */
  footer?: ReactNode;
  style?: CSSProperties;
}

export declare function LogStream(props: LogStreamProps): JSX.Element;

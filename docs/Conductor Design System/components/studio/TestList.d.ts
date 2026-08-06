import type { CSSProperties, MouseEvent, ReactNode } from 'react';

export interface TestSummary {
  id: string;
  /** The flow's file name, shown verbatim in mono — it is the artifact. */
  name: string;
  /** Command count. */
  steps: number;
  /** Result of the most recent run. "never" renders a muted "never run". */
  lastResult: 'pass' | 'fail' | 'running' | 'never';
  /** Human timestamp as the CLI prints it, e.g. "Jul 28, 12:29 pm". */
  lastRun?: string;
  /** m:ss of the last run. */
  duration?: string;
  /** Already open as an editor tab — marks the row with an accent dot. */
  open?: boolean;
  /** Drafted by the assistant — marks the row with a violet sparkle. */
  aiAuthored?: boolean;
}

/**
 * The suite: every flow in the project, with the metadata that decides which one you open.
 * Click selects, double-click opens. Checkboxes drive bulk run and delete.
 */
export interface TestListProps {
  tests?: TestSummary[];
  selectedId?: string;
  checkedIds?: string[];
  /** Fired on double-click and on Enter — opens the flow as an editor tab. */
  onOpen?: (id: string) => void;
  onSelect?: (id: string) => void;
  onCheck?: (id: string) => void;
  /** Receives the full next selection, so the header checkbox can clear or select all. */
  onCheckAll?: (ids: string[]) => void;
  /** Row overflow menu — rename, duplicate, reveal in Finder, delete. */
  onAction?: (id: string, event: MouseEvent) => void;
  /** Rendered instead of the table when `tests` is empty. */
  emptyState?: ReactNode;
  style?: CSSProperties;
}

export declare function TestList(props: TestListProps): JSX.Element;

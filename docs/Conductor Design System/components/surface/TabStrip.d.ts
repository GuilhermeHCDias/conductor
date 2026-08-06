import type { CSSProperties } from "react";

export interface TabItem {
  id: string;
  label: string;
  icon?: string;
  /** Unsaved changes — renders an accent dot instead of hiding the state. */
  dirty?: boolean;
}

/** Open-document tabs. Labels are mono because they are filenames. */
export interface TabStripProps {
  tabs?: TabItem[];
  activeId?: string;
  onSelect?: (id: string) => void;
  /** Omit to hide close affordances entirely. */
  onClose?: (id: string) => void;
  /** Omit to hide the trailing + button. */
  onAdd?: () => void;
  style?: CSSProperties;
}

export declare function TabStrip(props: TabStripProps): JSX.Element;

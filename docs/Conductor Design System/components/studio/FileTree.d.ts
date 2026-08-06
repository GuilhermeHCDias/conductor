import type { CSSProperties } from "react";

export interface FileNode {
  id: string;
  name: string;
  type: "dir" | "file";
  /** Icon override for files; defaults to file-code. */
  icon?: string;
  /** Right-aligned mono hint: step count, last result. */
  badge?: string;
  children?: FileNode[];
}

/** Project flow browser. Filenames are mono; only .yaml flows are selectable in practice. */
export interface FileTreeProps {
  nodes?: FileNode[];
  selectedId?: string;
  /** Node ids open on first render. */
  defaultExpanded?: string[];
  onSelect?: (id: string) => void;
  style?: CSSProperties;
}

export declare function FileTree(props: FileTreeProps): JSX.Element;

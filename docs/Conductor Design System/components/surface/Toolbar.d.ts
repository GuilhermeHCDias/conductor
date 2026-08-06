import type { CSSProperties, ReactNode } from "react";

/** Horizontal control strip. Use inside panels; the app titlebar is TitleBar instead. */
export interface ToolbarProps {
  children?: ReactNode;
  align?: "left" | "center" | "right" | "between";
  height?: string | number;
  /** Own glass fill — only when the toolbar floats over scrolling content. */
  glass?: boolean;
  divider?: "none" | "top" | "bottom" | "both";
  padding?: string | number;
  style?: CSSProperties;
}

export declare function Toolbar(props: ToolbarProps): JSX.Element;

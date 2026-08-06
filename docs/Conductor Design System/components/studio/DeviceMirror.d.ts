import type { CSSProperties, MouseEventHandler, ReactNode } from "react";

export interface HighlightRect {
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number | string;
}

/**
 * The interactive Android mirror. Screen content is passed as children (a recreation of
 * the app under test); the accessibility-tree node under the cursor is drawn as an
 * accent highlight rect, and right-click opens the Maestro command menu.
 */
export interface DeviceMirrorProps {
  children?: ReactNode;
  /** Screen width in px — 300 fits the 340px mirror column. */
  width?: number;
  height?: number;
  /** Accessibility-tree bounds of the hovered/selected node, relative to the screen area. */
  highlight?: HighlightRect;
  /** Mono caption pinned above the highlight, e.g. 'Text · "Pedidos pendentes"'. */
  highlightLabel?: string;
  showNavBar?: boolean;
  showStatusBar?: boolean;
  /** Extra absolutely-positioned layers inside the screen (multi-node selection, tap ripples). */
  overlay?: ReactNode;
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  /** false renders the paused scrim. */
  live?: boolean;
  /**
   * Colour of the mirrored device's own chrome (bezel, status bar, nav bar). Independent of
   * Conductor's theme on purpose — a real phone does not repaint when the tool switches to light.
   * Set it from the device's OS theme, not from data-theme.
   */
  deviceTheme?: "dark" | "light";
  style?: CSSProperties;
}

export declare function DeviceMirror(props: DeviceMirrorProps): JSX.Element;

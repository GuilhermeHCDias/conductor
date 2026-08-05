import type { CSSProperties, ReactNode } from 'react';

/**
 * The Electron window titlebar: macOS traffic lights left, the current project path
 * centred as a click-to-switch mono chip, window-level actions right.
 */
export interface TitleBarProps {
  /**
   * Centre slot — takes priority over `projectPath`. Put the document's identity here (the
   * open flow), the way a native titlebar centres the current document.
   */
  center?: ReactNode;
  /**
   * Left slot, immediately after the traffic lights. For window-level panel toggles (the
   * flows sidebar), which need to sit next to the chrome they open, not among the actions.
   */
  leading?: ReactNode;
  /** Absolute path of the open project. Truncates from the left so the folder name stays visible. */
  projectPath: string;
  /** IconButtons: theme toggle, settings, help. */
  actions?: ReactNode;
  /** Off on Windows/Linux builds. */
  showTrafficLights?: boolean;
  style?: CSSProperties;
}

export declare function TitleBar(props: TitleBarProps): JSX.Element;

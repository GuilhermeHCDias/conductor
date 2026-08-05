import type { CSSProperties, ReactNode } from 'react';

/** Keyboard hint capsules. Conductor is keyboard-first, so shortcuts are shown, not hidden. */
export interface KbdProps {
  /** "⌘ + Enter" is split on "+" automatically. */
  children?: ReactNode;
  /** Explicit key list, wins over children. */
  keys?: string[];
  style?: CSSProperties;
}

export declare function Kbd(props: KbdProps): JSX.Element;

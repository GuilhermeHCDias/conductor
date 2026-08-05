import type { CSSProperties, MouseEventHandler } from 'react';

/** Square glyph-only control for toolbars, panel headers, titlebars and row affordances. */
export interface IconButtonProps {
  /** Icon name. */
  icon: string;
  /** Required — becomes both aria-label and the native tooltip. */
  label: string;
  /** sm 24px · md 30px · lg 36px. Rows use sm, panel headers md, titlebar lg. */
  size?: 'sm' | 'md' | 'lg';
  /** ghost = inside chrome (default) · glass = floating over the device mirror or imagery */
  variant?: 'ghost' | 'glass' | 'danger' | 'ai';
  /** Sticky on-state: accent tint + accent-quiet fill. Use for toggles like panel visibility. */
  selected?: boolean;
  disabled?: boolean;
  pill?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  style?: CSSProperties;
}

export declare function IconButton(props: IconButtonProps): JSX.Element;

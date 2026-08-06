import type { CSSProperties } from 'react';

export type IconName = string;

/** Conductor's icon glyph. Lucide v0.577.0, vendored to assets/icons. */
export interface IconProps {
  /** Kebab-case Lucide name, e.g. "mouse-pointer-click". Unknown names render a dashed placeholder box. */
  name: IconName;
  /** Rendered box in px. Conductor uses 14 in dense rows, 16 default, 18 in toolbars, 20 in empty states. */
  size?: number | string;
  /** Lucide's native weight is 2; Conductor lightens to 1.75 to sit correctly next to Manrope. */
  strokeWidth?: number;
  color?: string;
  /** Supply for standalone meaning-bearing icons; omitted icons are aria-hidden. */
  label?: string;
  style?: CSSProperties;
  className?: string;
}

export declare function Icon(props: IconProps): JSX.Element;
export declare const ICONS: Record<string, string>;
export declare const ICON_NAMES: string[];
/** Maestro command name -> icon name. Use for any command menu or generated-step row. */
export declare const ACTION_ICONS: Record<string, IconName>;

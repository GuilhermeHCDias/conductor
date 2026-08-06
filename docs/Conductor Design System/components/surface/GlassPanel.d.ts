import type { CSSProperties, ReactNode } from "react";

/**
 * The substrate of every Conductor region. Depth is expressed as blur radius first,
 * shadow second — 1 for layout regions, 2 for cards inside them, 3 for floating layers.
 */
export interface GlassPanelProps {
  children?: ReactNode;
  /** 1 = region (mirror bay, editor, logs) · 2 = card on a region · 3 = floating layer */
  depth?: 1 | 2 | 3;
  radius?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl" | "window" | "pill";
  padding?: string | number;
  /** Inverts to a recessed well — content areas the user reads or types into. */
  sunken?: boolean;
  /** Adds the 1px diagonal specular rim. Worth it on panels wider than ~320px. */
  sheen?: boolean;
  as?: keyof JSX.IntrinsicElements;
  style?: CSSProperties;
}

export declare function GlassPanel(props: GlassPanelProps): JSX.Element;

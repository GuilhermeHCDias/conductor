import type { CSSProperties } from 'react';

export interface ContextMenuItem {
  id?: string;
  /** Command label. For Maestro commands use the exact YAML keyword, e.g. "tapOn". */
  label?: string;
  icon?: string;
  shortcut?: string;
  type?: 'item' | 'separator' | 'label';
  /** Monospace label — for YAML keywords and selectors. */
  mono?: boolean;
  disabled?: boolean;
  /** Red tint + red hover fill. */
  destructive?: boolean;
  /** Blue AI tint — the assistant performs this action. */
  ai?: boolean;
  submenu?: boolean;
}

/**
 * Floating L3 command menu. This is the core interaction of Conductor: right-click an
 * element in the device mirror and pick the Maestro command to append.
 */
export interface ContextMenuProps {
  items?: ContextMenuItem[];
  /** Fixed-position coordinates. Omit both to render inline (docs, cards). */
  x?: number;
  y?: number;
  width?: number;
  /** Mono header naming the targeted element, e.g. 'Button "Finalizar pedido"'. */
  title?: string;
  onSelect?: (item: ContextMenuItem) => void;
  style?: CSSProperties;
}

export declare function ContextMenu(props: ContextMenuProps): JSX.Element;

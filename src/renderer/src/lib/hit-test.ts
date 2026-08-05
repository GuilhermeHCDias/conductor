import type { Bounds, TreeNode } from '@shared/types';

/**
 * §5.5's hover, entirely in the renderer: which element is under the pointer,
 * answered from the frozen snapshot with zero IPC and zero process work
 * (criterion 46).
 *
 * The coordinate chain, end to end (criterion 7): canvas CSS px → stream px
 * (the mirror's fit scale — the canvas's own bitmap is the stream, scaled by
 * `transform` alone) → screenshot px (the stream is the same picture the
 * screenshot froze, at `max_size`-capped resolution, so each axis carries its
 * own ratio) → hierarchy units (÷ the calibrated scale of §5.2). Never
 * `window.devicePixelRatio`: the browser's pixel density says nothing about
 * the device's.
 *
 * Pure, like `mirror-point.ts` beside it: the view reads the DOM boxes and
 * passes numbers in, so every edge is drivable without rendering anything.
 */

/** Everything the chain needs, gathered by the view: the fit from the layout,
 * the stream size from the session, the rest from the snapshot. */
export type SnapshotGeometry = {
  /** Canvas CSS px per stream px — `fitMirror`'s own scale. */
  readonly fitScale: number;
  /** The stream's size right now, which follows rotation. */
  readonly streamWidth: number;
  readonly streamHeight: number;
  /** The frozen screenshot's pixel size, from the snapshot. */
  readonly screenshotWidth: number;
  readonly screenshotHeight: number;
  /** Screenshot px per hierarchy unit — the calibrated §5.2 scale. */
  readonly scale: number;
};

export type HierarchyPoint = {
  readonly x: number;
  readonly y: number;
};

export type StreamRect = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

/** A pointer position, as hierarchy units — or `null` off the drawn picture:
 * the gutter and the bezel are the app, not the phone (criterion 12). */
export function pointToHierarchy(
  offsetX: number,
  offsetY: number,
  geometry: SnapshotGeometry,
): HierarchyPoint | null {
  if (!usable(geometry)) {
    return null;
  }
  const drawnWidth = geometry.streamWidth * geometry.fitScale;
  const drawnHeight = geometry.streamHeight * geometry.fitScale;
  if (offsetX < 0 || offsetY < 0 || offsetX >= drawnWidth || offsetY >= drawnHeight) {
    return null;
  }

  const streamX = offsetX / geometry.fitScale;
  const streamY = offsetY / geometry.fitScale;
  return {
    x: (streamX * geometry.screenshotWidth) / geometry.streamWidth / geometry.scale,
    y: (streamY * geometry.screenshotHeight) / geometry.streamHeight / geometry.scale,
  };
}

/**
 * The element under the point, as its path of child indices — the same path
 * synthesis names (criterion 23). §5.5's rules: skip the boundless and the
 * zero-sized as targets (but never as parents — the real root is boundless and
 * everything hangs under it), take the **smallest area**, break ties by
 * **depth**, then prefer `clickable`, a `resourceId`, and `text`, in that
 * order (criteria 8–10).
 */
export function hitTest(tree: TreeNode, point: HierarchyPoint): readonly number[] | null {
  let winner: { path: readonly number[]; area: number; depth: number; rank: number } | null = null;

  const visit = (node: TreeNode, path: readonly number[]): void => {
    const bounds = node.bounds;
    if (bounds !== null && contains(bounds, point)) {
      const width = bounds.x2 - bounds.x1;
      const height = bounds.y2 - bounds.y1;
      if (width > 0 && height > 0) {
        const candidate = {
          path,
          area: width * height,
          depth: path.length,
          rank: preferenceRank(node),
        };
        if (winner === null || beats(candidate, winner)) {
          winner = candidate;
        }
      }
    }
    node.children.forEach((child, index) => {
      visit(child, [...path, index]);
    });
  };
  visit(tree, []);

  return winner === null ? null : (winner as { path: readonly number[] }).path;
}

/**
 * Criterion 11 — Alt retargets the hit one level up, to the container. When
 * the parent carries no drawable bounds (the real root reports none), the hit
 * stays where it is: a highlight of nothing is not "the container".
 */
export function retargetToParent(tree: TreeNode, path: readonly number[]): readonly number[] {
  if (path.length === 0) {
    return path;
  }
  const parentPath = path.slice(0, -1);
  const parent = nodeAt(tree, parentPath);
  const bounds = parent?.bounds;
  if (bounds === undefined || bounds === null || bounds.x2 <= bounds.x1 || bounds.y2 <= bounds.y1) {
    return path;
  }
  return parentPath;
}

/** The node a path names, or `null` for a path the tree does not have. */
export function nodeAt(tree: TreeNode, path: readonly number[]): TreeNode | null {
  let node = tree;
  for (const index of path) {
    const child = node.children[index];
    if (child === undefined) {
      return null;
    }
    node = child;
  }
  return node;
}

/**
 * A node's rectangle in stream coordinates — the canvas's own pre-transform
 * space, where the overlay is positioned (criterion 13). The parent's CSS
 * `transform` applies the fit, so the fit scale deliberately plays no part.
 */
export function nodeStreamRect(bounds: Bounds, geometry: SnapshotGeometry): StreamRect | null {
  if (!usable(geometry) || bounds.x2 <= bounds.x1 || bounds.y2 <= bounds.y1) {
    return null;
  }
  const toStreamX = (geometry.scale * geometry.streamWidth) / geometry.screenshotWidth;
  const toStreamY = (geometry.scale * geometry.streamHeight) / geometry.screenshotHeight;
  return {
    x: bounds.x1 * toStreamX,
    y: bounds.y1 * toStreamY,
    width: (bounds.x2 - bounds.x1) * toStreamX,
    height: (bounds.y2 - bounds.y1) * toStreamY,
  };
}

/**
 * Criterion 40 — where a menu-executed gesture lands: the element's centre, as
 * the integers the wire carries, clamped inside the stream the way
 * `mirror-point.ts` clamps a click: the encoder refuses a coordinate at the
 * stream's own size.
 */
export function nodeStreamCenter(
  bounds: Bounds,
  geometry: SnapshotGeometry,
): { x: number; y: number } | null {
  const rect = nodeStreamRect(bounds, geometry);
  if (rect === null) {
    return null;
  }
  return {
    x: clamp(Math.round(rect.x + rect.width / 2), geometry.streamWidth),
    y: clamp(Math.round(rect.y + rect.height / 2), geometry.streamHeight),
  };
}

/** Half-open, the way Android reports bounds: `[0,0][100,100]` contains 99. */
function contains(bounds: Bounds, point: HierarchyPoint): boolean {
  return point.x >= bounds.x1 && point.x < bounds.x2 && point.y >= bounds.y1 && point.y < bounds.y2;
}

/** Criterion 10's ladder, as a rank: lower wins. */
function preferenceRank(node: TreeNode): number {
  if (node.clickable === true) {
    return 0;
  }
  if (node.resourceId !== null) {
    return 1;
  }
  if (node.text !== null) {
    return 2;
  }
  return 3;
}

function beats(
  candidate: { area: number; depth: number; rank: number },
  winner: { area: number; depth: number; rank: number },
): boolean {
  if (candidate.area !== winner.area) {
    return candidate.area < winner.area;
  }
  if (candidate.depth !== winner.depth) {
    return candidate.depth > winner.depth;
  }
  // Strictly better only: an all-else-equal tie keeps the first in tree order.
  return candidate.rank < winner.rank;
}

function usable(geometry: SnapshotGeometry): boolean {
  return (
    geometry.fitScale > 0 &&
    geometry.streamWidth > 0 &&
    geometry.streamHeight > 0 &&
    geometry.screenshotWidth > 0 &&
    geometry.screenshotHeight > 0 &&
    geometry.scale > 0
  );
}

/** Into `[0, size)`, the half-open range the wire's coordinates live in. */
function clamp(value: number, size: number): number {
  return Math.min(Math.max(value, 0), size - 1);
}

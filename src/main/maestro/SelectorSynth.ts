import { ERROR_CODES, type ErrorCode, type SynthesizedSelector } from '@shared/ipc';
import type { Bounds, TreeNode } from '@shared/types';

/**
 * §5.4's ladder: `id:` → `text:` → `text:` + `index:` → relational → `point:`,
 * climbing a rung **only** when the current one is not unique on screen, and
 * validating every candidate against the snapshot's own tree before it is
 * allowed out. §5.1 names the failure this prevents: a selector that looks
 * right in Conductor and fails in `maestro test`.
 *
 * Pure, like `HierarchyParser` (§9.2): a tree, a path and a screen in, a
 * structured selector out. Every trap below is §5.3's:
 *
 *  - Tree keys are not selector keys. `resourceId` becomes `id:`,
 *    `text`/`contentDescription` become `text:` — `class`, `hintText` and the
 *    rest never leave the tree.
 *  - `text:` is a full-string regex with IGNORE_CASE; `id:` a full-string
 *    regex, case-sensitive. Both counted here with exactly those semantics.
 *  - The value is copied literally from the tree, never derived from pixels.
 *  - Regex specials are escaped — but only when the snapshot proves the raw
 *    string would name a different set of nodes. `com.vtex.pnp:id/login` stays
 *    readable in review (§12.7) because its dots, though wildcards, match
 *    nothing else on screen; `R$ 10` is escaped because its `$` anchors
 *    instead of matching.
 */

export class SelectorSynthError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'SelectorSynthError';
  }
}

/** The screen in hierarchy units — the calibrated frame `point:` percentages
 * are relative to. The snapshot service derives it from the same widest-bounds
 * node the scale came from (§5.2). */
export type SynthesisScreen = {
  readonly width: number;
  readonly height: number;
};

/** §5.4's relational rung, in the order the section lists the directions. */
const DIRECTIONS = ['below', 'above', 'leftOf', 'rightOf'] as const;

type Direction = (typeof DIRECTIONS)[number];

type Point = { readonly x: number; readonly y: number };

export function synthesizeSelector(
  tree: TreeNode,
  path: readonly number[],
  screen: SynthesisScreen,
): SynthesizedSelector {
  const target = nodeAt(tree, path);
  const nodes = flatten(tree);

  // Rung 1 — `id:`, the testID of a React Native app. Stable, cross-platform,
  // immune to copy changes — when it is unique, which a launcher stamping
  // `id/icon` on nine tiles shows is not a given.
  if (target.resourceId !== null) {
    const matches = nodes.filter((candidate) => candidate.resourceId === target.resourceId);
    assertSomeMatch(matches.length, 'resource-id');
    if (matches.length === 1) {
      return {
        level: 'id',
        selector: `id: ${emitValue(target.resourceId, nodes, idValues, false)}`,
        fragile: false,
      };
    }
  }

  // Rungs 2 and 3 — `text:`, from the node's text or its content-desc (§5.3),
  // with `index:` when the duplicates are legitimate. The index is the node's
  // position among the matches in tree order, which is also the order the
  // elements were reported in.
  const text = target.text ?? target.contentDescription;
  if (text !== null) {
    const matches = nodes.filter((candidate) => literallyMatchesText(candidate, text));
    assertSomeMatch(matches.length, 'text');
    const value = emitValue(text, nodes, textValues, true);
    if (matches.length === 1) {
      return { level: 'text', selector: `text: ${value}`, fragile: false };
    }
    const index = matches.indexOf(target);
    assertSomeMatch(index === -1 ? 0 : 1, 'text-index');
    return { level: 'text-index', selector: `text: ${value}\nindex: ${index}`, fragile: false };
  }

  // Rung 4 — relational, anchored on a stable neighbour.
  const relational = relationalSelector(nodes, target);
  if (relational !== null) {
    return relational;
  }

  // Rung 5 — `point:`, as percentages of the screen so it survives a
  // resolution change a little longer. §5.4: if it lands here, the UI must
  // warn that the step is fragile.
  const centre = centreOf(target.bounds);
  if (centre === null || screen.width <= 0 || screen.height <= 0) {
    throw new SelectorSynthError(
      ERROR_CODES.selectorNoMatch,
      'No rung of the ladder can name this element: it has no id, no text and no usable bounds.',
    );
  }
  return {
    level: 'point',
    selector: `point: ${Math.round((centre.x / screen.width) * 100)}%,${Math.round((centre.y / screen.height) * 100)}%`,
    fragile: true,
  };
}

/**
 * §5.4's validation net. A count of zero means the synthesis no longer agrees
 * with the tree it was reading — by construction the target matches its own
 * value, so reaching this is a bug, and a bug is reported rather than written.
 */
function assertSomeMatch(count: number, rung: string): void {
  if (count === 0) {
    throw new SelectorSynthError(
      ERROR_CODES.selectorNoMatch,
      `Synthesis on the ${rung} rung matched nothing, including the element it was reading. This is a bug.`,
    );
  }
}

/* ── values ─────────────────────────────────────────────────────────────── */

/** The strings `id:` runs its regex against. */
function idValues(node: TreeNode): readonly (string | null)[] {
  return [node.resourceId];
}

/** The strings `text:` runs its regex against — text *or* content-desc, which
 * is how Maestro reads the filter and why both count toward uniqueness. */
function textValues(node: TreeNode): readonly (string | null)[] {
  return [node.text, node.contentDescription];
}

function literallyMatchesText(node: TreeNode, value: string): boolean {
  const wanted = value.toLowerCase();
  return textValues(node).some((candidate) => candidate?.toLowerCase() === wanted);
}

/**
 * The emitted, quoted YAML value. Raw when the raw string, compiled as the
 * full-string regex Maestro will compile, names exactly the nodes the literal
 * value names on this snapshot; escaped the moment that stops being true. The
 * escape is for correctness, never decoration — these files are read in code
 * review (§12.7), and `id: "com\\.vtex\\.pnp:id/x"` is noise when the dots
 * were never going to match anything else.
 */
function emitValue(
  value: string,
  nodes: readonly TreeNode[],
  valuesOf: (node: TreeNode) => readonly (string | null)[],
  caseInsensitive: boolean,
): string {
  return quote(rawIsLiteral(value, nodes, valuesOf, caseInsensitive) ? value : escapeRegex(value));
}

function rawIsLiteral(
  value: string,
  nodes: readonly TreeNode[],
  valuesOf: (node: TreeNode) => readonly (string | null)[],
  caseInsensitive: boolean,
): boolean {
  let regex: RegExp;
  try {
    regex = new RegExp(`^(?:${value})$`, caseInsensitive ? 'i' : '');
  } catch {
    // Not even a regex — `(` unbalanced, say. Escaping is the only option.
    return false;
  }

  const wanted = caseInsensitive ? value.toLowerCase() : value;
  return nodes.every((node) =>
    valuesOf(node).every((candidate) => {
      if (candidate === null) {
        return true;
      }
      const literal = (caseInsensitive ? candidate.toLowerCase() : candidate) === wanted;
      return literal === regex.test(candidate);
    }),
  );
}

/** Everything the target platform's regex reads as syntax, escaped. */
function escapeRegex(value: string): string {
  return value.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

/** YAML double-quoted style, the way the design system writes selectors. */
function quote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/* ── the relational rung ────────────────────────────────────────────────── */

/**
 * `below:`/`above:`/`leftOf:`/`rightOf:`, anchored on a neighbour that is
 * itself uniquely selectable. The filter names the element *closest* to the
 * anchor in that direction, so the candidate is emitted only when the closest
 * element provably is the target — anything else would write a selector that
 * taps the interloper.
 */
function relationalSelector(
  nodes: readonly TreeNode[],
  target: TreeNode,
): SynthesizedSelector | null {
  const targetCentre = centreOf(target.bounds);
  if (targetCentre === null) {
    return null;
  }

  const bounded = nodes.filter((node) => centreOf(node.bounds) !== null);
  const anchors = bounded
    .filter((node) => node !== target)
    .map((node) => ({
      node,
      centre: centreOf(node.bounds) as Point,
      selector: stableSelector(node, nodes),
    }))
    .filter((anchor) => anchor.selector !== null)
    // Nearest stable neighbour first — §5.4 wants an anchor, not a landmark on
    // the far side of the screen.
    .sort((a, b) => distance(a.centre, targetCentre) - distance(b.centre, targetCentre));

  for (const anchor of anchors) {
    for (const direction of DIRECTIONS) {
      if (!inDirection(targetCentre, anchor.centre, direction)) {
        continue;
      }
      if (closestInDirection(bounded, anchor.node, anchor.centre, direction) === target) {
        return {
          level: 'relational',
          selector: `${direction}:\n  ${anchor.selector}`,
          fragile: false,
        };
      }
    }
  }
  return null;
}

/** An anchor is stable when its own first or second rung is unique — id
 * preferred, text otherwise. Nothing anchors on a `point:`. */
function stableSelector(node: TreeNode, nodes: readonly TreeNode[]): string | null {
  if (node.resourceId !== null) {
    const rid = node.resourceId;
    if (nodes.filter((candidate) => candidate.resourceId === rid).length === 1) {
      return `id: ${emitValue(rid, nodes, idValues, false)}`;
    }
  }
  const text = node.text ?? node.contentDescription;
  if (
    text !== null &&
    nodes.filter((candidate) => literallyMatchesText(candidate, text)).length === 1
  ) {
    return `text: ${emitValue(text, nodes, textValues, true)}`;
  }
  return null;
}

function inDirection(candidate: Point, anchor: Point, direction: Direction): boolean {
  switch (direction) {
    case 'below':
      return candidate.y > anchor.y;
    case 'above':
      return candidate.y < anchor.y;
    case 'leftOf':
      return candidate.x < anchor.x;
    case 'rightOf':
      return candidate.x > anchor.x;
  }
}

/** The single closest element in that direction, or `null` on a tie — a tie
 * means the selector's answer depends on iteration order, which is exactly the
 * kind of "works today" §5.4 exists to refuse. */
function closestInDirection(
  bounded: readonly TreeNode[],
  anchor: TreeNode,
  anchorCentre: Point,
  direction: Direction,
): TreeNode | null {
  let winner: TreeNode | null = null;
  let winning = Number.POSITIVE_INFINITY;
  let tied = false;

  for (const node of bounded) {
    if (node === anchor) {
      continue;
    }
    const centre = centreOf(node.bounds) as Point;
    if (!inDirection(centre, anchorCentre, direction)) {
      continue;
    }
    const away = distance(centre, anchorCentre);
    if (away < winning) {
      winner = node;
      winning = away;
      tied = false;
    } else if (away === winning) {
      tied = true;
    }
  }
  return tied ? null : winner;
}

/* ── geometry and traversal ─────────────────────────────────────────────── */

/** `null` for absent bounds and for the zero-sized: invisible elements are
 * never a hover target (§5.2) and make no sense as an anchor either. */
function centreOf(bounds: Bounds | null): Point | null {
  if (bounds === null || bounds.x2 <= bounds.x1 || bounds.y2 <= bounds.y1) {
    return null;
  }
  return { x: (bounds.x1 + bounds.x2) / 2, y: (bounds.y1 + bounds.y2) / 2 };
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Depth-first, root first — the order the device reported and the order
 * `index:` counts in. */
function flatten(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

function nodeAt(tree: TreeNode, path: readonly number[]): TreeNode {
  let node = tree;
  for (const index of path) {
    const child = node.children[index];
    if (child === undefined) {
      throw new SelectorSynthError(
        ERROR_CODES.selectorNodeMissing,
        `The snapshot's tree has no node at [${path.join(', ')}]. The renderer and main disagree about the tree — re-capture and retry.`,
      );
    }
    node = child;
  }
  return node;
}

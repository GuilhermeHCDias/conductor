import { ERROR_CODES, type ErrorCode, type SynthesizedSelector } from '@shared/ipc';
import type { Bounds, TreeNode } from '@shared/types';

/**
 * §5.4's ladder: `id:` → `text:` → `text:` + `index:` → relational → `point:`,
 * climbing a rung **only** when the current one cannot name exactly the target
 * at runtime, and validating every candidate against the snapshot's own tree
 * before it is allowed out. §5.1 names the failure this prevents: a selector
 * that looks right in Conductor and fails in `maestro test`.
 *
 * "At runtime" is modelled on Maestro's own code (cli-2.8.0: `Filters.kt`,
 * `Orchestra.buildFilter`, `Maestro.findElementWithTimeout`), not on what the
 * filters look like they do. The 2026-08-06 incident — a validated `above:`
 * that tapped a documentation link on the far side of the screen — came from
 * assuming the relational filter picks the element nearest its anchor. What
 * the runtime actually does:
 *
 *  - `idMatches` accepts the resource-id **or** its part after the last `/`;
 *    `textMatches` reads text, content-desc **and** hintText — all
 *    full-string regexes, `text:` with IGNORE_CASE (§5.3).
 *  - Every index-less selector passes through `deepestMatchingElement`: a
 *    match with a matching descendant is dropped. A tab whose content-desc
 *    repeats its label's text is unambiguous at runtime — and that same
 *    container can never be named by the text itself.
 *  - `index:` counts the surviving matches sorted by position — `(y1, x1)`,
 *    boundless last (`INDEX_COMPARATOR`) — never by tree order.
 *  - A relational selector keeps the nodes whose **top-left corner** satisfies
 *    the direction against the anchor's corner (never centres, so a wrapper
 *    counts as `above` its own content); `Filters.intersect`'s `.toSet()`
 *    erases the distance sort, leaving **tree order**; `clickableFirst()`
 *    ranks clickable candidates ahead; the runner taps the **first**.
 *    Distance decides nothing.
 *
 * Pure, like `HierarchyParser` (§9.2): a tree, a path and a screen in, a
 * structured selector out. The remaining §5.3 traps this module carries:
 *
 *  - Tree keys are not selector keys. `resourceId` becomes `id:`,
 *    `text`/`contentDescription` become `text:` — `class`, `hintText` and the
 *    rest never leave the tree. hintText *counts* toward uniqueness, but is
 *    never a value.
 *  - The value is copied literally from the tree, never derived from pixels.
 *  - Regex specials are escaped — but only when the snapshot proves the raw
 *    string would name a different set of nodes. `com.vtex.pnp:id/login`
 *    stays readable in review (§12.7) because its dots, though wildcards,
 *    match nothing else on screen; `R$ 10` is escaped because its `$` anchors
 *    instead of matching.
 *
 * The one honesty limit: this model runs over the MCP tree, which prunes
 * zero-sized nodes and empty containers the runtime tree still carries. The
 * recapture that precedes every synthesis keeps the two close; a pruned node
 * stealing a pick is the residual risk §5.2's amendment accepted.
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
  // immune to copy changes — when the runtime resolves it to exactly this
  // node, which a launcher stamping `id/icon` on nine tiles shows is not a
  // given. A lone match that is not the target is a container whose own
  // descendant carries the id: the collapse hands the runner the descendant,
  // and the ladder climbs.
  if (target.resourceId !== null) {
    const rid = target.resourceId;
    const matches = deepestMatches(tree, (candidate) => literallyMatchesId(candidate, rid));
    assertSomeMatch(matches.length, 'resource-id');
    if (matches.length === 1 && matches[0] === target) {
      return {
        level: 'id',
        selector: `id: ${emitValue(rid, nodes, idValues, false)}`,
        fragile: false,
      };
    }
  }

  // Rungs 2 and 3 — `text:`, from the node's text or its content-desc (§5.3),
  // with `index:` when the duplicates are legitimate. The index is the
  // target's position among the surviving matches in `INDEX_COMPARATOR`
  // order — `(y1, x1)`, the order the runner counts in — and a target the
  // collapse dropped (its own label matches instead) has no index at all.
  const text = target.text ?? target.contentDescription;
  if (text !== null) {
    const matches = deepestMatches(tree, (candidate) => literallyMatchesText(candidate, text));
    assertSomeMatch(matches.length, 'text');
    const value = emitValue(text, nodes, textValues, true);
    if (matches.length === 1 && matches[0] === target) {
      return { level: 'text', selector: `text: ${value}`, fragile: false };
    }
    const index = positionSorted(matches).indexOf(target);
    if (index !== -1) {
      return { level: 'text-index', selector: `text: ${value}\nindex: ${index}`, fragile: false };
    }
  }

  // Rung 4 — relational, anchored on a stable neighbour.
  const relational = relationalSelector(tree, nodes, target);
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
 * with the tree it was reading — the target (or a descendant of it) always
 * matches its own value, so reaching this is a bug, and a bug is reported
 * rather than written.
 */
function assertSomeMatch(count: number, rung: string): void {
  if (count === 0) {
    throw new SelectorSynthError(
      ERROR_CODES.selectorNoMatch,
      `Synthesis on the ${rung} rung matched nothing, including the element it was reading. This is a bug.`,
    );
  }
}

/* ── Maestro's own matching (cli-2.8.0) ─────────────────────────────────── */

/** The strings `id:` runs its regex against — `idMatches` reads the
 * resource-id and, separately, its part after the last `/`: a bare testID
 * collides with any namespaced id ending in the same name. */
function idValues(node: TreeNode): readonly (string | null)[] {
  const rid = node.resourceId;
  if (rid === null) {
    return [null];
  }
  const slash = rid.lastIndexOf('/');
  return slash === -1 ? [rid] : [rid, rid.slice(slash + 1)];
}

function literallyMatchesId(node: TreeNode, value: string): boolean {
  return idValues(node).some((candidate) => candidate === value);
}

/** The strings `text:` runs its regex against — text, content-desc *and*
 * hintText (`textMatches`), which is why all three count toward uniqueness
 * even though hintText is never a value of ours (§5.3). */
function textValues(node: TreeNode): readonly (string | null)[] {
  return [node.text, node.contentDescription, node.hintText];
}

function literallyMatchesText(node: TreeNode, value: string): boolean {
  const wanted = value.toLowerCase();
  return textValues(node).some((candidate) => candidate?.toLowerCase() === wanted);
}

/**
 * `Filters.deepestMatchingElement`, which Orchestra wraps around every
 * index-less basic filter: a match with a matching descendant never reaches
 * the runner — only the deepest survive, in tree order.
 */
function deepestMatches(root: TreeNode, matches: (node: TreeNode) => boolean): TreeNode[] {
  const survivors: TreeNode[] = [];
  const visit = (node: TreeNode): boolean => {
    let below = false;
    for (const child of node.children) {
      below = visit(child) || below;
    }
    if (below) {
      return true;
    }
    if (matches(node)) {
      survivors.push(node);
      return true;
    }
    return false;
  };
  visit(root);
  return survivors;
}

/** `Filters.INDEX_COMPARATOR` — `index:` counts by `(y1, x1)`, boundless
 * last, never by tree order. The sort is stable, like Kotlin's. */
function positionSorted(nodes: readonly TreeNode[]): TreeNode[] {
  const key = (node: TreeNode): readonly [number, number] =>
    node.bounds === null
      ? [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER]
      : [node.bounds.y1, node.bounds.x1];
  return [...nodes].sort((a, b) => {
    const [ay, ax] = key(a);
    const [by, bx] = key(b);
    return ay - by || ax - bx;
  });
}

/* ── values ─────────────────────────────────────────────────────────────── */

/**
 * The emitted, quoted YAML value. Raw when the raw string, compiled as the
 * full-string regex Maestro will compile, names exactly the nodes the literal
 * value names on this snapshot — tested against every string the runtime
 * tests, prefixless ids included; escaped the moment that stops being true.
 * The escape is for correctness, never decoration — these files are read in
 * code review (§12.7), and `id: "com\\.vtex\\.pnp:id/x"` is noise when the
 * dots were never going to match anything else.
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
 * itself uniquely resolvable. The candidate is emitted only when the runtime
 * pick — `maestroResolve`, the first-in-tree-order clickable-first candidate
 * — provably is the target; anything else would write a selector that taps
 * the interloper. Anchors are tried nearest-first: that is a readability
 * preference (§5.4 wants a neighbour, not a landmark across the screen), and
 * correctness rests on the resolution alone.
 */
function relationalSelector(
  tree: TreeNode,
  nodes: readonly TreeNode[],
  target: TreeNode,
): SynthesizedSelector | null {
  const targetCentre = centreOf(target.bounds);
  if (targetCentre === null) {
    return null;
  }

  const anchors = nodes
    .filter((candidate) => candidate !== target)
    .flatMap((candidate) => {
      const centre = centreOf(candidate.bounds);
      const selector = candidate.bounds === null ? null : stableSelector(candidate, tree, nodes);
      return centre !== null && selector !== null && candidate.bounds !== null
        ? [{ bounds: candidate.bounds, centre, selector }]
        : [];
    })
    .sort((a, b) => distance(a.centre, targetCentre) - distance(b.centre, targetCentre));

  for (const anchor of anchors) {
    for (const direction of DIRECTIONS) {
      if (maestroResolve(nodes, anchor.bounds, direction) === target) {
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

/**
 * The element `direction: <anchor>` actually taps. Candidates are the bounded
 * nodes whose top-left corner satisfies the direction against the anchor's
 * corner, standing in tree order; `clickableFirst()` moves clickable ones
 * ahead (stable, true before false before unreported); the runner takes the
 * first. `null` when nothing qualifies.
 */
function maestroResolve(
  nodes: readonly TreeNode[],
  anchor: Bounds,
  direction: Direction,
): TreeNode | null {
  let winner: TreeNode | null = null;
  let winnerRank = Number.POSITIVE_INFINITY;
  for (const candidate of nodes) {
    if (candidate.bounds === null || !inDirection(candidate.bounds, anchor, direction)) {
      continue;
    }
    const rank = clickableRank(candidate);
    if (rank < winnerRank) {
      winner = candidate;
      winnerRank = rank;
    }
  }
  return winner;
}

/** `Filters.kt`'s own predicates — top-left corners, never centres. A strict
 * inequality, so the anchor itself never qualifies. */
function inDirection(candidate: Bounds, anchor: Bounds, direction: Direction): boolean {
  switch (direction) {
    case 'below':
      return candidate.y1 > anchor.y1;
    case 'above':
      return candidate.y1 < anchor.y1;
    case 'leftOf':
      return candidate.x1 < anchor.x1;
    case 'rightOf':
      return candidate.x1 > anchor.x1;
  }
}

/** `clickableFirst()` — Kotlin's `sortedByDescending { it.clickable }` puts
 * true ahead of false ahead of unreported. */
function clickableRank(node: TreeNode): number {
  if (node.clickable === true) {
    return 0;
  }
  return node.clickable === false ? 1 : 2;
}

/** An anchor is stable when its own first or second rung resolves to exactly
 * it at runtime — id preferred, text otherwise, both through the same
 * collapse the runner applies. Nothing anchors on a `point:`. */
function stableSelector(node: TreeNode, tree: TreeNode, nodes: readonly TreeNode[]): string | null {
  if (node.resourceId !== null) {
    const rid = node.resourceId;
    const matches = deepestMatches(tree, (candidate) => literallyMatchesId(candidate, rid));
    if (matches.length === 1 && matches[0] === node) {
      return `id: ${emitValue(rid, nodes, idValues, false)}`;
    }
  }
  const text = node.text ?? node.contentDescription;
  if (text !== null) {
    const matches = deepestMatches(tree, (candidate) => literallyMatchesText(candidate, text));
    if (matches.length === 1 && matches[0] === node) {
      return `text: ${emitValue(text, nodes, textValues, true)}`;
    }
  }
  return null;
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

/** Depth-first, root first — the order the device reported, the order the
 * runtime's `aggregate()` walks in, and so the order `maestroResolve` reads
 * as "first". */
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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ERROR_CODES } from '@shared/ipc';
import type { Bounds, TreeNode } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { parseHierarchy } from './HierarchyParser';
import { SelectorSynthError, synthesizeSelector } from './SelectorSynth';

/**
 * §5.4's ladder, driven from the same real capture `HierarchyParser` reads —
 * 110 nodes off a Galaxy A07 — plus hand-built trees for the rungs the real
 * screen happens not to exercise. The traps here are §5.3's: tree keys are not
 * selector keys, `text:` is a full-string case-insensitive regex, and text is
 * copied literally from the tree or not at all.
 *
 * The runtime model the assertions encode is Maestro's own, read out of
 * cli-2.8.0 (`Filters.kt`, `Orchestra.buildFilter`, `Maestro.findElementWithTimeout`)
 * after the 2026-08-06 incident where a recorded `above:` tapped a link on the
 * far side of the screen:
 *
 *  - `idMatches` accepts the resource-id **or** its part after the last `/`.
 *  - `textMatches` reads text, content-desc **and hintText**.
 *  - Every index-less selector is wrapped in `deepestMatchingElement`: a match
 *    with a matching descendant is dropped, and only the deepest survive.
 *  - `index:` counts the survivors sorted by position — `(y1, x1)`, boundless
 *    last — never by tree order.
 *  - A relational filter keeps the nodes whose **top-left corner** satisfies
 *    the direction against the anchor's; `intersect` then throws the distance
 *    sort away (`.toSet()`), leaving tree order, `clickableFirst()` ranks
 *    clickable ones ahead, and the runner taps the first.
 */

const CAPTURE = readFileSync(resolve('src/main/maestro/inspect-screen.capture.json'), 'utf8');

/** The capture's own screen, in hierarchy units: its widest bounds are
 * `[0,0][720,1600]`, matching the 720×1600 screenshot at scale 1. */
const SCREEN = { width: 720, height: 1600 };

const tree = (): TreeNode => parseHierarchy(CAPTURE);

const node = (over: Partial<TreeNode> = {}): TreeNode => ({
  bounds: null,
  className: null,
  text: null,
  resourceId: null,
  contentDescription: null,
  hintText: null,
  scrollable: null,
  clickable: null,
  enabled: null,
  focused: null,
  selected: null,
  checked: null,
  children: [],
  ...over,
});

const box = (x1: number, y1: number, x2: number, y2: number): Bounds => ({ x1, y1, x2, y2 });

/** Every node, root first, paired with its path of child indices. */
function walk(
  root: TreeNode,
  path: readonly number[] = [],
): Array<{ node: TreeNode; path: readonly number[] }> {
  return [
    { node: root, path },
    ...root.children.flatMap((child, index) => walk(child, [...path, index])),
  ];
}

/** The path of the first node satisfying `test`, or a failure naming it. */
function pathTo(root: TreeNode, test: (candidate: TreeNode) => boolean): readonly number[] {
  const found = walk(root).find((entry) => test(entry.node));
  if (found === undefined) {
    throw new Error('The capture no longer carries the node this test is about.');
  }
  return found.path;
}

/* ── the real capture ───────────────────────────────────────────────────── */

describe('the ladder against real hardware data', () => {
  /** Criterion 30 — `id:` is the first rung, and this rid is unique on screen. */
  it('emits id: for a node whose resource-id is unique', () => {
    const capture = tree();
    const path = pathTo(capture, (n) => n.resourceId === 'com.android.systemui:id/clock');

    expect(synthesizeSelector(capture, path, SCREEN)).toEqual({
      level: 'id',
      selector: 'id: "com.android.systemui:id/clock"',
      fragile: false,
    });
  });

  /**
   * ⚠️ The launcher stamps `id/icon` on nine nodes, which is exactly the trap
   * §5.4 climbs past: an id that is not unique on screen selects one of nine.
   * The text is unique, so the ladder stops there.
   */
  it('climbs past a duplicated resource-id to a unique text', () => {
    const capture = tree();
    const path = pathTo(capture, (n) => n.text === 'Spotify');

    expect(synthesizeSelector(capture, path, SCREEN)).toEqual({
      level: 'text',
      selector: 'text: "Spotify"',
      fragile: false,
    });
  });

  /** §5.3 — `content-desc` becomes `text:`, never a key of its own. */
  it('selects by content-desc as text: when the node has no text', () => {
    const capture = tree();
    const path = pathTo(capture, (n) => n.contentDescription === 'Fair');

    expect(synthesizeSelector(capture, path, SCREEN)).toEqual({
      level: 'text',
      selector: 'text: "Fair"',
      fragile: false,
    });
  });

  /**
   * Criterion 34. The value is the tree's own string, `°` and `.` included —
   * and the dot stays unescaped because as a regex it still matches nothing
   * else on this screen. Escaping is for correctness, not decoration: these
   * files go through code review (§12.7).
   */
  it('copies text literally from the tree', () => {
    const capture = tree();
    const path = pathTo(capture, (n) => n.text === 'Mostly sunny tomorrow. High of 26°');

    expect(synthesizeSelector(capture, path, SCREEN).selector).toBe(
      'text: "Mostly sunny tomorrow. High of 26°"',
    );
  });

  /**
   * Criteria 30–32, as one property over all 109 bounded nodes: every emitted
   * selector uses a legal key, and a selector below `point:` names exactly one
   * element of the tree it was synthesised from — §5.4's validation, exercised
   * against real hardware rather than asserted about it.
   */
  it('synthesises a validated selector for every bounded node of the capture', () => {
    const capture = tree();
    const entries = walk(capture).filter((entry) => entry.node.bounds !== null);
    expect(entries.length).toBeGreaterThan(100);

    for (const entry of entries) {
      const result = synthesizeSelector(capture, entry.path, SCREEN);

      // Criterion 32: tree-only keys never leak into a selector. Inline rungs
      // carry their value on the line; relational ones nest their anchor.
      expect(result.selector).toMatch(
        /^(?:(?:id|text|point): |(?:below|above|leftOf|rightOf):\n {2}(?:id|text): )/,
      );
      expect(result.selector).not.toMatch(/class|hintText|resource-id|content-desc/);
      // Criterion 27's input: only `point:` is fragile, and always is.
      expect(result.fragile).toBe(result.level === 'point');

      if (result.level === 'id' || result.level === 'text') {
        const matches = matchedNodes(capture, result);
        expect(matches.length).toBe(1);
        // Not merely unique: the one node Maestro would resolve is this one.
        expect(matches[0]).toBe(entry.node);
      }
      if (result.level === 'text-index') {
        const matches = positionSorted(matchedNodes(capture, result));
        const index = Number(result.selector.match(/index: (\d+)$/)?.[1]);
        expect(matches[index]).toBe(entry.node);
      }
    }
  });
});

/**
 * The nodes the emitted selector names at runtime, by Maestro's own semantics
 * (cli-2.8.0): full-string regex — case-insensitive for `text:` against text,
 * content-desc and hintText; case-sensitive for `id:` against the resource-id
 * and its part after the last `/` — then `deepestMatchingElement`, which drops
 * any match with a matching descendant.
 */
function matchedNodes(root: TreeNode, result: { level: string; selector: string }): TreeNode[] {
  const value = result.selector.match(/^(?:id|text): "((?:[^"\\]|\\.)*)"/)?.[1];
  if (value === undefined) {
    throw new Error(`No quoted value in: ${result.selector}`);
  }
  // Undoing the YAML double-quote escapes yields the regex Maestro compiles —
  // the semantics the emitted selector actually has, wildcards and all.
  const pattern = value.replace(/\\(.)/g, '$1');
  const hit =
    result.level === 'id'
      ? (node: TreeNode): boolean => {
          const regex = new RegExp(`^(?:${pattern})$`);
          const rid = node.resourceId;
          return (
            rid !== null && (regex.test(rid) || regex.test(rid.slice(rid.lastIndexOf('/') + 1)))
          );
        }
      : (node: TreeNode): boolean => {
          const regex = new RegExp(`^(?:${pattern})$`, 'i');
          return [node.text, node.contentDescription, node.hintText].some(
            (candidate) => candidate !== null && regex.test(candidate),
          );
        };
  return collapseToDeepest(root, hit);
}

/** `Filters.deepestMatchingElement`: a match with a matching descendant never
 * reaches the runner — only the deepest survive, in tree order. */
function collapseToDeepest(root: TreeNode, hit: (node: TreeNode) => boolean): TreeNode[] {
  const survivors: TreeNode[] = [];
  const visit = (node: TreeNode): boolean => {
    let below = false;
    for (const child of node.children) {
      below = visit(child) || below;
    }
    if (below) {
      return true;
    }
    if (hit(node)) {
      survivors.push(node);
      return true;
    }
    return false;
  };
  visit(root);
  return survivors;
}

/** `Filters.INDEX_COMPARATOR` — `index:` counts by position, boundless last. */
function positionSorted(nodes: readonly TreeNode[]): TreeNode[] {
  const key = (node: TreeNode): { y: number; x: number } => ({
    y: node.bounds?.y1 ?? Number.MAX_SAFE_INTEGER,
    x: node.bounds?.x1 ?? Number.MAX_SAFE_INTEGER,
  });
  return [...nodes].sort((a, b) => key(a).y - key(b).y || key(a).x - key(b).x);
}

/* ── the rungs the capture does not reach ───────────────────────────────── */

describe('duplicated text', () => {
  const screen = { width: 100, height: 300 };
  const duplicated = (): TreeNode =>
    node({
      bounds: box(0, 0, 100, 300),
      children: [
        node({ bounds: box(0, 0, 100, 100), text: 'Item' }),
        node({ bounds: box(0, 100, 100, 200), text: 'Item' }),
        node({ bounds: box(0, 200, 100, 300), text: 'Item' }),
      ],
    });

  /** §5.4 rung 3 — legitimate duplicates, told apart by position. */
  it('adds index: for the nth of several equal texts', () => {
    expect(synthesizeSelector(duplicated(), [1], screen)).toEqual({
      level: 'text-index',
      selector: 'text: "Item"\nindex: 1',
      fragile: false,
    });
  });

  /** ⚠️ §5.3 — `text:` matches with IGNORE_CASE, so "OK" and "ok" collide and
   * counting them as distinct would emit a selector that matches two. */
  it('counts duplicates case-insensitively', () => {
    const capture = node({
      bounds: box(0, 0, 100, 300),
      children: [
        node({ bounds: box(0, 0, 100, 100), text: 'OK' }),
        node({ bounds: box(0, 100, 100, 200), text: 'ok' }),
      ],
    });

    expect(synthesizeSelector(capture, [0], screen)).toEqual({
      level: 'text-index',
      selector: 'text: "OK"\nindex: 0',
      fragile: false,
    });
  });

  /** ⚠️ §5.3 — full-string means a prefix is not a duplicate: "RNR 352" does
   * not match "RNR 352 - Expo Launch", so no index is needed. */
  it('does not mistake a longer text for a duplicate of its prefix', () => {
    const capture = node({
      bounds: box(0, 0, 100, 300),
      children: [
        node({ bounds: box(0, 0, 100, 100), text: 'RNR 352' }),
        node({ bounds: box(0, 100, 100, 200), text: 'RNR 352 - Expo Launch' }),
      ],
    });

    expect(synthesizeSelector(capture, [0], screen)).toEqual({
      level: 'text',
      selector: 'text: "RNR 352"',
      fragile: false,
    });
  });

  it('prefers the node own text over its content-desc for the value', () => {
    const capture = node({
      bounds: box(0, 0, 100, 300),
      children: [node({ bounds: box(0, 0, 100, 100), text: 'A', contentDescription: 'B' })],
    });

    expect(synthesizeSelector(capture, [0], screen).selector).toBe('text: "A"');
  });

  /**
   * ⚠️ A container's content-desc and its label's text routinely repeat each
   * other (a Material tab: item `content-desc: Explore` wrapping a TextView
   * `text: Explore`). Maestro's `deepestMatchingElement` drops the container,
   * so at runtime `text:` names exactly one node — counting it as a duplicate
   * would demote a sound selector to `index:` for nothing.
   */
  it('collapses a container whose descendant carries the same text', () => {
    const capture = node({
      bounds: box(0, 0, 100, 300),
      children: [
        node({
          bounds: box(0, 0, 100, 50),
          contentDescription: 'Explore',
          clickable: true,
          children: [node({ bounds: box(10, 10, 90, 40), text: 'Explore' })],
        }),
      ],
    });

    expect(synthesizeSelector(capture, [0, 0], screen)).toEqual({
      level: 'text',
      selector: 'text: "Explore"',
      fragile: false,
    });
  });

  /**
   * ⚠️ `Filters.index` sorts its matches by position — `(y1, x1)`, the
   * `INDEX_COMPARATOR` — never by tree order. A tree whose second child is
   * drawn above its first would otherwise get an index that taps the wrong
   * twin at runtime.
   */
  it('counts index: in position order, not tree order', () => {
    const capture = node({
      bounds: box(0, 0, 100, 300),
      children: [
        node({ bounds: box(0, 100, 100, 150), text: 'Q' }),
        node({ bounds: box(0, 0, 100, 50), text: 'Q' }),
      ],
    });

    // The first child in tree order is the *second* by position.
    expect(synthesizeSelector(capture, [0], screen)).toEqual({
      level: 'text-index',
      selector: 'text: "Q"\nindex: 1',
      fragile: false,
    });
  });

  /** ⚠️ `Filters.textMatches` also reads hintText. A field whose hint repeats
   * the target's text is a second runtime match, even though hintText is never
   * a selector value of ours (§5.3). */
  it('counts a hintText match toward text uniqueness', () => {
    const capture = node({
      bounds: box(0, 0, 100, 300),
      children: [
        node({ bounds: box(0, 0, 100, 50), text: 'Search' }),
        node({ bounds: box(0, 100, 100, 150), hintText: 'Search' }),
      ],
    });

    expect(synthesizeSelector(capture, [0], screen)).toEqual({
      level: 'text-index',
      selector: 'text: "Search"\nindex: 0',
      fragile: false,
    });
  });
});

describe('id matching', () => {
  const screen = { width: 100, height: 200 };

  /**
   * ⚠️ `Filters.idMatches` accepts the resource-id *or* its part after the
   * last `/`. A bare testID therefore collides with any namespaced id ending
   * in the same name, and emitting `id:` here would tap one of two at runtime.
   * With no text either, and no anchor that can name it, the honest answer is
   * `point:`.
   */
  it('climbs past an id whose prefixless form matches a second node', () => {
    const capture = node({
      bounds: box(0, 0, 100, 200),
      children: [
        node({ bounds: box(0, 0, 100, 50), resourceId: 'submit' }),
        node({ bounds: box(0, 100, 100, 150), resourceId: 'com.app:id/submit' }),
      ],
    });

    expect(synthesizeSelector(capture, [0], screen).level).toBe('point');
  });
});

describe('regex escaping', () => {
  const screen = { width: 100, height: 300 };

  /**
   * ⚠️ §5.3 — `$` mid-pattern anchors instead of matching, so the raw string
   * would find nothing at runtime. Escaped, and the YAML double-quote doubles
   * the backslash so Maestro reads `R\$ 10`.
   */
  it('escapes specials that would change what the regex matches', () => {
    const capture = node({
      bounds: box(0, 0, 100, 300),
      children: [
        node({ bounds: box(0, 0, 100, 100), text: 'R$ 10' }),
        node({ bounds: box(0, 100, 100, 200), text: 'R$ 20' }),
      ],
    });

    expect(synthesizeSelector(capture, [0], screen).selector).toBe('text: "R\\\\$ 10"');
  });

  /**
   * ⚠️ An unescaped dot is a wildcard: `com.a.b:id/x` also matches
   * `comzazb:id/x`, so emitting it raw would name two nodes. The escape is
   * applied exactly when the snapshot proves it changes the answer.
   */
  it('escapes an id whose raw form would match a second node', () => {
    const capture = node({
      bounds: box(0, 0, 100, 300),
      children: [
        node({ bounds: box(0, 0, 100, 100), resourceId: 'com.a.b:id/x' }),
        node({ bounds: box(0, 100, 100, 200), resourceId: 'comzazb:id/x' }),
      ],
    });

    expect(synthesizeSelector(capture, [0], screen)).toEqual({
      level: 'id',
      selector: 'id: "com\\\\.a\\\\.b:id/x"',
      fragile: false,
    });
  });

  /** YAML's own special, escaped for YAML and left alone for the regex. */
  it('escapes double quotes for the YAML string', () => {
    const capture = node({
      bounds: box(0, 0, 100, 300),
      children: [node({ bounds: box(0, 0, 100, 100), text: 'Say "hi"' })],
    });

    expect(synthesizeSelector(capture, [0], screen).selector).toBe('text: "Say \\"hi\\""');
  });
});

describe('relational selectors', () => {
  const screen = { width: 100, height: 220 };

  /**
   * §5.4 rung 4 — a node with no id and no text, anchored on a stable
   * neighbour. The anchor's own selector rides inside, nested the way Maestro
   * reads it.
   */
  it('anchors below: a uniquely-texted neighbour', () => {
    // The target shares its rid with a sibling, so the id rung climbs; with no
    // text either, the ladder reaches the relational rung.
    const capture = node({
      bounds: box(0, 0, 100, 220),
      children: [
        node({ bounds: box(0, 0, 100, 50), text: 'Label' }),
        node({ bounds: box(0, 50, 100, 150), resourceId: 'dup' }),
        node({ bounds: box(0, 150, 100, 200), resourceId: 'dup' }),
      ],
    });

    expect(synthesizeSelector(capture, [1], screen)).toEqual({
      level: 'relational',
      selector: 'below:\n  text: "Label"',
      fragile: false,
    });
  });

  it('anchors with the neighbour id when it has one', () => {
    const capture = node({
      bounds: box(0, 0, 100, 220),
      children: [
        node({ bounds: box(0, 0, 100, 50), resourceId: 'app:id/label' }),
        node({ bounds: box(0, 50, 100, 150) }),
      ],
    });

    expect(synthesizeSelector(capture, [1], screen).selector).toBe('below:\n  id: "app:id/label"');
  });

  /**
   * The direction names where the target sits relative to the anchor — by
   * top-left corners, Maestro's own predicate. The targets are clickable
   * because `above`/`leftOf` also admit every enclosing container (a wrapper's
   * corner is above its content's): `clickableFirst()` is what carries the
   * pick past the containers to the element the person actually meant.
   */
  it.each([
    ['above', box(0, 100, 100, 150), box(0, 160, 100, 210)],
    ['leftOf', box(40, 60, 80, 160), box(80, 60, 100, 160)],
    ['rightOf', box(20, 60, 60, 160), box(0, 60, 20, 160)],
  ] as const)('emits %s: when the target is %s the anchor', (direction, target, anchor) => {
    const capture = node({
      bounds: box(0, 0, 100, 220),
      children: [
        node({ bounds: anchor, text: 'Anchor' }),
        node({ bounds: target, clickable: true }),
      ],
    });

    expect(synthesizeSelector(capture, [1], screen).selector).toBe(
      `${direction}:\n  text: "Anchor"`,
    );
  });

  /**
   * ⚠️ Maestro resolves a relational selector to the first node in **tree
   * order** that satisfies the direction — `intersect` throws the distance
   * sort away (`Filters.kt`, `.toSet()`). A node earlier in the tree between
   * the anchor and the target is the runtime pick, so the selector is not
   * emitted and the ladder falls through to `point:`.
   */
  it('refuses an anchor when an earlier node in tree order is the pick', () => {
    const capture = node({
      bounds: box(0, 0, 100, 220),
      children: [
        node({ bounds: box(0, 0, 100, 50), text: 'Label' }),
        node({ bounds: box(0, 50, 100, 100) }),
        node({ bounds: box(0, 100, 100, 200) }),
      ],
    });

    const result = synthesizeSelector(capture, [2], screen);
    expect(result.level).toBe('point');
  });

  /**
   * ⚠️ `above:`'s predicate is `candidate.y1 < anchor.y1`, which the enclosing
   * container satisfies too — its corner is above everything it wraps, and it
   * sits first in tree order. For a non-clickable target nothing outranks it,
   * so the container is what Maestro would tap.
   */
  it('refuses above: when the enclosing container is the runtime pick', () => {
    const capture = node({
      bounds: box(0, 0, 100, 220),
      children: [
        node({ bounds: box(0, 160, 100, 210), text: 'Anchor' }),
        node({ bounds: box(0, 100, 100, 150) }),
      ],
    });

    expect(synthesizeSelector(capture, [1], screen).level).toBe('point');
  });

  /**
   * ⚠️ `clickableFirst()` ranks every clickable candidate ahead of the rest,
   * still in tree order — so a clickable node earlier in the tree steals the
   * pick from a clickable target, however far from the anchor it sits. This is
   * the 2026-08-06 incident in miniature.
   */
  it('refuses a direction when an earlier clickable steals the pick', () => {
    // A boundless root, the way real captures report theirs (§5.2).
    const capture = node({
      children: [
        node({ bounds: box(0, 50, 100, 90), clickable: true }),
        node({ bounds: box(0, 200, 100, 250), text: 'Anchor' }),
        node({ bounds: box(0, 100, 100, 150), clickable: true }),
      ],
    });

    expect(synthesizeSelector(capture, [2], screen).level).toBe('point');
  });

  /**
   * ⚠️ The target can be an ancestor Maestro's collapse makes unnameable by
   * text (its label matches instead) — but the relational rung can still name
   * it when the runtime pick lands on it: here the clickable container is the
   * first candidate above its own label. This is the tab item's happy path.
   */
  it('falls through to a relational anchored on the target own label', () => {
    const capture = node({
      bounds: box(0, 0, 100, 220),
      children: [
        node({
          bounds: box(0, 0, 100, 50),
          contentDescription: 'Explore',
          clickable: true,
          children: [node({ bounds: box(10, 10, 90, 40), text: 'Explore' })],
        }),
      ],
    });

    expect(synthesizeSelector(capture, [0], screen)).toEqual({
      level: 'relational',
      selector: 'above:\n  text: "Explore"',
      fragile: false,
    });
  });
});

describe('the 2026-08-06 incident', () => {
  /** The Galaxy A07's screen, hierarchy units at scale 1. */
  const screen = { width: 720, height: 1600 };

  const APP = 'com.kuei.ainativesampleapp';

  /**
   * The screen `teste.yaml`'s second step was recorded on, geometry lifted
   * from the run log (`~/.maestro/tests/2026-08-06_145024`): a content area
   * whose first clickable is a documentation link, and a Material bottom bar
   * whose selected tab shows its large label while the other shows its small
   * one. Tree order is the screen's own: content first, navigation bar last.
   */
  const incident = (): TreeNode =>
    node({
      bounds: box(0, 0, 720, 1600),
      children: [
        node({
          bounds: box(0, 64, 720, 1359),
          children: [
            node({
              bounds: box(177, 417, 544, 504),
              contentDescription: 'Expo documentation, ',
              clickable: true,
            }),
            node({ bounds: box(500, 600, 700, 800) }),
          ],
        }),
        node({
          bounds: box(0, 1359, 720, 1510),
          children: [
            node({
              bounds: box(44, 1359, 360, 1510),
              contentDescription: 'Home',
              clickable: true,
              children: [
                node({
                  bounds: box(141, 1382, 261, 1510),
                  resourceId: `${APP}:id/navigation_bar_item_content_container`,
                  children: [
                    node({
                      bounds: box(180, 1389, 225, 1434),
                      resourceId: `${APP}:id/navigation_bar_item_icon_view`,
                    }),
                    node({
                      bounds: box(161, 1450, 240, 1510),
                      resourceId: `${APP}:id/navigation_bar_item_labels_group`,
                      children: [
                        node({
                          bounds: box(161, 1465, 240, 1505),
                          text: 'Home',
                          resourceId: `${APP}:id/navigation_bar_item_large_label_view`,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
            node({
              bounds: box(360, 1359, 676, 1510),
              contentDescription: 'Explore',
              clickable: true,
              children: [
                node({
                  bounds: box(458, 1382, 578, 1510),
                  resourceId: `${APP}:id/navigation_bar_item_content_container`,
                  children: [
                    node({
                      bounds: box(495, 1389, 540, 1434),
                      resourceId: `${APP}:id/navigation_bar_item_icon_view`,
                    }),
                    node({
                      bounds: box(478, 1450, 557, 1510),
                      resourceId: `${APP}:id/navigation_bar_item_labels_group`,
                      children: [
                        node({
                          bounds: box(478, 1450, 557, 1480),
                          text: 'Explore',
                          resourceId: `${APP}:id/navigation_bar_item_small_label_view`,
                        }),
                      ],
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    });

  /**
   * ⚠️ The regression itself. The recorded step was
   * `tapOn: above: id: …small_label_view` — synthesised for the tab's inner
   * container under the old closest-by-centre model, validated, and then
   * resolved by Maestro to the first clickable in tree order above the label:
   * the documentation link at (360, 460), which opened the browser. Under
   * Maestro's real semantics no anchor and no direction name this container,
   * so the ladder must fall to `point:` and carry the fragility warning.
   */
  it('refuses the recorded above: selector and falls to point:', () => {
    const tree = incident();
    const path = pathTo(
      tree,
      (n) =>
        n.resourceId === `${APP}:id/navigation_bar_item_content_container` && n.bounds?.x1 === 458,
    );

    expect(synthesizeSelector(tree, path, screen)).toEqual({
      level: 'point',
      selector: 'point: 72%,90%',
      fragile: true,
    });
  });

  /** The tab's label, though, is nameable outright — its Material id is
   * unique on this screen, and the collapsed match is the label itself. */
  it('names the tab label by its unique id', () => {
    const tree = incident();
    const path = pathTo(tree, (n) => n.text === 'Explore');

    expect(synthesizeSelector(tree, path, screen)).toEqual({
      level: 'id',
      selector: `id: "${APP}:id/navigation_bar_item_small_label_view"`,
      fragile: false,
    });
  });
});

describe('the point: last resort', () => {
  /** §5.4 rung 5, flagged fragile — criterion 27 makes the warning mandatory. */
  it('emits the centre as screen percentages, flagged fragile', () => {
    const capture = node({
      bounds: box(0, 0, 100, 200),
      children: [node({ bounds: box(25, 50, 75, 150) })],
    });

    expect(synthesizeSelector(capture, [0], { width: 100, height: 200 })).toEqual({
      level: 'point',
      selector: 'point: 50%,50%',
      fragile: true,
    });
  });

  it('rounds the percentages to integers', () => {
    const capture = node({
      bounds: box(0, 0, 300, 300),
      children: [node({ bounds: box(0, 0, 200, 200) })],
    });

    expect(synthesizeSelector(capture, [0], { width: 300, height: 300 }).selector).toBe(
      'point: 33%,33%',
    );
  });
});

/* ── failures ───────────────────────────────────────────────────────────── */

describe('a path the tree does not have', () => {
  /** Criterion 5's other half: a path from a tree main no longer holds is a
   * condition with a stable code, not a crash. */
  it('throws the stable node-missing code', () => {
    const capture = node({ bounds: box(0, 0, 100, 100) });

    expect(() => synthesizeSelector(capture, [3], { width: 100, height: 100 })).toThrowError(
      SelectorSynthError,
    );
    try {
      synthesizeSelector(capture, [3], { width: 100, height: 100 });
    } catch (error) {
      expect((error as SelectorSynthError).code).toBe(ERROR_CODES.selectorNodeMissing);
    }
  });
});

describe('a node nothing can name', () => {
  it('throws the no-match code rather than inventing a selector', () => {
    // No id, no text, and no bounds: every rung of the ladder needs one of
    // those, and §5.4 is explicit that 0 is an error, never an emission.
    const capture = node({ bounds: box(0, 0, 100, 100), children: [node()] });

    try {
      synthesizeSelector(capture, [0], { width: 100, height: 100 });
      expect.unreachable('a selector was emitted for an unnameable node');
    } catch (error) {
      expect((error as SelectorSynthError).code).toBe(ERROR_CODES.selectorNoMatch);
    }
  });
});

/* ── the module itself ──────────────────────────────────────────────────── */

describe('the module itself', () => {
  /** §9.2 and criterion 35 — pure: no I/O, no Electron, no Node built-ins. */
  it('imports nothing beyond shared types', () => {
    const source = readFileSync(resolve('src/main/maestro/SelectorSynth.ts'), 'utf8');
    const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);

    for (const specifier of imports) {
      expect(specifier).toMatch(/^@shared\//);
    }
  });
});

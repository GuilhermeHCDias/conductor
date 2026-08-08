import type { Bounds, TreeNode } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { parseHierarchy } from '../../../main/maestro/HierarchyParser';
import captureText from '../../../main/maestro/inspect-screen.capture.json?raw';
import {
  hitTest,
  nodeStreamCenter,
  nodeStreamRect,
  pointToHierarchy,
  retargetToParent,
} from './hit-test';

/**
 * §5.5's hit-test, driven from the same Galaxy A07 capture the parser and the
 * synthesiser read — its ancestor chains are heavily degenerate (parents with
 * byte-identical bounds), which is exactly what makes depth a load-bearing
 * tiebreak — plus hand-built trees for the preference ladder.
 *
 * The geometry composes criterion 7's chain: canvas CSS px → stream px (the
 * fit scale) → screenshot px (stream against screenshot size) → hierarchy
 * units (the calibrated scale). `window.devicePixelRatio` appears nowhere.
 */

const capture = (): TreeNode => parseHierarchy(captureText);

/** The real streaming setup: a 720×1600 phone, streamed at 464×1024, drawn at
 * a fit scale of 0.55, calibrated at scale 1. */
const GEOMETRY = {
  fitScale: 0.55,
  streamWidth: 464,
  streamHeight: 1024,
  screenshotWidth: 720,
  screenshotHeight: 1600,
  scale: 1,
} as const;

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

/* ── the coordinate chain ───────────────────────────────────────────────── */

describe('mapping a pointer into hierarchy units', () => {
  /** Criterion 7 — the full chain, with the real stream-to-screenshot ratios
   * (which differ per axis: 720/464 is not 1600/1024). */
  it('composes CSS px through the stream and the screenshot into the hierarchy', () => {
    const point = pointToHierarchy(100, 200, GEOMETRY);

    expect(point).not.toBeNull();
    // 100 / 0.55 = 181.81 stream px; × 720/464 = 282.13 screenshot px; ÷ 1.
    expect(point?.x).toBeCloseTo(282.13, 1);
    // 200 / 0.55 = 363.63 stream px; × 1600/1024 = 568.18 screenshot px; ÷ 1.
    expect(point?.y).toBeCloseTo(568.18, 1);
  });

  it('divides by the calibrated scale for a 2x screen', () => {
    const point = pointToHierarchy(100, 200, { ...GEOMETRY, scale: 2 });

    expect(point?.x).toBeCloseTo(141.06, 1);
    expect(point?.y).toBeCloseTo(284.09, 1);
  });

  /** Criterion 12 — the gutter and the bezel are the app, not the phone. */
  it('answers null outside the drawn picture', () => {
    expect(pointToHierarchy(464 * 0.55, 10, GEOMETRY)).toBeNull();
    expect(pointToHierarchy(10, 1024 * 0.55, GEOMETRY)).toBeNull();
    expect(pointToHierarchy(-1, 10, GEOMETRY)).toBeNull();
    expect(pointToHierarchy(10, -1, GEOMETRY)).toBeNull();
  });

  it('answers null when nothing is drawn to map against', () => {
    expect(pointToHierarchy(10, 10, { ...GEOMETRY, fitScale: 0 })).toBeNull();
    expect(pointToHierarchy(10, 10, { ...GEOMETRY, streamWidth: 0 })).toBeNull();
    expect(pointToHierarchy(10, 10, { ...GEOMETRY, scale: 0 })).toBeNull();
  });
});

/* ── the hit itself, against real hardware data ─────────────────────────── */

describe('the hit against the real capture', () => {
  /**
   * Criterion 8 with the capture's own degeneracy: the weather line's parent
   * carries byte-identical bounds, so equal areas are broken by depth — the
   * leaf wins, not its wrapper.
   */
  it('selects the deepest of two nodes with identical bounds', () => {
    const path = hitTest(capture(), { x: 360, y: 550 });

    expect(path).toEqual([1, 2, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 3, 0]);
  });

  it('selects the launcher icon over the workspace that also contains the point', () => {
    expect(hitTest(capture(), { x: 110, y: 960 })).toEqual([1, 2, 0, 0, 0, 0, 1, 2]);
  });

  it('descends past a stack of identically-bounded ancestors to the leaf', () => {
    // "AUG", inside the six-deep identical "Today widget" chain.
    expect(hitTest(capture(), { x: 360, y: 180 })).toEqual([
      1, 2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 2, 0,
    ]);
  });

  it('selects the Home button inside the full-width navigation bar', () => {
    expect(hitTest(capture(), { x: 360, y: 1555 })).toEqual([0, 0, 0, 0, 0, 2, 0]);
  });

  /** Criterion 12 — the capture's screen ends at y 1600. */
  it('answers null for a point outside every node', () => {
    expect(hitTest(capture(), { x: 360, y: 1700 })).toBeNull();
  });
});

/* ── the rules, hand-built ──────────────────────────────────────────────── */

describe('the selection rules', () => {
  /** Criterion 9 — a zero-sized node is invisible and never a target; its
   * bounded parent answers instead. */
  it('skips nodes with zero width or height', () => {
    const tree = node({
      bounds: box(0, 0, 100, 100),
      children: [node({ bounds: box(10, 10, 10, 90) }), node({ bounds: box(10, 10, 90, 10) })],
    });

    expect(hitTest(tree, { x: 10, y: 10 })).toEqual([]);
  });

  /** Criterion 9 — boundless nodes are skipped as targets but not as parents:
   * the real root reports no bounds and everything hangs under it. */
  it('descends through a boundless node to its bounded children', () => {
    const tree = node({
      children: [node({ bounds: box(0, 0, 100, 100) })],
    });

    expect(hitTest(tree, { x: 50, y: 50 })).toEqual([0]);
  });

  /** Bounds are half-open the way Android reports them: `[0,0][100,100]`
   * contains 99 and not 100. */
  it('treats the far edges as outside', () => {
    const tree = node({ bounds: box(0, 0, 100, 100) });

    expect(hitTest(tree, { x: 99, y: 99 })).toEqual([]);
    expect(hitTest(tree, { x: 100, y: 50 })).toBeNull();
    expect(hitTest(tree, { x: 50, y: 100 })).toBeNull();
  });

  /** Criterion 10, in order: clickable, then resource-id, then text. */
  it('prefers the clickable node when areas and depths tie', () => {
    const tree = node({
      bounds: box(0, 0, 100, 100),
      children: [
        node({ bounds: box(0, 0, 50, 50), resourceId: 'app:id/quiet' }),
        node({ bounds: box(0, 0, 50, 50), clickable: true }),
      ],
    });

    expect(hitTest(tree, { x: 25, y: 25 })).toEqual([1]);
  });

  it('prefers a resource-id over text when nothing is clickable', () => {
    const tree = node({
      bounds: box(0, 0, 100, 100),
      children: [
        node({ bounds: box(0, 0, 50, 50), text: 'Entrar' }),
        node({ bounds: box(0, 0, 50, 50), resourceId: 'app:id/login' }),
      ],
    });

    expect(hitTest(tree, { x: 25, y: 25 })).toEqual([1]);
  });

  it('prefers text over nothing at all', () => {
    const tree = node({
      bounds: box(0, 0, 100, 100),
      children: [
        node({ bounds: box(0, 0, 50, 50) }),
        node({ bounds: box(0, 0, 50, 50), text: 'Entrar' }),
      ],
    });

    expect(hitTest(tree, { x: 25, y: 25 })).toEqual([1]);
  });

  it('keeps the first in tree order when nothing breaks the tie', () => {
    const tree = node({
      bounds: box(0, 0, 100, 100),
      children: [node({ bounds: box(0, 0, 50, 50) }), node({ bounds: box(0, 0, 50, 50) })],
    });

    expect(hitTest(tree, { x: 25, y: 25 })).toEqual([0]);
  });

  /** The smallest thing under the cursor wins — a small badge over a large
   * container is the badge, whatever their depths. */
  it('prefers the smaller area over the deeper node', () => {
    const tree = node({
      bounds: box(0, 0, 100, 100),
      children: [
        node({
          bounds: box(0, 0, 100, 100),
          children: [node({ bounds: box(0, 0, 90, 90) })],
        }),
        node({ bounds: box(0, 0, 20, 20) }),
      ],
    });

    expect(hitTest(tree, { x: 10, y: 10 })).toEqual([1]);
  });
});

/* ── the semantic tier ──────────────────────────────────────────────────── */

describe('the semantic tier (criteria 8 and 10 amended 2026-08-06)', () => {
  /**
   * The RN trees this product inspects are full of decoration that reports
   * bounds and nothing else — `StyleSheet.absoluteFill` overlays, gradients,
   * hairline separators. Smallest-area-then-deepest hands them the hit: the
   * overlay shares the card's bounds and sits deeper, so every hover lands on
   * a node the synthesiser can say nothing about. The amendment: a node
   * carrying nothing a selector could name — no `clickable`, no id, no text,
   * no description, no hint — loses to any semantic node that also contains
   * the point, whatever their areas and depths.
   */
  it('prefers the clickable card over its bare overlay with identical bounds', () => {
    const tree = node({
      bounds: box(0, 0, 200, 100),
      clickable: true,
      children: [node({ bounds: box(0, 0, 200, 100) })],
    });

    expect(hitTest(tree, { x: 100, y: 50 })).toEqual([]);
  });

  it('prefers the row text over a bare hairline lying across it', () => {
    const tree = node({
      bounds: box(0, 0, 200, 200),
      children: [
        node({ bounds: box(0, 40, 200, 80), text: 'Pix' }),
        node({ bounds: box(0, 58, 200, 60) }),
      ],
    });

    expect(hitTest(tree, { x: 100, y: 59 })).toEqual([0]);
  });

  /** A hint is §5.3's `textMatches` third leg — an empty input is still a
   * thing the person means to tap. */
  it('counts a hint as semantic', () => {
    const tree = node({
      bounds: box(0, 0, 200, 200),
      children: [
        node({ bounds: box(0, 0, 200, 40), hintText: 'CPF' }),
        node({ bounds: box(0, 10, 200, 12) }),
      ],
    });

    expect(hitTest(tree, { x: 100, y: 11 })).toEqual([0]);
  });

  /** The tier orders, it never excludes: where only decoration contains the
   * point, the hit still answers — a product image with no attributes must
   * stay hoverable, and its menu reachable (criterion 25 unchanged). */
  it('still answers the smallest bare node where nothing semantic contains the point', () => {
    const tree = node({
      bounds: box(0, 0, 200, 200),
      children: [
        node({ bounds: box(0, 0, 100, 100), children: [node({ bounds: box(0, 0, 40, 40) })] }),
      ],
    });

    expect(hitTest(tree, { x: 10, y: 10 })).toEqual([0, 0]);
  });

  /** Within the tier the old rules stand: the text inside a clickable button
   * keeps the hit — its `text:` selector is the stable one, and the tap it
   * writes lands inside the button all the same. */
  it('keeps the smallest semantic node when semantic nodes nest', () => {
    const tree = node({
      bounds: box(0, 0, 100, 40),
      clickable: true,
      children: [node({ bounds: box(20, 10, 80, 30), text: 'Entrar' })],
    });

    expect(hitTest(tree, { x: 50, y: 20 })).toEqual([0]);
  });
});

/* ── Alt retargeting ────────────────────────────────────────────────────── */

describe('retargeting to the parent', () => {
  /** Criterion 11 — one level up, while Alt is held. */
  it('climbs one level to a bounded parent', () => {
    const tree = node({
      bounds: box(0, 0, 100, 100),
      children: [node({ bounds: box(10, 10, 90, 90) })],
    });

    expect(retargetToParent(tree, [0])).toEqual([]);
  });

  /** The real root carries no bounds: a highlight of nothing is not "the
   * container", so the hit stays where it is. */
  it('stays on the node when the parent has no usable bounds', () => {
    const tree = node({
      children: [node({ bounds: box(0, 0, 100, 100) })],
    });

    expect(retargetToParent(tree, [0])).toEqual([0]);
  });

  it('stays on the root itself', () => {
    const tree = node({ bounds: box(0, 0, 100, 100) });

    expect(retargetToParent(tree, [])).toEqual([]);
  });
});

/* ── back out to the stream ─────────────────────────────────────────────── */

describe('mapping a node back into stream coordinates', () => {
  /** Criterion 13's positioning: hierarchy units → screenshot px → stream px.
   * The overlay lives in the canvas's own pre-transform space, which is the
   * stream's. */
  it('maps bounds into a stream-space rectangle', () => {
    const rect = nodeStreamRect(box(244, 516, 478, 585), GEOMETRY);

    expect(rect?.x).toBeCloseTo((244 * 464) / 720, 1);
    expect(rect?.y).toBeCloseTo((516 * 1024) / 1600, 1);
    expect(rect?.width).toBeCloseTo(((478 - 244) * 464) / 720, 1);
    expect(rect?.height).toBeCloseTo(((585 - 516) * 1024) / 1600, 1);
  });

  /** Criterion 40 — the gesture lands at the element's centre, as integers the
   * wire accepts, inside the stream even for an edge-hugging element. */
  it('maps the centre to integers inside the stream', () => {
    const centre = nodeStreamCenter(box(0, 0, 720, 1600), GEOMETRY);

    expect(centre).toEqual({ x: 232, y: 512 });
  });

  it('clamps a centre that rounds onto the stream edge', () => {
    const centre = nodeStreamCenter(box(700, 1580, 720, 1600), GEOMETRY);

    expect(centre?.x).toBeLessThan(464);
    expect(centre?.y).toBeLessThan(1024);
  });

  it('answers null for bounds that cannot be drawn', () => {
    expect(nodeStreamRect(box(10, 10, 10, 90), GEOMETRY)).toBeNull();
    expect(nodeStreamCenter(box(10, 10, 10, 90), GEOMETRY)).toBeNull();
    expect(nodeStreamRect(box(0, 0, 100, 100), { ...GEOMETRY, screenshotWidth: 0 })).toBeNull();
  });
});

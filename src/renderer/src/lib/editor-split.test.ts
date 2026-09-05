import { describe, expect, it } from 'vitest';
import { clampSplit, DEFAULT_SPLIT, MIN_PANE, STEP_SPLIT, splitFromPointer } from './editor-split';

/**
 * The editor column's two flexible rows — the YAML above, the Run/Assistant
 * panel below — share one band, and the split is that band's share. All of the
 * arithmetic lives here so the drag is testable without a pointer: the view
 * measures, this decides.
 */

describe('clampSplit', () => {
  it('leaves a split that already clears both minimums alone', () => {
    expect(clampSplit(0.4, 1000)).toBe(0.4);
  });

  /** Neither pane may be dragged away: 120px of each survives every gesture. */
  it('keeps the minimum pane above and below', () => {
    expect(clampSplit(0, 1000)).toBeCloseTo(MIN_PANE / 1000);
    expect(clampSplit(1, 1000)).toBeCloseTo(1 - MIN_PANE / 1000);
  });

  /** A band too short for two minimums has no honest split, so it halves. */
  it('halves a band that cannot hold both minimums', () => {
    expect(clampSplit(0.9, MIN_PANE)).toBe(0.5);
  });

  /** A measurement before layout, or a corrupt stored value, must not become
   * a `NaN` grid track. */
  it('falls back to the default for a band or split that is not a number', () => {
    expect(clampSplit(Number.NaN, 1000)).toBe(DEFAULT_SPLIT);
    expect(clampSplit(0.4, 0)).toBe(DEFAULT_SPLIT);
  });
});

describe('splitFromPointer', () => {
  /**
   * The boundary lands where the cursor is: the top row's height is the split
   * of the band, so `bandTop + split * band` is exactly the pointer. That
   * identity is what makes the divider follow the mouse rather than drift.
   */
  it('puts the boundary under the cursor', () => {
    expect(splitFromPointer(500, 100, 800)).toBeCloseTo(0.5);
  });

  it('clamps a pointer dragged past either end', () => {
    expect(splitFromPointer(-400, 100, 800)).toBeCloseTo(MIN_PANE / 800);
    expect(splitFromPointer(9000, 100, 800)).toBeCloseTo(1 - MIN_PANE / 800);
  });
});

describe('the keyboard step', () => {
  /** A separator that can only be dragged is a separator the keyboard cannot
   * reach, so the arrows move it by a fixed share of the band. */
  it('is small enough to aim with and large enough to feel', () => {
    expect(STEP_SPLIT).toBeGreaterThan(0);
    expect(STEP_SPLIT).toBeLessThan(0.1);
  });
});

/**
 * The editor column's vertical split. Its two flexible rows — the YAML body
 * and the lower Run/Assistant panel — share one band, and the split is the
 * share the YAML takes of it; the rows between them (the tab bar) and below
 * them (the composer) keep their own heights and are not part of the band.
 *
 * Pure, because the drag is: the view measures the band and reports where the
 * pointer is, and this decides what the split becomes. Nothing here touches
 * the DOM, so every bound is testable without a gesture.
 */

/** Neither pane may be dragged smaller than this, in px. Below it the YAML is
 * fewer than four lines and the thread is a scrollbar. */
export const MIN_PANE = 120;

/** The band's share the YAML opens with — the 0.95fr / 1.05fr the column was
 * written with, which is what the window looked like before it could move. */
export const DEFAULT_SPLIT = 0.475;

/** One arrow press, as a share of the band. */
export const STEP_SPLIT = 0.02;

/**
 * The split, held inside the band's own limits. A band too short for two
 * minimums has no split that satisfies both, so it halves rather than picking
 * a side; a band or split that is not a number is a measurement taken before
 * layout, or a stored value someone edited, and falls back to the default.
 */
export function clampSplit(split: number, band: number): number {
  if (!Number.isFinite(split) || !Number.isFinite(band) || band <= 0) {
    return DEFAULT_SPLIT;
  }
  if (band <= MIN_PANE * 2) {
    return 0.5;
  }
  const min = MIN_PANE / band;
  return Math.min(1 - min, Math.max(min, split));
}

/**
 * Where the pointer puts the boundary. The top row's height is `split * band`
 * measured from the band's top, so a split of `(pointer - bandTop) / band`
 * lands the divider exactly under the cursor — the reason the drag never
 * drifts away from the hand, however long it runs.
 */
export function splitFromPointer(pointerY: number, bandTop: number, band: number): number {
  return clampSplit((pointerY - bandTop) / band, band);
}

import type { Bounds } from '@shared/types';

/**
 * Criterion 7. The one parser for `[x1,y1][x2,y2]`.
 *
 * The string is identical in both formats Conductor reads — the raw
 * `maestro hierarchy` dump's `bounds` (§5.2) and `inspect_screen`'s compact `b`
 * — so it is parsed in one place. A second implementation is how the two drift,
 * and a hit-test off by one format's rounding is invisible until a selector
 * misses on someone else's phone.
 *
 * Anchored end to end on purpose: `null` says "this is not bounds", which is
 * what lets `HierarchyParser` tell an absent field (the root has none) from a
 * present one it cannot read (a malformed payload, criterion 10). A lenient
 * match would collapse those two into a silent guess.
 */
const BOUNDS = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/;

export function parseBounds(text: string): Bounds | null {
  const match = BOUNDS.exec(text);
  if (match === null) {
    return null;
  }
  // Every group is `-?\d+` or the match failed, so `Number` cannot produce NaN
  // here; the non-null assertions the tuple would otherwise need are what the
  // destructure avoids.
  const [, x1, y1, x2, y2] = match;
  return {
    x1: Number(x1),
    y1: Number(y1),
    x2: Number(x2),
    y2: Number(y2),
  };
}

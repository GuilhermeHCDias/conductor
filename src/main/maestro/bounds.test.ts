import { describe, expect, it } from 'vitest';
import { parseBounds } from './bounds';

/**
 * Criterion 7. `[x1,y1][x2,y2]` is one format with two producers — the raw
 * `maestro hierarchy` dump (.context.md §5.2) and `inspect_screen`'s compact
 * `b` — so it gets one parser, and this is it. A second, divergent one is the
 * bug this file exists to prevent.
 *
 * Every string below is the shape the device actually produces; the captured
 * payload in `HierarchyParser.test.ts` is where they came from.
 */
describe('parseBounds', () => {
  it('reads the four numbers of a real element', () => {
    expect(parseBounds('[194,86][528,280]')).toEqual({ x1: 194, y1: 86, x2: 528, y2: 280 });
  });

  it('reads a full-screen root', () => {
    expect(parseBounds('[0,0][1080,2340]')).toEqual({ x1: 0, y1: 0, x2: 1080, y2: 2340 });
  });

  // UIAutomator reports an element scrolled off the left edge with a negative
  // x1. Dropping the sign would place it back on screen, and the hover hit-test
  // downstream would then match a node the person cannot see.
  it('keeps the sign of an element that starts off-screen', () => {
    expect(parseBounds('[-96,1275][360,1308]')).toEqual({
      x1: -96,
      y1: 1275,
      x2: 360,
      y2: 1308,
    });
  });

  // Zero-area nodes are real and are filtered at hit-test (§5.2), not here:
  // this parser reports what the device said and nothing more.
  it('reads a zero-area node rather than rejecting it', () => {
    expect(parseBounds('[540,0][540,0]')).toEqual({ x1: 540, y1: 0, x2: 540, y2: 0 });
  });

  /**
   * Anything that is not the format is `null` — "this string is not bounds" —
   * and never a partially-read guess. The caller decides what that means; for
   * `HierarchyParser` a *present* but unreadable `b` is a parse failure
   * (criterion 10), which it can only tell apart because of this.
   */
  it.each([
    ['empty', ''],
    ['not bounds at all', 'android.widget.FrameLayout'],
    ['only one pair', '[194,86]'],
    ['a missing number', '[194,86][528]'],
    ['non-numeric coordinates', '[a,b][c,d]'],
    ['fractional coordinates', '[194.5,86][528,280]'],
    ['trailing junk after the pairs', '[194,86][528,280]x'],
    ['leading junk before the pairs', 'x[194,86][528,280]'],
    ['pairs the wrong way round', '(194,86)(528,280)'],
  ])('returns null for %s', (_case, text) => {
    expect(parseBounds(text)).toBeNull();
  });
});

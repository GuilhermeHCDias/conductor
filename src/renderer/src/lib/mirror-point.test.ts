import { describe, expect, it } from 'vitest';
import { fitMirror } from './mirror-fit';
import { mirrorPoint } from './mirror-point';

/**
 * Criteria 7–9. Where on the device a click landed, and nothing else — this
 * answers "which pixel", never "which element". The hit-test §5.4–5.5 describes,
 * against a frozen view hierarchy, is a different feature that will likely share
 * this scale math; do not conflate them.
 *
 * Pure, so the whole of it is drivable with no DOM: the view reads the canvas's
 * box and hands the numbers in.
 */

/** The stream the hardware actually produced on 2026-08-04. */
const STREAM = { streamWidth: 464, streamHeight: 1024 };

describe('translating a click', () => {
  /** Criterion 7 — the inverse of the one transform `mirror-fit` applies. */
  it('divides by the scale the mirror is drawn at', () => {
    const point = mirrorPoint({ offsetX: 116, offsetY: 256, scale: 0.5, ...STREAM });

    expect(point).toEqual({ x: 232, y: 512 });
  });

  it('is the identity when the mirror is drawn at its own size', () => {
    const point = mirrorPoint({ offsetX: 100, offsetY: 628, scale: 1, ...STREAM });

    expect(point).toEqual({ x: 100, y: 628 });
  });

  it('maps the top-left corner to the origin', () => {
    expect(mirrorPoint({ offsetX: 0, offsetY: 0, scale: 0.42, ...STREAM })).toEqual({ x: 0, y: 0 });
  });

  /**
   * The two axes are scaled by the same number, because the mirror is scaled and
   * never stretched — a stream 464 wide inside a bay 250 wide is smaller, not
   * narrower.
   */
  it('uses one scale for both axes', () => {
    const point = mirrorPoint({ offsetX: 50, offsetY: 50, scale: 0.25, ...STREAM });

    expect(point).toEqual({ x: 200, y: 200 });
  });

  /** It reads whatever size the stream is *now*: a rotation swaps them
   * mid-session, and only the frames carry the news. */
  it('follows the stream through a rotation', () => {
    const landscape = mirrorPoint({
      offsetX: 512,
      offsetY: 232,
      scale: 1,
      streamWidth: 1024,
      streamHeight: 464,
    });

    expect(landscape).toEqual({ x: 512, y: 232 });
  });
});

/** Criterion 8 — the bay is bigger than the phone, and the gutter is not the
 * device. A click there is a click on the app, not on the phone. */
describe('a click outside the drawn area', () => {
  it.each([
    ['above', { offsetX: 100, offsetY: -1 }],
    ['left of', { offsetX: -1, offsetY: 100 }],
    ['below', { offsetX: 100, offsetY: 512 }],
    ['right of', { offsetX: 232, offsetY: 100 }],
  ])('sends nothing for a click %s the picture', (_where, at) => {
    // 464 x 1024 at half scale is drawn 232 x 512.
    expect(mirrorPoint({ ...at, scale: 0.5, ...STREAM })).toBeNull();
  });

  it('accepts the last drawn pixel on each axis', () => {
    expect(mirrorPoint({ offsetX: 231.9, offsetY: 511.9, scale: 0.5, ...STREAM })).toEqual({
      x: 463,
      y: 1023,
    });
  });

  /** A mirror drawn at no size is not a target; dividing by it would give
   * Infinity and a coordinate the device would reject. */
  it('sends nothing when there is nothing drawn', () => {
    expect(mirrorPoint({ offsetX: 0, offsetY: 0, scale: 0, ...STREAM })).toBeNull();
    expect(
      mirrorPoint({ offsetX: 0, offsetY: 0, scale: 0.5, streamWidth: 0, streamHeight: 0 }),
    ).toBeNull();
  });
});

/**
 * Criterion 9. The clamp is the belt to the bounds check's braces: the division
 * is floating point, and a click a hair inside the edge must not divide out to a
 * coordinate one past it. `PositionMapper` would not reject that — the device
 * would take it and touch the wrong thing, or nothing.
 */
describe('the clamp', () => {
  it('never produces a coordinate at or past the stream bounds', () => {
    const scales = [0.35, 0.5, 0.57, 0.64, 0.9, 1];

    for (const scale of scales) {
      for (const edge of [1, 0.999999, 0.9999999999]) {
        const point = mirrorPoint({
          offsetX: STREAM.streamWidth * scale * edge - Number.EPSILON,
          offsetY: STREAM.streamHeight * scale * edge - Number.EPSILON,
          scale,
          ...STREAM,
        });

        if (point !== null) {
          expect(point.x).toBeLessThan(STREAM.streamWidth);
          expect(point.y).toBeLessThan(STREAM.streamHeight);
          expect(point.x).toBeGreaterThanOrEqual(0);
          expect(point.y).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('gives whole pixels, because the wire carries whole pixels', () => {
    const point = mirrorPoint({ offsetX: 77.7, offsetY: 33.3, scale: 0.37, ...STREAM });

    expect(Number.isInteger(point?.x)).toBe(true);
    expect(Number.isInteger(point?.y)).toBe(true);
  });
});

/** The two modules are one transform and its inverse, so they are worth checking
 * against each other rather than only against hand-written numbers. */
describe('against the fit it inverts', () => {
  it('round-trips a click at the centre of the drawn mirror', () => {
    const fit = fitMirror({
      bayWidth: 300,
      bayHeight: 700,
      maxWidth: 280,
      deviceWidth: STREAM.streamWidth,
      deviceHeight: STREAM.streamHeight,
    });

    const point = mirrorPoint({
      offsetX: (STREAM.streamWidth * fit.scale) / 2,
      offsetY: (STREAM.streamHeight * fit.scale) / 2,
      scale: fit.scale,
      ...STREAM,
    });

    expect(point).toEqual({ x: 232, y: 512 });
  });
});

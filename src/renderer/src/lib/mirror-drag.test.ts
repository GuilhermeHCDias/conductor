import { describe, expect, it } from 'vitest';
import { dragEnd, dragMove, dragStart } from './mirror-drag';

/**
 * The live drag's three policies, one per phase. Pure, like `mirror-point.ts`
 * beneath them: the view reads the canvas's own box and the fit scale and
 * passes numbers in, so every edge below is drivable without rendering
 * anything.
 *
 * The phone in these cases is drawn at half size — 464x1024 of stream inside
 * 232x512 of screen — because a scale of 1 would let a wrong division pass
 * unnoticed.
 */

const GEOMETRY: { scale: number; streamWidth: number; streamHeight: number } = {
  scale: 0.5,
  streamWidth: 464,
  streamHeight: 1024,
};

const at = (offsetX: number, offsetY: number, geometry = GEOMETRY) => ({
  offsetX,
  offsetY,
  ...geometry,
});

const SIZE = { screenWidth: 464, screenHeight: 1024 } as const;

describe('the press', () => {
  it('lands the finger at the device pixel under it', () => {
    expect(dragStart(at(100, 400))).toEqual({
      type: 'touch',
      action: 'down',
      x: 200,
      y: 800,
      ...SIZE,
    });
  });

  /**
   * The bay is wider than the phone and the bezel sits outside the screen, so
   * a press in the gutter is a press on the app — no gesture starts there,
   * however far the pointer then travels onto the picture.
   */
  it('starts nothing off the picture', () => {
    expect(dragStart(at(300, 400))).toBeNull();
    expect(dragStart(at(100, -1))).toBeNull();
  });

  it('starts nothing while nothing is drawn', () => {
    expect(dragStart(at(100, 400, { ...GEOMETRY, scale: 0 }))).toBeNull();
    expect(dragStart(at(100, 400, { ...GEOMETRY, streamWidth: 0 }))).toBeNull();
  });
});

describe('the travel', () => {
  const LAST = { x: 200, y: 800 } as const;

  it('follows the finger to the device pixel under it', () => {
    expect(dragMove(at(100, 300), LAST)).toEqual({
      type: 'touch',
      action: 'move',
      x: 200,
      y: 600,
      ...SIZE,
    });
  });

  /**
   * A finger cannot leave the glass mid-drag: on a real phone, dragging past
   * the edge keeps the touch pinned at the edge until you lift. Refusing the
   * move would throw away the scroll the person is actually performing.
   */
  it('pins the finger to the glass when the pointer leaves it', () => {
    expect(dragMove(at(100, 900), LAST)).toMatchObject({ x: 200, y: 1023 });
    expect(dragMove(at(-40, -200), LAST)).toMatchObject({ x: 0, y: 0 });
    expect(dragMove(at(400, 300), LAST)).toMatchObject({ x: 463, y: 600 });
  });

  /**
   * The wire needs no duplicate: at any mirror scale a CSS pixel of motion is
   * a fraction of a device pixel, and a move that names the point the finger
   * is already at says nothing. The dedupe is here rather than in the view so
   * the policy is pinned by a test with no DOM.
   */
  it('repeats nothing while the finger stays on one device pixel', () => {
    expect(dragMove(at(100, 400), LAST)).toBeNull();
    // A half CSS pixel of drift is still the same device pixel at this scale.
    expect(dragMove(at(100.4, 400.4), LAST)).toBeNull();
    // A full CSS pixel is two device pixels here, and that is a move.
    expect(dragMove(at(101, 400), LAST)).toMatchObject({ x: 202, y: 800 });
  });

  it('moves nowhere while nothing is drawn', () => {
    expect(dragMove(at(100, 300, { ...GEOMETRY, scale: 0 }), LAST)).toBeNull();
  });
});

describe('the release', () => {
  const LAST = { x: 200, y: 600 } as const;

  it('lifts the finger at the device pixel under the release', () => {
    expect(dragEnd(at(100, 300), LAST)).toEqual({
      type: 'touch',
      action: 'up',
      x: 200,
      y: 600,
      ...SIZE,
    });
  });

  it('pins a release past the edge to the glass, like the travel', () => {
    expect(dragEnd(at(100, -50), LAST)).toMatchObject({ x: 200, y: 0 });
    expect(dragEnd(at(500, 900), LAST)).toMatchObject({ x: 463, y: 1023 });
  });

  /**
   * ⚠️ The one phase that must always answer. A DOWN is already on the device,
   * and a refusal here would leave the app under test holding a press nobody
   * is making. If the picture vanished mid-drag — the bay collapsed to
   * nothing — the finger lifts from wherever it last stood.
   */
  it('still lifts, from where the finger last was, when nothing is drawn', () => {
    expect(dragEnd(at(100, 300, { ...GEOMETRY, scale: 0 }), LAST)).toEqual({
      type: 'touch',
      action: 'up',
      x: 200,
      y: 600,
      ...SIZE,
    });
  });

  /**
   * ⚠️ Same trap as every touch: scrcpy's `PositionMapper` silently drops any
   * message whose declared size is not the video's current one, so each phase
   * declares the size it was aimed at.
   */
  it('declares the stream size it was aimed at', () => {
    expect(dragEnd(at(100, 300), LAST)).toMatchObject(SIZE);
  });
});

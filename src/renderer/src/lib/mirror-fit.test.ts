import { describe, expect, it } from 'vitest';
import { DEVICE, fitMirror } from './mirror-fit';

const OUTER_W = DEVICE.width + 2 * DEVICE.bezel; // 346
const OUTER_H = DEVICE.height + 2 * DEVICE.bezel; // 664

/**
 * Criteria 39–41. A mirror shows the device's own pixels, scaled — never a
 * reflowed layout — so the phone keeps a fixed logical size and only its scale
 * changes to fit the bay.
 */
describe('fitMirror', () => {
  it('keeps the logical size fixed at 330 x 648 whatever the bay', () => {
    const wide = fitMirror({ bayWidth: 900, bayHeight: 900, maxWidth: 300 });
    const tight = fitMirror({ bayWidth: 120, bayHeight: 200, maxWidth: 250 });

    expect(wide.width).toBe(330);
    expect(wide.height).toBe(648);
    expect(tight.width).toBe(330);
    expect(tight.height).toBe(648);
  });

  it('caps the scale at maxWidth / 330 when the bay is larger than the cap', () => {
    const fit = fitMirror({ bayWidth: 4000, bayHeight: 4000, maxWidth: 300 });

    // 300 / 330 = 0.909…, floored to 1/100.
    expect(fit.scale).toBe(0.9);
  });

  it('fits by width when the bay is wider-limited', () => {
    // 200 / 346 = 0.578…
    const fit = fitMirror({ bayWidth: 200, bayHeight: 4000, maxWidth: 300 });

    expect(fit.scale).toBe(0.57);
  });

  it('fits by height when the bay is shorter-limited', () => {
    // 400 / 664 = 0.602…
    const fit = fitMirror({ bayWidth: 4000, bayHeight: 400, maxWidth: 300 });

    expect(fit.scale).toBe(0.6);
  });

  it('clamps the scale at 0.35 rather than shrinking the phone away', () => {
    const fit = fitMirror({ bayWidth: 10, bayHeight: 10, maxWidth: 300 });

    expect(fit.scale).toBe(0.35);
  });

  // Flooring to 1/100 is what keeps the reserved footprint inside the bay; a
  // rounded scale can round a pixel past it and the column overflows.
  it('floors the scale to a hundredth', () => {
    const fit = fitMirror({ bayWidth: 4000, bayHeight: 4000, maxWidth: 329 });

    expect(fit.scale).toBe(0.99);
  });

  it('reserves the floored scaled footprint of the bezelled phone', () => {
    const fit = fitMirror({ bayWidth: 4000, bayHeight: 400, maxWidth: 300 });

    expect(fit.scale).toBe(0.6);
    expect(fit.outerWidth).toBe(Math.floor(OUTER_W * 0.6));
    expect(fit.outerHeight).toBe(Math.floor(OUTER_H * 0.6));
  });

  it('never reserves more than the bay it was measured against', () => {
    const fit = fitMirror({ bayWidth: 260, bayHeight: 520, maxWidth: 300 });

    expect(fit.outerWidth).toBeLessThanOrEqual(260);
    expect(fit.outerHeight).toBeLessThanOrEqual(520);
  });

  // A bay measured before first layout is 0 x 0; the clamp has to hold there too.
  it('falls back to the clamp for an unmeasured bay', () => {
    expect(fitMirror({ bayWidth: 0, bayHeight: 0, maxWidth: 300 }).scale).toBe(0.35);
  });
});

/**
 * Criterion 33. Once a stream is up, the phone's logical size *is* the stream's
 * size — the canvas is sized to the device's own framebuffer and fitted by
 * `transform: scale()` alone, never by changing its width or height.
 *
 * The 464 x 1024 below is what the Galaxy A07 actually opened at `max_size=1024`.
 */
describe('fitMirror against a real stream', () => {
  const STREAM = { deviceWidth: 464, deviceHeight: 1024 };

  it('takes the stream’s own dimensions as the logical size', () => {
    const fit = fitMirror({ bayWidth: 300, bayHeight: 600, maxWidth: 300, ...STREAM });

    expect(fit.width).toBe(464);
    expect(fit.height).toBe(1024);
  });

  /** Nothing is streaming until the codec header lands, and the bezel still has
   * to have a size before then. */
  it('falls back to the placeholder phone when no stream has arrived', () => {
    const fit = fitMirror({ bayWidth: 300, bayHeight: 600, maxWidth: 300 });

    expect(fit.width).toBe(DEVICE.width);
    expect(fit.height).toBe(DEVICE.height);
  });

  it('caps the scale against the stream’s width, not the placeholder’s', () => {
    const fit = fitMirror({ bayWidth: 4000, bayHeight: 4000, maxWidth: 232, ...STREAM });

    // 232 / 464 = 0.5 exactly.
    expect(fit.scale).toBe(0.5);
  });

  it('fits a tall stream by height', () => {
    const fit = fitMirror({ bayWidth: 4000, bayHeight: 520, maxWidth: 300, ...STREAM });

    // 520 / (1024 + 16) = 0.5
    expect(fit.scale).toBe(0.5);
  });

  it('reserves the footprint the scaled stream occupies', () => {
    const fit = fitMirror({ bayWidth: 4000, bayHeight: 520, maxWidth: 300, ...STREAM });

    expect(fit.outerWidth).toBe(Math.floor((464 + 2 * DEVICE.bezel) * 0.5));
    expect(fit.outerHeight).toBe(Math.floor((1024 + 2 * DEVICE.bezel) * 0.5));
  });

  it('never reserves more than the bay, whatever the stream’s shape', () => {
    const fit = fitMirror({ bayWidth: 260, bayHeight: 520, maxWidth: 300, ...STREAM });

    expect(fit.outerWidth).toBeLessThanOrEqual(260);
    expect(fit.outerHeight).toBeLessThanOrEqual(520);
  });

  /** A portrait phone rotated, or a tablet: nothing here assumes portrait. */
  it('handles a landscape stream', () => {
    const fit = fitMirror({
      bayWidth: 4000,
      bayHeight: 4000,
      maxWidth: 300,
      deviceWidth: 1024,
      deviceHeight: 464,
    });

    expect(fit.width).toBe(1024);
    expect(fit.height).toBe(464);
    expect(fit.scale).toBe(0.29);
  });
});

/**
 * The clamp is a rendered width, not a ratio. A ratio calibrated against the
 * 330px placeholder would clip every stream wider than it — a phone held
 * landscape opens at 1024px, and 0.35 of that is 358px in a 250px column.
 */
describe('the readability clamp', () => {
  it('is the same rendered width whatever the stream’s own size', () => {
    const placeholder = fitMirror({ bayWidth: 1, bayHeight: 1, maxWidth: 300 });
    const landscape = fitMirror({
      bayWidth: 1,
      bayHeight: 1,
      maxWidth: 300,
      deviceWidth: 1024,
      deviceHeight: 464,
    });

    expect(placeholder.scale * placeholder.width).toBeCloseTo(landscape.scale * landscape.width, 5);
  });

  it('still clamps a stream squeezed into nothing', () => {
    const fit = fitMirror({
      bayWidth: 1,
      bayHeight: 1,
      maxWidth: 300,
      deviceWidth: 464,
      deviceHeight: 1024,
    });

    expect(fit.scale * fit.width).toBeCloseTo(DEVICE.width * 0.35, 5);
  });
});

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

import { describe, expect, it } from 'vitest';
import { formatClock } from './clock';

/**
 * `m:ss` — the one way the run report writes a span of seconds: a step's
 * duration, and where in the video the failed step begins (recording
 * criterion 24). Whole seconds in, never a fraction out.
 */
describe('formatClock', () => {
  it.each([
    [0, '0:00'],
    [4, '0:04'],
    [59, '0:59'],
    [60, '1:00'],
    [72, '1:12'],
    [754, '12:34'],
  ])('writes %i seconds as %s', (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });

  it('floors a fraction rather than rounding it up', () => {
    expect(formatClock(4.9)).toBe('0:04');
  });
});

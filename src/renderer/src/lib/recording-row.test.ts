import { describe, expect, it } from 'vitest';
import { recordingRowIndex } from './recording-row';

/**
 * Recording criterion 23 — which row of the run report carries the video's
 * action. Pure, so the rule is pinned here and the panel only draws it.
 */
describe('recordingRowIndex', () => {
  it('picks the row whose status is fail', () => {
    expect(recordingRowIndex([{ status: 'pass' }, { status: 'fail' }, { status: 'pass' }])).toBe(1);
  });

  /** Maestro stops at the first failure, so the failed row is also the only
   * one — but the rule reads "last", never "first". */
  it('picks the last of several failed rows', () => {
    expect(recordingRowIndex([{ status: 'fail' }, { status: 'fail' }])).toBe(1);
  });

  /** A failed run whose every parsed step passed — the JVM died between
   * steps, or after the last — kept its video: the last row stands in. */
  it('falls back to the last row when no step reads as failed', () => {
    expect(recordingRowIndex([{ status: 'pass' }, { status: 'running' }])).toBe(1);
  });

  it('answers -1 when there are no rows', () => {
    expect(recordingRowIndex([])).toBe(-1);
  });
});

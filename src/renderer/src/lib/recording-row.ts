/**
 * Recording criterion 23 — which row of the run report carries the video's
 * action: the last row whose status is `fail`. Maestro stops at the first
 * failure, so it is also the only one. A failed run whose every parsed step
 * passed — the JVM died between steps, or after the last — still kept its
 * video, and it must stay reachable: the last row stands in. `-1` when there
 * are no rows. Structural on purpose: `lib/` knows the report's rows by their
 * status alone, never through the store.
 */
export function recordingRowIndex(steps: ReadonlyArray<{ readonly status: string }>): number {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index]?.status === 'fail') {
      return index;
    }
  }
  return steps.length - 1;
}

/**
 * `m:ss` — the one way the run report writes a span of seconds: a step's
 * duration and, since the recording spec, where in the video the failed step
 * begins (recording criterion 24). Floored: the report never claims a
 * precision it does not have.
 */
export function formatClock(seconds: number): string {
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
}

/**
 * Where on the device a click landed. The inverse of the one transform
 * `mirror-fit.ts` applies — the mirror is drawn at a scale and never reflowed,
 * so undoing it is a division and a bounds check (criterion 7).
 *
 * ⚠️ This is **not** the hit-test .context.md §5.4–5.5 describes. That one
 * answers "which element is under the pointer", locally against a frozen view
 * hierarchy, and is a different feature that will likely share this scale math.
 * This one has no opinion about elements at all: it answers "which device pixel",
 * which is the only thing scrcpy's control wire can be told.
 *
 * Pure, and with no access to the DOM: the view reads the canvas's own box and
 * passes the numbers in, so every edge below is drivable without rendering
 * anything.
 */

export type MirrorClick = {
  /** Where the pointer landed, relative to the canvas's own box, in CSS pixels. */
  readonly offsetX: number;
  readonly offsetY: number;
  /** The scale the mirror is currently drawn at — `fitMirror`'s own. */
  readonly scale: number;
  /**
   * The stream's size right now. Not the device's panel size and not the
   * canvas's box: a rotation swaps these mid-session and only the frames carry
   * the news, and scrcpy's `PositionMapper` drops any touch that names a size
   * other than the video's current one.
   */
  readonly streamWidth: number;
  readonly streamHeight: number;
};

export type MirrorPoint = {
  readonly x: number;
  readonly y: number;
};

export function mirrorPoint(click: MirrorClick): MirrorPoint | null {
  const { offsetX, offsetY, scale, streamWidth, streamHeight } = click;
  // Nothing is drawn, so nothing was clicked. Dividing by this would give
  // Infinity, and clamping Infinity would silently pick a corner.
  if (scale <= 0 || streamWidth <= 0 || streamHeight <= 0) {
    return null;
  }

  // Criterion 8. The bay is wider than the phone and the bezel sits outside the
  // screen, so a click in the gutter is a click on the app — not a touch at the
  // top-left of the device, which is what clamping alone would make of it.
  const drawnWidth = streamWidth * scale;
  const drawnHeight = streamHeight * scale;
  if (offsetX < 0 || offsetY < 0 || offsetX >= drawnWidth || offsetY >= drawnHeight) {
    return null;
  }

  return mirrorPointClamped(click);
}

/**
 * The same mapping, for a point that may have left the picture — the far end of
 * a drag, and nothing else so far.
 *
 * The two differ by one policy, deliberately. A *click* in the gutter is a
 * click on the app, so `mirrorPoint` refuses it. A *finger* cannot leave the
 * glass mid-drag: on a real phone, dragging past the edge keeps the touch
 * pinned at the edge until you lift, so pinning is the faithful answer and
 * refusing would throw away the scroll the person actually performed.
 */
export function mirrorPointClamped({
  offsetX,
  offsetY,
  scale,
  streamWidth,
  streamHeight,
}: MirrorClick): MirrorPoint | null {
  if (scale <= 0 || streamWidth <= 0 || streamHeight <= 0) {
    return null;
  }

  // Criterion 9. The bounds check above is on CSS pixels and this is the result
  // of a floating-point division, so the clamp is what actually guarantees the
  // range: a click a hair inside the edge must not divide out to `streamWidth`,
  // which the device would accept and misplace rather than reject.
  return {
    x: clamp(Math.floor(offsetX / scale), streamWidth),
    y: clamp(Math.floor(offsetY / scale), streamHeight),
  };
}

/** Into `[0, size)`, the half-open range the wire's coordinates live in. */
function clamp(value: number, size: number): number {
  return Math.min(Math.max(value, 0), size - 1);
}

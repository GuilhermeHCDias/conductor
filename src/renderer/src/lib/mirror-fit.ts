/**
 * A device mirror shows the device's own pixels, scaled — never a reflowed
 * layout. So the phone keeps a FIXED logical size and only its scale changes to
 * fit the bay it is given.
 *
 * Once a stream is up that size is the stream's own — 464 x 1024 on the phone
 * this was verified against — and these numbers are what the bezel holds before
 * the codec header has arrived (criterion 33).
 */
export const DEVICE = {
  width: 330,
  height: 648,
  bezel: 8,
} as const;

/** Below this the phone stops being readable, so the bay clips instead. */
const MIN_SCALE = 0.35;

/**
 * The floor is a *rendered width*, not a ratio. Expressed as a ratio it would
 * mean something different for every stream: a phone held landscape opens at
 * 1024 px wide, and 0.35 of that is 358 px in a 250 px column — clipped, for a
 * picture that would have fitted at 0.24. What "too small to read" means is a
 * size on screen, and it is the same size whatever the framebuffer behind it.
 */
const MIN_RENDERED_WIDTH = DEVICE.width * MIN_SCALE;

export type MirrorFit = {
  /** Multiplier for `transform: scale()`. Never applied to width or height. */
  readonly scale: number;
  /** Logical size handed to the mirror — constant, so the app never re-flows. */
  readonly width: number;
  readonly height: number;
  /** Footprint the scaled mirror occupies, for the wrapper that reserves space. */
  readonly outerWidth: number;
  readonly outerHeight: number;
};

export type MirrorBay = {
  readonly bayWidth: number;
  readonly bayHeight: number;
  /** The active breakpoint's mirror width — the cap the phone never exceeds. */
  readonly maxWidth: number;
  /**
   * The stream's own dimensions, from the codec header. Absent until one has
   * arrived, and then the placeholder phone's size stands in — a bezel with no
   * size would collapse before the first frame (criterion 33).
   */
  readonly deviceWidth?: number;
  readonly deviceHeight?: number;
};

export function fitMirror({
  bayWidth,
  bayHeight,
  maxWidth,
  deviceWidth = DEVICE.width,
  deviceHeight = DEVICE.height,
}: MirrorBay): MirrorFit {
  const outerWidth = deviceWidth + 2 * DEVICE.bezel;
  const outerHeight = deviceHeight + 2 * DEVICE.bezel;
  const byWidth = bayWidth / outerWidth;
  const byHeight = bayHeight / outerHeight;
  const cap = maxWidth / deviceWidth;
  // Floored to 1/100 so the reserved footprint never rounds a pixel past the bay.
  const fitted = Math.floor(Math.min(cap, byWidth, byHeight) * 100) / 100;
  const scale = Math.max(MIN_RENDERED_WIDTH / deviceWidth, fitted);

  return {
    scale,
    width: deviceWidth,
    height: deviceHeight,
    outerWidth: Math.floor(outerWidth * scale),
    outerHeight: Math.floor(outerHeight * scale),
  };
}

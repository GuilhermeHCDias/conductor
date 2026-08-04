/**
 * A device mirror shows the device's own pixels, scaled — never a reflowed
 * layout. So the phone keeps a FIXED logical size and only its scale changes to
 * fit the bay it is given.
 */
export const DEVICE = {
  width: 330,
  height: 648,
  bezel: 8,
} as const;

/** Below this the phone stops being readable, so the bay clips instead. */
const MIN_SCALE = 0.35;

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
};

export function fitMirror({ bayWidth, bayHeight, maxWidth }: MirrorBay): MirrorFit {
  const outerWidth = DEVICE.width + 2 * DEVICE.bezel;
  const outerHeight = DEVICE.height + 2 * DEVICE.bezel;
  const byWidth = bayWidth / outerWidth;
  const byHeight = bayHeight / outerHeight;
  const cap = maxWidth / DEVICE.width;
  // Floored to 1/100 so the reserved footprint never rounds a pixel past the bay.
  const fitted = Math.floor(Math.min(cap, byWidth, byHeight) * 100) / 100;
  const scale = Math.max(MIN_SCALE, fitted);

  return {
    scale,
    width: DEVICE.width,
    height: DEVICE.height,
    outerWidth: Math.floor(outerWidth * scale),
    outerHeight: Math.floor(outerHeight * scale),
  };
}

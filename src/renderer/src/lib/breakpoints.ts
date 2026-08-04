/**
 * Width-driven layout decisions for the Aurora shell. Pure, so the bands can be
 * read in a test instead of inferred from a rendered window.
 */

export type WindowLayout = {
  /** Logical width of the device mirror, in px. The inspector is this + 40. */
  readonly mirror: number;
  /** Whether the Flows sidebar shows at this width, before any user override. */
  readonly flows: boolean;
};

/** Widest band first — `layoutForWidth` takes the first one the window clears. */
const BANDS: ReadonlyArray<{ min: number } & WindowLayout> = [
  { min: 1360, mirror: 300, flows: true },
  { min: 1120, mirror: 268, flows: true },
  { min: 0, mirror: 250, flows: false },
];

/** The narrowest band, used when no band matches (a width below 0 cannot). */
const NARROWEST: WindowLayout = { mirror: 250, flows: false };

export function layoutForWidth(width: number): WindowLayout {
  const band = BANDS.find((candidate) => width >= candidate.min);
  return band === undefined ? NARROWEST : { mirror: band.mirror, flows: band.flows };
}

export type DeviceHeaderLayout = {
  /** Whether the uppercase `DEVICE` label still fits. */
  readonly label: boolean;
  /** Whether the reload and screenshot buttons still fit. */
  readonly tools: boolean;
};

/**
 * The device header degrades in priority order as the inspector narrows: the
 * serial truncates (CSS does that), then the label goes, then reload and
 * screenshot go. Inspect is not represented here because it always survives —
 * it is the mode the whole window is in.
 */
export function deviceHeaderLayout(width: number): DeviceHeaderLayout {
  return { label: width >= 250, tools: width >= 190 };
}

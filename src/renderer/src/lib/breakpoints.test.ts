import { describe, expect, it } from 'vitest';
import { deviceHeaderLayout, layoutForWidth } from './breakpoints';

/** Criterion 44 — the window's own breakpoints. */
describe('layoutForWidth', () => {
  it.each([1360, 1440, 1920])('shows the sidebar and a 300px mirror at %ipx', (width) => {
    expect(layoutForWidth(width)).toEqual({ flows: true, mirror: 300 });
  });

  it.each([1120, 1200, 1359])('shows the sidebar and a 268px mirror at %ipx', (width) => {
    expect(layoutForWidth(width)).toEqual({ flows: true, mirror: 268 });
  });

  it.each([960, 1000, 1119])('hides the sidebar and uses a 250px mirror at %ipx', (width) => {
    expect(layoutForWidth(width)).toEqual({ flows: false, mirror: 250 });
  });

  // The window's own minWidth is 960, but a measurement can arrive before the
  // first layout — a 0 must not fall off the end of the table.
  it('falls back to the narrowest band at width 0', () => {
    expect(layoutForWidth(0)).toEqual({ flows: false, mirror: 250 });
  });
});

/**
 * Criterion 37 — the device header degrades in priority order: the serial
 * truncates (CSS), then the DEVICE label goes, then reload and screenshot go.
 * Inspect always survives; it is the mode the whole window is in.
 */
describe('deviceHeaderLayout', () => {
  it.each([250, 268, 340])('keeps the label and the tools at %ipx', (width) => {
    expect(deviceHeaderLayout(width)).toEqual({ label: true, tools: true });
  });

  it.each([190, 220, 249])('drops the label but keeps the tools at %ipx', (width) => {
    expect(deviceHeaderLayout(width)).toEqual({ label: false, tools: true });
  });

  it.each([0, 120, 189])('drops the label and the tools at %ipx', (width) => {
    expect(deviceHeaderLayout(width)).toEqual({ label: false, tools: false });
  });
});

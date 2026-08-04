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
 * Criteria 37 and 28 — the device header degrades in priority order: the app
 * identity line goes first, then the DEVICE label, then the tools. The device's
 * own name never leaves the header; it truncates instead (CSS). Inspect always
 * survives; it is the mode the whole window is in.
 */
describe('deviceHeaderLayout', () => {
  it.each([300, 340])('keeps everything at %ipx', (width) => {
    expect(deviceHeaderLayout(width)).toEqual({ identity: true, label: true, tools: true });
  });

  it.each([250, 268, 299])('drops the app identity first, at %ipx', (width) => {
    expect(deviceHeaderLayout(width)).toEqual({ identity: false, label: true, tools: true });
  });

  it.each([190, 220, 249])('drops the label next, at %ipx', (width) => {
    expect(deviceHeaderLayout(width)).toEqual({ identity: false, label: false, tools: true });
  });

  it.each([0, 120, 189])('drops the tools last, at %ipx', (width) => {
    expect(deviceHeaderLayout(width)).toEqual({ identity: false, label: false, tools: false });
  });
});

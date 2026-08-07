import { describe, expect, it } from 'vitest';
import { flowCountLabel, platformLabel, primaryBundleId } from './repo-labels';

/** The three little words every repo surface repeats — derived pure, so the
 * bar, the popover and the found card can never disagree. */

describe('primaryBundleId', () => {
  it('prefers the android package and falls back to ios', () => {
    expect(primaryBundleId({ android: 'com.a', ios: 'com.i' })).toBe('com.a');
    expect(primaryBundleId({ android: null, ios: 'com.i' })).toBe('com.i');
    expect(primaryBundleId({ android: null, ios: null })).toBeNull();
  });
});

describe('platformLabel', () => {
  it('names the sides the app.json declares', () => {
    expect(platformLabel({ android: 'com.a', ios: 'com.i' })).toBe('Android · iOS');
    expect(platformLabel({ android: 'com.a', ios: null })).toBe('Android');
    expect(platformLabel({ android: null, ios: 'com.i' })).toBe('iOS');
  });
});

describe('flowCountLabel', () => {
  /** The kit's words exactly: a repo with nothing yet is a normal state. */
  it('counts flows the way the kit does', () => {
    expect(flowCountLabel(0)).toBe('empty for now');
    expect(flowCountLabel(1)).toBe('1 flow');
    expect(flowCountLabel(4)).toBe('4 flows');
  });
});

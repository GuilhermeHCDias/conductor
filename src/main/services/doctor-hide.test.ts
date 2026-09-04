import { describe, expect, it } from 'vitest';
import { hiddenTools, hideTools } from './doctor-hide';

/**
 * Doctor criterion 40 — `CONDUCTOR_DOCTOR_HIDE` makes named tools absent for
 * every consumer while developing, and is ignored when packaged.
 */
describe('hiddenTools', () => {
  it('reads the comma-separated list, trimmed', () => {
    expect(hiddenTools({ CONDUCTOR_DOCTOR_HIDE: 'maestro, gh ,java' }, false)).toEqual(
      new Set(['maestro', 'gh', 'java']),
    );
  });

  it('is empty when unset, empty, or the app is packaged', () => {
    expect(hiddenTools({}, false)).toEqual(new Set());
    expect(hiddenTools({ CONDUCTOR_DOCTOR_HIDE: '' }, false)).toEqual(new Set());
    expect(hiddenTools({ CONDUCTOR_DOCTOR_HIDE: 'maestro' }, true)).toEqual(new Set());
  });

  it('ignores names that are not tools', () => {
    expect(hiddenTools({ CONDUCTOR_DOCTOR_HIDE: 'maestro,git,adb' }, false)).toEqual(
      new Set(['maestro', 'adb']),
    );
  });
});

describe('hideTools', () => {
  const always = (): boolean => true;

  it('answers false for a binary whose name is hidden, wherever it lives', () => {
    const probe = hideTools(always, new Set(['maestro']));

    expect(probe('/opt/homebrew/bin/maestro')).toBe(false);
    expect(probe('/Users/x/Library/Application Support/Conductor/maestro/bin/maestro')).toBe(false);
  });

  it('defers to the real probe for everything else', () => {
    const probe = hideTools(always, new Set(['maestro']));

    expect(probe('/opt/homebrew/bin/adb')).toBe(true);
  });

  it('is the real probe itself when nothing is hidden', () => {
    expect(hideTools(always, new Set())).toBe(always);
  });
});

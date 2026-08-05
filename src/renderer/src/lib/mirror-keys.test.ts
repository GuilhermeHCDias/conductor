import { describe, expect, it } from 'vitest';
import { mirrorKeyInput } from './mirror-keys';

/**
 * Criteria 11–13. Which keystrokes are the device's and which are the app's —
 * pure, so the precedence is pinned here rather than inside a chain of
 * conditions in an event handler.
 */

const stroke = (
  key: string,
  held: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {},
) => ({
  key,
  ctrlKey: held.ctrlKey ?? false,
  metaKey: held.metaKey ?? false,
  altKey: held.altKey ?? false,
});

/** Criterion 11 — a printable character is text, and text is what the device's
 * own keyboard layout is applied to. */
describe('a printable character', () => {
  it.each(['a', 'Z', '4', '@', ' ', 'é', 'ß'])('sends %s as text', (key) => {
    expect(mirrorKeyInput(stroke(key))).toEqual({ type: 'text', text: key });
  });

  /** Shift is how the character got its case, and the character is what travels
   * — sending a modifier state as well would double it up. */
  it('carries the character the layout already produced', () => {
    expect(mirrorKeyInput(stroke('A'))).toEqual({ type: 'text', text: 'A' });
  });
});

/** Criterion 12 — a key with no character of its own is a keycode event. */
describe('a non-printable key', () => {
  it.each([
    ['Backspace', 'backspace'],
    ['Enter', 'enter'],
    ['Tab', 'tab'],
    ['Escape', 'escape'],
    ['Delete', 'delete'],
    ['ArrowUp', 'arrow-up'],
    ['ArrowDown', 'arrow-down'],
    ['ArrowLeft', 'arrow-left'],
    ['ArrowRight', 'arrow-right'],
  ])('sends %s as the %s keycode', (key, named) => {
    expect(mirrorKeyInput(stroke(key))).toEqual({ type: 'key', key: named });
  });

  it('is never sent as text', () => {
    for (const key of ['Backspace', 'Enter', 'Tab', 'Escape', 'Delete', 'ArrowUp']) {
      expect(mirrorKeyInput(stroke(key))).not.toMatchObject({ type: 'text' });
    }
  });
});

/**
 * ⚠️ Criterion 13, and the half that is easy to get wrong. Swallowing every key
 * while the canvas has focus would take Cmd-Q, Cmd-W and Cmd-R away from the
 * person — the app would stop being quittable from its own window. A modifier
 * held means the keystroke is a command to Conductor or to the OS, and nothing
 * here claims it.
 */
describe('a keystroke that is not the device’s', () => {
  it.each([
    ['meta', { metaKey: true }],
    ['control', { ctrlKey: true }],
    ['alt', { altKey: true }],
  ])('claims nothing while %s is held', (_name, held) => {
    expect(mirrorKeyInput(stroke('q', held))).toBeNull();
    expect(mirrorKeyInput(stroke('r', held))).toBeNull();
    expect(mirrorKeyInput(stroke('ArrowLeft', held))).toBeNull();
  });

  /** A modifier pressed on its own is not an input, it is the start of one. */
  it.each(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'])('claims nothing for %s alone', (key) => {
    expect(mirrorKeyInput(stroke(key))).toBeNull();
  });

  /** Keys the device has no notion of, and that the person may have bound in
   * the app: leaving them alone is the only safe answer. */
  it.each(['F1', 'F12', 'Home', 'End', 'PageUp', 'Insert', 'Dead', 'Unidentified'])(
    'claims nothing for %s',
    (key) => {
      expect(mirrorKeyInput(stroke(key))).toBeNull();
    },
  );
});

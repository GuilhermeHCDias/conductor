import { ERROR_CODES, MAX_INPUT_TEXT_LENGTH, type MirrorKey } from '@shared/ipc';
import { describe, expect, it } from 'vitest';
import {
  BACK_MESSAGE_BYTES,
  controlSteps,
  DOUBLE_TAP_PAUSE_MS,
  KEYCODE_MESSAGE_BYTES,
  LONG_PRESS_HOLD_MS,
  POINTER_ID_FINGER,
  SCRCPY_KEYCODES,
  ScrcpyControlError,
  TOUCH_MESSAGE_BYTES,
} from './scrcpy-control-protocol';

/**
 * The outbound wire, and the same discipline `scrcpy-protocol.test.ts` holds the
 * inbound one to: the module is pure, so every byte below is either read out of
 * the pinned `scrcpy-server-3.3.4.jar` (`ControlMessageReader`, `Controller`,
 * `PositionMapper`) or derived from that reading and then confirmed against a
 * Galaxy A07 on 2026-08-04 — never remembered.
 *
 * The layout, per message, big-endian throughout because the server reads it
 * with a `DataInputStream`:
 *
 *   INJECT_KEYCODE    (0) u8 action, i32 keycode, i32 repeat, i32 metaState
 *   INJECT_TEXT       (1) u32 length, then that many bytes of UTF-8
 *   INJECT_TOUCH_EVENT(2) u8 action, i64 pointerId, i32 x, i32 y,
 *                         u16 screenWidth, u16 screenHeight, u16 pressure,
 *                         i32 actionButton, i32 buttons
 *   BACK_OR_SCREEN_ON (4) u8 action
 *
 * A step is a message plus how long to hold before the next one — the protocol
 * itself has no press duration, so a long press *is* its timing, and the
 * timing belongs beside the bytes it paces.
 */

const hex = (bytes: Uint8Array | undefined): string =>
  [...(bytes ?? [])].map((byte) => byte.toString(16).padStart(2, '0')).join('');

const bytesOf = (input: Parameters<typeof controlSteps>[0]): Uint8Array[] =>
  controlSteps(input).map((step) => step.bytes);

const TAP = {
  type: 'tap',
  x: 100,
  y: 628,
  screenWidth: 464,
  screenHeight: 1024,
} as const;

describe('a tap', () => {
  /** Criterion 6 — one point, pressed and released, with no pause between. */
  it('is a touch-down immediately followed by a touch-up', () => {
    const steps = controlSteps(TAP);

    expect(steps).toHaveLength(2);
    expect(steps[0]?.bytes[0]).toBe(2);
    expect(steps[1]?.bytes[0]).toBe(2);
    expect(steps[0]?.bytes[1]).toBe(0);
    expect(steps[1]?.bytes[1]).toBe(1);
    expect(steps.map((step) => step.pauseAfterMs)).toEqual([0, 0]);
  });

  /**
   * The whole 32 bytes, spelled out. Written from the field order read out of
   * `ControlMessageReader.parseInjectTouchEvent`, and this exact tap pressed the
   * "7" key of the dialer on the hardware it was checked against.
   */
  it('lays its 32 bytes out the way the server reads them', () => {
    const [down, up] = bytesOf(TAP);

    expect(down).toHaveLength(TOUCH_MESSAGE_BYTES);
    expect(hex(down)).toBe(
      [
        '02', // TYPE_INJECT_TOUCH_EVENT
        '00', // AMOTION_EVENT_ACTION_DOWN
        'fffffffffffffffe', // pointerId -2: a finger, not the mouse
        '00000064', // x = 100
        '00000274', // y = 628
        '01d0', // screenWidth = 464
        '0400', // screenHeight = 1024
        'ffff', // pressure 1.0, as u16 fixed point
        '00000000', // actionButton — never read for a touchscreen source
        '00000000', // buttons
      ].join(''),
    );
    expect(hex(up)).toBe(
      [
        '02',
        '01',
        'fffffffffffffffe',
        '00000064',
        '00000274',
        '01d0',
        '0400',
        '0000',
        '00000000',
        '00000000',
      ].join(''),
    );
  });

  /**
   * ⚠️ `Controller.injectTouch` reserves -1 for the mouse: it switches the event
   * to `SOURCE_MOUSE` with a mouse tool type, where the app under test sees a
   * hover-capable pointer rather than a finger. Any other id is a touchscreen
   * finger, and -2 is scrcpy's own generic-finger constant.
   */
  it('is a finger, never the mouse', () => {
    const view = new DataView(bytesOf(TAP)[0]?.buffer as ArrayBuffer);

    expect(view.getBigInt64(2)).toBe(POINTER_ID_FINGER);
    expect(view.getBigInt64(2)).not.toBe(-1n);
  });

  /** `Binary.u16FixedPointToFloat` special-cases 0xFFFF to exactly 1.0. */
  it('presses at full pressure and releases at none', () => {
    const [down, up] = bytesOf(TAP);

    expect(new DataView(down?.buffer as ArrayBuffer).getUint16(22)).toBe(0xffff);
    expect(new DataView(up?.buffer as ArrayBuffer).getUint16(22)).toBe(0);
  });

  /**
   * ⚠️ The trap that costs a silent nothing: `PositionMapper.map` returns null,
   * with no log and no error, unless the declared size equals the video's own.
   * Confirmed on hardware — the same tap that pressed a key landed nothing when
   * its declared width was one pixel wide.
   */
  it('declares the stream size it was aimed at', () => {
    const view = new DataView(bytesOf(TAP)[0]?.buffer as ArrayBuffer);

    expect(view.getUint16(18)).toBe(464);
    expect(view.getUint16(20)).toBe(1024);
  });

  it('refuses a point outside the stream it declares', () => {
    expect(() => controlSteps({ ...TAP, x: 464 })).toThrow(ScrcpyControlError);
    expect(() => controlSteps({ ...TAP, y: 1024 })).toThrow(ScrcpyControlError);
    expect(() => controlSteps({ ...TAP, x: -1 })).toThrow(ScrcpyControlError);
  });

  it('accepts the last pixel of each axis', () => {
    expect(() => controlSteps({ ...TAP, x: 463, y: 1023 })).not.toThrow();
  });
});

/* ── the timed gestures ─────────────────────────────────────────────────── */

describe('a long press', () => {
  /**
   * Criterion 40. The protocol has no press duration, so a long press is the
   * tap pair held apart: the down goes out, the hold elapses, the up follows.
   */
  it('is the tap pair, held apart by the hold pause', () => {
    const steps = controlSteps({ ...TAP, type: 'long-press' });

    expect(steps).toHaveLength(2);
    expect(steps[0]?.bytes[1]).toBe(0);
    expect(steps[0]?.pauseAfterMs).toBe(LONG_PRESS_HOLD_MS);
    expect(steps[1]?.bytes[1]).toBe(1);
    expect(steps[1]?.pauseAfterMs).toBe(0);
  });

  it('presses exactly the bytes a tap at the same point would', () => {
    const gesture = bytesOf({ ...TAP, type: 'long-press' });
    const tap = bytesOf(TAP);

    expect(gesture.map(hex)).toEqual(tap.map(hex));
  });

  /** `ViewConfiguration`'s default long-press timeout is 400ms, and the person
   * may have raised it in accessibility settings — so the hold clears the
   * default with room, without feeling stuck. */
  it('holds well past the platform default timeout', () => {
    expect(LONG_PRESS_HOLD_MS).toBeGreaterThanOrEqual(600);
    expect(LONG_PRESS_HOLD_MS).toBeLessThanOrEqual(1500);
  });

  it('checks its point against the stream like any touch', () => {
    expect(() => controlSteps({ ...TAP, type: 'long-press', x: 464 })).toThrow(ScrcpyControlError);
  });
});

describe('a double tap', () => {
  /** Criterion 40 — two full pairs, with the inter-tap gap between them. */
  it('is two tap pairs with the gap between the first up and the second down', () => {
    const steps = controlSteps({ ...TAP, type: 'double-tap' });

    expect(steps).toHaveLength(4);
    expect(steps.map((step) => step.bytes[1])).toEqual([0, 1, 0, 1]);
    expect(steps.map((step) => step.pauseAfterMs)).toEqual([0, DOUBLE_TAP_PAUSE_MS, 0, 0]);
  });

  /**
   * ⚠️ `GestureDetector.isConsideredDoubleTap` refuses a second tap closer than
   * `DOUBLE_TAP_MIN_TIME` (40ms) — jitter, not a tap — and later than
   * `DOUBLE_TAP_TIMEOUT` (300ms). Back-to-back writes would land at ~0ms and be
   * rejected by the very views the gesture is for.
   */
  it('paces the gap inside the detector window', () => {
    expect(DOUBLE_TAP_PAUSE_MS).toBeGreaterThanOrEqual(40);
    expect(DOUBLE_TAP_PAUSE_MS).toBeLessThanOrEqual(300);
  });

  it('checks its point against the stream like any touch', () => {
    expect(() => controlSteps({ ...TAP, type: 'double-tap', y: -1 })).toThrow(ScrcpyControlError);
  });
});

describe('typed text', () => {
  /**
   * Criterion 11. `Controller.injectText` walks the whole string char by char,
   * so a contiguous run travels as one message — confirmed on hardware, where
   * '0123' arrived as a single write and all four digits landed.
   */
  it('travels as one message however many characters it carries', () => {
    const steps = controlSteps({ type: 'text', text: 'hello 42' });

    expect(steps).toHaveLength(1);
    expect(steps[0]?.bytes[0]).toBe(1);
  });

  it('prefixes the byte length as a big-endian u32', () => {
    const [message] = bytesOf({ type: 'text', text: 'hi' });
    const view = new DataView(message?.buffer as ArrayBuffer);

    expect(view.getUint32(1)).toBe(2);
    expect(hex(message)).toBe('01000000026869');
  });

  /** `parseByteArray` reads a byte count, and `new String(bytes, UTF_8)` decodes
   * it — so a character that is three bytes long counts as three. */
  it('counts bytes rather than characters for a multibyte string', () => {
    const [message] = bytesOf({ type: 'text', text: 'é☕' });
    const view = new DataView(message?.buffer as ArrayBuffer);

    expect(view.getUint32(1)).toBe(5);
    expect(message).toHaveLength(1 + 4 + 5);
  });

  /** `INJECT_TEXT_MAX_LENGTH` in the pinned server. */
  it('refuses more text than the server will read', () => {
    expect(() =>
      controlSteps({ type: 'text', text: 'a'.repeat(MAX_INPUT_TEXT_LENGTH) }),
    ).not.toThrow();
    expect(() =>
      controlSteps({ type: 'text', text: 'a'.repeat(MAX_INPUT_TEXT_LENGTH + 1) }),
    ).toThrow(ScrcpyControlError);
  });

  /** The cap is on bytes, which is what the server allocates against. */
  it('counts the cap in bytes, not in characters', () => {
    expect(() => controlSteps({ type: 'text', text: '☕'.repeat(101) })).toThrow(
      ScrcpyControlError,
    );
  });
});

describe('a named key', () => {
  /** Criterion 12 — a keycode event, never text. */
  it('is a keycode pressed and released', () => {
    const steps = controlSteps({ type: 'key', key: 'backspace' });

    expect(steps).toHaveLength(2);
    expect(steps[0]?.bytes).toHaveLength(KEYCODE_MESSAGE_BYTES);
    expect(hex(steps[0]?.bytes)).toBe(
      [
        '00', // TYPE_INJECT_KEYCODE
        '00', // AKEY_EVENT_ACTION_DOWN
        '00000043', // KEYCODE_DEL = 67
        '00000000', // repeat
        '00000000', // metaState
      ].join(''),
    );
    expect(hex(steps[1]?.bytes)).toBe('0001000000430000000000000000');
  });

  /**
   * The values are Android's own, read out of the platform `android.jar` rather
   * than remembered. They are the whole reason the renderer names a key instead
   * of carrying a number.
   */
  it.each([
    ['backspace', 67],
    ['enter', 66],
    ['tab', 61],
    ['escape', 111],
    ['delete', 112],
    ['arrow-up', 19],
    ['arrow-down', 20],
    ['arrow-left', 21],
    ['arrow-right', 22],
  ] as Array<[MirrorKey, number]>)('sends %s as Android keycode %i', (key, keycode) => {
    const view = new DataView(bytesOf({ type: 'key', key })[0]?.buffer as ArrayBuffer);

    expect(view.getInt32(2)).toBe(keycode);
    expect(SCRCPY_KEYCODES[key]).toBe(keycode);
  });

  it('repeats nothing and holds no modifier', () => {
    const view = new DataView(bytesOf({ type: 'key', key: 'enter' })[0]?.buffer as ArrayBuffer);

    expect(view.getInt32(6)).toBe(0);
    expect(view.getInt32(10)).toBe(0);
  });
});

describe('the back action', () => {
  /**
   * Criterion 14. `Controller.pressBackOrTurnScreenOn` turns the message into a
   * `KeyEvent` carrying the action it was given, so a down with no up leaves the
   * key held.
   */
  it('is its own two-byte message, pressed and released', () => {
    const steps = controlSteps({ type: 'back' });

    expect(steps).toHaveLength(2);
    expect(steps[0]?.bytes).toHaveLength(BACK_MESSAGE_BYTES);
    expect(hex(steps[0]?.bytes)).toBe('0400');
    expect(hex(steps[1]?.bytes)).toBe('0401');
  });

  /** It is not INJECT_KEYCODE with KEYCODE_BACK: the server's own type wakes a
   * sleeping screen instead, which is what the person means by "back". */
  it('uses BACK_OR_SCREEN_ON rather than the plain keycode', () => {
    expect(controlSteps({ type: 'back' })[0]?.bytes[0]).toBe(4);
  });
});

describe('every step', () => {
  const everything = [
    controlSteps(TAP),
    controlSteps({ ...TAP, type: 'long-press' }),
    controlSteps({ ...TAP, type: 'double-tap' }),
    controlSteps({ type: 'text', text: 'a' }),
    controlSteps({ type: 'key', key: 'enter' }),
    controlSteps({ type: 'back' }),
  ].flat();

  /** Criterion 5 — bytes built from typed fields, never a composed string. */
  it('carries bytes, never a string', () => {
    for (const step of everything) {
      expect(step.bytes).toBeInstanceOf(Uint8Array);
    }
  });

  it('names a type the pinned server dispatches on', () => {
    for (const step of everything) {
      expect([0, 1, 2, 4]).toContain(step.bytes[0]);
    }
  });

  /** A pause is a hold inside a gesture, never a delay tacked onto the end —
   * a trailing one would make every send linger for nothing. */
  it('never pauses after its last message', () => {
    const gestures = [
      controlSteps(TAP),
      controlSteps({ ...TAP, type: 'long-press' }),
      controlSteps({ ...TAP, type: 'double-tap' }),
      controlSteps({ type: 'back' }),
    ];
    for (const steps of gestures) {
      expect(steps.at(-1)?.pauseAfterMs).toBe(0);
    }
  });
});

describe('a refused message', () => {
  /** Criterion 16 — control failing is its own condition, with its own code. */
  it('carries the control code rather than a video one', () => {
    try {
      controlSteps({ ...TAP, x: 9999 });
      expect.unreachable('the tap was outside the stream');
    } catch (error) {
      expect(error).toBeInstanceOf(ScrcpyControlError);
      expect((error as ScrcpyControlError).code).toBe(ERROR_CODES.mirrorControlFailed);
    }
  });
});

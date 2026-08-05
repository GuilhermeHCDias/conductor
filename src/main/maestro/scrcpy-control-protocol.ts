import {
  ERROR_CODES,
  type ErrorCode,
  MAX_INPUT_TEXT_LENGTH,
  type MirrorInput,
  type MirrorKey,
  type MirrorTap,
} from '@shared/ipc';

/**
 * The scrcpy control socket, as an encoder. Pure, the way `ScrcpyParser` is pure
 * for the wire coming the other way: it is handed typed fields and gives back
 * bytes, and it has no idea a socket, a device or a process exists. That is what
 * lets every trap below be pinned by a test with nothing plugged in.
 *
 * The layout was read out of the pinned `scrcpy-server-3.3.4.jar` — the
 * `packed-switch` in `ControlMessageReader.read` for the type byte, the
 * `readInt`/`readLong`/`readUnsignedShort` order in each `parse…` for the
 * fields — and every message here was then confirmed acting on a Galaxy A07 on
 * 2026-08-04. Everything is big-endian, because the server reads it with a
 * `DataInputStream`.
 *
 *   INJECT_KEYCODE    (0) u8 action, i32 keycode, i32 repeat, i32 metaState
 *   INJECT_TEXT       (1) u32 length, then that many bytes of UTF-8
 *   INJECT_TOUCH_EVENT(2) u8 action, i64 pointerId, i32 x, i32 y,
 *                         u16 screenWidth, u16 screenHeight, u16 pressure,
 *                         i32 actionButton, i32 buttons
 *   BACK_OR_SCREEN_ON (4) u8 action
 */

/** The type byte, from the 18-entry switch the server dispatches on. Only the
 * four this spec sends are named; the rest are out of scope by decision. */
const TYPE = {
  injectKeycode: 0,
  injectText: 1,
  injectTouch: 2,
  backOrScreenOn: 4,
} as const;

/** `AKEY_EVENT_ACTION_*` and `AMOTION_EVENT_ACTION_*` share these two values. */
const ACTION = { down: 0, up: 1 } as const;

export const TOUCH_MESSAGE_BYTES = 32;
export const KEYCODE_MESSAGE_BYTES = 14;
export const BACK_MESSAGE_BYTES = 2;
/** The type byte plus the u32 length that precedes the UTF-8. */
const TEXT_HEADER_BYTES = 5;

/**
 * ⚠️ `Controller.injectTouch` reserves -1 for the mouse — it switches the event
 * to `SOURCE_MOUSE` with a mouse tool type, and reads `actionButton`/`buttons`
 * only on that path. Any other id is a finger on `SOURCE_TOUCHSCREEN`, which is
 * what an app under test expects to be touched by. -2 is scrcpy's own
 * generic-finger constant.
 */
export const POINTER_ID_FINGER = -2n;

/** `Binary.u16FixedPointToFloat` special-cases 0xFFFF to exactly 1.0; every
 * other value is `n / 65536`, which would never quite reach full pressure. */
const PRESSURE_FULL = 0xffff;

/**
 * Android's own numbers, read out of the platform `android.jar` rather than
 * remembered. They live here so nothing above the Gateway ever learns them: the
 * renderer names a key, and this is the only table that knows what 67 means.
 */
export const SCRCPY_KEYCODES: Readonly<Record<MirrorKey, number>> = {
  backspace: 67, // KEYCODE_DEL
  enter: 66,
  tab: 61,
  escape: 111,
  delete: 112, // KEYCODE_FORWARD_DEL
  'arrow-up': 19, // KEYCODE_DPAD_UP
  'arrow-down': 20,
  'arrow-left': 21,
  'arrow-right': 22,
};

/**
 * A message that could not be built. It carries a stable code for the same
 * reason `ScrcpyProtocolError` does — and always the control one, because
 * nothing here can break the picture: the video path never passes through this
 * module (criterion 16).
 */
export class ScrcpyControlError extends Error {
  readonly code: ErrorCode;

  constructor(message: string) {
    super(message);
    this.code = ERROR_CODES.mirrorControlFailed satisfies ErrorCode;
    this.name = 'ScrcpyControlError';
  }
}

/**
 * The one door: an input the renderer asked for, as the messages the wire
 * carries. A gesture that is a pair on the wire — a tap, a key, the back action
 * — comes back as two, in order, so the caller writes them together and neither
 * half can straddle a session change.
 *
 * Returns buffers built field by field from an argument list; nothing here ever
 * composes a string (.context.md §12.19, applied to encoding).
 */
export function controlMessages(input: MirrorInput): Uint8Array[] {
  switch (input.type) {
    case 'tap':
      return [touchMessage(input, ACTION.down), touchMessage(input, ACTION.up)];
    case 'text':
      return [textMessage(input.text)];
    case 'key':
      return [
        keycodeMessage(SCRCPY_KEYCODES[input.key], ACTION.down),
        keycodeMessage(SCRCPY_KEYCODES[input.key], ACTION.up),
      ];
    case 'back':
      return [backMessage(ACTION.down), backMessage(ACTION.up)];
  }
}

/**
 * ⚠️ The declared screen size is not decoration. `PositionMapper.map` returns
 * null — silently, with nothing logged on either side — unless it equals the
 * video's current size, and the touch is dropped. The caller supplies the size
 * because after a rotation only the renderer holds a fresh one.
 */
function touchMessage(tap: MirrorTap, action: number): Uint8Array {
  if (tap.x < 0 || tap.x >= tap.screenWidth || tap.y < 0 || tap.y >= tap.screenHeight) {
    throw new ScrcpyControlError(
      `A tap at (${tap.x}, ${tap.y}) is outside the ${tap.screenWidth}x${tap.screenHeight} stream it names.`,
    );
  }

  const bytes = new Uint8Array(TOUCH_MESSAGE_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, TYPE.injectTouch);
  view.setUint8(1, action);
  view.setBigInt64(2, POINTER_ID_FINGER);
  view.setInt32(10, tap.x);
  view.setInt32(14, tap.y);
  view.setUint16(18, tap.screenWidth);
  view.setUint16(20, tap.screenHeight);
  view.setUint16(22, action === ACTION.down ? PRESSURE_FULL : 0);
  // Both are read only for `SOURCE_MOUSE`, which a finger never is.
  view.setInt32(24, 0);
  view.setInt32(28, 0);
  return bytes;
}

/**
 * Criterion 11. One message for a whole run of characters: the server walks the
 * string itself (`Controller.injectText` calls `injectChar` per char), so
 * batching is the protocol's own shape rather than something built on top of it.
 */
function textMessage(text: string): Uint8Array {
  const payload = new TextEncoder().encode(text);
  // The server's cap is on the byte count it allocates, not on characters.
  if (payload.length > MAX_INPUT_TEXT_LENGTH) {
    throw new ScrcpyControlError(
      `${payload.length} bytes of text is past the ${MAX_INPUT_TEXT_LENGTH} the server will read.`,
    );
  }

  const bytes = new Uint8Array(TEXT_HEADER_BYTES + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, TYPE.injectText);
  view.setUint32(1, payload.length);
  bytes.set(payload, TEXT_HEADER_BYTES);
  return bytes;
}

function keycodeMessage(keycode: number, action: number): Uint8Array {
  const bytes = new Uint8Array(KEYCODE_MESSAGE_BYTES);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, TYPE.injectKeycode);
  view.setUint8(1, action);
  view.setInt32(2, keycode);
  // A single press, with nothing held down beside it — the modifiers a person
  // holds are the app's shortcuts, and criterion 13 leaves those alone.
  view.setInt32(6, 0);
  view.setInt32(10, 0);
  return bytes;
}

/**
 * Criterion 14. Its own message type rather than `INJECT_KEYCODE` with
 * `KEYCODE_BACK`: `Controller.pressBackOrTurnScreenOn` wakes a sleeping display
 * instead of pressing back into the dark, which is what a person means by it.
 */
function backMessage(action: number): Uint8Array {
  return new Uint8Array([TYPE.backOrScreenOn, action]);
}

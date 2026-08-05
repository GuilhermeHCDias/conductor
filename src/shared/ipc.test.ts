import { describe, expect, it } from 'vitest';
import { CHANNELS, ERROR_CODES, IPC, PUSH, PUSH_CHANNELS } from './ipc';

/**
 * The contract itself, pinned. These names cross a process boundary and a
 * version boundary — main validates against them, the preload exposes them and
 * the renderer types itself from them, so a rename that compiles is still a
 * break.
 */

describe('the channels', () => {
  /** Criterion 27 — the mirror's three, beside the four that were already here. */
  it('are exactly the invokes this app declares', () => {
    expect(Object.values(CHANNELS)).toEqual([
      'app:info',
      'config:get',
      'device:list',
      'device:app-info',
      'viewer:open',
      'mirror:start',
      'mirror:stop',
      'mirror:input',
    ]);
  });

  it('are exactly the pushes this app declares', () => {
    expect(Object.values(PUSH_CHANNELS)).toEqual(['device:changed', 'mirror:event']);
  });

  it('read as <domain>:<action> in kebab-case', () => {
    for (const channel of [...Object.values(CHANNELS), ...Object.values(PUSH_CHANNELS)]) {
      expect(channel).toMatch(/^[a-z]+:[a-z]+(-[a-z]+)*$/);
    }
  });

  /** Criterion 26 — one Zod schema per payload, with no channel left undeclared. */
  it('every invoke has a request and a response schema', () => {
    for (const channel of Object.values(CHANNELS)) {
      expect(IPC[channel]?.request).toBeDefined();
      expect(IPC[channel]?.response).toBeDefined();
    }
  });

  it('every push has a payload schema', () => {
    for (const channel of Object.values(PUSH_CHANNELS)) {
      expect(PUSH[channel]).toBeDefined();
    }
  });
});

describe('mirror:start', () => {
  const schema = IPC[CHANNELS.mirrorStart];

  it('takes the opaque device id and nothing else', () => {
    expect(schema.request.safeParse(['R9QYC01EMXL']).success).toBe(true);
    expect(schema.request.safeParse([]).success).toBe(false);
    expect(schema.request.safeParse([42]).success).toBe(false);
  });

  /** Criterion 28 — the session id and the stream's own dimensions, immediately.
   * Frames are never part of this answer. */
  it('answers with the session and the stream it opened', () => {
    const parsed = schema.response.safeParse({
      sessionId: 'mirror-1',
      codec: 'h264',
      width: 464,
      height: 1024,
      control: true,
    });

    expect(parsed.success).toBe(true);
  });

  it('refuses a stream with no size', () => {
    expect(schema.response.safeParse({ sessionId: 'mirror-1', codec: 'h264' }).success).toBe(false);
  });

  /** Criterion 4. A picture with no control is a real state, not a failure: the
   * panel has to know which one it got before it offers a tap target. */
  it('says whether the session can be driven as well as watched', () => {
    const parsed = schema.response.safeParse({
      sessionId: 'mirror-1',
      codec: 'h264',
      width: 464,
      height: 1024,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('mirror:stop', () => {
  it('takes the session id, not the device id', () => {
    expect(IPC[CHANNELS.mirrorStop].request.safeParse(['mirror-1']).success).toBe(true);
    expect(IPC[CHANNELS.mirrorStop].request.safeParse([]).success).toBe(false);
  });
});

/**
 * The outbound half. It names the session rather than the device: control
 * belongs to the stream that is open, and a tap aimed at a session that has
 * already been replaced must not reach the device under the new one.
 */
describe('mirror:input', () => {
  const schema = IPC[CHANNELS.mirrorInput];
  const tap = {
    type: 'tap',
    x: 232,
    y: 534,
    screenWidth: 464,
    screenHeight: 1024,
  };

  it('takes the session id and one input', () => {
    expect(schema.request.safeParse(['mirror-1', tap]).success).toBe(true);
    expect(schema.request.safeParse([tap]).success).toBe(false);
    expect(schema.request.safeParse(['mirror-1']).success).toBe(false);
  });

  /**
   * ⚠️ The screen size travels with the tap because `PositionMapper` drops any
   * touch whose declared size is not the video's current one — and after a
   * rotation the renderer is the only side that knows the new size.
   */
  it('carries the stream size the tap was aimed at', () => {
    expect(schema.request.safeParse(['mirror-1', { ...tap, screenWidth: undefined }]).success).toBe(
      false,
    );
  });

  it('refuses a tap outside the stream it names', () => {
    expect(schema.request.safeParse(['mirror-1', { ...tap, x: -1 }]).success).toBe(false);
    expect(schema.request.safeParse(['mirror-1', { ...tap, x: 464 }]).success).toBe(false);
    expect(schema.request.safeParse(['mirror-1', { ...tap, y: 1024 }]).success).toBe(false);
    expect(schema.request.safeParse(['mirror-1', { ...tap, x: 463, y: 1023 }]).success).toBe(true);
  });

  it('refuses a screen size the wire cannot carry as a u16', () => {
    expect(schema.request.safeParse(['mirror-1', { ...tap, screenWidth: 70_000 }]).success).toBe(
      false,
    );
    expect(schema.request.safeParse(['mirror-1', { ...tap, screenWidth: 0 }]).success).toBe(false);
  });

  it('carries typed text', () => {
    expect(schema.request.safeParse(['mirror-1', { type: 'text', text: 'hello' }]).success).toBe(
      true,
    );
    expect(schema.request.safeParse(['mirror-1', { type: 'text', text: '' }]).success).toBe(false);
  });

  /** `INJECT_TEXT_MAX_LENGTH` in the pinned server. */
  it('refuses more text than the server will read', () => {
    expect(
      schema.request.safeParse(['mirror-1', { type: 'text', text: 'a'.repeat(300) }]).success,
    ).toBe(true);
    expect(
      schema.request.safeParse(['mirror-1', { type: 'text', text: 'a'.repeat(301) }]).success,
    ).toBe(false);
  });

  /** Criterion 12. The renderer names a key; Android's numbers stay in main. */
  it('names a key rather than an Android keycode', () => {
    expect(schema.request.safeParse(['mirror-1', { type: 'key', key: 'backspace' }]).success).toBe(
      true,
    );
    expect(schema.request.safeParse(['mirror-1', { type: 'key', key: 67 }]).success).toBe(false);
    expect(schema.request.safeParse(['mirror-1', { type: 'key', key: 'meta' }]).success).toBe(
      false,
    );
  });

  it('carries the back action with nothing else', () => {
    expect(schema.request.safeParse(['mirror-1', { type: 'back' }]).success).toBe(true);
  });

  it('refuses an input that is none of those four', () => {
    expect(schema.request.safeParse(['mirror-1', { type: 'swipe' }]).success).toBe(false);
    expect(schema.request.safeParse(['mirror-1', { type: 'clipboard' }]).success).toBe(false);
  });

  it('answers with the session it reached', () => {
    expect(schema.response.safeParse({ sessionId: 'mirror-1' }).success).toBe(true);
  });
});

describe('mirror:event', () => {
  const schema = PUSH[PUSH_CHANNELS.mirrorEvent];

  /** Criterion 29 — bytes, never a file path. A remote device shares no
   * filesystem with us (.context.md §10.1 rule 2). */
  it('carries a frame as bytes', () => {
    const parsed = schema.safeParse({
      type: 'frame',
      sessionId: 'mirror-1',
      config: false,
      keyFrame: true,
      pts: 652021984203,
      data: new Uint8Array([0, 0, 0, 1, 0x65]),
    });

    expect(parsed.success).toBe(true);
  });

  it.each([
    ['a path', '/tmp/frame-0001.h264'],
    ['nothing at all', undefined],
    ['a plain array', [0, 0, 0, 1]],
  ])('refuses a frame whose payload arrived as %s', (_label, data) => {
    const parsed = schema.safeParse({
      type: 'frame',
      sessionId: 'mirror-1',
      config: false,
      keyFrame: true,
      pts: 0,
      data,
    });

    expect(parsed.success).toBe(false);
  });

  /** Criterion 25 — a terminal event, with the code the panel reads. */
  it('carries the end of a session with a stable code', () => {
    const parsed = schema.safeParse({
      type: 'ended',
      sessionId: 'mirror-1',
      code: ERROR_CODES.mirrorDeviceLost,
      message: 'The device closed the mirror stream.',
    });

    expect(parsed.success).toBe(true);
  });

  it('is one of exactly those two things', () => {
    expect(schema.safeParse({ type: 'started', sessionId: 'mirror-1' }).success).toBe(false);
  });
});

/** Criterion 31 — the doctor and the panel tell one failure from another by the
 * code alone, so the codes are part of the contract. */
describe('the failure codes', () => {
  it('namespaces every one of them by domain', () => {
    for (const code of Object.values(ERROR_CODES)) {
      expect(code).toMatch(/^[a-z]+\/[a-z-]+$/);
    }
  });

  it('are unique', () => {
    const codes = Object.values(ERROR_CODES);

    expect(new Set(codes).size).toBe(codes.length);
  });

  it('tell the four ways a mirror fails apart', () => {
    expect([
      ERROR_CODES.mirrorStartFailed,
      ERROR_CODES.mirrorHandshakeFailed,
      ERROR_CODES.mirrorProtocolFailed,
      ERROR_CODES.mirrorDeviceLost,
    ]).toEqual([
      'mirror/start-failed',
      'mirror/handshake-failed',
      'mirror/protocol-failed',
      'mirror/device-lost',
    ]);
  });

  /**
   * Criterion 16. Control failing is its own condition: the picture is still
   * there, so the panel must not read it as the stream dying. It is the one
   * mirror code that leaves the video path untouched.
   */
  it('gives a control failure a code of its own', () => {
    expect(ERROR_CODES.mirrorControlFailed).toBe('mirror/control-failed');
    expect(ERROR_CODES.mirrorControlFailed).not.toBe(ERROR_CODES.mirrorDeviceLost);
  });
});

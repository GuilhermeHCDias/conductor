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
    });

    expect(parsed.success).toBe(true);
  });

  it('refuses a stream with no size', () => {
    expect(schema.response.safeParse({ sessionId: 'mirror-1', codec: 'h264' }).success).toBe(false);
  });
});

describe('mirror:stop', () => {
  it('takes the session id, not the device id', () => {
    expect(IPC[CHANNELS.mirrorStop].request.safeParse(['mirror-1']).success).toBe(true);
    expect(IPC[CHANNELS.mirrorStop].request.safeParse([]).success).toBe(false);
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
});

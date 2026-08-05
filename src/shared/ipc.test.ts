import { describe, expect, it } from 'vitest';
import { CHANNELS, ERROR_CODES, IPC, PUSH, PUSH_CHANNELS } from './ipc';

/**
 * The contract itself, pinned. These names cross a process boundary and a
 * version boundary — main validates against them, the preload exposes them and
 * the renderer types itself from them, so a rename that compiles is still a
 * break.
 */

describe('the channels', () => {
  /**
   * `viewer:open` is gone with the feature behind it (criterion 24).
   *
   * ⚠️ Nothing was added in its place. `hierarchy` and `screenshot` are Gateway
   * capabilities this spec keeps in main on purpose (criterion 3): there is no
   * renderer code that calls them yet, and a channel with no caller is surface
   * that has to be maintained before anyone knows what shape it wants. The
   * snapshot spec is the one that needs this data in the renderer, and it is
   * where the channels belong.
   */
  it('are exactly the invokes this app declares', () => {
    expect(Object.values(CHANNELS)).toEqual([
      'app:info',
      'config:get',
      'device:list',
      'device:app-info',
      'mirror:start',
      'mirror:stop',
    ]);
  });

  /** Criterion 3, stated where a future reader would otherwise add one out of
   * tidiness. */
  it('declares no channel for the hierarchy or the screenshot yet', () => {
    const channels: string[] = [...Object.values(CHANNELS), ...Object.values(PUSH_CHANNELS)];

    expect(channels.filter((channel) => /hierarchy|screenshot|snapshot/.test(channel))).toEqual([]);
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

  /**
   * Criterion 22. The `maestro mcp` child's failures used to be namespaced
   * `viewer/`, from when that child existed to open one. Nothing opens a viewer
   * now, and a code naming a feature the app does not have tells whoever reads
   * it next exactly the wrong thing.
   */
  it('name the mcp session rather than a viewer', () => {
    expect(Object.values(ERROR_CODES).filter((code) => code.startsWith('viewer/'))).toEqual([]);
    expect([
      ERROR_CODES.maestroNotFound,
      ERROR_CODES.mcpStartFailed,
      ERROR_CODES.mcpHandshakeTimeout,
      ERROR_CODES.mcpToolMissing,
      ERROR_CODES.mcpCallFailed,
    ]).toEqual([
      'mcp/maestro-not-found',
      'mcp/start-failed',
      'mcp/handshake-timeout',
      'mcp/tool-missing',
      'mcp/call-failed',
    ]);
  });

  /** There is no URL to trust once nothing opens one (criterion 22). */
  it('no longer carries a code for an untrusted URL', () => {
    expect(Object.values(ERROR_CODES)).not.toContain('viewer/untrusted-url');
  });

  /** The two this spec adds, each distinct from the other and from adb's —
   * three different failures with three different fixes (criteria 10, 15). */
  it('tell a bad hierarchy, a failed capture and a missing adb apart', () => {
    expect([
      ERROR_CODES.hierarchyParseFailed,
      ERROR_CODES.captureFailed,
      ERROR_CODES.adbNotFound,
    ]).toEqual(['hierarchy/parse-failed', 'capture/failed', 'device/adb-not-found']);
  });
});

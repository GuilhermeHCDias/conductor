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
   * The two `maestro:` invokes arrived with the inspect spec — the successor
   * this list was holding the door for. `maestro:synthesize-selector` is the
   * name AGENTS.md's worked example uses, verbatim.
   */
  it('are exactly the invokes this app declares', () => {
    expect(Object.values(CHANNELS)).toEqual([
      'app:info',
      'config:get',
      'device:list',
      'device:app-info',
      'mirror:start',
      'mirror:stop',
      'mirror:input',
      'maestro:snapshot',
      'maestro:synthesize-selector',
      'run:start',
      'run:cancel',
    ]);
  });

  /**
   * Criterion 6 of the inspect spec: the tree crosses inside the snapshot,
   * and the screenshot's bytes still never cross at all — they exist in main
   * to calibrate. A raw hierarchy or screenshot channel would be surface for
   * data nothing renders.
   */
  it('declares no channel for raw hierarchy or screenshot bytes', () => {
    const channels: string[] = [...Object.values(CHANNELS), ...Object.values(PUSH_CHANNELS)];

    expect(channels.filter((channel) => /hierarchy|screenshot/.test(channel))).toEqual([]);
  });

  it('are exactly the pushes this app declares', () => {
    expect(Object.values(PUSH_CHANNELS)).toEqual(['device:changed', 'mirror:event', 'run:event']);
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

  /** The server's cap is on the bytes it allocates, so the boundary has to
   * count what the encoder counts. Measuring characters here would pass a
   * payload the encoder then refuses — the same limit, disagreeing with
   * itself across two layers. */
  it('measures the cap in bytes, the way the encoder does', () => {
    // 200 characters, 400 UTF-8 bytes: under any character count, over the cap.
    expect(
      schema.request.safeParse(['mirror-1', { type: 'text', text: 'é'.repeat(200) }]).success,
    ).toBe(false);
    // 150 characters, 300 bytes: exactly the cap, and still allowed.
    expect(
      schema.request.safeParse(['mirror-1', { type: 'text', text: 'é'.repeat(150) }]).success,
    ).toBe(true);
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

  /**
   * Criterion 40 — the two gestures the command menu executes, shaped exactly
   * like a tap and expanded main-side the same way. The timing is main's:
   * nothing above the Gateway learns what a long press is made of.
   */
  it('carries the long-press and double-tap gestures with the same guards as a tap', () => {
    expect(schema.request.safeParse(['mirror-1', { ...tap, type: 'long-press' }]).success).toBe(
      true,
    );
    expect(schema.request.safeParse(['mirror-1', { ...tap, type: 'double-tap' }]).success).toBe(
      true,
    );
    expect(schema.request.safeParse(['mirror-1', { type: 'long-press', x: 1, y: 1 }]).success).toBe(
      false,
    );
    expect(
      schema.request.safeParse(['mirror-1', { ...tap, type: 'double-tap', x: 464 }]).success,
    ).toBe(false);
  });

  /**
   * The live drag crosses one phase at a time — down, then every move, then up
   * — because the hand is still drawing the gesture when its first message
   * must already be on the device. No composed form could carry that: the far
   * end does not exist yet. Each phase is guarded exactly like a tap's point,
   * for the same `PositionMapper` reason.
   */
  it('carries a live touch as one phase at one point', () => {
    expect(
      schema.request.safeParse(['mirror-1', { ...tap, type: 'touch', action: 'down' }]).success,
    ).toBe(true);
    expect(
      schema.request.safeParse(['mirror-1', { ...tap, type: 'touch', action: 'move' }]).success,
    ).toBe(true);
    expect(
      schema.request.safeParse(['mirror-1', { ...tap, type: 'touch', action: 'up' }]).success,
    ).toBe(true);
  });

  it('requires a touch to say which phase it is', () => {
    expect(schema.request.safeParse(['mirror-1', { ...tap, type: 'touch' }]).success).toBe(false);
    expect(
      schema.request.safeParse(['mirror-1', { ...tap, type: 'touch', action: 'cancel' }]).success,
    ).toBe(false);
  });

  it('guards a touch phase exactly as it guards a tap', () => {
    expect(
      schema.request.safeParse(['mirror-1', { ...tap, type: 'touch', action: 'move', x: 464 }])
        .success,
    ).toBe(false);
    expect(
      schema.request.safeParse([
        'mirror-1',
        { ...tap, type: 'touch', action: 'up', screenWidth: undefined },
      ]).success,
    ).toBe(false);
  });

  it('refuses an input that is none of the declared kinds', () => {
    // `swipe` once stood in this union: the replayed gesture the live `touch`
    // phases made redundant. It must stay refused now that nothing sends it.
    expect(schema.request.safeParse(['mirror-1', { type: 'pinch' }]).success).toBe(false);
    expect(
      schema.request.safeParse([
        'mirror-1',
        { ...tap, type: 'swipe', toX: 232, toY: 100, durationMs: 240 },
      ]).success,
    ).toBe(false);
    expect(schema.request.safeParse(['mirror-1', { type: 'clipboard' }]).success).toBe(false);
  });

  it('answers with the session it reached', () => {
    expect(schema.response.safeParse({ sessionId: 'mirror-1' }).success).toBe(true);
  });
});

/** A minimal but complete node, nested once — the recursive shape is the whole
 * point of the schema, so the fixture exercises it. */
const NODE = {
  bounds: { x1: 0, y1: 0, x2: 720, y2: 1600 },
  className: 'android.widget.FrameLayout',
  text: null,
  resourceId: null,
  contentDescription: null,
  hintText: null,
  scrollable: null,
  clickable: true,
  enabled: null,
  focused: null,
  selected: null,
  checked: null,
  children: [
    {
      bounds: null,
      className: null,
      text: 'Entrar',
      resourceId: 'com.vtex.pnp:id/login',
      contentDescription: null,
      hintText: null,
      scrollable: null,
      clickable: null,
      enabled: null,
      focused: null,
      selected: null,
      checked: null,
      children: [],
    },
  ],
};

describe('maestro:snapshot', () => {
  const schema = IPC[CHANNELS.maestroSnapshot];

  it('takes the opaque device id and nothing else', () => {
    expect(schema.request.safeParse(['R9QYC01EMXL']).success).toBe(true);
    expect(schema.request.safeParse([]).success).toBe(false);
  });

  /** Criterion 1 — the tree, the screenshot's size and the calibrated scale.
   * The recursive `TreeNode` is what `z.lazy` exists for here. */
  it('answers the snapshot view with its nested tree', () => {
    const parsed = schema.response.safeParse({
      snapshotId: 'snapshot-1',
      tree: NODE,
      screenshotWidth: 720,
      screenshotHeight: 1600,
      scale: 1,
    });

    expect(parsed.success).toBe(true);
  });

  it('refuses a snapshot with no calibration', () => {
    const parsed = schema.response.safeParse({
      snapshotId: 'snapshot-1',
      tree: NODE,
      screenshotWidth: 720,
      screenshotHeight: 1600,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('maestro:synthesize-selector', () => {
  const schema = IPC[CHANNELS.maestroSynthesizeSelector];

  /** Criterion 5 — the snapshot the renderer hit-tested, and the node's path
   * of child indices in that tree. */
  it('takes the snapshot id and the node path', () => {
    expect(schema.request.safeParse(['snapshot-1', [1, 2, 0]]).success).toBe(true);
    expect(schema.request.safeParse(['snapshot-1', []]).success).toBe(true);
    expect(schema.request.safeParse(['snapshot-1']).success).toBe(false);
    expect(schema.request.safeParse(['snapshot-1', [-1]]).success).toBe(false);
    expect(schema.request.safeParse(['snapshot-1', [1.5]]).success).toBe(false);
  });

  /** Criterion 35 — a structured result, never a full command. */
  it('answers the rung, the fragment and the fragility flag', () => {
    const parsed = schema.response.safeParse({
      level: 'id',
      selector: 'id: "com.vtex.pnp:id/login"',
      fragile: false,
    });

    expect(parsed.success).toBe(true);
  });

  /** Criterion 32 — the levels are the ladder's, and only the ladder's. */
  it('refuses a rung the ladder does not have', () => {
    const parsed = schema.response.safeParse({
      level: 'class',
      selector: 'class: "android.widget.Button"',
      fragile: false,
    });

    expect(parsed.success).toBe(false);
  });
});

describe('run:start', () => {
  const schema = IPC[CHANNELS.runStart];

  /** Criterion 1 — the device and the flow's own YAML text: the run executes a
   * temp snapshot of memory, so the text itself is what crosses. */
  it('takes the opaque device id and the flow text', () => {
    expect(schema.request.safeParse(['R9QYC01EMXL', 'appId: x\n---\n- launchApp\n']).success).toBe(
      true,
    );
    expect(schema.request.safeParse(['R9QYC01EMXL']).success).toBe(false);
    expect(schema.request.safeParse([]).success).toBe(false);
  });

  /** Criterion 17 keeps the button disabled on an empty flow; the boundary
   * refuses one outright rather than handing Maestro an empty file. */
  it('refuses an empty flow', () => {
    expect(schema.request.safeParse(['R9QYC01EMXL', '']).success).toBe(false);
  });

  /** Same rule, same measure as the button's disable: a flow of nothing but
   * whitespace is an empty flow, not a runnable file. */
  it('refuses a whitespace-only flow', () => {
    expect(schema.request.safeParse(['R9QYC01EMXL', ' \n\t\n']).success).toBe(false);
  });

  /** Criterion 1 — the fresh run id, immediately, and nothing else: progress
   * arrives as `run:event` pushes, never in this answer. */
  it('answers with the run id and nothing else', () => {
    expect(schema.response.safeParse({ runId: 'run-1' }).success).toBe(true);
    expect(schema.response.safeParse({}).success).toBe(false);
  });
});

describe('run:cancel', () => {
  it('takes the run id, not the device id', () => {
    expect(IPC[CHANNELS.runCancel].request.safeParse(['run-1']).success).toBe(true);
    expect(IPC[CHANNELS.runCancel].request.safeParse([]).success).toBe(false);
  });

  it('answers with the run it canceled', () => {
    expect(IPC[CHANNELS.runCancel].response.safeParse({ runId: 'run-1' }).success).toBe(true);
  });
});

describe('run:event', () => {
  const schema = PUSH[PUSH_CHANNELS.runEvent];

  /** Criterion 6 — every event is tagged with the run it belongs to, so a late
   * event from a canceled run cannot decorate the one that replaced it. */
  it.each([
    ['started', { type: 'started', runId: 'run-1' }],
    ['step-started', { type: 'step-started', runId: 'run-1', label: 'Launch app "x"' }],
    ['step-passed', { type: 'step-passed', runId: 'run-1', label: 'Launch app "x"' }],
    ['step-failed', { type: 'step-failed', runId: 'run-1', label: 'Assert that "y" is visible' }],
    ['log', { type: 'log', runId: 'run-1', lines: ['Running on R9QYC01EMXL', ' > Flow happy'] }],
    ['finished', { type: 'finished', runId: 'run-1', outcome: 'passed', message: null }],
  ] as const)('carries the %s event', (_label, event) => {
    expect(schema.safeParse(event).success).toBe(true);
  });

  it('refuses an event that carries no run id', () => {
    expect(schema.safeParse({ type: 'started' }).success).toBe(false);
    expect(schema.safeParse({ type: 'log', lines: [] }).success).toBe(false);
  });

  /** Constraint — log lines are batched per chunk, so the payload is a list. */
  it('carries log lines as a list, never as one blob', () => {
    expect(schema.safeParse({ type: 'log', runId: 'run-1', lines: 'a\nb' }).success).toBe(false);
  });

  /** Criterion 6 — the four ways a run ends, and only those. */
  it('refuses an outcome the vocabulary does not have', () => {
    for (const outcome of ['passed', 'failed', 'canceled', 'error'] as const) {
      expect(
        schema.safeParse({ type: 'finished', runId: 'run-1', outcome, message: null }).success,
      ).toBe(true);
    }
    expect(
      schema.safeParse({ type: 'finished', runId: 'run-1', outcome: 'crashed', message: null })
        .success,
    ).toBe(false);
  });

  /** Criterion 21 — an error travels with its message; a clean pass has none,
   * and `null` says so rather than an empty string pretending to. */
  it('carries the terminal message as text or as null, never absent', () => {
    expect(
      schema.safeParse({
        type: 'finished',
        runId: 'run-1',
        outcome: 'error',
        message: 'The Maestro CLI is not installed.',
      }).success,
    ).toBe(true);
    expect(schema.safeParse({ type: 'finished', runId: 'run-1', outcome: 'passed' }).success).toBe(
      false,
    );
  });

  it('refuses an event of no declared kind', () => {
    expect(schema.safeParse({ type: 'progress', runId: 'run-1' }).success).toBe(false);
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
   * Criterion 16 of the control-socket spec. Control failing is its own
   * condition: the picture is still there, so the panel must not read it as the
   * stream dying. It is the one mirror code that leaves the video path
   * untouched.
   */
  it('gives a control failure a code of its own', () => {
    expect(ERROR_CODES.mirrorControlFailed).toBe('mirror/control-failed');
    expect(ERROR_CODES.mirrorControlFailed).not.toBe(ERROR_CODES.mirrorDeviceLost);
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

  /**
   * The run spec's four. `run/maestro-not-found` is distinct from the mcp
   * child's `mcp/maestro-not-found` on purpose: same missing binary, but the
   * refusal reaches a different surface, and criterion 3 wants it distinct
   * from every mid-run failure. `run/active` is both criterion 4's "one run at
   * a time" and criterion 11's "the screen is stale until the run ends".
   */
  it('tell the run refusals apart', () => {
    expect([
      ERROR_CODES.runActive,
      ERROR_CODES.runMaestroNotFound,
      ERROR_CODES.runNotFound,
      ERROR_CODES.runStartFailed,
    ]).toEqual(['run/active', 'run/maestro-not-found', 'run/not-found', 'run/start-failed']);
  });

  /** The inspect spec's four: a stale snapshot re-captures and retries, a
   * calibration that cannot happen refuses, and the two synthesis failures
   * write nothing (criteria 3, 5, 28, 31). */
  it('tell the snapshot and synthesis failures apart', () => {
    expect([
      ERROR_CODES.snapshotStale,
      ERROR_CODES.snapshotNoBounds,
      ERROR_CODES.selectorNodeMissing,
      ERROR_CODES.selectorNoMatch,
    ]).toEqual([
      'snapshot/stale',
      'snapshot/no-bounds',
      'selector/node-missing',
      'selector/no-match',
    ]);
  });
});

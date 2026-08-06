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
      'app:read-clipboard',
      'app:write-clipboard',
      'config:get',
      'repo:list',
      'repo:resolve',
      'repo:connect',
      'repo:switch',
      'device:list',
      'device:app-info',
      'mirror:start',
      'mirror:stop',
      'mirror:input',
      'maestro:snapshot',
      'maestro:synthesize-selector',
      'run:start',
      'run:cancel',
      'flow:list',
      'flow:read',
      'flow:save',
      'flow:create',
      'flow:create-folder',
      'flow:rename',
      'flow:rename-folder',
      'flow:duplicate',
      'flow:delete',
      'flow:delete-folder',
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
    expect(Object.values(PUSH_CHANNELS)).toEqual([
      'device:changed',
      'mirror:event',
      'run:event',
      'flow:changed',
      'repo:changed',
      'repo:resolve-event',
    ]);
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

/** A complete index entry, the shape §7 keeps in memory and criterion 2 answers. */
const FLOW_META = {
  path: 'checkout/pix.yml',
  name: 'pix.yml',
  folder: 'checkout',
  commandCount: 3,
  hash: '811c9dc5',
};

describe('flow:list', () => {
  const schema = IPC[CHANNELS.flowList];

  it('takes nothing', () => {
    expect(schema.request.safeParse([]).success).toBe(true);
    expect(schema.request.safeParse(['conductor']).success).toBe(false);
  });

  /** Criterion 2 — every flow with its identity (§7.2: the root-relative path),
   * name, folder, command count and hash; and every directory, empty ones
   * included, so a folder just made does not vanish (criterion 13). */
  it('answers flows and folders, and an empty folder is still a folder', () => {
    const parsed = schema.response.safeParse({
      flows: [FLOW_META],
      folders: ['checkout', 'drafts'],
    });

    expect(parsed.success).toBe(true);
  });

  /** §7.2 — an index entry without its path is an identity crisis, refused. */
  it('refuses a flow entry that lost its identity', () => {
    expect(
      schema.response.safeParse({
        flows: [{ name: 'pix.yml', folder: '', commandCount: 3, hash: 'x' }],
        folders: [],
      }).success,
    ).toBe(false);
  });
});

describe('flow:read', () => {
  const schema = IPC[CHANNELS.flowRead];

  /** §7.2 — the identity legitimately carries `/`, so the schema takes any
   * string; main refuses by resolving against the root (§9.3), never here. */
  it('takes the root-relative path', () => {
    expect(schema.request.safeParse(['checkout/pix.yml']).success).toBe(true);
    expect(schema.request.safeParse([]).success).toBe(false);
  });

  it('answers the file text', () => {
    expect(schema.response.safeParse({ yaml: 'appId: x\n---\n' }).success).toBe(true);
    expect(schema.response.safeParse({}).success).toBe(false);
  });
});

describe('flow:save', () => {
  const schema = IPC[CHANNELS.flowSave];

  it('takes the path and the text', () => {
    expect(schema.request.safeParse(['pix.yml', 'appId: x\n---\n']).success).toBe(true);
    expect(schema.request.safeParse(['pix.yml']).success).toBe(false);
  });

  /** Criterion 6 — editing is saving, and clearing the editor is an edit: an
   * emptied flow still lands on disk, unlike `run:start` which refuses it. */
  it('accepts an empty text', () => {
    expect(schema.request.safeParse(['pix.yml', '']).success).toBe(true);
  });

  it('answers with the path it wrote', () => {
    expect(schema.response.safeParse({ path: 'pix.yml' }).success).toBe(true);
  });
});

describe('flow:create', () => {
  const schema = IPC[CHANNELS.flowCreate];

  /** Criterion 16 — the draft lands inside the folder it was started in; `''`
   * is the root. The name is as typed: the extension is main's job
   * (criterion 18), and an invalid name earns a stable code, never a schema
   * error (criterion 5). */
  it('takes the target folder and the typed name', () => {
    expect(schema.request.safeParse(['checkout', 'pix']).success).toBe(true);
    expect(schema.request.safeParse(['', 'pix.yml']).success).toBe(true);
    expect(schema.request.safeParse(['pix']).success).toBe(false);
  });

  it('answers with the created path', () => {
    expect(schema.response.safeParse({ path: 'checkout/pix.yaml' }).success).toBe(true);
  });
});

describe('flow:create-folder', () => {
  const schema = IPC[CHANNELS.flowCreateFolder];

  /** Criterion 20 — folders are created at the root, so only the name crosses. */
  it('takes the typed name', () => {
    expect(schema.request.safeParse(['drafts']).success).toBe(true);
    expect(schema.request.safeParse([]).success).toBe(false);
  });

  it('answers with the folder it made', () => {
    expect(schema.response.safeParse({ folder: 'drafts' }).success).toBe(true);
  });
});

describe('flow:rename', () => {
  const schema = IPC[CHANNELS.flowRename];

  /** Criterion 21 — a rename stays in its parent directory: the path names the
   * flow, the new name is a single segment, and main refuses anything else. */
  it('takes the path and the new name', () => {
    expect(schema.request.safeParse(['checkout/pix.yml', 'card']).success).toBe(true);
    expect(schema.request.safeParse(['checkout/pix.yml']).success).toBe(false);
  });

  it('answers with the path the flow lives at now', () => {
    expect(schema.response.safeParse({ path: 'checkout/card.yaml' }).success).toBe(true);
  });
});

describe('flow:rename-folder', () => {
  const schema = IPC[CHANNELS.flowRenameFolder];

  it('takes the folder and the new name', () => {
    expect(schema.request.safeParse(['drafts', 'checkout']).success).toBe(true);
    expect(schema.request.safeParse(['drafts']).success).toBe(false);
  });

  it('answers with the folder it lives at now', () => {
    expect(schema.response.safeParse({ folder: 'checkout' }).success).toBe(true);
  });
});

describe('flow:duplicate', () => {
  const schema = IPC[CHANNELS.flowDuplicate];

  /** Criterion 22 — the copy's name is derived main-side (`-copy`, `-copy-2`…),
   * so only the source crosses. */
  it('takes the source path alone', () => {
    expect(schema.request.safeParse(['pix.yml']).success).toBe(true);
    expect(schema.request.safeParse(['pix.yml', 'pix-copy.yml']).success).toBe(false);
  });

  it('answers with the copy it made', () => {
    expect(schema.response.safeParse({ path: 'pix-copy.yml' }).success).toBe(true);
  });
});

describe('flow:delete', () => {
  const schema = IPC[CHANNELS.flowDelete];

  it('takes the path', () => {
    expect(schema.request.safeParse(['checkout/pix.yml']).success).toBe(true);
    expect(schema.request.safeParse([]).success).toBe(false);
  });

  it('answers with the path it removed', () => {
    expect(schema.response.safeParse({ path: 'checkout/pix.yml' }).success).toBe(true);
  });
});

describe('flow:delete-folder', () => {
  const schema = IPC[CHANNELS.flowDeleteFolder];

  it('takes the folder', () => {
    expect(schema.request.safeParse(['checkout']).success).toBe(true);
    expect(schema.request.safeParse([]).success).toBe(false);
  });

  it('answers with the folder it removed', () => {
    expect(schema.response.safeParse({ folder: 'checkout' }).success).toBe(true);
  });
});

/** A repo as the resolver reports it — everything derived from the clone,
 * nothing typed by the person but the URL (§2.1). */
const RESOLVED_REPO = {
  url: 'https://github.com/loja-verde/pnp-fast-mode',
  org: 'loja-verde',
  name: 'pnp-fast-mode',
  appName: 'PnP Fast Mode',
  appId: { android: 'com.lojaverde.pnp', ios: 'com.lojaverde.pnp' },
  branch: 'main',
  flowCount: 4,
};

/** The same repo once connected: the slug main derived, and when it arrived. */
const CONNECTED_REPO = {
  ...RESOLVED_REPO,
  slug: 'loja-verde-pnp-fast-mode-1a2b3c4d',
  connectedAt: '2026-08-06T12:00:00.000Z',
};

describe('config:get', () => {
  const schema = IPC[CHANNELS.configGet];

  /** §12.6 — the app under test is runtime state derived from the active repo,
   * so the constants that cross carry no appId and no repo URL. */
  it('exposes only true constants — no appId, no repo URL', () => {
    const parsed = schema.response.safeParse({
      APP_ID: 'com.example.app',
      REPO_URL: 'https://github.com/x/y',
      REPO_BASE_BRANCH: 'main',
      FLOWS_DIR: 'conductor',
      FLOW_EXTENSIONS: ['.yml', '.yaml'],
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && 'APP_ID' in parsed.data).toBe(false);
    expect(parsed.success && 'REPO_URL' in parsed.data).toBe(false);
  });
});

describe('repo:list', () => {
  const schema = IPC[CHANNELS.repoList];

  it('takes nothing', () => {
    expect(schema.request.safeParse([]).success).toBe(true);
    expect(schema.request.safeParse(['loja-verde']).success).toBe(false);
  });

  /** The whole projection the renderer holds: every connected repo, and which
   * one is active — `null` before the first connect. */
  it('answers the connected repos and the active slug', () => {
    expect(
      schema.response.safeParse({ repos: [CONNECTED_REPO], active: CONNECTED_REPO.slug }).success,
    ).toBe(true);
    expect(schema.response.safeParse({ repos: [], active: null }).success).toBe(true);
  });

  it('refuses a repo entry that lost its slug', () => {
    const { slug: _slug, ...withoutSlug } = CONNECTED_REPO;

    expect(schema.response.safeParse({ repos: [withoutSlug], active: null }).success).toBe(false);
  });

  /** §2.1 — the two ids may diverge, so the model carries both sides from the
   * start; a side the app.json does not declare is `null`, never absent. */
  it('carries both sides of the appId, each nullable', () => {
    const oneSided = { ...CONNECTED_REPO, appId: { android: 'com.lojaverde.pnp', ios: null } };

    expect(schema.response.safeParse({ repos: [oneSided], active: null }).success).toBe(true);
    expect(
      schema.response.safeParse({
        repos: [{ ...CONNECTED_REPO, appId: { android: 'com.lojaverde.pnp' } }],
        active: null,
      }).success,
    ).toBe(false);
  });
});

describe('repo:resolve', () => {
  const schema = IPC[CHANNELS.repoResolve];

  /** §9.3 — the renderer sends the raw pasted URL and nothing else: no paths,
   * no slugs. Main parses, sanitizes and derives everything itself. */
  it('takes the raw pasted URL alone', () => {
    expect(schema.request.safeParse(['github.com/loja-verde/pnp-fast-mode']).success).toBe(true);
    expect(schema.request.safeParse([]).success).toBe(false);
  });

  /** No repository address is measured in kilobytes — a multi-megabyte
   * paste is refused at the boundary, not round-tripped. */
  it('refuses an address past any honest length', () => {
    expect(schema.request.safeParse(['g'.repeat(3000)]).success).toBe(false);
  });

  /** The start invoke returns an id immediately; progress arrives as
   * `repo:resolve-event` pushes, never in this answer. */
  it('answers with the resolve id and nothing else', () => {
    expect(schema.response.safeParse({ resolveId: 1 }).success).toBe(true);
    expect(schema.response.safeParse({}).success).toBe(false);
  });
});

describe('repo:connect', () => {
  const schema = IPC[CHANNELS.repoConnect];

  /** Confirming persists what main already resolved — the renderer names the
   * resolution, never re-sends derived data. */
  it('takes the resolve id of a finished resolution', () => {
    expect(schema.request.safeParse([1]).success).toBe(true);
    expect(schema.request.safeParse(['one']).success).toBe(false);
    expect(schema.request.safeParse([]).success).toBe(false);
  });

  it('answers the fresh repo state', () => {
    expect(
      schema.response.safeParse({ repos: [CONNECTED_REPO], active: CONNECTED_REPO.slug }).success,
    ).toBe(true);
  });
});

describe('repo:switch', () => {
  const schema = IPC[CHANNELS.repoSwitch];

  /** The slug is one main itself published in the list; main validates it by
   * lookup and never builds a path from it. */
  it('takes the slug of a connected repo', () => {
    expect(schema.request.safeParse([CONNECTED_REPO.slug]).success).toBe(true);
    expect(schema.request.safeParse([]).success).toBe(false);
  });

  it('answers the fresh repo state', () => {
    expect(
      schema.response.safeParse({ repos: [CONNECTED_REPO], active: CONNECTED_REPO.slug }).success,
    ).toBe(true);
  });
});

describe('app:read-clipboard', () => {
  const schema = IPC[CHANNELS.appReadClipboard];

  /** The Paste affordance — the sandboxed renderer's permission handler denies
   * `navigator.clipboard`, so the read is main's. */
  it('takes nothing and answers the clipboard text', () => {
    expect(schema.request.safeParse([]).success).toBe(true);
    expect(schema.request.safeParse(['text']).success).toBe(false);
    expect(schema.response.safeParse({ text: 'github.com/org/app' }).success).toBe(true);
    expect(schema.response.safeParse({}).success).toBe(false);
  });
});

describe('app:write-clipboard', () => {
  const schema = IPC[CHANNELS.appWriteClipboard];

  /** The error surface's Copy button, same rule the read follows. */
  it('takes the text and answers what it wrote', () => {
    expect(schema.request.safeParse(['gh auth login']).success).toBe(true);
    expect(schema.request.safeParse([]).success).toBe(false);
    expect(schema.response.safeParse({ text: 'gh auth login' }).success).toBe(true);
  });

  /** Only our own short commands are ever written; anything huge is a bug. */
  it('refuses a write past any honest command length', () => {
    expect(schema.request.safeParse(['x'.repeat(3000)]).success).toBe(false);
  });
});

describe('repo:changed', () => {
  const schema = PUSH[PUSH_CHANNELS.repoChanged];

  /** One push for every kind of change — first connect, a switch — carrying
   * the same projection `repo:list` answers. */
  it('carries the same state repo:list answers', () => {
    expect(schema.safeParse({ repos: [CONNECTED_REPO], active: CONNECTED_REPO.slug }).success).toBe(
      true,
    );
    expect(schema.safeParse({ repos: [CONNECTED_REPO] }).success).toBe(false);
  });
});

describe('repo:resolve-event', () => {
  const schema = PUSH[PUSH_CHANNELS.repoResolveEvent];

  /** The three real stages — clone, read app.json, scan conductor/ — advance
   * as each completes; `step` is how many are done, so `3` is "all of them". */
  it('carries the step progress, tagged with its resolution', () => {
    expect(schema.safeParse({ kind: 'step', resolveId: 1, step: 0 }).success).toBe(true);
    expect(schema.safeParse({ kind: 'step', resolveId: 1, step: 3 }).success).toBe(true);
    expect(schema.safeParse({ kind: 'step', resolveId: 1, step: 4 }).success).toBe(false);
    expect(schema.safeParse({ kind: 'step', step: 1 }).success).toBe(false);
  });

  it('carries everything the found card shows', () => {
    expect(schema.safeParse({ kind: 'found', resolveId: 1, repo: RESOLVED_REPO }).success).toBe(
      true,
    );
    expect(
      schema.safeParse({
        kind: 'found',
        resolveId: 1,
        repo: { ...RESOLVED_REPO, flowCount: undefined },
      }).success,
    ).toBe(false);
  });

  /** A clone that has nothing checked out to name is a real state: the branch
   * crosses as `null`, never as a guessed default. */
  it('lets the branch be unknown', () => {
    expect(
      schema.safeParse({ kind: 'found', resolveId: 1, repo: { ...RESOLVED_REPO, branch: null } })
        .success,
    ).toBe(true);
  });

  /**
   * A resolution failing is not the subscription failing — like
   * `mirror:event`'s `ended`, the failure travels as a typed event that names
   * its resolution and carries the stable code the error surface is built
   * from.
   */
  it('carries a failure with its resolution and its stable code', () => {
    const parsed = schema.safeParse({
      kind: 'failed',
      resolveId: 1,
      code: ERROR_CODES.repoGhUnauthenticated,
      message: 'gh is not logged in.',
    });

    expect(parsed.success).toBe(true);
    expect(schema.safeParse({ kind: 'failed', resolveId: 1 }).success).toBe(false);
  });

  it('refuses an event of no declared kind', () => {
    expect(schema.safeParse({ kind: 'progress', resolveId: 1 }).success).toBe(false);
  });
});

describe('flow:changed', () => {
  const schema = PUSH[PUSH_CHANNELS.flowChanged];

  /** Criterion 4 — the watcher pushes the fresh index itself, one event for
   * every kind of change (§12.21). Metadata only: file bodies never ride a
   * push (constraint), the editor pulls them over `flow:read`. */
  it('carries the same index flow:list answers', () => {
    expect(schema.safeParse({ flows: [FLOW_META], folders: ['checkout'] }).success).toBe(true);
    expect(schema.safeParse({ flows: [FLOW_META] }).success).toBe(false);
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

  /**
   * The flow workspace's four (criteria 5, 36). `flow/workspace-unavailable`
   * is the sidebar's error state, so it must survive the trip distinct from
   * "that flow is gone"; the two name refusals are what the draft row's inline
   * error is built from, told apart because only one of them keeps the typed
   * name worth correcting.
   */
  it('tell the flow workspace refusals apart', () => {
    expect([
      ERROR_CODES.flowWorkspaceUnavailable,
      ERROR_CODES.flowNotFound,
      ERROR_CODES.flowNameTaken,
      ERROR_CODES.flowInvalidName,
    ]).toEqual([
      'flow/workspace-unavailable',
      'flow/not-found',
      'flow/name-taken',
      'flow/invalid-name',
    ]);
  });

  /**
   * The resolver's vocabulary — the spec's seven, plus the two lifecycle
   * refusals. "gh missing" and "gh not authenticated" are different failures
   * with different fixes (§8.1: `brew install gh` vs `gh auth login`), and
   * the error surface tells them apart by code alone.
   */
  it('tell the repo refusals apart', () => {
    expect([
      ERROR_CODES.repoInvalidUrl,
      ERROR_CODES.repoUnsupportedHost,
      ERROR_CODES.repoAlreadyConnected,
      ERROR_CODES.repoGhMissing,
      ERROR_CODES.repoGhUnauthenticated,
      ERROR_CODES.repoCloneFailed,
      ERROR_CODES.repoAppConfigUnreadable,
      ERROR_CODES.repoResolveNotFound,
      ERROR_CODES.repoNotFound,
    ]).toEqual([
      'repo/invalid-url',
      'repo/unsupported-host',
      'repo/already-connected',
      'repo/gh-missing',
      'repo/gh-unauthenticated',
      'repo/clone-failed',
      'repo/app-config-unreadable',
      'repo/resolve-not-found',
      'repo/not-found',
    ]);
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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Device, Result } from '@shared/ipc';
import { ERROR_CODES } from '@shared/ipc';
import type { SnapshotView, TreeNode } from '@shared/types';
import { describe, expect, it, vi } from 'vitest';
import { parseHierarchy } from '../maestro/HierarchyParser';
import type { MaestroGateway } from '../maestro/MaestroGateway';
import { SnapshotService } from './snapshot.service';

/**
 * The frozen `{hierarchy, screenshot, scale}` §5.5 hovers against. The traps:
 * scale is calibrated from the widest node that *carries* bounds — the real
 * root does not (§5.2's amendment) — and synthesis only ever runs against the
 * tree the renderer is hovering, which is what the per-device currency check
 * enforces (criterion 5).
 */

const CAPTURE = readFileSync(resolve('src/main/maestro/inspect-screen.capture.json'), 'utf8');

/** A syntactically real PNG header declaring `width` × `height`. */
function png(width: number, height: number): Buffer {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode('IHDR'), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return Buffer.from(bytes);
}

const node = (over: Partial<TreeNode> = {}): TreeNode => ({
  bounds: null,
  className: null,
  text: null,
  resourceId: null,
  contentDescription: null,
  hintText: null,
  scrollable: null,
  clickable: null,
  enabled: null,
  focused: null,
  selected: null,
  checked: null,
  children: [],
  ...over,
});

type Gateway = MaestroGateway & {
  hierarchyCalls: string[];
  screenshotCalls: string[];
  tree: TreeNode;
  shot: Buffer;
  hierarchyFailure: Error | null;
  screenshotFailure: Error | null;
};

function coded(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

function fakeGateway(tree: TreeNode = parseHierarchy(CAPTURE)): Gateway {
  const gateway: Gateway = {
    hierarchyCalls: [],
    screenshotCalls: [],
    tree,
    shot: png(720, 1600),
    hierarchyFailure: null,
    screenshotFailure: null,
    listDevices: (): Promise<Device[]> =>
      Promise.reject(new Error('SnapshotService does not list devices.')),
    deviceProperties: () =>
      Promise.reject(new Error('SnapshotService does not read device properties.')),
    appIdentity: () => Promise.reject(new Error('SnapshotService does not read app identity.')),
    startMirror: () => Promise.reject(new Error('SnapshotService does not open mirrors.')),
    hierarchy: (deviceId) => {
      gateway.hierarchyCalls.push(deviceId);
      return gateway.hierarchyFailure === null
        ? Promise.resolve(gateway.tree)
        : Promise.reject(gateway.hierarchyFailure);
    },
    screenshot: (deviceId) => {
      gateway.screenshotCalls.push(deviceId);
      return gateway.screenshotFailure === null
        ? Promise.resolve(gateway.shot)
        : Promise.reject(gateway.screenshotFailure);
    },
  };
  return gateway;
}

function view(result: Result<SnapshotView>): SnapshotView {
  if (!result.ok) {
    throw new Error(`Expected a snapshot, got ${result.error.code}: ${result.error.message}`);
  }
  return result.data;
}

function code(result: Result<unknown>): string {
  if (result.ok) {
    throw new Error('Expected a failure, got a snapshot.');
  }
  return result.error.code;
}

/* ── capturing ──────────────────────────────────────────────────────────── */

describe('capturing a snapshot', () => {
  /** Criterion 1 — the two captures run concurrently: the screenshot must not
   * wait for the hierarchy's ~300ms, nor the other way round. */
  it('starts the hierarchy and the screenshot before either resolves', async () => {
    const gateway = fakeGateway();
    let release: () => void = () => {};
    const held = new Promise<void>((resolveHeld) => {
      release = resolveHeld;
    });
    const tree = gateway.tree;
    gateway.hierarchy = (deviceId) => {
      gateway.hierarchyCalls.push(deviceId);
      return held.then(() => tree);
    };
    const service = new SnapshotService({ gateway });

    const capture = service.capture('R9QYC01EMXL');
    // The hierarchy is still pending; a sequential implementation would not
    // have asked for the screenshot yet.
    await Promise.resolve();
    expect(gateway.hierarchyCalls).toEqual(['R9QYC01EMXL']);
    expect(gateway.screenshotCalls).toEqual(['R9QYC01EMXL']);

    release();
    const result = view(await capture);
    expect(result.tree).toEqual(tree);
  });

  it('answers the parsed tree, the screenshot size, the scale and a fresh id', async () => {
    const service = new SnapshotService({ gateway: fakeGateway() });

    const first = view(await service.capture('R9QYC01EMXL'));
    const second = view(await service.capture('R9QYC01EMXL'));

    // The capture's widest bounds are 720 wide, matching the 720px screenshot.
    expect(first.scale).toBe(1);
    expect(first.screenshotWidth).toBe(720);
    expect(first.screenshotHeight).toBe(1600);
    expect(first.tree.children.length).toBeGreaterThan(0);
    expect(second.snapshotId).not.toBe(first.snapshotId);
  });

  /**
   * Criterion 2 and §5.2's amendment: the real root carries no bounds at all,
   * so the anchor is the widest node that does. Here the widest bounded node is
   * 360 units wide under a 720px screenshot — an iOS-shaped 2× screen.
   */
  it('calibrates against the widest node that carries bounds, never the root', async () => {
    const gateway = fakeGateway(
      node({
        children: [
          node({ bounds: { x1: 0, y1: 0, x2: 180, y2: 400 } }),
          node({ bounds: { x1: 0, y1: 0, x2: 360, y2: 800 } }),
        ],
      }),
    );
    const service = new SnapshotService({ gateway });

    expect(view(await service.capture('device')).scale).toBe(2);
  });

  /** Criterion 3 — a tree with no bounds anywhere has nothing to calibrate
   * against, and a guessed scale is a hit-test that selects the wrong element. */
  it('refuses a tree in which no node carries bounds', async () => {
    const gateway = fakeGateway(node({ children: [node(), node()] }));
    const service = new SnapshotService({ gateway });

    expect(code(await service.capture('device'))).toBe(ERROR_CODES.snapshotNoBounds);
  });

  /** Criterion 4 — the underlying code, untranslated: the doctor tells "the
   * mcp session died" from "screencap produced nothing" by it. */
  it('answers the hierarchy failure with its own stable code', async () => {
    const gateway = fakeGateway();
    gateway.hierarchyFailure = coded(ERROR_CODES.mcpCallFailed, 'inspect_screen refused.');
    const service = new SnapshotService({ gateway });

    expect(code(await service.capture('device'))).toBe(ERROR_CODES.mcpCallFailed);
  });

  it('answers the screenshot failure with its own stable code', async () => {
    const gateway = fakeGateway();
    gateway.screenshotFailure = coded(ERROR_CODES.captureFailed, 'screencap produced nothing.');
    const service = new SnapshotService({ gateway });

    expect(code(await service.capture('device'))).toBe(ERROR_CODES.captureFailed);
  });

  it('reports both captures failing as one failure, not an unhandled rejection', async () => {
    const gateway = fakeGateway();
    gateway.hierarchyFailure = coded(ERROR_CODES.mcpCallFailed, 'gone');
    gateway.screenshotFailure = coded(ERROR_CODES.captureFailed, 'gone too');
    const service = new SnapshotService({ gateway });

    expect(code(await service.capture('device'))).toBe(ERROR_CODES.mcpCallFailed);
  });

  /** Criterion 4's other half. `coded` shapes a Node system error — `spawn`
   * failing carries `ENOENT`, a string `code` that is not one of ours. Letting
   * it through types an arbitrary errno as an `ErrorCode`, and the doctor reads
   * those codes to tell one prerequisite from another. */
  it('falls back to its own code when the failure carries a foreign one', async () => {
    const gateway = fakeGateway();
    gateway.screenshotFailure = coded('ENOENT', 'spawn adb ENOENT');
    const service = new SnapshotService({ gateway });

    expect(code(await service.capture('device'))).toBe(ERROR_CODES.captureFailed);
  });

  it('refuses a screenshot that is not a readable PNG', async () => {
    const gateway = fakeGateway();
    gateway.shot = Buffer.from('definitely not a picture');
    const service = new SnapshotService({ gateway });

    expect(code(await service.capture('device'))).toBe(ERROR_CODES.captureFailed);
  });

  /** Criterion 6 — the screenshot's bytes exist to calibrate, and nothing in
   * this spec renders them. They must not ride an IPC answer at ~1MB a go. */
  it('sends no screenshot bytes in the snapshot view', async () => {
    const service = new SnapshotService({ gateway: fakeGateway() });

    const result = view(await service.capture('device'));
    expect(Object.keys(result).sort()).toEqual([
      'scale',
      'screenshotHeight',
      'screenshotWidth',
      'snapshotId',
      'tree',
    ]);
  });
});

/* ── synthesis and currency ─────────────────────────────────────────────── */

describe('synthesising against the held snapshot', () => {
  it('synthesises a selector for a path of the current snapshot', async () => {
    const service = new SnapshotService({ gateway: fakeGateway() });
    const snapshot = view(await service.capture('device'));

    // The status-bar clock: a unique resource-id, so the first rung answers.
    const result = service.synthesize(snapshot.snapshotId, [2, 2, 0, 0, 0, 0, 0, 0, 0]);
    expect(result).toEqual({
      ok: true,
      data: { level: 'id', selector: 'id: "com.android.systemui:id/clock"', fragile: false },
    });
  });

  /** Criterion 5 — a snapshot that was replaced is a tree the user is no
   * longer seeing, and synthesising against it writes a selector for a screen
   * that is gone. */
  it('refuses a snapshotId that is no longer current', async () => {
    const service = new SnapshotService({ gateway: fakeGateway() });
    const first = view(await service.capture('device'));
    await service.capture('device');

    expect(code(service.synthesize(first.snapshotId, []))).toBe(ERROR_CODES.snapshotStale);
  });

  it('refuses a snapshotId that was never issued', () => {
    const service = new SnapshotService({ gateway: fakeGateway() });

    expect(code(service.synthesize('snapshot-imagined', []))).toBe(ERROR_CODES.snapshotStale);
  });

  it('holds one current snapshot per device, not one overall', async () => {
    const service = new SnapshotService({ gateway: fakeGateway() });
    const phone = view(await service.capture('phone'));
    const tablet = view(await service.capture('tablet'));

    expect(service.synthesize(phone.snapshotId, [0]).ok).toBe(true);
    expect(service.synthesize(tablet.snapshotId, [0]).ok).toBe(true);
  });

  /** A failed capture must not tear down the snapshot the renderer still has —
   * "no partial snapshot" cuts both ways. */
  it('keeps the previous snapshot when a recapture fails', async () => {
    const gateway = fakeGateway();
    const service = new SnapshotService({ gateway });
    const first = view(await service.capture('device'));

    gateway.hierarchyFailure = coded(ERROR_CODES.mcpCallFailed, 'gone');
    expect((await service.capture('device')).ok).toBe(false);

    expect(service.synthesize(first.snapshotId, [0]).ok).toBe(true);
  });

  it('answers the synthesis failure code for a path the tree does not have', async () => {
    const service = new SnapshotService({ gateway: fakeGateway() });
    const snapshot = view(await service.capture('device'));

    expect(code(service.synthesize(snapshot.snapshotId, [99, 99]))).toBe(
      ERROR_CODES.selectorNodeMissing,
    );
  });

  /** §5.4: 0 matches → "não escrever; **logar**". The refusal crosses as a
   * value, so main must leave its own trail — a bug nobody logged is a bug
   * only the user who hit it knows about. */
  it('logs the 0-match case in main, beside refusing it', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    // A node nothing can name: no id, no text, no bounds.
    const gateway = fakeGateway(
      node({ bounds: { x1: 0, y1: 0, x2: 100, y2: 100 }, children: [node()] }),
    );
    const service = new SnapshotService({ gateway });
    const snapshot = view(await service.capture('device'));

    expect(code(service.synthesize(snapshot.snapshotId, [0]))).toBe(ERROR_CODES.selectorNoMatch);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

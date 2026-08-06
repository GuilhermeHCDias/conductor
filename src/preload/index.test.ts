import { CHANNELS, type ConductorApi, PUSH_CHANNELS } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The bridge is the whole surface of `window.conductor`, and the only thing
 * standing between a sandboxed renderer and Electron's own primitives. What is
 * asserted here is what §9.3 forbids: nothing raw crosses, and every
 * subscription hands back the way to undo itself.
 *
 * `electron` is mocked because the preload runs in neither of Vitest's two
 * environments — it is the seam, so it is what gets replaced.
 */

const exposed: Record<string, unknown> = {};
const listeners: Array<{ channel: string; listener: (...args: unknown[]) => void }> = [];
const removed: Array<{ channel: string; listener: (...args: unknown[]) => void }> = [];
const invoked: Array<{ channel: string; args: unknown[] }> = [];

vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (key: string, value: Record<string, unknown>) => {
      exposed[key] = value;
    },
  },
  ipcRenderer: {
    invoke: (channel: string, ...args: unknown[]) => {
      invoked.push({ channel, args });
      return Promise.resolve({ ok: true, data: null });
    },
    on: (channel: string, listener: (...args: unknown[]) => void) => {
      listeners.push({ channel, listener });
    },
    removeListener: (channel: string, listener: (...args: unknown[]) => void) => {
      removed.push({ channel, listener });
    },
  },
}));

let api: ConductorApi;

beforeEach(async () => {
  listeners.length = 0;
  removed.length = 0;
  invoked.length = 0;
  await import('./index');
  api = exposed.conductor as ConductorApi;
});

describe('the bridge', () => {
  it('is exposed under one global and no other', () => {
    expect(Object.keys(exposed)).toEqual(['conductor']);
  });

  /** Criterion 26 — one named function per channel, and nothing beyond them. */
  it('exposes exactly one function per channel, and no primitive', () => {
    expect(Object.keys(api).sort()).toEqual([
      'appInfo',
      'appReadClipboard',
      'appWriteClipboard',
      'configGet',
      'deviceAppInfo',
      'deviceList',
      'flowCreate',
      'flowCreateFolder',
      'flowDelete',
      'flowDeleteFolder',
      'flowDuplicate',
      'flowList',
      'flowRead',
      'flowRename',
      'flowRenameFolder',
      'flowSave',
      'maestroSnapshot',
      'maestroSynthesizeSelector',
      'mirrorInput',
      'mirrorStart',
      'mirrorStop',
      'onDeviceChanged',
      'onFlowChanged',
      'onMirrorEvent',
      'onRepoChanged',
      'onRepoResolveEvent',
      'onRunEvent',
      'repoConnect',
      'repoList',
      'repoResolve',
      'repoSwitch',
      'runCancel',
      'runStart',
    ]);
  });

  /** Criterion 24 — no surface of the Viewer is left reachable from the
   * renderer, the bridge included. */
  it('exposes no way to open a viewer', () => {
    expect(api as unknown as Record<string, unknown>).not.toHaveProperty('viewerOpen');
  });

  it('exposes no ipcRenderer, send or invoke of its own', () => {
    const surface = api as unknown as Record<string, unknown>;

    expect(surface.ipcRenderer).toBeUndefined();
    expect(surface.send).toBeUndefined();
    expect(surface.invoke).toBeUndefined();
    expect(surface.sendSync).toBeUndefined();
  });

  it('forwards each invoke to its own channel, with the arguments untouched', async () => {
    const tap = { type: 'tap', x: 232, y: 534, screenWidth: 464, screenHeight: 1024 } as const;
    await api.mirrorStart('R9QYC01EMXL');
    await api.mirrorStop('mirror-1');
    await api.deviceAppInfo('R9QYC01EMXL');
    await api.mirrorInput('mirror-1', tap);
    await api.maestroSnapshot('R9QYC01EMXL');
    await api.maestroSynthesizeSelector('snapshot-1', [1, 2, 0]);
    await api.runStart('R9QYC01EMXL', 'appId: x\n---\n- launchApp\n');
    await api.runCancel('run-1');
    await api.flowList();
    await api.flowRead('checkout/pix.yml');
    await api.flowSave('checkout/pix.yml', 'appId: x\n---\n');
    await api.flowCreate('checkout', 'card');
    await api.flowCreateFolder('drafts');
    await api.flowRename('checkout/pix.yml', 'pix-2');
    await api.flowRenameFolder('drafts', 'ideas');
    await api.flowDuplicate('checkout/pix.yml');
    await api.flowDelete('checkout/pix.yml');
    await api.flowDeleteFolder('drafts');
    await api.repoList();
    await api.repoResolve('github.com/loja-verde/pnp-fast-mode');
    await api.repoConnect(3);
    await api.repoSwitch('loja-verde-pnp-fast-mode-1a2b3c4d');
    await api.appReadClipboard();
    await api.appWriteClipboard('gh auth login');

    expect(invoked).toEqual([
      { channel: CHANNELS.mirrorStart, args: ['R9QYC01EMXL'] },
      { channel: CHANNELS.mirrorStop, args: ['mirror-1'] },
      { channel: CHANNELS.deviceAppInfo, args: ['R9QYC01EMXL'] },
      { channel: CHANNELS.mirrorInput, args: ['mirror-1', tap] },
      { channel: CHANNELS.maestroSnapshot, args: ['R9QYC01EMXL'] },
      { channel: CHANNELS.maestroSynthesizeSelector, args: ['snapshot-1', [1, 2, 0]] },
      { channel: CHANNELS.runStart, args: ['R9QYC01EMXL', 'appId: x\n---\n- launchApp\n'] },
      { channel: CHANNELS.runCancel, args: ['run-1'] },
      { channel: CHANNELS.flowList, args: [] },
      { channel: CHANNELS.flowRead, args: ['checkout/pix.yml'] },
      { channel: CHANNELS.flowSave, args: ['checkout/pix.yml', 'appId: x\n---\n'] },
      { channel: CHANNELS.flowCreate, args: ['checkout', 'card'] },
      { channel: CHANNELS.flowCreateFolder, args: ['drafts'] },
      { channel: CHANNELS.flowRename, args: ['checkout/pix.yml', 'pix-2'] },
      { channel: CHANNELS.flowRenameFolder, args: ['drafts', 'ideas'] },
      { channel: CHANNELS.flowDuplicate, args: ['checkout/pix.yml'] },
      { channel: CHANNELS.flowDelete, args: ['checkout/pix.yml'] },
      { channel: CHANNELS.flowDeleteFolder, args: ['drafts'] },
      { channel: CHANNELS.repoList, args: [] },
      { channel: CHANNELS.repoResolve, args: ['github.com/loja-verde/pnp-fast-mode'] },
      { channel: CHANNELS.repoConnect, args: [3] },
      { channel: CHANNELS.repoSwitch, args: ['loja-verde-pnp-fast-mode-1a2b3c4d'] },
      { channel: CHANNELS.appReadClipboard, args: [] },
      { channel: CHANNELS.appWriteClipboard, args: ['gh auth login'] },
    ]);
  });

  /**
   * §9.3 and criterion 5. Input is the one thing the renderer sends *at* the
   * device, so it is worth saying out loud that it still crosses as a named
   * function taking typed fields — never a command, never a composed string.
   */
  it('carries input as a structured value rather than anything command-shaped', async () => {
    await api.mirrorInput('mirror-1', { type: 'text', text: '; rm -rf /' });

    expect(invoked.at(-1)?.args[1]).toEqual({ type: 'text', text: '; rm -rf /' });
    expect(typeof invoked.at(-1)?.args[1]).toBe('object');
  });
});

/** Criterion 32. At 60 frames a second, a listener left behind is a memory leak
 * with a framerate on it. */
describe('a subscription', () => {
  it.each([
    ['onDeviceChanged', PUSH_CHANNELS.deviceChanged],
    ['onMirrorEvent', PUSH_CHANNELS.mirrorEvent],
    ['onRunEvent', PUSH_CHANNELS.runEvent],
    ['onFlowChanged', PUSH_CHANNELS.flowChanged],
    ['onRepoChanged', PUSH_CHANNELS.repoChanged],
    ['onRepoResolveEvent', PUSH_CHANNELS.repoResolveEvent],
  ] as const)('%s listens on its own channel', (name, channel) => {
    api[name](() => {});

    expect(listeners.map((entry) => entry.channel)).toEqual([channel]);
  });

  it.each([
    'onDeviceChanged',
    'onMirrorEvent',
    'onRunEvent',
    'onFlowChanged',
    'onRepoChanged',
    'onRepoResolveEvent',
  ] as const)('%s returns the unsubscribe that removes exactly its own listener', (name) => {
    const unsubscribe = api[name](() => {});

    unsubscribe();

    expect(removed).toEqual([listeners[0]]);
  });

  /** The event object carries `sender` — a live `WebContents` handle. Handing
   * that to the renderer would undo the bridge. */
  it('never passes the Electron event through to the renderer', () => {
    const seen: unknown[] = [];
    api.onMirrorEvent((payload) => {
      seen.push(payload);
    });
    const payload = { ok: true, data: { type: 'ended', sessionId: 'mirror-1' } };

    listeners[0]?.listener({ sender: 'a live WebContents' }, payload);

    expect(seen).toEqual([payload]);
  });
});

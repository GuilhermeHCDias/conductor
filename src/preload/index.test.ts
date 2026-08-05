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
      'configGet',
      'deviceAppInfo',
      'deviceList',
      'mirrorInput',
      'mirrorStart',
      'mirrorStop',
      'onDeviceChanged',
      'onMirrorEvent',
      'viewerOpen',
    ]);
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

    expect(invoked).toEqual([
      { channel: CHANNELS.mirrorStart, args: ['R9QYC01EMXL'] },
      { channel: CHANNELS.mirrorStop, args: ['mirror-1'] },
      { channel: CHANNELS.deviceAppInfo, args: ['R9QYC01EMXL'] },
      { channel: CHANNELS.mirrorInput, args: ['mirror-1', tap] },
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

/** Criterion 32. At 30 frames a second, a listener left behind is a memory leak
 * with a framerate on it. */
describe('a subscription', () => {
  it.each([
    ['onDeviceChanged', PUSH_CHANNELS.deviceChanged],
    ['onMirrorEvent', PUSH_CHANNELS.mirrorEvent],
  ] as const)('%s listens on its own channel', (name, channel) => {
    api[name](() => {});

    expect(listeners.map((entry) => entry.channel)).toEqual([channel]);
  });

  it.each(['onDeviceChanged', 'onMirrorEvent'] as const)(
    '%s returns the unsubscribe that removes exactly its own listener',
    (name) => {
      const unsubscribe = api[name](() => {});

      unsubscribe();

      expect(removed).toEqual([listeners[0]]);
    },
  );

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

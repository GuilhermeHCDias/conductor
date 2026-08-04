import { CHANNELS, IPC, type Result } from '@shared/ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: unknown, ...args: unknown[]) => Promise<unknown>;

const listeners = new Map<string, Listener>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: Listener) => {
      listeners.set(channel, listener);
    },
  },
  BrowserWindow: {
    fromWebContents: vi.fn(() => ({ id: 1 })),
  },
}));

vi.mock('../window', () => ({
  isRendererUrl: (url: string) => url === RENDERER_URL,
}));

const RENDERER_URL = 'http://localhost:5173/index.html';

const { handle, handleResult } = await import('./handle');
const { BrowserWindow } = await import('electron');

const appInfo = {
  appVersion: '0.1.0',
  electronVersion: '43.2.0',
  chromeVersion: '140.0.0',
  nodeVersion: '24.18.0',
  platform: 'darwin',
};

/** A sender that passes every check: the window's own top frame, on the
 * renderer's own URL. Individual tests break exactly one of those. */
function trustedEvent(): unknown {
  const mainFrame = { url: RENDERER_URL };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

function register(fn: () => unknown = () => appInfo): Listener {
  handle(CHANNELS.appInfo, IPC[CHANNELS.appInfo].request, fn as () => typeof appInfo);
  const listener = listeners.get(CHANNELS.appInfo);
  if (listener === undefined) {
    throw new Error('handle() did not register a listener');
  }
  return listener;
}

beforeEach(() => {
  listeners.clear();
  vi.mocked(BrowserWindow.fromWebContents).mockReturnValue({ id: 1 } as never);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('handle', () => {
  it('returns the handler result as a success Result for a trusted sender', async () => {
    const listener = register();

    await expect(listener(trustedEvent())).resolves.toEqual({ ok: true, data: appInfo });
  });

  it('rejects a subframe without invoking the handler', async () => {
    const fn = vi.fn(() => appInfo);
    const listener = register(fn);
    const subframe = { url: RENDERER_URL };
    const event = { senderFrame: subframe, sender: { mainFrame: { url: RENDERER_URL } } };

    const result = await listener(event);

    expect(result).toEqual({
      ok: false,
      error: { code: 'ipc/untrusted-sender', message: expect.stringContaining('app:info') },
    });
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects a frame that has navigated off the renderer URL', async () => {
    const fn = vi.fn(() => appInfo);
    const listener = register(fn);
    const mainFrame = { url: 'https://evil.example/index.html' };

    const result = await listener({ senderFrame: mainFrame, sender: { mainFrame } });

    expect(result).toMatchObject({ ok: false, error: { code: 'ipc/untrusted-sender' } });
    expect(fn).not.toHaveBeenCalled();
  });

  it('rejects a sender whose WebContents belongs to no window', async () => {
    vi.mocked(BrowserWindow.fromWebContents).mockReturnValue(null as never);
    const fn = vi.fn(() => appInfo);
    const listener = register(fn);

    const result = await listener(trustedEvent());

    expect(result).toMatchObject({ ok: false, error: { code: 'ipc/untrusted-sender' } });
    expect(fn).not.toHaveBeenCalled();
  });

  // Electron destroys the frame when the renderer reloads or the window closes;
  // a WebFrameMain outlives it as an object whose getters throw. An invoke that
  // races either one must still come back as a value.
  it('returns a Result when reading senderFrame throws on a destroyed frame', async () => {
    const fn = vi.fn(() => appInfo);
    const listener = register(fn);
    const event = {
      get senderFrame(): never {
        throw new Error('Render frame was disposed before WebFrameMain could be accessed');
      },
      sender: {},
    };

    const result = await listener(event);

    expect(result).toMatchObject({ ok: false, error: { code: 'ipc/untrusted-sender' } });
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns a Result when reading the frame URL throws on a destroyed frame', async () => {
    const fn = vi.fn(() => appInfo);
    const listener = register(fn);
    const mainFrame = {
      get url(): never {
        throw new Error('Render frame was disposed before WebFrameMain could be accessed');
      },
    };

    const result = await listener({ senderFrame: mainFrame, sender: { mainFrame } });

    expect(result).toMatchObject({ ok: false, error: { code: 'ipc/untrusted-sender' } });
    expect(fn).not.toHaveBeenCalled();
  });

  it('returns invalid-args without invoking the handler when parsing fails', async () => {
    const fn = vi.fn(() => appInfo);
    const listener = register(fn);

    const result = await listener(trustedEvent(), 'unexpected');

    expect(result).toMatchObject({ ok: false, error: { code: 'ipc/invalid-args' } });
    expect(fn).not.toHaveBeenCalled();
  });

  it('converts a throwing handler into a failure Result and logs it in main', async () => {
    const listener = register(() => {
      throw new Error('service exploded');
    });

    const result = await listener(trustedEvent());

    expect(result).toMatchObject({ ok: false, error: { code: 'ipc/handler-failed' } });
    // Throwing across IPC is reserved for bugs, so a bug that never reaches a
    // log is a bug nobody can diagnose.
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('app:info'),
      expect.any(Error),
    );
  });

  it('converts a rejected async handler into a failure Result', async () => {
    const listener = register(() => Promise.reject(new Error('async explosion')));

    await expect(listener(trustedEvent())).resolves.toMatchObject({
      ok: false,
      error: { code: 'ipc/handler-failed' },
    });
  });
});

/**
 * The variant for services that fail as a value. `adb` missing is not a bug and
 * not a snapshot either — it is a stable code the doctor reads, so the handler
 * produces the whole `Result` and the guard passes it through rather than
 * wrapping a second one around it.
 */
describe('handleResult', () => {
  const snapshot = { devices: [], selectedId: null, properties: null };

  function registerResult(fn: () => unknown): Listener {
    handleResult(
      CHANNELS.deviceList,
      IPC[CHANNELS.deviceList].request,
      fn as () => Result<typeof snapshot>,
    );
    const listener = listeners.get(CHANNELS.deviceList);
    if (listener === undefined) {
      throw new Error('handleResult() did not register a listener');
    }
    return listener;
  }

  it('passes a success Result through untouched', async () => {
    const listener = registerResult(() => ({ ok: true, data: snapshot }));

    await expect(listener(trustedEvent())).resolves.toEqual({ ok: true, data: snapshot });
  });

  it('passes a handler-produced failure through with its own code', async () => {
    const listener = registerResult(() => ({
      ok: false,
      error: { code: 'device/adb-not-found', message: 'No adb on this machine.' },
    }));

    await expect(listener(trustedEvent())).resolves.toEqual({
      ok: false,
      error: { code: 'device/adb-not-found', message: 'No adb on this machine.' },
    });
  });

  it('checks the sender before invoking the handler', async () => {
    const fn = vi.fn(() => ({ ok: true, data: snapshot }));
    const listener = registerResult(fn);
    const mainFrame = { url: 'https://evil.example/index.html' };

    const result = await listener({ senderFrame: mainFrame, sender: { mainFrame } });

    expect(result).toMatchObject({ ok: false, error: { code: 'ipc/untrusted-sender' } });
    expect(fn).not.toHaveBeenCalled();
  });

  it('parses the arguments before invoking the handler', async () => {
    const fn = vi.fn(() => ({ ok: true, data: snapshot }));
    const listener = registerResult(fn);

    const result = await listener(trustedEvent(), 'unexpected');

    expect(result).toMatchObject({ ok: false, error: { code: 'ipc/invalid-args' } });
    expect(fn).not.toHaveBeenCalled();
  });

  // A service that throws is still a bug, and still has to leave as a value.
  it('converts a throwing handler into a failure Result', async () => {
    const listener = registerResult(() => {
      throw new Error('service exploded');
    });

    await expect(listener(trustedEvent())).resolves.toMatchObject({
      ok: false,
      error: { code: 'ipc/handler-failed' },
    });
  });
});

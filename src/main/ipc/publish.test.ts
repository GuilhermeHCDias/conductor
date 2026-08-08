import type { Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublishService } from '../services/publish.service';

/**
 * The publish IPC module is a thin controller: validate, call one service
 * method, hand the `Result` back. The push halves — `publish:changed` and
 * `publish:event` — are the composition root's, not these handlers'.
 */

type Listener = (event: unknown, ...args: unknown[]) => Promise<unknown>;
const listeners = new Map<string, Listener>();

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: Listener) => {
      listeners.set(channel, listener);
    },
  },
  BrowserWindow: { fromWebContents: vi.fn(() => ({ id: 1 })) },
}));

vi.mock('../window', () => ({ isRendererUrl: (url: string) => url === RENDERER_URL }));

const RENDERER_URL = 'http://localhost:5173/index.html';

const { registerPublishIpc } = await import('./publish');

function trustedEvent(): unknown {
  const mainFrame = { url: RENDERER_URL };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

const STATE = { repo: 'loja-verde-pnp-1a2b3c4d', changes: [], reviewOpen: false };

/** Every method answers ok with a recognizable payload, so pass-through is
 * visible; a test that needs a failure swaps one in. */
function fakePublish(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    status: vi.fn(() => Promise.resolve({ ok: true, data: STATE })),
    describe: vi.fn(() => Promise.resolve({ ok: true, data: { describeId: 1 } })),
    send: vi.fn(() => Promise.resolve({ ok: true, data: { sendId: 2 } })),
    cancel: vi.fn(() => ({ ok: true, data: { jobId: 1 } })),
    openPr: vi.fn(() =>
      Promise.resolve({ ok: true, data: { url: 'https://github.com/o/r/pull/7' } }),
    ),
  };
}

let publish: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  listeners.clear();
  publish = fakePublish();
  registerPublishIpc({ publish: publish as unknown as PublishService });
});

async function invoke(channel: string, ...args: unknown[]): Promise<Result<unknown>> {
  const listener = listeners.get(channel);
  if (listener === undefined) {
    throw new Error(`No handler registered for ${channel}.`);
  }
  return (await listener(trustedEvent(), ...args)) as Result<unknown>;
}

describe('registerPublishIpc', () => {
  it('registers exactly the five publish channels', () => {
    expect([...listeners.keys()].sort()).toEqual([
      'publish:cancel',
      'publish:describe',
      'publish:open-pr',
      'publish:send',
      'publish:status',
    ]);
  });

  /** Thin controllers: one channel, one method, the arguments verbatim. */
  it.each([
    ['publish:status', [], 'status', []],
    ['publish:describe', [], 'describe', []],
    [
      'publish:send',
      ['The login test goes back.', 'login.yml'],
      'send',
      ['The login test goes back.', 'login.yml'],
    ],
    ['publish:send', ['', null], 'send', ['', null]],
    ['publish:cancel', [1], 'cancel', [1]],
    ['publish:open-pr', [], 'openPr', []],
  ] as const)('%s calls %s', async (channel, args, method, methodArgs) => {
    const result = await invoke(channel, ...args);

    expect(result.ok).toBe(true);
    expect(publish[method]).toHaveBeenCalledExactlyOnceWith(...methodArgs);
  });

  /** The stable code survives the trip — the sheet's surface is built from it. */
  it('hands a service refusal back untouched', async () => {
    publish.send?.mockResolvedValueOnce({
      ok: false,
      error: { code: 'publish/nothing-to-send', message: 'There is nothing new to send.' },
    });

    const result = await invoke('publish:send', 'note', null);

    expect(result).toEqual({
      ok: false,
      error: { code: 'publish/nothing-to-send', message: 'There is nothing new to send.' },
    });
  });

  /** Criterion 32 — the note's bound refuses at the boundary. */
  it('refuses malformed arguments before the service runs', async () => {
    const oversized = await invoke('publish:send', 'x'.repeat(10_001), null);
    const unnumbered = await invoke('publish:cancel', 'describe-1');

    expect(oversized.ok ? '' : oversized.error.code).toBe('ipc/invalid-args');
    expect(unnumbered.ok ? '' : unnumbered.error.code).toBe('ipc/invalid-args');
    expect(publish.send).not.toHaveBeenCalled();
    expect(publish.cancel).not.toHaveBeenCalled();
  });

  /** The guard is `handle.ts`'s, inherited by construction — one probe proves
   * the wiring actually goes through it. */
  it('refuses an untrusted sender before the service runs', async () => {
    const listener = listeners.get('publish:send');
    const foreign = { senderFrame: { url: 'https://example.com' }, sender: { mainFrame: null } };

    const result = (await listener?.(foreign, 'note', null)) as Result<unknown>;

    expect(result.ok ? '' : result.error.code).toBe('ipc/untrusted-sender');
    expect(publish.send).not.toHaveBeenCalled();
  });
});

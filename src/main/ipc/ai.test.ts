import type { Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AiService } from '../services/ai.service';

/**
 * The AI IPC module is a thin controller: validate, call one service method,
 * hand the `Result` back. The push half — `ai:event` — is the composition
 * root's, not these handlers'. Criterion 14: every handler goes through
 * `handle.ts`, so the sender check and the schema parse hold by construction.
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

const { registerAiIpc } = await import('./ai');

function trustedEvent(): unknown {
  const mainFrame = { url: RENDERER_URL };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

function fakeAi(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    send: vi.fn(() => Promise.resolve({ ok: true, data: { turnId: 'turn-1' } })),
    cancel: vi.fn(() => ({ ok: true, data: { turnId: 'turn-1' } })),
    reset: vi.fn(() => ({ ok: true, data: { turnId: null } })),
    status: vi.fn(() => ({ ok: true, data: { ready: true } })),
  };
}

let ai: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  listeners.clear();
  ai = fakeAi();
  registerAiIpc({ ai: ai as unknown as AiService });
});

async function invoke(channel: string, ...args: unknown[]): Promise<Result<unknown>> {
  const listener = listeners.get(channel);
  if (listener === undefined) {
    throw new Error(`No handler registered for ${channel}.`);
  }
  return (await listener(trustedEvent(), ...args)) as Result<unknown>;
}

describe('registerAiIpc', () => {
  it('registers exactly the four ai channels', () => {
    expect([...listeners.keys()].sort()).toEqual(['ai:cancel', 'ai:reset', 'ai:send', 'ai:status']);
  });

  it.each([
    ['ai:send', ['Write a login test', 'checkout/pix.yml'], 'send'],
    ['ai:send', ['Write a login test', null], 'send'],
    ['ai:cancel', [], 'cancel'],
    ['ai:reset', [], 'reset'],
    ['ai:status', [], 'status'],
  ] as const)('%s calls %s with the arguments verbatim', async (channel, args, method) => {
    const result = await invoke(channel, ...args);

    expect(result.ok).toBe(true);
    expect(ai[method]).toHaveBeenCalledExactlyOnceWith(...args);
  });

  it('hands a service refusal back untouched', async () => {
    ai.send?.mockResolvedValueOnce({
      ok: false,
      error: { code: 'ai/budget-exceeded', message: 'This conversation has reached its limit.' },
    });

    const result = await invoke('ai:send', 'more', null);

    expect(result).toEqual({
      ok: false,
      error: { code: 'ai/budget-exceeded', message: 'This conversation has reached its limit.' },
    });
  });

  /** Criterion 14 — bounded and non-empty at the boundary, before any work. */
  it('refuses malformed messages before the service runs', async () => {
    const empty = await invoke('ai:send', '   ', null);
    const oversized = await invoke('ai:send', 'x'.repeat(10_001), null);
    const untupled = await invoke('ai:send', 'hello');

    expect(empty.ok ? '' : empty.error.code).toBe('ipc/invalid-args');
    expect(oversized.ok ? '' : oversized.error.code).toBe('ipc/invalid-args');
    expect(untupled.ok ? '' : untupled.error.code).toBe('ipc/invalid-args');
    expect(ai.send).not.toHaveBeenCalled();
  });

  /** Criterion 14 — the guard is `handle.ts`'s, inherited by construction. */
  it('refuses an untrusted sender before the service runs', async () => {
    const listener = listeners.get('ai:send');
    const foreign = { senderFrame: { url: 'https://example.com' }, sender: { mainFrame: null } };

    const result = (await listener?.(foreign, 'oi', null)) as Result<unknown>;

    expect(result.ok ? '' : result.error.code).toBe('ipc/untrusted-sender');
    expect(ai.send).not.toHaveBeenCalled();
  });
});

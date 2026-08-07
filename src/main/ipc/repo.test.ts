import type { Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoService } from '../services/repo.service';

/**
 * The repo IPC module is a thin controller: validate, call one service
 * method, hand the `Result` back. The push halves — `repo:changed` and
 * `repo:resolve-event` — are the composition root's, not these handlers'.
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

const { registerRepoIpc } = await import('./repo');

function trustedEvent(): unknown {
  const mainFrame = { url: RENDERER_URL };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

const STATE = { repos: [], active: null };

/** Every method answers ok with a recognizable payload, so pass-through is
 * visible; a test that needs a failure swaps one in. */
function fakeRepo(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    list: vi.fn(() => Promise.resolve({ ok: true, data: STATE })),
    resolve: vi.fn(() => Promise.resolve({ ok: true, data: { resolveId: 1 } })),
    connect: vi.fn(() => Promise.resolve({ ok: true, data: STATE })),
    switch: vi.fn(() => Promise.resolve({ ok: true, data: STATE })),
  };
}

let repo: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  listeners.clear();
  repo = fakeRepo();
  registerRepoIpc({ repo: repo as unknown as RepoService });
});

async function invoke(channel: string, ...args: unknown[]): Promise<Result<unknown>> {
  const listener = listeners.get(channel);
  if (listener === undefined) {
    throw new Error(`No handler registered for ${channel}.`);
  }
  return (await listener(trustedEvent(), ...args)) as Result<unknown>;
}

describe('registerRepoIpc', () => {
  it('registers exactly the four repo channels', () => {
    expect([...listeners.keys()].sort()).toEqual([
      'repo:connect',
      'repo:list',
      'repo:resolve',
      'repo:switch',
    ]);
  });

  /** Thin controllers: one channel, one method, the arguments verbatim. */
  it.each([
    ['repo:list', [], 'list', []],
    ['repo:resolve', ['github.com/loja-verde/app'], 'resolve', ['github.com/loja-verde/app']],
    ['repo:connect', [3], 'connect', [3]],
    ['repo:switch', ['loja-verde-app-1a2b3c4d'], 'switch', ['loja-verde-app-1a2b3c4d']],
  ] as const)('%s calls %s', async (channel, args, method, methodArgs) => {
    const result = await invoke(channel, ...args);

    expect(result.ok).toBe(true);
    expect(repo[method]).toHaveBeenCalledExactlyOnceWith(...methodArgs);
  });

  /** The stable code survives the trip — the error surface is built from it. */
  it('hands a service refusal back untouched', async () => {
    repo.resolve?.mockResolvedValueOnce({
      ok: false,
      error: { code: 'repo/invalid-url', message: 'That is not a repository address.' },
    });

    const result = await invoke('repo:resolve', 'not a repository');

    expect(result).toEqual({
      ok: false,
      error: { code: 'repo/invalid-url', message: 'That is not a repository address.' },
    });
  });

  it('refuses malformed arguments before the service runs', async () => {
    const result = await invoke('repo:connect', 'one');

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.code).toBe('ipc/invalid-args');
    expect(repo.connect).not.toHaveBeenCalled();
  });

  /** The guard is `handle.ts`'s, inherited by construction — one probe proves
   * the wiring actually goes through it. */
  it('refuses an untrusted sender before the service runs', async () => {
    const listener = listeners.get('repo:resolve');
    const foreign = { senderFrame: { url: 'https://example.com' }, sender: { mainFrame: null } };

    const result = (await listener?.(foreign, 'github.com/o/a')) as Result<unknown>;

    expect(result.ok ? '' : result.error.code).toBe('ipc/untrusted-sender');
    expect(repo.resolve).not.toHaveBeenCalled();
  });
});

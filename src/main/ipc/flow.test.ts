import type { Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FlowService } from '../services/flow.service';

/**
 * The flow IPC module is a thin controller: validate, call one service
 * method, hand the `Result` back. What is tested is exactly that thinness —
 * every channel lands on its own method with its own arguments, everything
 * else (sender check, schema, error shape) is `handle.ts`, already proven.
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

const { registerFlowIpc } = await import('./flow');

function trustedEvent(): unknown {
  const mainFrame = { url: RENDERER_URL };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

/** Every method answers ok with a recognizable payload, so pass-through is
 * visible; a test that needs a failure swaps one in. */
function fakeFlow(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    list: vi.fn(() => Promise.resolve({ ok: true, data: { flows: [], folders: [] } })),
    read: vi.fn(() => Promise.resolve({ ok: true, data: { yaml: 'appId: x\n---\n' } })),
    save: vi.fn(() => Promise.resolve({ ok: true, data: { path: 'a.yaml' } })),
    createFlow: vi.fn(() => Promise.resolve({ ok: true, data: { path: 'a.yaml' } })),
    createFolder: vi.fn(() => Promise.resolve({ ok: true, data: { folder: 'drafts' } })),
    renameFlow: vi.fn(() => Promise.resolve({ ok: true, data: { path: 'b.yaml' } })),
    renameFolder: vi.fn(() => Promise.resolve({ ok: true, data: { folder: 'ideas' } })),
    duplicateFlow: vi.fn(() => Promise.resolve({ ok: true, data: { path: 'a-copy.yaml' } })),
    deleteFlow: vi.fn(() => Promise.resolve({ ok: true, data: { path: 'a.yaml' } })),
    deleteFolder: vi.fn(() => Promise.resolve({ ok: true, data: { folder: 'drafts' } })),
  };
}

let flow: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  listeners.clear();
  flow = fakeFlow();
  registerFlowIpc({ flow: flow as unknown as FlowService });
});

async function invoke(channel: string, ...args: unknown[]): Promise<Result<unknown>> {
  const listener = listeners.get(channel);
  if (listener === undefined) {
    throw new Error(`No handler registered for ${channel}.`);
  }
  return (await listener(trustedEvent(), ...args)) as Result<unknown>;
}

describe('registerFlowIpc', () => {
  it('registers exactly the ten flow channels', () => {
    expect([...listeners.keys()].sort()).toEqual([
      'flow:create',
      'flow:create-folder',
      'flow:delete',
      'flow:delete-folder',
      'flow:duplicate',
      'flow:list',
      'flow:read',
      'flow:rename',
      'flow:rename-folder',
      'flow:save',
    ]);
  });

  /** Thin controllers: one channel, one method, the arguments verbatim. */
  it.each([
    ['flow:list', [], 'list', []],
    ['flow:read', ['checkout/pix.yml'], 'read', ['checkout/pix.yml']],
    ['flow:save', ['pix.yml', 'appId: x\n---\n'], 'save', ['pix.yml', 'appId: x\n---\n']],
    ['flow:create', ['checkout', 'pix'], 'createFlow', ['checkout', 'pix']],
    ['flow:create-folder', ['drafts'], 'createFolder', ['drafts']],
    ['flow:rename', ['pix.yml', 'card'], 'renameFlow', ['pix.yml', 'card']],
    ['flow:rename-folder', ['drafts', 'ideas'], 'renameFolder', ['drafts', 'ideas']],
    ['flow:duplicate', ['pix.yml'], 'duplicateFlow', ['pix.yml']],
    ['flow:delete', ['pix.yml'], 'deleteFlow', ['pix.yml']],
    ['flow:delete-folder', ['drafts'], 'deleteFolder', ['drafts']],
  ] as const)('%s calls %s', async (channel, args, method, methodArgs) => {
    const result = await invoke(channel, ...args);

    expect(result.ok).toBe(true);
    expect(flow[method]).toHaveBeenCalledExactlyOnceWith(...methodArgs);
  });

  /** The service fails as a value and the code survives the trip — the draft
   * row's inline error is built from it. */
  it('hands a service refusal back untouched', async () => {
    flow.createFlow?.mockResolvedValueOnce({
      ok: false,
      error: { code: 'flow/name-taken', message: '“pix.yaml” already exists in this folder.' },
    });

    const result = await invoke('flow:create', '', 'pix');

    expect(result).toEqual({
      ok: false,
      error: { code: 'flow/name-taken', message: '“pix.yaml” already exists in this folder.' },
    });
  });

  it('refuses malformed arguments before the service runs', async () => {
    const result = await invoke('flow:save', 42, 'text');

    expect(result.ok).toBe(false);
    expect(result.ok ? '' : result.error.code).toBe('ipc/invalid-args');
    expect(flow.save).not.toHaveBeenCalled();
  });

  /** The guard is `handle.ts`'s, inherited by construction — one probe proves
   * the wiring actually goes through it. */
  it('refuses an untrusted sender before the service runs', async () => {
    const listener = listeners.get('flow:delete');
    const foreign = { senderFrame: { url: 'https://example.com' }, sender: { mainFrame: null } };

    const result = (await listener?.(foreign, 'pix.yml')) as Result<unknown>;

    expect(result.ok ? '' : result.error.code).toBe('ipc/untrusted-sender');
    expect(flow.deleteFlow).not.toHaveBeenCalled();
  });
});

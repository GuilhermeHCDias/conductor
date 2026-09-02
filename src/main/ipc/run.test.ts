import type { Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RunService } from '../services/run.service';

/**
 * The run IPC module is a thin controller: validate, call one service method,
 * hand the `Result` back. The push half — `run:event` — is the composition
 * root's, not these handlers'.
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
const YAML = 'appId: x\n---\n- launchApp\n';

const { registerRunIpc } = await import('./run');

function trustedEvent(): unknown {
  const mainFrame = { url: RENDERER_URL };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

/** Every method answers ok with a recognizable payload, so pass-through is
 * visible; a test that needs a failure swaps one in. */
function fakeRun(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    start: vi.fn(() => Promise.resolve({ ok: true, data: { runId: 'run-1' } })),
    cancel: vi.fn(() => ({ ok: true, data: { runId: 'run-1' } })),
    openRecording: vi.fn(() => Promise.resolve({ ok: true, data: { runId: 'run-1' } })),
  };
}

let run: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  listeners.clear();
  run = fakeRun();
  registerRunIpc({ run: run as unknown as RunService });
});

async function invoke(channel: string, ...args: unknown[]): Promise<Result<unknown>> {
  const listener = listeners.get(channel);
  if (listener === undefined) {
    throw new Error(`No handler registered for ${channel}.`);
  }
  return (await listener(trustedEvent(), ...args)) as Result<unknown>;
}

describe('registerRunIpc', () => {
  it('registers exactly the three run channels', () => {
    expect([...listeners.keys()].sort()).toEqual(['run:cancel', 'run:open-recording', 'run:start']);
  });

  /** Thin controllers: one channel, one method, the arguments verbatim —
   * the flow identity included (recording criterion 31). */
  it.each([
    [
      'run:start',
      ['R9QYC01EMXL', YAML, 'checkout/pix.yml'],
      'start',
      ['R9QYC01EMXL', YAML, 'checkout/pix.yml'],
    ],
    ['run:start', ['R9QYC01EMXL', YAML, null], 'start', ['R9QYC01EMXL', YAML, null]],
    ['run:cancel', ['run-1'], 'cancel', ['run-1']],
    ['run:open-recording', ['run-1'], 'openRecording', ['run-1']],
  ] as const)('%s calls %s', async (channel, args, method, methodArgs) => {
    const result = await invoke(channel, ...args);

    expect(result.ok).toBe(true);
    expect(run[method]).toHaveBeenCalledExactlyOnceWith(...methodArgs);
  });

  /** The stable code survives the trip — the panel's note is built from it
   * (recording criteria 18–19). */
  it('hands a service refusal back untouched', async () => {
    run.openRecording?.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'run/recording-missing',
        message: 'The video is no longer in your Movies folder.',
      },
    });

    const result = await invoke('run:open-recording', 'run-1');

    expect(result).toEqual({
      ok: false,
      error: {
        code: 'run/recording-missing',
        message: 'The video is no longer in your Movies folder.',
      },
    });
  });

  /** Recording criterion 30 — args are Zod-parsed at the boundary: a start
   * without the identity, or an open-recording carrying anything but the id,
   * never reaches the service. */
  it('refuses malformed arguments before the service runs', async () => {
    const unnamed = await invoke('run:start', 'R9QYC01EMXL', YAML);
    const pathed = await invoke('run:open-recording', 'run-1', '/Users/x/Movies/a.mp4');
    const empty = await invoke('run:open-recording');

    expect(unnamed.ok ? '' : unnamed.error.code).toBe('ipc/invalid-args');
    expect(pathed.ok ? '' : pathed.error.code).toBe('ipc/invalid-args');
    expect(empty.ok ? '' : empty.error.code).toBe('ipc/invalid-args');
    expect(run.start).not.toHaveBeenCalled();
    expect(run.openRecording).not.toHaveBeenCalled();
  });

  /** The guard is `handle.ts`'s, inherited by construction — one probe proves
   * the wiring actually goes through it. */
  it('refuses an untrusted sender before the service runs', async () => {
    const listener = listeners.get('run:open-recording');
    const foreign = { senderFrame: { url: 'https://example.com' }, sender: { mainFrame: null } };

    const result = (await listener?.(foreign, 'run-1')) as Result<unknown>;

    expect(result.ok ? '' : result.error.code).toBe('ipc/untrusted-sender');
    expect(run.openRecording).not.toHaveBeenCalled();
  });
});

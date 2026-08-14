import type { Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The app module's clipboard pair: the sandboxed renderer's permission
 * handler denies `navigator.clipboard`, so Paste and Copy cross here. Thin
 * handlers — the guard is `handle.ts`'s, the clipboard is Electron's.
 */

type Listener = (event: unknown, ...args: unknown[]) => Promise<unknown>;
const listeners = new Map<string, Listener>();

const clipboard = vi.hoisted(() => ({
  text: 'github.com/loja-verde/pnp-fast-mode',
  written: [] as string[],
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, listener: Listener) => {
      listeners.set(channel, listener);
    },
  },
  BrowserWindow: { fromWebContents: vi.fn(() => ({ id: 1 })) },
  app: { getVersion: () => '0.0.0-test' },
  clipboard: {
    readText: () => clipboard.text,
    writeText: (text: string) => {
      clipboard.written.push(text);
    },
  },
}));

vi.mock('../window', () => ({ isRendererUrl: (url: string) => url === RENDERER_URL }));

const RENDERER_URL = 'http://localhost:5173/index.html';

const { registerAppIpc } = await import('./app');

function trustedEvent(): unknown {
  const mainFrame = { url: RENDERER_URL };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

beforeEach(() => {
  listeners.clear();
  clipboard.written.length = 0;
  registerAppIpc();
});

async function invoke(channel: string, ...args: unknown[]): Promise<Result<unknown>> {
  const listener = listeners.get(channel);
  if (listener === undefined) {
    throw new Error(`No handler registered for ${channel}.`);
  }
  return (await listener(trustedEvent(), ...args)) as Result<unknown>;
}

describe('registerAppIpc', () => {
  it('registers the info, config and clipboard channels', () => {
    expect([...listeners.keys()].sort()).toEqual([
      'app:info',
      'app:read-clipboard',
      'app:write-clipboard',
      'config:get',
    ]);
  });

  /** The Paste affordance — reads on the click, through main. */
  it('answers the clipboard text on read', async () => {
    const result = await invoke('app:read-clipboard');

    expect(result).toEqual({
      ok: true,
      data: { text: 'github.com/loja-verde/pnp-fast-mode' },
    });
  });

  /** The error surface's Copy button — writes what it echoes. */
  it('writes the command on copy and echoes it back', async () => {
    const result = await invoke('app:write-clipboard', 'gh auth login');

    expect(clipboard.written).toEqual(['gh auth login']);
    expect(result).toEqual({ ok: true, data: { text: 'gh auth login' } });
  });

  /**
   * §12.6 — what crosses as CONFIG carries no appId and no repo URL. And
   * §6.4 as amended — the wire carries exactly the three fields the response
   * schema declares: budgets and binary paths are main's business, and the
   * AI conversation's ceiling in particular crosses no channel at all
   * (ai-assistant-session constraint).
   */
  it('exposes exactly the declared constants over config:get', async () => {
    const result = await invoke('config:get');

    expect(result.ok).toBe(true);
    expect(Object.keys((result as { data: Record<string, unknown> }).data).sort()).toEqual([
      'FLOWS_DIR',
      'FLOW_EXTENSIONS',
      'REPO_BASE_BRANCH',
    ]);
  });
});

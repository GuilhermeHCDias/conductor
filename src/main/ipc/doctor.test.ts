import type { Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DoctorService } from '../services/doctor.service';

/**
 * The doctor IPC module is a thin controller: validate, call one service
 * method, hand the `Result` back. The push halves — `doctor:changed` and
 * `doctor:install-event` — are the composition root's. Criterion 37: every
 * handler goes through `handle.ts`, and the renderer sends nothing — no
 * path, no URL, no command.
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

const { registerDoctorIpc } = await import('./doctor');

function trustedEvent(): unknown {
  const mainFrame = { url: RENDERER_URL };
  return { senderFrame: mainFrame, sender: { mainFrame } };
}

const STATE = {
  report: null,
  checking: false,
  setup: { active: false, reason: null, plan: null },
  install: null,
  login: null,
  overridden: [],
  version: '2.10.0',
};

function fakeDoctor(): Record<string, ReturnType<typeof vi.fn>> {
  return {
    status: vi.fn(() => ({ ok: true, data: STATE })),
    check: vi.fn(() => ({ ok: true, data: { started: true } })),
    install: vi.fn(() => ({ ok: true, data: { installId: 'install-1' } })),
    login: vi.fn(() => ({ ok: true, data: { loginId: 'login-1' } })),
    loginCancel: vi.fn(() => ({ ok: true, data: {} })),
    openLoginUrl: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
    openUrl: vi.fn(() => Promise.resolve({ ok: true, data: {} })),
  };
}

let doctor: Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  listeners.clear();
  doctor = fakeDoctor();
  registerDoctorIpc({ doctor: doctor as unknown as DoctorService });
});

async function invoke(channel: string, ...args: unknown[]): Promise<Result<unknown>> {
  const listener = listeners.get(channel);
  if (listener === undefined) {
    throw new Error(`No handler registered for ${channel}.`);
  }
  return (await listener(trustedEvent(), ...args)) as Result<unknown>;
}

describe('registerDoctorIpc', () => {
  it('registers exactly the seven doctor channels', () => {
    expect([...listeners.keys()].sort()).toEqual([
      'doctor:check',
      'doctor:install',
      'doctor:login',
      'doctor:login-cancel',
      'doctor:open-login-url',
      'doctor:open-url',
      'doctor:status',
    ]);
  });

  it.each([
    ['doctor:status', 'status'],
    ['doctor:check', 'check'],
    ['doctor:login', 'login'],
    ['doctor:login-cancel', 'loginCancel'],
    ['doctor:open-login-url', 'openLoginUrl'],
  ] as const)(
    '%s calls %s with no arguments and hands the result back',
    async (channel, method) => {
      const result = await invoke(channel);

      expect(result.ok).toBe(true);
      expect(doctor[method]).toHaveBeenCalledExactlyOnceWith();
    },
  );

  it('install passes the parsed request through, and nothing else', async () => {
    const result = await invoke('doctor:install', { tools: ['gh'], androidTermsAccepted: true });

    expect(result).toEqual({ ok: true, data: { installId: 'install-1' } });
    expect(doctor.install).toHaveBeenCalledExactlyOnceWith({
      tools: ['gh'],
      androidTermsAccepted: true,
    });
  });

  it('open-url passes the id through — main resolves it to a URL', async () => {
    await invoke('doctor:open-url', { id: 'android-terms' });

    expect(doctor.openUrl).toHaveBeenCalledExactlyOnceWith('android-terms');
  });

  it('hands a service refusal back untouched', async () => {
    doctor.install?.mockReturnValueOnce({
      ok: false,
      error: { code: 'doctor/install-active', message: 'Maestro is already being installed.' },
    });

    expect(await invoke('doctor:install', { androidTermsAccepted: false })).toEqual({
      ok: false,
      error: { code: 'doctor/install-active', message: 'Maestro is already being installed.' },
    });
  });

  /** Criterion 37 — the renderer decides nothing about where a tool lives
   * or which URL a page has. */
  it('refuses a path, a URL or a missing decision before the service runs', async () => {
    expect((await invoke('doctor:install', '/tmp/maestro')).ok).toBe(false);
    expect((await invoke('doctor:install', { tools: ['gh'] })).ok).toBe(false);
    expect(
      (await invoke('doctor:install', { androidTermsAccepted: true, url: 'https://x' })).ok,
    ).toBe(false);
    expect((await invoke('doctor:open-url', { id: 'https://example.com' })).ok).toBe(false);
    expect((await invoke('doctor:login', 'gh')).ok).toBe(false);
    const result = await invoke('doctor:install', '/tmp/maestro');

    expect(result.ok ? '' : result.error.code).toBe('ipc/invalid-args');
    expect(doctor.install).not.toHaveBeenCalled();
    expect(doctor.openUrl).not.toHaveBeenCalled();
    expect(doctor.login).not.toHaveBeenCalled();
  });

  it('refuses an untrusted sender before the service runs', async () => {
    const listener = listeners.get('doctor:install');
    const foreign = { senderFrame: { url: 'https://example.com' }, sender: { mainFrame: null } };

    const result = (await listener?.(foreign)) as Result<unknown>;

    expect(result.ok ? '' : result.error.code).toBe('ipc/untrusted-sender');
    expect(doctor.install).not.toHaveBeenCalled();
  });
});

import type { DoctorPlan, DoctorReport, DoctorRow, DoctorState, Result, ToolId } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installableTools,
  isToolId,
  resetDoctorStore,
  selectIssues,
  selectSignInPending,
  splitRows,
  useDoctorStore,
} from './doctor.store';

/**
 * The doctor store: a projection of main's doctor state — the report, the
 * setup plan, the install and the sign-in in flight — plus the sheet's own
 * open flag, the terms checkbox and the per-tool outcomes of the run on
 * screen. Exactly one seam is faked — `window.conductor` — per the
 * renderer's testing rule.
 */

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

function store(): ReturnType<typeof useDoctorStore.getState> {
  return useDoctorStore.getState();
}

function row(id: DoctorRow['id'], status: DoctorRow['status']): DoctorRow {
  return { id, name: id, status, label: status, detail: `${id} detail`, short: `${id} short` };
}

const REPORT: DoctorReport = {
  rows: [
    row('maestro', 'fail'),
    row('adb', 'ok'),
    row('java', 'ok'),
    row('xcode-clt', 'ok'),
    row('gh', 'ok'),
    row('github-auth', 'warn'),
    row('claude', 'ok'),
    row('claude-auth', 'ok'),
  ],
  checkedAt: 1_756_800_000_000,
  issues: 2,
};

const PLAN: DoctorPlan = {
  tools: [
    { id: 'java', state: 'present', method: null, detail: 'openjdk 21 · /jdk/bin/java' },
    { id: 'maestro', state: 'install', method: 'direct', detail: 'Will download' },
    { id: 'gh', state: 'install', method: 'homebrew', detail: 'Will install with Homebrew' },
    { id: 'adb', state: 'install', method: 'homebrew', detail: 'Will install with Homebrew' },
  ],
  homebrew: '/opt/homebrew/bin/brew',
  androidTermsRequired: true,
  profile: '~/.zprofile',
};

const STATE: DoctorState = {
  report: REPORT,
  checking: false,
  setup: { active: false, reason: null, plan: null },
  install: null,
  login: null,
  overridden: [],
  version: '2.10.0',
};

const FAILURE = { code: 'doctor/download-failed', message: 'sentence', detail: 'HTTP 503' };

beforeEach(() => {
  resetDoctorStore();
});

describe('init', () => {
  it('stores the answer and marks the state loaded', async () => {
    window.conductor.doctorStatus = vi.fn(() => Promise.resolve(ok(STATE)));

    await store().init();

    expect(store().loaded).toBe(true);
    expect(store().report).toEqual(REPORT);
    expect(store().version).toBe('2.10.0');
  });

  it('still loads on a failed answer, so the window is never blank forever', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.conductor.doctorStatus = vi.fn(() =>
      Promise.resolve({ ok: false as const, error: { code: 'ipc/handler-failed', message: 'x' } }),
    );

    await store().init();

    expect(store().loaded).toBe(true);
    expect(store().report).toBeNull();
    error.mockRestore();
  });
});

describe('applyState', () => {
  it('replaces the projection whole, plan and sign-in included', () => {
    store().applyState(
      ok({
        ...STATE,
        checking: true,
        setup: { active: true, reason: 'first-run', plan: PLAN },
        login: { loginId: 'login-1', code: '1234-ABCD' },
      }),
    );

    expect(store().loaded).toBe(true);
    expect(store().checking).toBe(true);
    expect(store().setup.plan).toEqual(PLAN);
    expect(store().login).toEqual({ loginId: 'login-1', code: '1234-ABCD' });
  });

  it('logs and ignores a failed payload', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    store().applyState({ ok: false, error: { code: 'ipc/handler-failed', message: 'x' } });

    expect(store().loaded).toBe(false);
    error.mockRestore();
  });
});

describe('applyInstallEvent', () => {
  it('tracks progress by install id and tool, a null pct included', () => {
    store().applyInstallEvent(
      ok({
        kind: 'progress',
        installId: 'install-1',
        tool: 'gh',
        pct: null,
        step: 'Installing gh with Homebrew',
      }),
    );

    expect(store().install).toEqual({
      installId: 'install-1',
      tool: 'gh',
      pct: null,
      step: 'Installing gh with Homebrew',
    });
  });

  /** Criterion 39 — a settled row keeps its outcome on screen while the
   * next tool runs and until the plan catches up. */
  it('collects each tool’s outcome for the install on screen', () => {
    store().applyInstallEvent(
      ok({
        kind: 'progress',
        installId: 'install-1',
        tool: 'java',
        pct: 12,
        step: 'Downloading Zulu JDK 21',
      }),
    );
    store().applyInstallEvent(
      ok({ kind: 'done', installId: 'install-1', tool: 'java', version: '21.52.203' }),
    );
    store().applyInstallEvent(
      ok({ kind: 'failed', installId: 'install-1', tool: 'gh', ...FAILURE }),
    );

    expect(store().outcomes).toEqual({
      installId: 'install-1',
      byTool: {
        java: { kind: 'done', version: '21.52.203' },
        gh: { kind: 'failed', ...FAILURE },
      },
    });
  });

  it('lands settled as the failures by tool, and forgets the outcomes of an earlier install', () => {
    store().applyInstallEvent(
      ok({ kind: 'failed', installId: 'install-1', tool: 'gh', ...FAILURE }),
    );
    store().applyInstallEvent(ok({ kind: 'settled', installId: 'install-1', failed: ['gh'] }));
    expect(store().install).toEqual({ installId: 'install-1', failed: { gh: FAILURE } });
    expect(store().outcomes.byTool.gh).toEqual({ kind: 'failed', ...FAILURE });

    store().applyInstallEvent(
      ok({
        kind: 'progress',
        installId: 'install-2',
        tool: 'gh',
        pct: 0,
        step: 'Downloading GitHub CLI',
      }),
    );
    expect(store().outcomes).toEqual({ installId: 'install-2', byTool: {} });
  });

  it('logs and ignores a failed payload', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    store().applyInstallEvent({ ok: false, error: { code: 'ipc/handler-failed', message: 'x' } });

    expect(store().install).toBeNull();
    error.mockRestore();
  });
});

describe('applyLoginEvent', () => {
  it('keeps the code, the account on done, the failure, and clears on cancel', () => {
    store().applyLoginEvent(
      ok({
        kind: 'code',
        loginId: 'login-1',
        code: '1234-ABCD',
        url: 'https://github.com/login/device',
      }),
    );
    expect(store().login).toEqual({ loginId: 'login-1', code: '1234-ABCD' });

    store().applyLoginEvent(ok({ kind: 'done', loginId: 'login-1', account: 'octocat' }));
    expect(store().login).toBeNull();
    expect(store().signedInAs).toBe('octocat');

    store().applyLoginEvent(
      ok({
        kind: 'failed',
        loginId: 'login-2',
        code: 'doctor/login-failed',
        message: 'sentence',
        detail: 'expired',
      }),
    );
    expect(store().login).toEqual({
      loginId: 'login-2',
      failed: { code: 'doctor/login-failed', message: 'sentence', detail: 'expired' },
    });

    store().applyLoginEvent(ok({ kind: 'cancelled', loginId: 'login-2' }));
    expect(store().login).toBeNull();
  });
});

describe('actions', () => {
  it('check asks main and leaves the state to the push', async () => {
    const check = vi.fn(() => Promise.resolve(ok({ started: true })));
    window.conductor.doctorCheck = check;

    await store().check();

    expect(check).toHaveBeenCalledOnce();
    expect(store().checking).toBe(false);
  });

  /** Criteria 38, 42 — the tools named (or all), and the terms as checked. */
  it('install sends the tools and the terms decision, and forgets the last run', async () => {
    const install = vi.fn(() => Promise.resolve(ok({ installId: 'install-2' })));
    window.conductor.doctorInstall = install;
    store().applyInstallEvent(ok({ kind: 'settled', installId: 'install-1', failed: ['gh'] }));
    store().setAndroidTerms(true);

    await store().installTools(['gh', 'adb']);
    await store().installTools();

    expect(install).toHaveBeenNthCalledWith(1, {
      tools: ['gh', 'adb'],
      androidTermsAccepted: true,
    });
    expect(install).toHaveBeenNthCalledWith(2, { androidTermsAccepted: true });
    expect(store().install).toBeNull();
    expect(store().outcomes).toEqual({ installId: null, byTool: {} });
  });

  it('install logs a refusal rather than throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.conductor.doctorInstall = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'doctor/install-active', message: 'already' },
      }),
    );

    await expect(store().installTools()).resolves.toBeUndefined();

    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  /** Criteria 28, 30, 31, 37 — the sign-in and the two pages, by intent alone. */
  it('signIn, signInCancel, openLoginUrl and openAndroidTerms ask main and send nothing else', async () => {
    const login = vi.fn(() => Promise.resolve(ok({ loginId: 'login-1' })));
    const cancel = vi.fn(() => Promise.resolve(ok({})));
    const openLogin = vi.fn(() => Promise.resolve(ok({})));
    const openUrl = vi.fn(() => Promise.resolve(ok({})));
    window.conductor.doctorLogin = login;
    window.conductor.doctorLoginCancel = cancel;
    window.conductor.doctorOpenLoginUrl = openLogin;
    window.conductor.doctorOpenUrl = openUrl;
    store().applyLoginEvent(ok({ kind: 'done', loginId: 'login-0', account: 'old' }));

    await store().signIn();
    await store().signInCancel();
    await store().openLoginUrl();
    await store().openAndroidTerms();

    expect(login).toHaveBeenCalledExactlyOnceWith();
    expect(cancel).toHaveBeenCalledExactlyOnceWith();
    expect(openLogin).toHaveBeenCalledExactlyOnceWith();
    expect(openUrl).toHaveBeenCalledExactlyOnceWith({ id: 'android-terms' });
    expect(store().signedInAs).toBeNull();
  });

  it('remembers the terms checkbox', () => {
    expect(store().androidTermsAccepted).toBe(false);
    store().setAndroidTerms(true);
    expect(store().androidTermsAccepted).toBe(true);
  });

  it('opens, closes and toggles the sheet', () => {
    store().openSheet();
    expect(store().sheetOpen).toBe(true);
    store().closeSheet();
    expect(store().sheetOpen).toBe(false);
    store().toggleSheet();
    expect(store().sheetOpen).toBe(true);
    store().toggleSheet();
    expect(store().sheetOpen).toBe(false);
  });
});

describe('selectors', () => {
  it('counts issues from the report, null before one', () => {
    expect(selectIssues(store())).toBeNull();
    store().applyState(ok(STATE));
    expect(selectIssues(store())).toBe(2);
  });

  it('splits the rows into Needs you and Ready, in order', () => {
    const { needsYou, ready } = splitRows(REPORT.rows);

    expect(needsYou.map((entry) => entry.id)).toEqual(['maestro', 'github-auth']);
    expect(ready.map((entry) => entry.id)).toEqual([
      'adb',
      'java',
      'xcode-clt',
      'gh',
      'claude',
      'claude-auth',
    ]);
  });

  /** Criterion 42 — Install on the four managed rows while not ok; never on
   * a configured Maestro, never while an install runs. */
  it('offers Install on the managed rows that are not ok', () => {
    const installable = (): ToolId[] => {
      const state = store();
      return [
        ...installableTools({
          rows: state.report?.rows ?? [],
          install: state.install,
          overridden: state.overridden,
        }),
      ];
    };
    expect(installable()).toEqual([]);
    store().applyState(
      ok({
        ...STATE,
        report: {
          ...REPORT,
          rows: REPORT.rows.map((entry) =>
            entry.id === 'adb' || entry.id === 'java'
              ? { ...entry, status: 'fail' as const }
              : entry,
          ),
        },
      }),
    );
    expect(installable()).toEqual(['java', 'maestro', 'adb']);

    store().applyState(
      ok({
        ...STATE,
        overridden: ['maestro', 'adb'],
        report: {
          ...REPORT,
          rows: REPORT.rows.map((entry) =>
            entry.id === 'adb' || entry.id === 'java'
              ? { ...entry, status: 'fail' as const }
              : entry,
          ),
        },
      }),
    );
    expect(installable()).toEqual(['java']);

    store().applyState(ok(STATE));
    store().applyInstallEvent(
      ok({ kind: 'progress', installId: 'install-1', tool: 'maestro', pct: 1, step: 'x' }),
    );
    expect(installable()).toEqual([]);
  });

  /** Criteria 32, 43 — gh is there, the sign-in is not. */
  it('knows when the sign-in is pending', () => {
    expect(selectSignInPending(store())).toBe(false);
    store().applyState(ok(STATE));
    expect(selectSignInPending(store())).toBe(true);
    store().applyState(
      ok({
        ...STATE,
        report: {
          ...REPORT,
          rows: REPORT.rows.map((entry) =>
            entry.id === 'gh' ? { ...entry, status: 'fail' as const } : entry,
          ),
        },
      }),
    );
    expect(selectSignInPending(store())).toBe(false);
  });
});

describe('isToolId', () => {
  it('narrows a row id to one of the four managed tools', () => {
    expect(isToolId('java')).toBe(true);
    expect(isToolId('adb')).toBe(true);
    expect(isToolId('xcode-clt')).toBe(false);
    expect(isToolId('github-auth')).toBe(false);
  });
});

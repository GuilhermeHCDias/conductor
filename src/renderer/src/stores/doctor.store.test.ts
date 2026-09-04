import type { DoctorReport, DoctorRow, DoctorState, Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetDoctorStore,
  selectInstallable,
  selectIssues,
  splitRows,
  useDoctorStore,
} from './doctor.store';

/**
 * The doctor store: a projection of main's doctor state plus the sheet's own
 * open flag and the last install's landing. Exactly one seam is faked —
 * `window.conductor` — per the renderer's testing rule.
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

const STATE: DoctorState = {
  report: REPORT,
  checking: false,
  setup: { active: false, reason: null },
  install: null,
  maestroOverridden: false,
  version: '2.10.0',
};

beforeEach(() => {
  resetDoctorStore();
});

describe('init', () => {
  it('stores the answer and marks the state loaded', async () => {
    window.conductor.doctorStatus = vi.fn(() => Promise.resolve(ok(STATE)));

    await store().init();

    expect(store().loaded).toBe(true);
    expect(store().report).toEqual(REPORT);
    expect(store().setup).toEqual({ active: false, reason: null });
  });

  it('still loads on a failed answer, so the window is never blank forever', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.conductor.doctorStatus = vi.fn(() =>
      Promise.resolve({ ok: false as const, error: { code: 'ipc/handler-failed', message: 'x' } }),
    );

    await store().init();

    expect(store().loaded).toBe(true);
    expect(store().report).toBeNull();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('applyState', () => {
  it('replaces the projection whole', () => {
    store().applyState(
      ok({ ...STATE, checking: true, setup: { active: true, reason: 'update' as const } }),
    );

    expect(store().checking).toBe(true);
    expect(store().setup).toEqual({ active: true, reason: 'update' });
    expect(store().loaded).toBe(true);
  });

  it('keeps the last landing when the pushed install is null', () => {
    store().applyInstallEvent(
      ok({ kind: 'done' as const, installId: 'install-1', version: '2.10.0' }),
    );

    store().applyState(ok(STATE));

    expect(store().installed).toEqual({ installId: 'install-1', version: '2.10.0' });
  });
});

/** Criterion 22 — every pct and step the Setup view renders comes from here. */
describe('applyInstallEvent', () => {
  it('tracks progress by install id', () => {
    store().applyInstallEvent(
      ok({ kind: 'progress' as const, installId: 'install-1', pct: 42, step: 'Extracting' }),
    );

    expect(store().install).toEqual({ installId: 'install-1', pct: 42, step: 'Extracting' });
  });

  it('lands done as the installed version and clears the progress', () => {
    store().applyInstallEvent(
      ok({
        kind: 'progress' as const,
        installId: 'install-1',
        pct: 98,
        step: 'Verifying installation',
      }),
    );
    store().applyInstallEvent(
      ok({ kind: 'done' as const, installId: 'install-1', version: '2.10.0' }),
    );

    expect(store().install).toBeNull();
    expect(store().installed).toEqual({ installId: 'install-1', version: '2.10.0' });
  });

  it('keeps a failure with its sentence and detail', () => {
    store().applyInstallEvent(
      ok({
        kind: 'failed' as const,
        installId: 'install-1',
        code: 'doctor/download-failed',
        message: 'sentence',
        detail: 'HTTP 503',
      }),
    );

    expect(store().install).toEqual({
      installId: 'install-1',
      failed: { code: 'doctor/download-failed', message: 'sentence', detail: 'HTTP 503' },
    });
  });

  it('forgets the previous landing when a new install starts', () => {
    store().applyInstallEvent(
      ok({ kind: 'done' as const, installId: 'install-1', version: '2.10.0' }),
    );
    store().applyInstallEvent(
      ok({
        kind: 'progress' as const,
        installId: 'install-2',
        pct: 0,
        step: 'Downloading maestro 2.10.0',
      }),
    );

    expect(store().installed).toBeNull();
  });

  it('logs and ignores a failed payload', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});

    store().applyInstallEvent({ ok: false, error: { code: 'x', message: 'y' } });

    expect(store().install).toBeNull();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('actions', () => {
  it('check asks main and leaves the state to the push', async () => {
    const check = vi.fn(() => Promise.resolve(ok({ started: true })));
    window.conductor.doctorCheck = check;

    await store().check();

    expect(check).toHaveBeenCalledOnce();
  });

  it('install asks main and forgets the last landing', async () => {
    const install = vi.fn(() => Promise.resolve(ok({ installId: 'install-2' })));
    window.conductor.doctorInstall = install;
    store().applyInstallEvent(
      ok({ kind: 'done' as const, installId: 'install-1', version: '2.10.0' }),
    );

    await store().installMaestro();

    expect(install).toHaveBeenCalledOnce();
    expect(store().installed).toBeNull();
  });

  it('install logs a refusal rather than throwing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.conductor.doctorInstall = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'doctor/install-active', message: 'Maestro is already being installed.' },
      }),
    );

    await store().installMaestro();

    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('skipSetup asks main', async () => {
    const skip = vi.fn(() => Promise.resolve(ok({})));
    window.conductor.doctorSkipSetup = skip;

    await store().skipSetup();

    expect(skip).toHaveBeenCalledOnce();
  });

  /** Criterion 25 — the badge toggles the sheet. */
  it('opens, closes and toggles the sheet', () => {
    store().openSheet();
    expect(store().sheetOpen).toBe(true);
    store().toggleSheet();
    expect(store().sheetOpen).toBe(false);
    store().toggleSheet();
    expect(store().sheetOpen).toBe(true);
    store().closeSheet();
    expect(store().sheetOpen).toBe(false);
  });
});

describe('selectors', () => {
  it('counts issues from the report, null before one', () => {
    expect(selectIssues(store())).toBeNull();
    store().applyState(ok(STATE));
    expect(selectIssues(store())).toBe(2);
  });

  /** Criterion 28 — non-ok rows above ok rows, each in the report's order. */
  it('splits the rows into Needs you and Ready, in order', () => {
    store().applyState(ok(STATE));
    const { needsYou, ready } = splitRows(store().report?.rows ?? []);

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

  /** Criterion 31 — the Install button's condition. */
  it('offers Install while the maestro row is not ok and no path is configured', () => {
    store().applyState(ok(STATE));
    expect(selectInstallable(store())).toBe(true);

    store().applyState(ok({ ...STATE, maestroOverridden: true }));
    expect(selectInstallable(store())).toBe(false);

    store().applyState(
      ok({
        ...STATE,
        report: {
          ...REPORT,
          rows: REPORT.rows.map((entry) => (entry.id === 'maestro' ? row('maestro', 'ok') : entry)),
        },
      }),
    );
    expect(selectInstallable(store())).toBe(false);
  });
});

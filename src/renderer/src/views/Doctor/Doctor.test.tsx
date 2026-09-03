import type { DoctorReport, DoctorRow } from '@shared/ipc';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDoctorStore, useDoctorStore } from '../../stores/doctor.store';
import { Doctor } from './Doctor';

/**
 * The diagnostic sheet (doctor criteria 25–32), the kit's `CDoctorSheetB`
 * over the real doctor store: the verdict first, then Needs you above
 * Ready, one footnote, one per-row action — Install on the maestro row.
 */

function row(
  id: DoctorRow['id'],
  status: DoctorRow['status'],
  fields: Partial<DoctorRow> = {},
): DoctorRow {
  return {
    id,
    name: id,
    status,
    label: status === 'ok' ? 'Ready' : status === 'warn' ? 'Signed out' : 'Not found',
    detail: `${id} → detail`,
    short: `${id} 1.0`,
    ...fields,
  };
}

const CHECKED_AT = new Date(2026, 8, 3, 9, 12).getTime();

const HEALTHY: DoctorReport = {
  rows: [
    row('maestro', 'ok', { name: 'Maestro', label: 'Installed', short: '2.10.0' }),
    row('adb', 'ok', { name: 'Android platform-tools', short: 'adb 35.0.2' }),
    row('java', 'ok', { name: 'Java Development Kit', short: 'java 21.0.4' }),
    row('xcode-clt', 'ok', { name: 'Xcode command line tools', label: 'Installed', short: '26.1' }),
    row('gh', 'ok', { name: 'GitHub CLI', label: 'Installed', short: 'gh 2.91.0' }),
    row('github-auth', 'ok', { name: 'GitHub', label: 'Signed in', short: 'GuilhermeHCDias' }),
    row('claude', 'ok', { name: 'Claude Code', label: 'Installed', short: 'claude 2.1.258' }),
    row('claude-auth', 'ok', { name: 'Claude', label: 'Signed in', short: 'claude.ai' }),
  ],
  checkedAt: CHECKED_AT,
  issues: 0,
};

const TROUBLED: DoctorReport = {
  rows: HEALTHY.rows.map((entry) =>
    entry.id === 'maestro'
      ? row('maestro', 'fail', {
          name: 'Maestro',
          label: 'Not installed',
          detail: 'maestro → not installed',
        })
      : entry.id === 'github-auth'
        ? row('github-auth', 'warn', {
            name: 'GitHub',
            label: 'Signed out',
            detail: 'You are not logged into any GitHub hosts. To log in, run: gh auth login',
          })
        : entry,
  ),
  checkedAt: CHECKED_AT,
  issues: 2,
};

function open(report: DoctorReport | null): void {
  useDoctorStore.setState({ loaded: true, report, sheetOpen: true });
}

beforeEach(() => {
  resetDoctorStore();
});

describe('Doctor', () => {
  it('renders nothing while closed', () => {
    useDoctorStore.setState({ report: HEALTHY, sheetOpen: false });
    const { container } = render(<Doctor />);

    expect(container).toBeEmptyDOMElement();
  });

  /** Criterion 26 — the header and the local time it was checked at. */
  it('is a dialog named Doctor, stamped with the check time', () => {
    open(HEALTHY);
    render(<Doctor />);

    expect(screen.getByRole('dialog', { name: 'Doctor' })).toBeInTheDocument();
    expect(screen.getByText('checked 9:12 am')).toBeInTheDocument();
  });

  it('reads checking… before the first report', () => {
    open(null);
    render(<Doctor />);

    expect(screen.getByText('checking…')).toBeInTheDocument();
  });

  /** Criterion 27 — the verdict band. */
  it('says everything is ready at zero issues', () => {
    open(HEALTHY);
    render(<Doctor />);

    expect(screen.getByText('Everything is ready')).toBeInTheDocument();
    expect(screen.getByText('Conductor has what it needs on this Mac.')).toBeInTheDocument();
    expect(screen.getByTestId('doctor-verdict')).toHaveAttribute('data-verdict', 'ready');
  });

  it('counts what needs the person, singular and plural', () => {
    open({ ...TROUBLED, rows: TROUBLED.rows, issues: 1 });
    const { unmount } = render(<Doctor />);
    expect(screen.getByText('1 thing needs you')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Conductor runs without them, and cannot install or sign in on your behalf.',
      ),
    ).toBeInTheDocument();
    unmount();

    open(TROUBLED);
    render(<Doctor />);
    expect(screen.getByText('2 things need you')).toBeInTheDocument();
    expect(screen.getByTestId('doctor-verdict')).toHaveAttribute('data-verdict', 'issues');
  });

  /** Criterion 28 — Needs you above Ready, details for the former, shorts
   * for the latter, each in the report's order. */
  it('lists the non-ok rows with their full detail above the ok rows with their short', () => {
    open(TROUBLED);
    render(<Doctor />);

    const needsYou = screen.getByRole('list', { name: 'Needs you' });
    const needsYouRows = within(needsYou).getAllByRole('listitem');
    expect(needsYouRows.map((entry) => entry.getAttribute('data-row'))).toEqual([
      'maestro',
      'github-auth',
    ]);
    expect(needsYouRows[0]).toHaveTextContent('maestro → not installed');
    expect(needsYouRows[0]).toHaveTextContent('Not installed');
    expect(needsYouRows[1]).toHaveTextContent(
      'You are not logged into any GitHub hosts. To log in, run: gh auth login',
    );

    const ready = screen.getByRole('list', { name: 'Ready' });
    const readyRows = within(ready).getAllByRole('listitem');
    expect(readyRows.map((entry) => entry.getAttribute('data-row'))).toEqual([
      'adb',
      'java',
      'xcode-clt',
      'gh',
      'claude',
      'claude-auth',
    ]);
    expect(readyRows[0]).toHaveTextContent('adb 35.0.2');
    expect(readyRows[0]).not.toHaveTextContent('adb → detail');
    expect(needsYou.compareDocumentPosition(ready) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('omits the Needs you section when nothing needs the person', () => {
    open(HEALTHY);
    render(<Doctor />);

    expect(screen.queryByRole('list', { name: 'Needs you' })).not.toBeInTheDocument();
    expect(
      within(screen.getByRole('list', { name: 'Ready' })).getAllByRole('listitem'),
    ).toHaveLength(8);
  });

  /** Criterion 29. */
  it('carries the footnote', () => {
    open(HEALTHY);
    render(<Doctor />);

    expect(
      screen.getByText(
        'Maestro is the only one Conductor installs and updates by itself. The rest live on your machine, and signing in is always yours to do.',
      ),
    ).toBeInTheDocument();
  });

  /** Criterion 30 — the footer. */
  it('Check again asks main, and is disabled while a check is in flight', async () => {
    const check = vi.fn(() => Promise.resolve({ ok: true as const, data: { started: true } }));
    window.conductor.doctorCheck = check;
    open(HEALTHY);
    render(<Doctor />);

    await userEvent.click(screen.getByRole('button', { name: 'Check again' }));
    expect(check).toHaveBeenCalledOnce();

    act(() => {
      useDoctorStore.setState({ checking: true });
    });
    expect(screen.getByRole('button', { name: 'Check again' })).toBeDisabled();
  });

  /** Criterion 25 — four ways out. */
  it('closes on Done, on the close glyph, on Escape and on the scrim', async () => {
    open(HEALTHY);
    render(<Doctor />);

    const reopen = (): void => {
      act(() => {
        useDoctorStore.setState({ sheetOpen: true });
      });
    };

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(useDoctorStore.getState().sheetOpen).toBe(false);

    reopen();
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useDoctorStore.getState().sheetOpen).toBe(false);

    reopen();
    await userEvent.keyboard('{Escape}');
    expect(useDoctorStore.getState().sheetOpen).toBe(false);

    reopen();
    await userEvent.click(screen.getByTestId('dialog-backdrop'));
    expect(useDoctorStore.getState().sheetOpen).toBe(false);
  });

  /** Criterion 31 — the one per-row action. */
  describe('the maestro row', () => {
    it('offers Install while not ok and no path is configured', async () => {
      const install = vi.fn(() =>
        Promise.resolve({ ok: true as const, data: { installId: 'install-1' } }),
      );
      window.conductor.doctorInstall = install;
      open(TROUBLED);
      render(<Doctor />);

      await userEvent.click(screen.getByRole('button', { name: 'Install' }));

      expect(install).toHaveBeenCalledOnce();
    });

    it('offers no Install while a path is configured, or while the row is ok', () => {
      open(TROUBLED);
      useDoctorStore.setState({ maestroOverridden: true });
      const { unmount } = render(<Doctor />);
      expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
      unmount();

      open(HEALTHY);
      render(<Doctor />);
      expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    });

    it('reads Installing with the step and percentage while the install runs', () => {
      open(TROUBLED);
      useDoctorStore.setState({ install: { installId: 'install-1', pct: 93, step: 'Extracting' } });
      render(<Doctor />);

      const maestro = screen.getByRole('listitem', { name: 'Maestro' });
      expect(maestro).toHaveTextContent('Installing');
      expect(maestro).toHaveTextContent('Extracting · 93%');
      expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
    });

    it('returns the button after a failure, with the row showing the cause', () => {
      open({
        ...TROUBLED,
        rows: TROUBLED.rows.map((entry) =>
          entry.id === 'maestro' ? { ...entry, detail: 'HTTP 503' } : entry,
        ),
      });
      useDoctorStore.setState({
        install: {
          installId: 'install-1',
          failed: { code: 'doctor/download-failed', message: 'sentence', detail: 'HTTP 503' },
        },
      });
      render(<Doctor />);

      expect(screen.getByRole('listitem', { name: 'Maestro' })).toHaveTextContent('HTTP 503');
      expect(screen.getByRole('button', { name: 'Install' })).toBeInTheDocument();
    });
  });

  /** Criterion 32 — §12.24: no Git vocabulary beyond the rows' own names
   * and the CLIs' own output. */
  it('says nothing about Git beyond the rows and their output', () => {
    open(TROUBLED);
    render(<Doctor />);

    const text = screen.getByRole('dialog').textContent ?? '';
    expect(text).not.toMatch(/\bgit\b|pull request|branch|commit|repository/i);
  });
});

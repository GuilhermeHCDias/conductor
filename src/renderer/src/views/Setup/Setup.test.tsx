import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDoctorStore, useDoctorStore } from '../../stores/doctor.store';
import { Setup } from './Setup';

/**
 * The first-run installer (doctor criteria 21–24), the kit's
 * `CDoctorInstaller` over the real doctor store: every pct and step on
 * screen arrived as a `doctor:install-event`; the view holds no timer.
 */

beforeEach(() => {
  resetDoctorStore();
  useDoctorStore.setState({
    loaded: true,
    setup: { active: true, reason: 'first-run' },
    version: '2.10.0',
  });
});

describe('Setup', () => {
  /** Criterion 21 — the real icon, the heading, the body. */
  it('shows the Conductor icon, the heading and the body', () => {
    render(<Setup />);

    expect(screen.getByTestId('setup-mark')).toHaveAttribute('src');
    expect(screen.getByRole('heading', { name: 'Setting up Conductor' })).toBeInTheDocument();
    expect(
      screen.getByText('Installing Maestro, the runner behind every test. This happens once.'),
    ).toBeInTheDocument();
  });

  /** Criterion 19 — the same window, an update's words. */
  it('reads as an update when the pin moved', () => {
    useDoctorStore.setState({ setup: { active: true, reason: 'update' } });
    render(<Setup />);

    expect(screen.getByRole('heading', { name: 'Updating Maestro' })).toBeInTheDocument();
    expect(
      screen.getByText("Conductor's test runner is moving to 2.10.0. This happens once."),
    ).toBeInTheDocument();
  });

  /** Criterion 24 — the drag strip, so the frameless window can be moved. */
  it('reserves the drag strip', () => {
    render(<Setup />);

    expect(screen.getByTestId('setup-drag')).toBeInTheDocument();
  });

  /** Criteria 21–23 — the bar, the step and the percentage from the store,
   * and no button while the install runs. */
  it('renders the install progress from the store', () => {
    useDoctorStore.setState({ install: { installId: 'install-1', pct: 42, step: 'Extracting' } });
    render(<Setup />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByText('Extracting')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('starts at zero with no step before the first event', () => {
    render(<Setup />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('0%')).toBeInTheDocument();
  });

  /** Criterion 21 — done: the bar turns pass, the check appears, the label
   * names the version. */
  it('shows the ready state once the install landed', () => {
    useDoctorStore.setState({ installed: { installId: 'install-1', version: '2.10.0' } });
    render(<Setup />);

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(screen.getByRole('progressbar')).toHaveAttribute('data-done', 'true');
    expect(screen.getByText('maestro 2.10.0 is ready')).toBeInTheDocument();
    expect(screen.getByTestId('setup-check')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /** Criterion 23 — the failure sentence replaces the step line; Try again
   * and Continue without Maestro are the two ways on. */
  describe('after a failure', () => {
    beforeEach(() => {
      useDoctorStore.setState({
        install: {
          installId: 'install-1',
          failed: {
            code: 'doctor/download-failed',
            message:
              "Conductor couldn't reach GitHub to download Maestro. Check your connection and try again.",
            detail: 'HTTP 503',
          },
        },
      });
    });

    it('shows the sentence, not the raw cause', () => {
      render(<Setup />);

      expect(screen.getByRole('alert')).toHaveTextContent(
        "Conductor couldn't reach GitHub to download Maestro. Check your connection and try again.",
      );
      expect(screen.queryByText('HTTP 503')).not.toBeInTheDocument();
    });

    it('Try again asks main for another install', async () => {
      const install = vi.fn(() =>
        Promise.resolve({ ok: true as const, data: { installId: 'install-2' } }),
      );
      window.conductor.doctorInstall = install;
      render(<Setup />);

      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(install).toHaveBeenCalledOnce();
    });

    it('Continue without Maestro asks main to skip setup', async () => {
      const skip = vi.fn(() => Promise.resolve({ ok: true as const, data: {} }));
      window.conductor.doctorSkipSetup = skip;
      render(<Setup />);

      await userEvent.click(screen.getByRole('button', { name: 'Continue without Maestro' }));

      expect(skip).toHaveBeenCalledOnce();
    });
  });
});

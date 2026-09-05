import type { DoctorPlan, DoctorReport } from '@shared/ipc';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDoctorStore, useDoctorStore } from '../../stores/doctor.store';
import { Setup } from './Setup';

/**
 * The first-run installer (managed-tools criteria 34–41), the kit's
 * `CDoctorInstallerB` over the real doctor store: the plan screen with its
 * one click, the progress screen with one row per tool, the sign-in card,
 * the failures. Every pct, step, code and outcome on screen arrived as a
 * push; the view holds no timer.
 */

const PLAN: DoctorPlan = {
  tools: [
    { id: 'java', state: 'present', method: null, detail: 'openjdk version "21.0.4" · /jdk' },
    { id: 'maestro', state: 'install', method: 'direct', detail: 'Will download' },
    { id: 'gh', state: 'install', method: 'homebrew', detail: 'Will install with Homebrew' },
    { id: 'adb', state: 'install', method: 'homebrew', detail: 'Will install with Homebrew' },
  ],
  homebrew: '/opt/homebrew/bin/brew',
  androidTermsRequired: true,
  profile: '~/.zprofile',
};

const DIRECT: DoctorPlan = {
  tools: PLAN.tools.map((tool) =>
    tool.state === 'install' ? { ...tool, method: 'direct', detail: 'Will download' } : tool,
  ),
  homebrew: null,
  androidTermsRequired: true,
  profile: null,
};

function report(auth: 'ok' | 'warn'): DoctorReport {
  return {
    rows: [
      {
        id: 'java',
        name: 'Java Development Kit',
        status: 'ok',
        label: 'Ready',
        detail: 'x',
        short: 'java 21.0.4',
      },
      {
        id: 'gh',
        name: 'GitHub CLI',
        status: 'ok',
        label: 'Installed',
        detail: 'x',
        short: 'gh 2.100.0',
      },
      {
        id: 'github-auth',
        name: 'GitHub',
        status: auth,
        label: auth === 'ok' ? 'Signed in' : 'Signed out',
        detail: 'x',
        short: 'x',
      },
    ],
    checkedAt: 0,
    issues: auth === 'ok' ? 0 : 1,
  };
}

function toolRow(name: string): HTMLElement {
  return screen.getByRole('listitem', { name });
}

beforeEach(() => {
  resetDoctorStore();
  useDoctorStore.setState({
    loaded: true,
    setup: { active: true, reason: 'first-run', plan: PLAN },
    report: report('warn'),
    version: '2.10.0',
  });
});

describe('Setup', () => {
  /** Criterion 35 — the mark, the title, the copy, the four rows in order. */
  it('shows the mark, the title, the copy and one row per tool', () => {
    render(<Setup />);

    expect(screen.getByTestId('setup-mark')).toHaveAttribute('src');
    expect(screen.getByRole('heading', { name: 'Setting up Conductor' })).toBeInTheDocument();
    expect(
      screen.getByText(
        "Conductor needs a few tools to run tests on this Mac. It installs what's missing — no password needed.",
      ),
    ).toBeInTheDocument();
    const rows = within(screen.getByRole('list', { name: 'Tools' })).getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Zulu JDK 21',
      'Maestro',
      'GitHub CLI',
      'Android platform-tools',
    ]);
    expect(toolRow('Zulu JDK 21')).toHaveTextContent('Installed · java 21.0.4');
    expect(toolRow('Zulu JDK 21')).toHaveAttribute('data-glyph', 'present');
    expect(toolRow('Maestro')).toHaveTextContent('Will download');
    expect(toolRow('GitHub CLI')).toHaveTextContent('Will install with Homebrew');
    expect(screen.getByTestId('setup-drag')).toBeInTheDocument();
  });

  it('reads Checking on every row before the plan lands', () => {
    useDoctorStore.setState({ setup: { active: true, reason: 'first-run', plan: null } });
    render(<Setup />);

    expect(toolRow('Maestro')).toHaveTextContent('Checking…');
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
  });

  /** Criterion 36 — the method line, with and without Homebrew. */
  it('says how the tools install, with Homebrew and without', () => {
    const { unmount } = render(<Setup />);
    expect(
      screen.getByText(
        'Homebrew found at /opt/homebrew/bin/brew — GitHub CLI and platform-tools install through it. The JDK downloads from Azul.',
      ),
    ).toBeInTheDocument();
    unmount();

    useDoctorStore.setState({ setup: { active: true, reason: 'first-run', plan: DIRECT } });
    render(<Setup />);
    expect(
      screen.getByText(
        /Homebrew isn't installed, so Conductor downloads everything into ~\/\.conductor and adds it to your PATH\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Add ~\/\.conductor\/bin to your PATH by hand/)).toBeInTheDocument();
  });

  /** Criterion 37 — the terms line; unchecked, the adb row says so. */
  it('asks for the Android terms while adb installs, and links to them', async () => {
    const openUrl = vi.fn(() => Promise.resolve({ ok: true as const, data: {} }));
    window.conductor.doctorOpenUrl = openUrl;
    render(<Setup />);

    const box = screen.getByRole('checkbox', {
      name: 'I accept the Android SDK Platform-Tools terms',
    });
    expect(box).not.toBeChecked();
    expect(toolRow('Android platform-tools')).toHaveTextContent('Accept the terms to install');
    await userEvent.click(box);
    expect(toolRow('Android platform-tools')).toHaveTextContent('Will install with Homebrew');
    await userEvent.click(screen.getByRole('button', { name: 'Read the terms' }));

    expect(openUrl).toHaveBeenCalledExactlyOnceWith({ id: 'android-terms' });
  });

  it('shows no terms line when adb is already there', () => {
    useDoctorStore.setState({
      setup: {
        active: true,
        reason: 'first-run',
        plan: {
          ...PLAN,
          tools: PLAN.tools.map((tool) =>
            tool.id === 'adb' ? { ...tool, state: 'present', method: null, detail: 'adb' } : tool,
          ),
          androidTermsRequired: false,
        },
      },
    });
    render(<Setup />);

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });

  /** Criterion 38 — Install is the plan screen's one button: the four tools
   * are mandatory, so there is nothing to continue without. */
  it('offers Install alone, held until the Android terms are accepted', async () => {
    const install = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { installId: 'install-1' } }),
    );
    window.conductor.doctorInstall = install;
    render(<Setup />);

    expect(
      screen.queryByRole('button', { name: 'Continue without installing' }),
    ).not.toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Install' });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(install).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('checkbox'));
    expect(button).toBeEnabled();
    await userEvent.click(button);

    expect(install).toHaveBeenCalledExactlyOnceWith({ androidTermsAccepted: true });
  });

  it('offers Install at once when adb is already there', async () => {
    const install = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { installId: 'install-1' } }),
    );
    window.conductor.doctorInstall = install;
    useDoctorStore.setState({
      setup: {
        active: true,
        reason: 'first-run',
        plan: {
          ...PLAN,
          tools: PLAN.tools.map((tool) =>
            tool.id === 'adb' ? { ...tool, state: 'present', method: null, detail: 'adb' } : tool,
          ),
          androidTermsRequired: false,
        },
      },
    });
    render(<Setup />);

    const button = screen.getByRole('button', { name: 'Install' });
    expect(button).toBeEnabled();
    await userEvent.click(button);

    expect(install).toHaveBeenCalledExactlyOnceWith({ androidTermsAccepted: false });
  });

  /** Criterion 39 — the progress screen. */
  describe('while installing', () => {
    beforeEach(() => {
      useDoctorStore.setState({
        install: {
          installId: 'install-1',
          tool: 'gh',
          pct: null,
          step: 'Installing gh with Homebrew',
        },
        outcomes: {
          installId: 'install-1',
          byTool: { maestro: { kind: 'done', version: '2.10.0' } },
        },
      });
    });

    it('shows the active row with its bar and step, settled rows Installed, waiting rows Waiting', () => {
      render(<Setup />);

      const gh = toolRow('GitHub CLI');
      expect(gh).toHaveTextContent('Installing gh with Homebrew');
      expect(within(gh).getByRole('progressbar')).not.toHaveAttribute('aria-valuenow');
      expect(toolRow('Maestro')).toHaveTextContent('Installed · 2.10.0');
      expect(toolRow('Maestro')).toHaveAttribute('data-glyph', 'present');
      expect(toolRow('Android platform-tools')).toHaveTextContent('Waiting');
      expect(screen.queryByRole('button')).not.toBeInTheDocument();
      expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    });

    it('shows a download’s percentage on the bar', () => {
      useDoctorStore.setState({
        install: {
          installId: 'install-1',
          tool: 'adb',
          pct: 43,
          step: 'Downloading Android platform-tools',
        },
      });
      render(<Setup />);

      const adb = toolRow('Android platform-tools');
      expect(adb).toHaveTextContent('Downloading Android platform-tools · 43%');
      expect(within(adb).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '43');
    });
  });

  /** Criteria 17, 39 — a failure reads its sentence, never the cause, and
   * Try again redoes only the failed ones. */
  describe('after a failure', () => {
    beforeEach(() => {
      const failed = {
        code: 'doctor/brew-failed',
        message:
          "Homebrew couldn't install the GitHub CLI. You can try again, or Conductor can download it instead.",
        detail: 'Error: No available formula',
      };
      useDoctorStore.setState({
        install: { installId: 'install-1', failed: { gh: failed } },
        outcomes: {
          installId: 'install-1',
          byTool: {
            maestro: { kind: 'done', version: '2.10.0' },
            gh: { kind: 'failed', ...failed },
          },
        },
      });
    });

    it('shows the sentence on the row, not the raw cause', () => {
      render(<Setup />);

      expect(toolRow('GitHub CLI')).toHaveTextContent("Homebrew couldn't install the GitHub CLI.");
      expect(toolRow('GitHub CLI')).toHaveAttribute('data-glyph', 'fail');
      expect(screen.queryByText(/No available formula/)).not.toBeInTheDocument();
    });

    it('offers Try again alone — a failed tool is retried, never continued past', async () => {
      const install = vi.fn(() =>
        Promise.resolve({ ok: true as const, data: { installId: 'install-2' } }),
      );
      window.conductor.doctorInstall = install;
      render(<Setup />);

      expect(screen.queryByRole('button', { name: 'Continue' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(install).toHaveBeenCalledExactlyOnceWith({
        tools: ['gh'],
        androidTermsAccepted: false,
      });
    });
  });

  /** Criteria 32, 40 — the sign-in card once the tools landed and gh is
   * there but signed out. */
  describe('the sign-in step', () => {
    beforeEach(() => {
      useDoctorStore.setState({
        install: { installId: 'install-1', failed: {} },
        outcomes: {
          installId: 'install-1',
          byTool: { maestro: { kind: 'done', version: '2.10.0' } },
        },
      });
    });

    it('offers Sign in with GitHub, and no way to skip it', async () => {
      const login = vi.fn(() =>
        Promise.resolve({ ok: true as const, data: { loginId: 'login-1' } }),
      );
      window.conductor.doctorLogin = login;
      render(<Setup />);

      expect(screen.getByRole('heading', { name: 'Sign in to GitHub' })).toBeInTheDocument();
      expect(
        screen.getByText(
          'Conductor sends your tests to GitHub through the GitHub CLI. Sign in happens in your browser — Conductor never sees your password or token.',
        ),
      ).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));

      expect(login).toHaveBeenCalledOnce();
    });

    /** Criterion 32 — the sign-in alone opened the installer: every tool is
     * there, nothing to install, the card at once and no Install button. */
    it('shows the card straight away when the sign-in is the reason', () => {
      useDoctorStore.setState({
        install: null,
        outcomes: { installId: null, byTool: {} },
        setup: {
          active: true,
          reason: 'sign-in',
          plan: {
            ...PLAN,
            tools: PLAN.tools.map((tool) => ({
              ...tool,
              state: 'present',
              method: null,
              detail: 'x',
            })),
            androidTermsRequired: false,
          },
        },
      });
      render(<Setup />);

      expect(screen.getByRole('heading', { name: 'Sign in to GitHub' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();
      expect(
        screen.getByText('Everything is installed. One last step: sign in to GitHub.'),
      ).toBeInTheDocument();
    });

    it('does not appear while signed in already', () => {
      useDoctorStore.setState({ report: report('ok') });
      render(<Setup />);

      expect(screen.queryByRole('heading', { name: 'Sign in to GitHub' })).not.toBeInTheDocument();
    });

    it('shows the code with Copy, the URL line, Open GitHub and Cancel once it arrives', async () => {
      const writeText = vi.fn(() => Promise.resolve());
      Object.assign(navigator, { clipboard: { writeText } });
      const open = vi.fn(() => Promise.resolve({ ok: true as const, data: {} }));
      const cancel = vi.fn(() => Promise.resolve({ ok: true as const, data: {} }));
      window.conductor.doctorOpenLoginUrl = open;
      window.conductor.doctorLoginCancel = cancel;
      useDoctorStore.setState({ login: { loginId: 'login-1', code: '1234-ABCD' } });
      render(<Setup />);

      expect(screen.getByTestId('login-code')).toHaveTextContent('1234-ABCD');
      expect(screen.getByText('Enter it at github.com/login/device')).toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));
      await userEvent.click(screen.getByRole('button', { name: 'Open GitHub' }));
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      expect(writeText).toHaveBeenCalledExactlyOnceWith('1234-ABCD');
      expect(open).toHaveBeenCalledOnce();
      expect(cancel).toHaveBeenCalledOnce();
    });

    it('waits for the code with no code shown', () => {
      useDoctorStore.setState({ login: { loginId: 'login-1', code: null } });
      render(<Setup />);

      expect(screen.queryByTestId('login-code')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sign in with GitHub' })).not.toBeInTheDocument();
    });

    it('reads Signed in as the account on done', () => {
      useDoctorStore.setState({ report: report('ok'), signedInAs: 'octocat' });
      render(<Setup />);

      expect(screen.getByText('Signed in as octocat')).toBeInTheDocument();
      expect(screen.getByTestId('signin-check')).toBeInTheDocument();
    });

    it('shows the failure sentence and Try again', async () => {
      const login = vi.fn(() =>
        Promise.resolve({ ok: true as const, data: { loginId: 'login-2' } }),
      );
      window.conductor.doctorLogin = login;
      useDoctorStore.setState({
        login: {
          loginId: 'login-1',
          failed: {
            code: 'doctor/login-failed',
            message: "GitHub sign-in didn't finish. Try again when you're ready.",
            detail: 'The device code has expired',
          },
        },
      });
      render(<Setup />);

      expect(screen.getByRole('alert')).toHaveTextContent("GitHub sign-in didn't finish.");
      expect(screen.queryByText(/device code has expired/)).not.toBeInTheDocument();
      await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

      expect(login).toHaveBeenCalledOnce();
    });
  });

  /** Criterion 41 — no timer of its own: nothing on screen changes without
   * a store change. */
  it('holds no timer', () => {
    vi.useFakeTimers();
    try {
      render(<Setup />);
      const before = document.body.innerHTML;
      vi.advanceTimersByTime(5_000);
      expect(document.body.innerHTML).toBe(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

import type { ResolvedRepo } from '@shared/ipc';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRepoStore, useRepoStore } from '../../stores/repo.store';
import { Connect } from './Connect';

/**
 * The first-run screen: the only content of the window while no repo is
 * active. Strings are the kit's, the mark is the real icon, and the footer
 * button opens the app resolution found.
 */

const RESOLVED: ResolvedRepo = {
  url: 'https://github.com/loja-verde/pnp-fast-mode',
  org: 'loja-verde',
  name: 'pnp-fast-mode',
  appName: 'PnP Fast Mode',
  appId: { android: 'com.lojaverde.pnp', ios: 'com.lojaverde.pnp' },
  branch: 'main',
  flowCount: 4,
};

beforeEach(() => {
  resetRepoStore();
});

describe('the connect screen', () => {
  it('says what one paste buys, in the kit words', () => {
    render(<Connect />);

    expect(
      screen.getByRole('heading', { name: 'Point Conductor at a repository' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Everything comes from the repo: the app to launch, its bundle id, and the conductor/ folder your flows live in. You can add more later.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Nothing is pushed without you')).toBeInTheDocument();
  });

  /** The mark is `build/icon.png` — never the kit's gradient "C". */
  it('wears the real Conductor icon as its mark', () => {
    render(<Connect />);

    expect(screen.getByTestId('connect-mark')).toHaveAttribute('src');
  });

  it('focuses the address field on arrival', () => {
    render(<Connect />);

    expect(screen.getByRole('textbox', { name: 'Repository address' })).toHaveFocus();
  });

  it('keeps Open project disabled until something is found', () => {
    render(<Connect />);

    expect(screen.getByRole('button', { name: 'Open project' })).toBeDisabled();
  });

  it('types into the store', async () => {
    render(<Connect />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Repository address' }),
      'github.com/o/a',
    );

    expect(useRepoStore.getState().url).toBe('github.com/o/a');
  });

  /** Found: the button names the app and confirms through the bridge. */
  it('offers Open <app name> once found', () => {
    useRepoStore.setState({ phase: 'found', found: RESOLVED });
    render(<Connect />);

    expect(screen.getByRole('button', { name: 'Open PnP Fast Mode' })).toBeEnabled();
  });

  it('runs the whole resolution against the bridge', async () => {
    const resolve = vi.fn(() => Promise.resolve({ ok: true as const, data: { resolveId: 3 } }));
    window.conductor.repoResolve = resolve;
    render(<Connect />);

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Repository address' }),
      'github.com/loja-verde/pnp-fast-mode{Enter}',
    );

    expect(resolve).toHaveBeenCalledExactlyOnceWith('github.com/loja-verde/pnp-fast-mode');
    expect(screen.getByText('Reading the repository')).toBeInTheDocument();
  });
});

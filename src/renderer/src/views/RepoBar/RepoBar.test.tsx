import type { ConnectedRepo } from '@shared/ipc';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRepoStore, useRepoStore } from '../../stores/repo.store';
import { RepoBar } from './RepoBar';

/**
 * The switcher at the top of the sidebar: the active project's initial on
 * the aurora tile, its name, `branch · bundle id`, and the popover that
 * switches or adds.
 */

function repo(slug: string, name: string, appName: string): ConnectedRepo {
  return {
    url: `https://github.com/loja-verde/${name}`,
    org: 'loja-verde',
    name,
    slug,
    appName,
    appId: { android: 'com.lojaverde.pnp', ios: null },
    branch: 'main',
    flowCount: 4,
    connectedAt: '2026-08-06T12:00:00.000Z',
  };
}

const REPOS = [
  repo('pnp-slug', 'pnp-fast-mode', 'PnP Fast Mode'),
  repo('other-slug', 'other', 'Other'),
];

beforeEach(() => {
  resetRepoStore();
  useRepoStore.setState({ repos: REPOS, active: 'pnp-slug', loaded: true });
  // Opening the switcher re-asks main for the list; here main answers with
  // the same truth the store was seeded with.
  window.conductor.repoList = vi.fn(() =>
    Promise.resolve({ ok: true as const, data: { repos: REPOS, active: 'pnp-slug' } }),
  );
});

describe('the repo bar', () => {
  it('names the active project with its branch and bundle id', () => {
    render(<RepoBar />);

    expect(screen.getByText('pnp-fast-mode')).toBeInTheDocument();
    expect(screen.getByText('main · com.lojaverde.pnp')).toBeInTheDocument();
    expect(screen.getByText('P')).toBeInTheDocument();
  });

  it('renders nothing while no repo is active', () => {
    useRepoStore.setState({ active: null });
    const { container } = render(<RepoBar />);

    expect(container).toBeEmptyDOMElement();
  });

  it('opens the switcher on click', async () => {
    render(<RepoBar />);

    await userEvent.click(screen.getByRole('button', { name: /pnp-fast-mode/ }));

    expect(screen.getByText('Repositories')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /other/ })).toBeInTheDocument();
  });

  /** The count on each row is read off the clone per query (§7) — the
   * moment of opening is the query, so flows created since the last repo
   * event still show their true number. */
  it('re-reads the repo list when the switcher opens', async () => {
    const fresh = REPOS.map((entry) =>
      entry.slug === 'pnp-slug' ? { ...entry, flowCount: 9 } : entry,
    );
    const list = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { repos: fresh, active: 'pnp-slug' } }),
    );
    window.conductor.repoList = list;
    render(<RepoBar />);

    await userEvent.click(screen.getByRole('button', { name: /pnp-fast-mode/ }));

    expect(list).toHaveBeenCalledOnce();
    expect(await screen.findByText('9')).toBeInTheDocument();
  });

  it('switches the active repo on a row click', async () => {
    const switchRepo = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { repos: REPOS, active: 'other-slug' } }),
    );
    window.conductor.repoSwitch = switchRepo;
    render(<RepoBar />);

    await userEvent.click(screen.getByRole('button', { name: /pnp-fast-mode/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: /other/ }));

    expect(switchRepo).toHaveBeenCalledExactlyOnceWith('other-slug');
    expect(screen.queryByText('Repositories')).not.toBeInTheDocument();
  });

  /** "Add repository…" opens the same resolver as a sheet, via the store. */
  it('hands Add repository… to the add sheet', async () => {
    render(<RepoBar />);

    await userEvent.click(screen.getByRole('button', { name: /pnp-fast-mode/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Add repository…' }));

    expect(useRepoStore.getState().addOpen).toBe(true);
    expect(screen.queryByText('Repositories')).not.toBeInTheDocument();
  });
});

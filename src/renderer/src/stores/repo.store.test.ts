import type { ConnectedRepo, RepoState, ResolvedRepo, Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRepoStore, selectActiveRepo, useRepoStore } from './repo.store';

/**
 * The store is a projection of main's repo state plus the resolver's UI
 * state — never a second truth. The parse refusals answer instantly with
 * zero IPC; everything real crosses the bridge and comes back as events.
 */

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

function refusal(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

function store(): ReturnType<typeof useRepoStore.getState> {
  return useRepoStore.getState();
}

const RESOLVED: ResolvedRepo = {
  url: 'https://github.com/loja-verde/pnp-fast-mode',
  org: 'loja-verde',
  name: 'pnp-fast-mode',
  appName: 'PnP Fast Mode',
  appId: { android: 'com.lojaverde.pnp', ios: 'com.lojaverde.pnp' },
  branch: 'main',
  flowCount: 4,
};

function repo(slug: string, overrides: Partial<ConnectedRepo> = {}): ConnectedRepo {
  return {
    ...RESOLVED,
    slug,
    connectedAt: '2026-08-06T12:00:00.000Z',
    ...overrides,
  };
}

const STATE: RepoState = { repos: [repo('loja-verde-pnp-fast-mode-1a2b3c4d')], active: null };

beforeEach(() => {
  resetRepoStore();
});

describe('the projection', () => {
  it('init stores the answer and marks the state loaded', async () => {
    window.conductor.repoList = vi.fn(() =>
      Promise.resolve(ok({ repos: STATE.repos, active: 'loja-verde-pnp-fast-mode-1a2b3c4d' })),
    );

    await store().init();

    expect(store().loaded).toBe(true);
    expect(store().active).toBe('loja-verde-pnp-fast-mode-1a2b3c4d');
    expect(selectActiveRepo(store())?.appName).toBe('PnP Fast Mode');
  });

  /** The window decides connect-vs-workspace only after the truth arrives —
   * a persisted repo must never flash the connect screen. */
  it('marks the state loaded even when the list fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.conductor.repoList = vi.fn(() => Promise.resolve(refusal('ipc/handler-failed', 'x')));

    await store().init();

    expect(store().loaded).toBe(true);
    expect(store().active).toBeNull();
    log.mockRestore();
  });

  it('applies a pushed state change', () => {
    store().applyState(ok({ repos: STATE.repos, active: STATE.repos[0]?.slug ?? null }));

    expect(store().repos).toHaveLength(1);
    expect(store().active).toBe(STATE.repos[0]?.slug);
  });

  /** Counts are computed per query in main (§7) — whoever asks again gets
   * the fresh number, and a failed re-read never blanks a working list. */
  it('refresh replaces the projection with the fresh answer', async () => {
    store().applyState(ok({ repos: STATE.repos, active: STATE.repos[0]?.slug ?? null }));
    window.conductor.repoList = vi.fn(() =>
      Promise.resolve(
        ok({
          repos: [repo('loja-verde-pnp-fast-mode-1a2b3c4d', { flowCount: 9 })],
          active: 'loja-verde-pnp-fast-mode-1a2b3c4d',
        }),
      ),
    );

    await store().refresh();

    expect(store().repos[0]?.flowCount).toBe(9);
    expect(store().active).toBe('loja-verde-pnp-fast-mode-1a2b3c4d');
  });

  it('refresh keeps the current projection when the re-read fails', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    store().applyState(ok({ repos: STATE.repos, active: null }));
    window.conductor.repoList = vi.fn(() => Promise.resolve(refusal('ipc/handler-failed', 'x')));

    await store().refresh();

    expect(store().repos).toHaveLength(1);
    expect(store().repos[0]?.flowCount).toBe(4);
    log.mockRestore();
  });
});

describe('submit', () => {
  it('refuses gibberish instantly, with the kit words and zero IPC', async () => {
    const resolve = vi.fn();
    window.conductor.repoResolve = resolve;
    store().setUrl('not a repository');

    await store().submit();

    expect(store().phase).toBe('error');
    expect(store().resolveError?.title).toBe('That is not a repository address');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('refuses a non-GitHub host by name, still with zero IPC', async () => {
    const resolve = vi.fn();
    window.conductor.repoResolve = resolve;
    store().setUrl('https://gitlab.com/org/app');

    await store().submit();

    expect(store().resolveError?.title).toBe('Conductor reads GitHub only, for now');
    expect(store().resolveError?.body).toBe('gitlab.com repositories are not supported yet.');
    expect(resolve).not.toHaveBeenCalled();
  });

  /** Case-insensitive `org/name` — GitHub treats them as one repo. */
  it('refuses a repo already in the list, whatever its case', async () => {
    const resolve = vi.fn();
    window.conductor.repoResolve = resolve;
    store().applyState(ok(STATE));
    store().setUrl('github.com/LOJA-VERDE/PNP-FAST-MODE');

    await store().submit();

    expect(store().resolveError?.title).toBe('Already connected');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('sends the raw URL and enters the resolving phase', async () => {
    const resolve = vi.fn(() => Promise.resolve(ok({ resolveId: 7 })));
    window.conductor.repoResolve = resolve;
    store().setUrl('  github.com/loja-verde/pnp-fast-mode  ');

    await store().submit();

    expect(store().phase).toBe('resolving');
    expect(store().step).toBe(0);
    expect(resolve).toHaveBeenCalledExactlyOnceWith('  github.com/loja-verde/pnp-fast-mode  ');
  });

  it('surfaces a refusal from main with the kit surface', async () => {
    window.conductor.repoResolve = vi.fn(() =>
      Promise.resolve(refusal('repo/already-connected', 'x')),
    );
    store().setUrl('github.com/loja-verde/pnp-fast-mode');

    await store().submit();

    expect(store().phase).toBe('error');
    expect(store().resolveError?.title).toBe('Already connected');
  });
});

describe('resolve events', () => {
  async function resolving(): Promise<void> {
    window.conductor.repoResolve = vi.fn(() => Promise.resolve(ok({ resolveId: 7 })));
    store().setUrl('github.com/loja-verde/pnp-fast-mode');
    await store().submit();
  }

  it('advances the steps of the current resolution', async () => {
    await resolving();

    store().applyResolveEvent(ok({ kind: 'step', resolveId: 7, step: 2 }));

    expect(store().step).toBe(2);
  });

  it('ignores events from a superseded resolution', async () => {
    await resolving();

    store().applyResolveEvent(ok({ kind: 'step', resolveId: 6, step: 1 }));
    store().applyResolveEvent(ok({ kind: 'found', resolveId: 6, repo: RESOLVED }));

    expect(store().step).toBe(0);
    expect(store().phase).toBe('resolving');
  });

  it('lands on the found card', async () => {
    await resolving();

    store().applyResolveEvent(ok({ kind: 'found', resolveId: 7, repo: RESOLVED }));

    expect(store().phase).toBe('found');
    expect(store().found?.appName).toBe('PnP Fast Mode');
  });

  /** The failure names its resolution and its code; the surface is built
   * from the code with the pasted repo's own name in the body. */
  it('lands on the kit error surface with the repo named', async () => {
    await resolving();

    store().applyResolveEvent(
      ok({ kind: 'failed', resolveId: 7, code: 'repo/gh-unauthenticated', message: 'refused' }),
    );

    expect(store().phase).toBe('error');
    expect(store().resolveError?.body).toContain('loja-verde/pnp-fast-mode');
    expect(store().resolveError?.command).toBe('gh auth login');
  });

  /**
   * A missing `gh` fails before main's handler even returns, so its events
   * are delivered ahead of the invoke reply — before the store knows its
   * resolveId. They must wait for the reply, not vanish: this is the
   * first-run failure whose whole point is showing `brew install gh`.
   */
  it('keeps a failure that outruns the invoke reply', async () => {
    window.conductor.repoResolve = vi.fn(() => {
      store().applyResolveEvent(ok({ kind: 'step', resolveId: 9, step: 0 }));
      store().applyResolveEvent(
        ok({ kind: 'failed', resolveId: 9, code: 'repo/gh-missing', message: 'not installed' }),
      );
      return Promise.resolve(ok({ resolveId: 9 }));
    });
    store().setUrl('github.com/loja-verde/pnp-fast-mode');

    await store().submit();

    expect(store().phase).toBe('error');
    expect(store().resolveError?.command).toBe('brew install gh');
  });

  /** The buffer holds only the reply's own resolution — an early event from
   * a superseded one still dies at the drain. */
  it('drops a buffered event that belongs to another resolution', async () => {
    window.conductor.repoResolve = vi.fn(() => {
      store().applyResolveEvent(
        ok({ kind: 'failed', resolveId: 3, code: 'repo/gh-missing', message: 'stale' }),
      );
      return Promise.resolve(ok({ resolveId: 9 }));
    });
    store().setUrl('github.com/loja-verde/pnp-fast-mode');

    await store().submit();

    expect(store().phase).toBe('resolving');
  });
});

describe('confirm', () => {
  async function found(): Promise<void> {
    window.conductor.repoResolve = vi.fn(() => Promise.resolve(ok({ resolveId: 7 })));
    store().setUrl('github.com/loja-verde/pnp-fast-mode');
    await store().submit();
    store().applyResolveEvent(ok({ kind: 'found', resolveId: 7, repo: RESOLVED }));
  }

  it('connects the pending resolution and applies the fresh state', async () => {
    await found();
    const slug = 'loja-verde-pnp-fast-mode-1a2b3c4d';
    const connect = vi.fn(() => Promise.resolve(ok({ repos: [repo(slug)], active: slug })));
    window.conductor.repoConnect = connect;

    await store().confirm();

    expect(connect).toHaveBeenCalledExactlyOnceWith(7);
    expect(store().active).toBe(slug);
    expect(store().phase).toBe('idle');
    expect(store().addOpen).toBe(false);
  });

  it('does nothing before anything was found', async () => {
    const connect = vi.fn();
    window.conductor.repoConnect = connect;

    await store().confirm();

    expect(connect).not.toHaveBeenCalled();
  });

  it('surfaces a stale resolution as the kit error', async () => {
    await found();
    window.conductor.repoConnect = vi.fn(() =>
      Promise.resolve(refusal('repo/resolve-not-found', 'That resolution is not pending.')),
    );

    await store().confirm();

    expect(store().phase).toBe('error');
    expect(store().resolveError?.body).toBe('That resolution is not pending.');
  });

  /** A double-click is one confirm: the second call while the first is in
   * flight must not earn a spurious resolve-not-found surface. */
  it('confirms once however fast the clicks come', async () => {
    await found();
    let settle: (value: Result<RepoState>) => void = () => {};
    const connect = vi.fn(
      () =>
        new Promise<Result<RepoState>>((resolve) => {
          settle = resolve;
        }),
    );
    window.conductor.repoConnect = connect;

    const first = store().confirm();
    const second = store().confirm();
    settle(ok({ repos: [repo('slug')], active: 'slug' }));
    await Promise.all([first, second]);

    expect(connect).toHaveBeenCalledTimes(1);
    expect(store().active).toBe('slug');
  });
});

describe('switching', () => {
  it('asks main and applies the answer', async () => {
    const next = repo('other-slug');
    const switchRepo = vi.fn(() => Promise.resolve(ok({ repos: [next], active: 'other-slug' })));
    window.conductor.repoSwitch = switchRepo;

    await store().switchRepo('other-slug');

    expect(switchRepo).toHaveBeenCalledExactlyOnceWith('other-slug');
    expect(store().active).toBe('other-slug');
  });
});

describe('the resolver field', () => {
  it('typing after an error returns the resolver to idle', async () => {
    store().setUrl('nope');
    await store().submit();
    expect(store().phase).toBe('error');

    store().setUrl('nope again');

    expect(store().phase).toBe('idle');
    expect(store().resolveError).toBeNull();
  });

  /** The add sheet reopens clean every time (criterion: reset on open). */
  it('openAdd resets the resolver and the field', async () => {
    store().setUrl('github.com/x/y');
    window.conductor.repoResolve = vi.fn(() => Promise.resolve(ok({ resolveId: 1 })));
    await store().submit();

    store().openAdd();

    expect(store().addOpen).toBe(true);
    expect(store().url).toBe('');
    expect(store().phase).toBe('idle');
  });

  it('closeAdd puts the sheet away and forgets the resolution', async () => {
    store().openAdd();
    store().closeAdd();

    expect(store().addOpen).toBe(false);
    // A late event from the abandoned resolve changes nothing.
    store().applyResolveEvent(ok({ kind: 'found', resolveId: 1, repo: RESOLVED }));
    expect(store().phase).toBe('idle');
  });

  /** The empty field's Paste affordance — clipboard through main (§9.3). */
  it('paste fills the field from the clipboard', async () => {
    window.conductor.appReadClipboard = vi.fn(() =>
      Promise.resolve(ok({ text: 'github.com/loja-verde/pnp-fast-mode' })),
    );

    await store().pasteFromClipboard();

    expect(store().url).toBe('github.com/loja-verde/pnp-fast-mode');
  });

  /** The error surface's working Copy button, same road out (§9.3). */
  it('copyCommand writes through main', async () => {
    const write = vi.fn(() => Promise.resolve(ok({ text: 'gh auth login' })));
    window.conductor.appWriteClipboard = write;

    await store().copyCommand('gh auth login');

    expect(write).toHaveBeenCalledExactlyOnceWith('gh auth login');
  });
});

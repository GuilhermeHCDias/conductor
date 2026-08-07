import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { RepoResolveEvent, RepoState, Result } from '@shared/ipc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RepoService, type RepoServiceDeps, type RepoWorkspace } from './repo.service';
import { repoSlug } from './repo-derive';

/**
 * The repo domain against real temp directories and a fake `gh`: the runner
 * is a constructor dep, so a "clone" is a closure writing the directories a
 * real clone would leave behind — app.json, .git/HEAD, conductor/ — and a
 * failure is a non-zero exit, never a stubbed `node:fs`.
 */

const scratch: string[] = [];
const services: RepoService[] = [];

afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.dispose();
  }
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const URL = 'https://github.com/loja-verde/pnp-fast-mode';
const SLUG = repoSlug('loja-verde', 'pnp-fast-mode');

/** A valid flow: `appId:` before the `---` (§7.1). */
const FLOW = 'appId: com.lojaverde.pnp\n---\n- launchApp:\n    clearState: true\n';

const APP_JSON = JSON.stringify({
  expo: {
    name: 'PnP Fast Mode',
    android: { package: 'com.lojaverde.pnp' },
    ios: { bundleIdentifier: 'com.lojaverde.pnp' },
  },
});

type Call = { command: string; args: readonly string[] };

/** What a real `gh repo clone` leaves behind, written by the fake. */
function plantClone(
  target: string,
  options: { appJson?: string | null; head?: string; flows?: readonly string[] } = {},
): void {
  mkdirSync(target, { recursive: true });
  if (options.appJson !== null) {
    writeFileSync(join(target, 'app.json'), options.appJson ?? APP_JSON);
  }
  mkdirSync(join(target, '.git'), { recursive: true });
  writeFileSync(join(target, '.git', 'HEAD'), options.head ?? 'ref: refs/heads/main\n');
  for (const flow of options.flows ?? []) {
    const path = join(target, 'conductor', flow);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, FLOW);
  }
}

type HarnessOptions = {
  gh?: string | null;
  authCode?: number;
  /** Answers the clone: plant files and return 0, or return a failure code. */
  clone?: (target: string) => number;
  /** Clone hangs until aborted — for supersede and dispose tests. */
  hangClone?: boolean;
  /** Clone hangs and ignores the abort — the worst-case child that outlives
   * its SIGTERM — until the test settles it by hand via `heldClones`. */
  holdClone?: boolean;
};

function harness(options: HarnessOptions = {}): {
  service: RepoService;
  deps: RepoServiceDeps;
  dir: string;
  reposDir: string;
  calls: Call[];
  changed: Result<RepoState>[];
  resolveEvents: Result<RepoResolveEvent>[];
  workspaces: (RepoWorkspace | null)[];
  aborted: () => number;
  heldClones: Array<(exitCode: number) => void>;
} {
  const dir = mkdtempSync(join(tmpdir(), 'conductor-repo-service-'));
  scratch.push(dir);
  const reposDir = join(dir, 'repos');
  const calls: Call[] = [];
  const changed: Result<RepoState>[] = [];
  const resolveEvents: Result<RepoResolveEvent>[] = [];
  const workspaces: (RepoWorkspace | null)[] = [];
  const heldClones: Array<(exitCode: number) => void> = [];
  let abortCount = 0;

  const deps: RepoServiceDeps = {
    reposDir,
    stateFile: join(dir, 'repos.json'),
    flowsDir: 'conductor',
    extensions: ['.yml', '.yaml'],
    resolveGh: () => (options.gh === null ? null : (options.gh ?? '/fake/bin/gh')),
    run: (command, args, runOptions) => {
      calls.push({ command, args });
      if (args[0] === 'auth') {
        return Promise.resolve({ stdout: '', stderr: '', code: options.authCode ?? 0 });
      }
      if (args[0] === 'repo' && args[1] === 'clone') {
        const target = args[3];
        if (target === undefined) {
          throw new Error(`The clone call carried no target: ${JSON.stringify(args)}`);
        }
        if (options.holdClone === true) {
          return new Promise((resolvePromise) => {
            heldClones.push((exitCode) => {
              if (exitCode === 0) {
                plantClone(target);
              }
              resolvePromise({ stdout: '', stderr: 'cloning...', code: exitCode });
            });
          });
        }
        if (options.hangClone === true) {
          // Like the real `run.ts`: a process handed an already-aborted
          // signal never starts and rejects at once.
          return new Promise((_resolve, reject) => {
            const signal = runOptions?.signal;
            const abort = (): void => {
              abortCount += 1;
              reject(new Error('The operation was aborted'));
            };
            if (signal?.aborted === true) {
              abort();
              return;
            }
            signal?.addEventListener('abort', abort);
          });
        }
        if (options.clone !== undefined) {
          const code = options.clone(target);
          return Promise.resolve({ stdout: '', stderr: 'cloning...', code });
        }
        plantClone(target);
        return Promise.resolve({ stdout: '', stderr: 'cloning...', code: 0 });
      }
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    },
    emitChanged: (payload) => {
      changed.push(payload);
    },
    emitResolveEvent: (payload) => {
      resolveEvents.push(payload);
    },
    onWorkspaceChanged: (workspace) => {
      workspaces.push(workspace);
    },
    now: () => new Date('2026-08-06T12:00:00.000Z'),
  };
  const service = new RepoService(deps);
  services.push(service);
  return {
    service,
    deps,
    dir,
    reposDir,
    calls,
    changed,
    resolveEvents,
    workspaces,
    aborted: () => abortCount,
    heldClones,
  };
}

/** The clone calls alone — the ones that touch the target directory. */
function clones(calls: Call[]): Call[] {
  return calls.filter((call) => call.args[0] === 'repo' && call.args[1] === 'clone');
}

function data<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok, got ${result.error.code}: ${result.error.message}`);
  }
  return result.data;
}

function code<T>(result: Result<T>): string {
  if (result.ok) {
    throw new Error(`Expected a failure, got data: ${JSON.stringify(result.data)}`);
  }
  return result.error.code;
}

/** The event stream, unwrapped — these travel `ok` (the mirrorEnded idiom). */
function events(payloads: Result<RepoResolveEvent>[]): RepoResolveEvent[] {
  return payloads.map((payload) => data(payload));
}

async function until(
  check: () => boolean,
  detail?: () => string,
  timeoutMs = 10_000,
): Promise<void> {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`The condition never held. ${detail?.() ?? ''}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Drives one resolution to its `found` event and answers the resolve id. */
async function resolved(
  service: RepoService,
  resolveEvents: Result<RepoResolveEvent>[],
  url = URL,
): Promise<number> {
  const { resolveId } = data(await service.resolve(url));
  const mine = (): RepoResolveEvent[] =>
    events(resolveEvents).filter((event) => event.resolveId === resolveId);
  await until(
    () => mine().some((event) => event.kind !== 'step'),
    () => JSON.stringify(resolveEvents),
  );
  const terminal = mine().find((event) => event.kind !== 'step');
  if (terminal?.kind !== 'found') {
    throw new Error(`Resolution did not find: ${JSON.stringify(terminal)}`);
  }
  return resolveId;
}

describe('resolve refusals', () => {
  /** The renderer catches these first for instant feedback; main is the
   * authority and answers the same stable codes (criterion: distinct codes). */
  it('refuses gibberish without touching gh', async () => {
    const { service, calls } = harness();

    expect(code(await service.resolve('not a repository'))).toBe('repo/invalid-url');
    expect(calls).toEqual([]);
  });

  it('refuses a host that is not github.com, naming it', async () => {
    const { service, calls } = harness();

    const result = await service.resolve('https://gitlab.com/org/app');

    expect(code(result)).toBe('repo/unsupported-host');
    expect(result.ok ? '' : result.error.message).toContain('gitlab.com');
    expect(calls).toEqual([]);
  });

  /** Case-insensitive `org/name` (criterion): GitHub treats them as one. */
  it('refuses a repo already in the list, whatever its case', async () => {
    const { service, resolveEvents } = harness();
    await service.connect(await resolved(service, resolveEvents));

    expect(code(await service.resolve('github.com/LOJA-VERDE/PNP-Fast-Mode'))).toBe(
      'repo/already-connected',
    );
  });
});

describe('resolution', () => {
  it('fails with repo/gh-missing when gh cannot be found', async () => {
    const { service, resolveEvents } = harness({ gh: null });

    await service.resolve(URL);
    await until(() => resolveEvents.length > 0);

    expect(events(resolveEvents).at(-1)).toMatchObject({
      kind: 'failed',
      code: 'repo/gh-missing',
    });
  });

  /** §8.1 — installed and authenticated are different failures with
   * different fixes, and the clone must not even be attempted. */
  it('fails with repo/gh-unauthenticated when gh auth status refuses', async () => {
    const { service, calls, resolveEvents } = harness({ authCode: 1 });

    await service.resolve(URL);
    await until(() => events(resolveEvents).some((event) => event.kind === 'failed'));

    expect(events(resolveEvents).at(-1)).toMatchObject({
      kind: 'failed',
      code: 'repo/gh-unauthenticated',
    });
    expect(calls.some((call) => call.args[0] === 'repo')).toBe(false);
  });

  /** §7 + §8.1 — `gh repo clone org/name <dir> -- --filter=blob:none`, into
   * `userData/repos/<slug>`, the slug derived from owner/name alone. */
  it('clones with gh into the slug directory, blobless', async () => {
    const { service, calls, reposDir, resolveEvents } = harness();

    await resolved(service, resolveEvents);

    const clone = calls.find((call) => call.args[0] === 'repo');
    expect(clone).toEqual({
      command: '/fake/bin/gh',
      args: [
        'repo',
        'clone',
        'loja-verde/pnp-fast-mode',
        join(reposDir, SLUG),
        '--',
        '--filter=blob:none',
      ],
    });
  });

  /** The three steps are real stages: nothing advances before the work, and
   * everything has advanced by the time the card shows (criterion: no
   * simulated timers). */
  it('advances the steps as stages actually complete, then finds', async () => {
    const { service, resolveEvents } = harness();

    const resolveId = await resolved(service, resolveEvents);

    const kinds = events(resolveEvents).map((event) =>
      event.kind === 'step' ? `step:${event.step}` : event.kind,
    );
    expect(kinds).toEqual(['step:0', 'step:1', 'step:2', 'step:3', 'found']);
    expect(events(resolveEvents).every((event) => event.resolveId === resolveId)).toBe(true);
  });

  /** Everything the found card shows, derived from the clone (§2.1). */
  it('finds the card facts: names, ids, branch and flow count', async () => {
    const { service, resolveEvents } = harness({
      clone: (target) => {
        plantClone(target, {
          head: 'ref: refs/heads/develop\n',
          flows: ['checkout/pix.yml', 'login.yaml'],
        });
        // §7.1 — classified, not counted by extension.
        writeFileSync(join(target, 'conductor', 'config.yaml'), 'format: 1\n');
        return 0;
      },
    });

    await resolved(service, resolveEvents);

    const found = events(resolveEvents).find((event) => event.kind === 'found');
    expect(found?.kind === 'found' ? found.repo : null).toEqual({
      url: URL,
      org: 'loja-verde',
      name: 'pnp-fast-mode',
      appName: 'PnP Fast Mode',
      appId: { android: 'com.lojaverde.pnp', ios: 'com.lojaverde.pnp' },
      branch: 'develop',
      flowCount: 2,
    });
  });

  /** "Empty for now" is a success, not a failure (criterion). */
  it('resolves a repo with no conductor folder as zero flows', async () => {
    const { service, resolveEvents } = harness();

    await resolved(service, resolveEvents);

    const found = events(resolveEvents).find((event) => event.kind === 'found');
    expect(found?.kind === 'found' ? found.repo.flowCount : -1).toBe(0);
  });

  it('fails with repo/clone-failed when the clone exits non-zero', async () => {
    const { service, reposDir, resolveEvents } = harness({ clone: () => 128 });

    await service.resolve(URL);
    await until(() => events(resolveEvents).some((event) => event.kind === 'failed'));

    expect(events(resolveEvents).at(-1)).toMatchObject({
      kind: 'failed',
      code: 'repo/clone-failed',
    });
    expect(existsSync(join(reposDir, SLUG))).toBe(false);
  });

  /** §2.1 MVP — the message names exactly what was missing, and the failed
   * clone directory is never persisted as a connected repo. */
  it('fails naming a missing app.json and removes the clone', async () => {
    const { service, reposDir, resolveEvents } = harness({
      clone: (target) => {
        plantClone(target, { appJson: null });
        return 0;
      },
    });

    await service.resolve(URL);
    await until(() => events(resolveEvents).some((event) => event.kind === 'failed'));

    const failed = events(resolveEvents).at(-1);
    expect(failed).toMatchObject({ kind: 'failed', code: 'repo/app-config-unreadable' });
    expect(failed?.kind === 'failed' ? failed.message : '').toContain('app.json');
    expect(existsSync(join(reposDir, SLUG))).toBe(false);
  });

  /** §2.1's dynamic-config ❓ — named, not evaluated. */
  it('names app.config.js when that is what the repo uses', async () => {
    const { service, resolveEvents } = harness({
      clone: (target) => {
        plantClone(target, { appJson: null });
        writeFileSync(join(target, 'app.config.js'), 'module.exports = {};\n');
        return 0;
      },
    });

    await service.resolve(URL);
    await until(() => events(resolveEvents).some((event) => event.kind === 'failed'));

    const failed = events(resolveEvents).at(-1);
    expect(failed?.kind === 'failed' ? failed.message : '').toContain('app.config.js');
  });

  it('fails naming the missing ids', async () => {
    const { service, resolveEvents } = harness({
      clone: (target) => {
        plantClone(target, { appJson: JSON.stringify({ expo: { name: 'X' } }) });
        return 0;
      },
    });

    await service.resolve(URL);
    await until(() => events(resolveEvents).some((event) => event.kind === 'failed'));

    const failed = events(resolveEvents).at(-1);
    expect(failed).toMatchObject({ kind: 'failed', code: 'repo/app-config-unreadable' });
    expect(failed?.kind === 'failed' ? failed.message : '').toContain('expo.android.package');
  });

  /** A crashed earlier attempt leaves its directory behind; the retry starts
   * clean instead of cloning into a refusal. */
  it('clears a leftover unconnected clone before cloning again', async () => {
    const { service, reposDir, resolveEvents } = harness({
      clone: (target) => {
        expect(existsSync(target)).toBe(false);
        plantClone(target);
        return 0;
      },
    });
    mkdirSync(join(reposDir, SLUG), { recursive: true });
    writeFileSync(join(reposDir, SLUG, 'leftover.txt'), 'from a crashed attempt');

    await resolved(service, resolveEvents);

    expect(existsSync(join(reposDir, SLUG, 'leftover.txt'))).toBe(false);
  });

  /** A second paste supersedes the first: the stale resolution is aborted
   * and nothing it says reaches the surface. */
  it('supersedes an in-flight resolution silently', async () => {
    const { service, resolveEvents, aborted } = harness({ hangClone: true });
    const first = data(await service.resolve(URL));

    const second = await service.resolve('github.com/loja-verde/other-app');

    expect(data(second).resolveId).not.toBe(first.resolveId);
    await until(() => aborted() > 0);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      events(resolveEvents).some(
        (event) => event.kind === 'failed' && event.resolveId === first.resolveId,
      ),
    ).toBe(false);
  });

  /** The supersede abort is a request, not a guarantee — the old `gh`
   * child can outlive its SIGTERM. The new resolution re-clones into the
   * very same directory, so none of its work may start until the old one
   * has fully wound down. The fake here ignores the abort entirely. */
  it('holds the superseding resolution until the superseded one wound down', async () => {
    const { service, calls, resolveEvents, heldClones } = harness({ holdClone: true });
    data(await service.resolve(URL));
    await until(() => clones(calls).length === 1);

    const second = data(await service.resolve(URL));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(clones(calls)).toHaveLength(1);

    heldClones[0]?.(1);
    await until(() => clones(calls).length === 2);
    heldClones[1]?.(0);
    await until(
      () =>
        events(resolveEvents).some(
          (event) => event.kind === 'found' && event.resolveId === second.resolveId,
        ),
      () => JSON.stringify(resolveEvents),
    );
  });

  /** Hygiene criterion — dispose aborts whatever is in flight. */
  it('aborts the in-flight clone on dispose', async () => {
    const { service, aborted } = harness({ hangClone: true });
    await service.resolve(URL);

    await service.dispose();

    await until(() => aborted() > 0);
  });
});

describe('connect', () => {
  it('persists the repo, marks it active and re-points the workspace', async () => {
    const { service, deps, reposDir, resolveEvents, changed, workspaces } = harness();
    const resolveId = await resolved(service, resolveEvents);

    const result = await service.connect(resolveId);

    const state = data(result);
    expect(state.active).toBe(SLUG);
    expect(state.repos).toEqual([
      {
        url: URL,
        org: 'loja-verde',
        name: 'pnp-fast-mode',
        slug: SLUG,
        appName: 'PnP Fast Mode',
        appId: { android: 'com.lojaverde.pnp', ios: 'com.lojaverde.pnp' },
        branch: 'main',
        flowCount: 0,
        connectedAt: '2026-08-06T12:00:00.000Z',
      },
    ]);
    // The workspace re-pointed to the clone's conductor/ with the header id.
    expect(workspaces).toEqual([
      { root: join(reposDir, SLUG, 'conductor'), appId: 'com.lojaverde.pnp' },
    ]);
    // The push carries the same projection the invoke answered.
    expect(changed.map(data).at(-1)).toEqual(state);
    // Persisted in userData — main's truth, no renderer involved.
    expect(JSON.parse(readFileSync(deps.stateFile, 'utf8')).active).toBe(SLUG);
  });

  it('refuses a resolve id that is not pending', async () => {
    const { service } = harness();

    expect(code(await service.connect(7))).toBe('repo/resolve-not-found');
  });

  /** §2.1's divergence — both ids persist; the header value is null and the
   * workspace says so. */
  it('hands the workspace a null header id when the ids diverge', async () => {
    const { service, resolveEvents, workspaces } = harness({
      clone: (target) => {
        plantClone(target, {
          appJson: JSON.stringify({
            expo: {
              name: 'X',
              android: { package: 'com.x.android' },
              ios: { bundleIdentifier: 'com.x.ios' },
            },
          }),
        });
        return 0;
      },
    });

    await service.connect(await resolved(service, resolveEvents));

    expect(workspaces.at(-1)?.appId).toBeNull();
  });
});

describe('switch', () => {
  it('changes the active repo and re-points the workspace', async () => {
    const { service, reposDir, resolveEvents, changed, workspaces } = harness();
    await service.connect(await resolved(service, resolveEvents));
    await service.connect(await resolved(service, resolveEvents, 'github.com/loja-verde/other'));
    const otherSlug = repoSlug('loja-verde', 'other');

    const result = await service.switch(SLUG);

    expect(data(result).active).toBe(SLUG);
    expect(workspaces.at(-1)).toEqual({
      root: join(reposDir, SLUG, 'conductor'),
      appId: 'com.lojaverde.pnp',
    });
    expect(data(result).repos.map((repo) => repo.slug)).toEqual([SLUG, otherSlug]);
    expect(changed.length).toBeGreaterThanOrEqual(3);
  });

  it('refuses a slug the list does not have', async () => {
    const { service } = harness();

    expect(code(await service.switch('nope'))).toBe('repo/not-found');
  });
});

describe('persistence', () => {
  it('answers the saved list and active repo after a restart', async () => {
    const first = harness();
    await first.service.connect(await resolved(first.service, first.resolveEvents));

    // A second service over the same userData — the app relaunched.
    const second = new RepoService({ ...first.deps });
    services.push(second);
    await second.start();

    const state = data(await second.list());
    expect(state.active).toBe(SLUG);
    expect(state.repos[0]?.appName).toBe('PnP Fast Mode');
    expect(state.repos[0]?.branch).toBe('main');
    expect(second.activeWorkspace()).toEqual({
      root: join(first.reposDir, SLUG, 'conductor'),
      appId: 'com.lojaverde.pnp',
    });
  });

  it('starts empty when nothing was ever saved', async () => {
    const { service } = harness();
    await service.start();

    expect(data(await service.list())).toEqual({ repos: [], active: null });
    expect(service.activeWorkspace()).toBeNull();
  });

  it('starts empty over a corrupt state file instead of crashing', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { service, deps } = harness();
    writeFileSync(deps.stateFile, '{ not json');

    await service.start();

    expect(data(await service.list())).toEqual({ repos: [], active: null });
    log.mockRestore();
  });

  /** The list's flow counts follow the clones as they change on disk. */
  it('counts flows per repo at list time', async () => {
    const { service, reposDir, resolveEvents } = harness();
    await service.connect(await resolved(service, resolveEvents));
    const flow = join(reposDir, SLUG, 'conductor', 'novo.yaml');
    mkdirSync(dirname(flow), { recursive: true });
    writeFileSync(flow, FLOW);

    const state = data(await service.list());

    expect(state.repos[0]?.flowCount).toBe(1);
  });
});

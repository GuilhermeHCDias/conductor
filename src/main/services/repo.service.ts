import { mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  type ConnectedRepo,
  ERROR_CODES,
  type RepoResolveEvent,
  type RepoState,
  type ResolvedRepo,
  type Result,
} from '@shared/ipc';
import { z } from 'zod';
import type { RunOptions, RunResult } from '../process/run';
import { flowBody, hasFlowExtension } from './flow-classify';
import { deriveAppMeta, headBranch, headerAppId, parseRepoUrl, repoSlug } from './repo-derive';

/**
 * The repo domain (§2.1, §7): the connected list and the active repo — both
 * persisted in `userData`, main's truth, never the renderer's — plus the
 * resolver behind the connect screen. Resolution is real work against a
 * remote: it is started, streamed as `repo:resolve-event` pushes and never
 * awaited in a handler; confirming (`connect`) only persists what resolution
 * already derived. `gh` is the only network door (§8.1), reached through the
 * injected runner — this service never imports `child_process`.
 */

/** What the flow workspace needs to know about the active repo: the
 * `conductor/` root inside its clone and the single header id (§12.6). */
export type RepoWorkspace = {
  readonly root: string;
  readonly appId: string | null;
};

export type RepoServiceDeps = {
  /** `userData/repos` — one clone per slug (§7). */
  readonly reposDir: string;
  /** `userData/repos.json` — the list and the active slug. */
  readonly stateFile: string;
  /** `CONFIG.FLOWS_DIR` — where flows live inside a clone (§7.1). */
  readonly flowsDir: string;
  /** `CONFIG.FLOW_EXTENSIONS` — what can be a flow file at all. */
  readonly extensions: readonly string[];
  /** Where `gh` is on this machine, or `null` — `resolve-gh`, injected so a
   * test can make the machine anything it needs. */
  readonly resolveGh: () => string | null;
  /** The one process door (§10.1): `execFile` with an argument array. */
  readonly run: (
    command: string,
    args: readonly string[],
    options?: RunOptions,
  ) => Promise<RunResult>;
  /** Pushes the fresh repo state at the window. */
  readonly emitChanged: (payload: Result<RepoState>) => void;
  /** Pushes resolution progress — real stages, never timers. */
  readonly emitResolveEvent: (payload: Result<RepoResolveEvent>) => void;
  /** The composition root re-points the flow workspace (and the window)
   * here whenever the active repo changes. */
  readonly onWorkspaceChanged: (workspace: RepoWorkspace | null) => void | Promise<void>;
  /** The clock, injectable so `connectedAt` is assertable. */
  readonly now?: () => Date;
};

/** What survives a relaunch. `branch` and `flowCount` are deliberately not
 * here — they are read off the clone whenever the list is asked, because the
 * clone changes under us and a stale count would be a small lie. */
const persistedRepo = z.object({
  url: z.string(),
  org: z.string(),
  name: z.string(),
  slug: z.string(),
  appName: z.string(),
  appId: z.object({ android: z.string().nullable(), ios: z.string().nullable() }),
  connectedAt: z.string(),
});

const persistedState = z.object({
  version: z.literal(1),
  active: z.string().nullable(),
  repos: z.array(persistedRepo),
});

type PersistedRepo = z.infer<typeof persistedRepo>;

export class RepoService {
  private readonly deps: RepoServiceDeps;
  private repos: PersistedRepo[] = [];
  private active: string | null = null;
  /** The one resolution `connect` may confirm — set by a `found`, cleared by
   * a confirm or by the next `resolve`. */
  private pendingFound: { resolveId: number; repo: ResolvedRepo } | null = null;
  private controller: AbortController | null = null;
  private currentResolveId = 0;
  private nextResolveId = 1;
  private disposed = false;

  constructor(deps: RepoServiceDeps) {
    this.deps = deps;
  }

  /** Loads the persisted list. A corrupt file starts empty rather than
   * crashing the app — the next connect rewrites it whole. */
  async start(): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.deps.stateFile, 'utf8');
    } catch {
      return;
    }
    try {
      const state = persistedState.parse(JSON.parse(text));
      this.repos = state.repos;
      this.active = state.active;
    } catch (error) {
      console.error('The repo list could not be read; starting empty.', error);
    }
  }

  /** Ends whatever resolution is in flight; nothing else is held. */
  dispose(): void {
    this.disposed = true;
    this.controller?.abort();
  }

  /** The active repo's workspace, for the composition root to hand the flow
   * service at startup — `null` before the first connect. */
  activeWorkspace(): RepoWorkspace | null {
    const repo = this.repos.find((entry) => entry.slug === this.active);
    if (repo === undefined) {
      return null;
    }
    return {
      root: join(this.deps.reposDir, repo.slug, this.deps.flowsDir),
      appId: headerAppId(repo.appId),
    };
  }

  async list(): Promise<Result<RepoState>> {
    return { ok: true, data: await this.projection() };
  }

  /**
   * Starts resolving a pasted URL. The immediate refusals — not an address,
   * not GitHub, already connected — answer on the invoke without touching
   * the network; everything real streams as `repo:resolve-event` pushes. A
   * new resolve supersedes the one in flight: the stale work is aborted and
   * nothing it says reaches the surface.
   */
  async resolve(url: string): Promise<Result<{ resolveId: number }>> {
    const parsed = parseRepoUrl(url);
    if (parsed === null) {
      return refuse(ERROR_CODES.repoInvalidUrl, 'That is not a repository address.');
    }
    if (parsed.host !== 'github.com') {
      return refuse(
        ERROR_CODES.repoUnsupportedHost,
        `${parsed.host} repositories are not supported yet.`,
      );
    }
    if (this.isConnected(parsed.org, parsed.name)) {
      return refuse(
        ERROR_CODES.repoAlreadyConnected,
        `${parsed.org}/${parsed.name} is already connected.`,
      );
    }
    const resolveId = this.nextResolveId;
    this.nextResolveId += 1;
    this.pendingFound = null;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.currentResolveId = resolveId;
    void this.runResolution(resolveId, parsed.org, parsed.name, url, controller.signal);
    return { ok: true, data: { resolveId } };
  }

  /**
   * "Open <app>": persists what resolution already derived, marks it active
   * and re-points the workspace. The renderer names the resolution and
   * nothing else — no derived fact makes a round trip (§9.3).
   */
  async connect(resolveId: number): Promise<Result<RepoState>> {
    const pending = this.pendingFound;
    if (pending === null || pending.resolveId !== resolveId) {
      return refuse(ERROR_CODES.repoResolveNotFound, 'That resolution is not pending any more.');
    }
    const { repo } = pending;
    this.pendingFound = null;
    const entry: PersistedRepo = {
      url: repo.url,
      org: repo.org,
      name: repo.name,
      slug: repoSlug(repo.org, repo.name),
      appName: repo.appName,
      appId: repo.appId,
      connectedAt: (this.deps.now?.() ?? new Date()).toISOString(),
    };
    this.repos = [...this.repos, entry];
    this.active = entry.slug;
    await this.saveState();
    await this.deps.onWorkspaceChanged(this.activeWorkspace());
    return this.announce();
  }

  /** Row click in the popover: swaps the whole workspace to another clone. */
  async switch(slug: string): Promise<Result<RepoState>> {
    const repo = this.repos.find((entry) => entry.slug === slug);
    if (repo === undefined) {
      return refuse(ERROR_CODES.repoNotFound, 'That repository is not connected.');
    }
    if (this.active !== slug) {
      this.active = slug;
      await this.saveState();
      await this.deps.onWorkspaceChanged(this.activeWorkspace());
    }
    return this.announce();
  }

  // ── resolution ─────────────────────────────────────────────────────────────

  /**
   * The three real stages behind the connect card: clone (step 0), read
   * `app.json` (step 1), scan `conductor/` (step 2) — `step` advances only
   * as each finishes, and 3 means all of them did. A failed stage removes
   * the clone directory: a repo that never resolved is never persisted, and
   * never leaves a half-directory to confuse the next attempt.
   */
  private async runResolution(
    resolveId: number,
    org: string,
    name: string,
    url: string,
    signal: AbortSignal,
  ): Promise<void> {
    const target = join(this.deps.reposDir, repoSlug(org, name));
    try {
      this.emit(resolveId, { kind: 'step', resolveId, step: 0 });
      const gh = this.deps.resolveGh();
      if (gh === null) {
        this.fail(resolveId, ERROR_CODES.repoGhMissing, 'The GitHub CLI (gh) is not installed.');
        return;
      }
      // §8.1 — installed and authenticated are different failures with
      // different fixes; the clone is not even attempted while signed out.
      const auth = await this.deps.run(gh, ['auth', 'status'], { signal });
      if (auth.code !== 0) {
        this.fail(
          resolveId,
          ERROR_CODES.repoGhUnauthenticated,
          'gh is installed but not signed in.',
        );
        return;
      }
      // A crashed earlier attempt may have left this directory. It cannot be
      // a connected repo — `resolve` refused those before any work — so the
      // retry starts clean instead of cloning into a refusal.
      await rm(target, { recursive: true, force: true });
      await mkdir(this.deps.reposDir, { recursive: true });
      const clone = await this.deps.run(
        gh,
        ['repo', 'clone', `${org}/${name}`, target, '--', '--filter=blob:none'],
        { signal },
      );
      if (clone.code !== 0) {
        await this.discard(target);
        this.fail(
          resolveId,
          ERROR_CODES.repoCloneFailed,
          `gh could not clone ${org}/${name}. ${clone.stderr.trim()}`.trim(),
        );
        return;
      }
      this.emit(resolveId, { kind: 'step', resolveId, step: 1 });
      const appJson = await this.readAppJson(target);
      if (appJson === null) {
        const dynamic = await this.dynamicConfigName(target);
        await this.discard(target);
        this.fail(
          resolveId,
          ERROR_CODES.repoAppConfigUnreadable,
          dynamic === null
            ? 'app.json was not found at the repository root.'
            : `This repo has no static app.json — it uses ${dynamic}, which Conductor cannot read yet.`,
        );
        return;
      }
      const meta = deriveAppMeta(appJson, name);
      if (!meta.ok) {
        await this.discard(target);
        this.fail(resolveId, ERROR_CODES.repoAppConfigUnreadable, meta.message);
        return;
      }
      this.emit(resolveId, { kind: 'step', resolveId, step: 2 });
      const branch = await this.readBranch(target);
      const flowCount = await this.countFlows(target);
      this.emit(resolveId, { kind: 'step', resolveId, step: 3 });
      const repo: ResolvedRepo = {
        url,
        org,
        name,
        appName: meta.appName,
        appId: meta.appId,
        branch,
        flowCount,
      };
      if (this.currentResolveId === resolveId && !this.disposed) {
        this.pendingFound = { resolveId, repo };
        this.emit(resolveId, { kind: 'found', resolveId, repo });
      }
    } catch (error) {
      // A superseded or disposed resolution was aborted on purpose; it says
      // nothing. Anything else is a real failure of the current one.
      if (signal.aborted || this.currentResolveId !== resolveId) {
        return;
      }
      await this.discard(target);
      if (isEnoent(error)) {
        this.fail(resolveId, ERROR_CODES.repoGhMissing, 'The GitHub CLI (gh) is not installed.');
        return;
      }
      this.fail(
        resolveId,
        ERROR_CODES.repoCloneFailed,
        error instanceof Error ? error.message : 'The repository could not be read.',
      );
    }
  }

  /** Progress reaches the window only from the latest resolution — a
   * superseded one is already someone else's story. */
  private emit(resolveId: number, event: RepoResolveEvent): void {
    if (this.disposed || this.currentResolveId !== resolveId) {
      return;
    }
    this.deps.emitResolveEvent({ ok: true, data: event });
  }

  /** Failures travel as events for `mirror:event`'s reason: the subscription
   * did not fail, the named resolution did (criterion: stable codes). */
  private fail(resolveId: number, code: string, message: string): void {
    this.emit(resolveId, { kind: 'failed', resolveId, code, message });
  }

  private async readAppJson(target: string): Promise<string | null> {
    try {
      return await readFile(join(target, 'app.json'), 'utf8');
    } catch {
      return null;
    }
  }

  /** §2.1's dynamic-config ❓ — named in the failure, never evaluated. */
  private async dynamicConfigName(target: string): Promise<string | null> {
    for (const candidate of ['app.config.js', 'app.config.ts']) {
      try {
        await readFile(join(target, candidate), 'utf8');
        return candidate;
      } catch {
        // Not this one.
      }
    }
    return null;
  }

  /** A clone that failed to resolve is removed whole: it must never be
   * mistaken for a connected repo, and never block the next attempt. */
  private async discard(target: string): Promise<void> {
    try {
      await rm(target, { recursive: true, force: true });
    } catch (error) {
      console.error('A failed clone directory could not be removed:', error);
    }
  }

  // ── state ──────────────────────────────────────────────────────────────────

  private isConnected(org: string, name: string): boolean {
    const wantedOrg = org.toLowerCase();
    const wantedName = name.toLowerCase();
    return this.repos.some(
      (repo) => repo.org.toLowerCase() === wantedOrg && repo.name.toLowerCase() === wantedName,
    );
  }

  /** §8.2's atomic idiom — temp name, then rename: the state file is never
   * half-written. A write that fails is logged and the in-memory truth keeps
   * serving this session; the next change retries the disk. */
  private async saveState(): Promise<void> {
    try {
      await mkdir(dirname(this.deps.stateFile), { recursive: true });
      const partial = `${this.deps.stateFile}.partial`;
      const state = { version: 1, active: this.active, repos: this.repos };
      await writeFile(partial, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      await rename(partial, this.deps.stateFile);
    } catch (error) {
      console.error('The repo list could not be saved:', error);
    }
  }

  private async announce(): Promise<Result<RepoState>> {
    const state = await this.projection();
    this.deps.emitChanged({ ok: true, data: state });
    return { ok: true, data: state };
  }

  /** The wire shape: persisted facts plus what the clone says right now. */
  private async projection(): Promise<RepoState> {
    const repos: ConnectedRepo[] = [];
    for (const repo of this.repos) {
      const target = join(this.deps.reposDir, repo.slug);
      repos.push({
        ...repo,
        branch: await this.readBranch(target),
        flowCount: await this.countFlows(target),
      });
    }
    return { repos, active: this.active };
  }

  private async readBranch(target: string): Promise<string | null> {
    try {
      return headBranch(await readFile(join(target, '.git', 'HEAD'), 'utf8'));
    } catch {
      return null;
    }
  }

  /** §7.1 — the same classification the index uses, over the clone's
   * `conductor/`. A repo with no folder at all counts zero: "empty for
   * now" is a state, not a failure. */
  private async countFlows(target: string): Promise<number> {
    let count = 0;
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => null);
      if (entries === null) {
        return;
      }
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await walk(join(dir, entry.name));
        } else if (entry.isFile() && hasFlowExtension(entry.name, this.deps.extensions)) {
          try {
            if (flowBody(await readFile(join(dir, entry.name), 'utf8')) !== null) {
              count += 1;
            }
          } catch {
            // A file that vanished mid-scan is not a flow.
          }
        }
      }
    };
    await walk(join(target, this.deps.flowsDir));
    return count;
  }
}

function refuse<T>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

function isEnoent(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

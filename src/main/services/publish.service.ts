import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { hashText } from '@shared/hash';
import {
  ERROR_CODES,
  type PublishChange,
  type PublishChangeKind,
  type PublishEvent,
  type PublishState,
  type Result,
} from '@shared/ipc';
import { z } from 'zod';
import { MaestroNotInstalledError } from '../maestro/CliRunner';
import type { SyntaxCheck } from '../maestro/MaestroGateway';
import type { RunOptions, RunResult } from '../process/run';
import { flowBody, hasFlowExtension } from './flow-classify';
import type { ActiveClone } from './repo.service';
import { headBranch } from './repo-derive';

/**
 * The publish domain (§8): the unsent set, the AI note, the send pipeline and
 * the publication lifecycle — one publication per repo, alive while its PR is
 * open (§8.3). Everything Git happens through the injected `run` as plumbing
 * over a temporary index: the clone's HEAD, working tree and real index are
 * the person's document and are never touched (§8.2, §12.23, criterion 21).
 * `gh` is the only door to GitHub (§8.1) and `claude` writes the note
 * headless (§8.4); losing `claude` degrades the note, never the send.
 */

/** The slice of the Gateway this service needs (§12 rule 9): the §4.2 gate. */
export type SyntaxGate = {
  checkSyntax: (flowPath: string) => Promise<SyntaxCheck>;
};

export type PluginResourceEnv = {
  readonly packaged: boolean;
  readonly resourcesPath: string;
  readonly appPath: string;
};

/** Where `resources/conductor-plugin` lives in this run — `extraResources`
 * beside the binary when packaged, the repo's own folder in dev. The same
 * two facts, resolved the same way, as `scrcpyJarPath` (§8.4 constraint). */
export function conductorPluginDir(env: PluginResourceEnv): string {
  return env.packaged
    ? join(env.resourcesPath, 'conductor-plugin')
    : join(env.appPath, 'resources', 'conductor-plugin');
}

export type PublishServiceDeps = {
  /** `userData/publications.json` — this service's own state, keyed by repo
   * slug; deliberately not inside `repos.json` (decision: no migration risk). */
  readonly stateFile: string;
  /** Scratch for temp indexes, body files and describe job dirs — inside the
   * app's user-data area, never the clone. */
  readonly jobsDir: string;
  /** `resources/conductor-plugin`, resolved for dev and packaged runs (§8.4). */
  readonly pluginDir: string;
  /** `CONFIG.FLOWS_DIR` — the one folder that publishes (§7.1). */
  readonly flowsDir: string;
  /** `CONFIG.FLOW_EXTENSIONS` — what can be a flow file at all. */
  readonly extensions: readonly string[];
  /** `CONFIG.REPO_BASE_BRANCH`: an explicit override, or `''` to use the
   * branch the clone came with, read at publish time (criterion 22). */
  readonly baseBranchOverride: string;
  /** `CONFIG.AI_DESCRIBE_MODEL` — the fastest alias (`haiku`): the note must
   * land while the sheet is still open. §6.0's `sonnet` is the AIPanel's. */
  readonly describeModel: string;
  /** `CONFIG.AI_DESCRIBE_BUDGET_USD` — the describe invocation's hard ceiling. */
  readonly describeBudgetUsd: number;
  /** The active repo's clone, live — a switch changes what this answers. */
  readonly activeClone: () => ActiveClone | null;
  readonly resolveGh: () => string | null;
  readonly resolveClaude: () => string | null;
  /** The §4.2 gate, behind the Gateway (§12 rule 9). */
  readonly gateway: SyntaxGate;
  /** The one process door (§10.1). `git` and `gh` and `claude` all leave
   * through here — argument arrays, never a composed string (§12.19). */
  readonly run: (
    command: string,
    args: readonly string[],
    options?: RunOptions,
  ) => Promise<RunResult>;
  /** The environment the children run under — the user's own, so Git finds
   * their identity and `claude` their login. */
  readonly env: NodeJS.ProcessEnv;
  readonly emitChanged: (payload: Result<PublishState>) => void;
  readonly emitEvent: (payload: Result<PublishEvent>) => void;
  /** `shell.openExternal`, injected — criterion 27's validated open. */
  readonly openExternal: (url: string) => Promise<void>;
  /** The clock, injectable so the branch date is assertable. */
  readonly now?: () => Date;
  /** Criterion 9's debounce over `flow:changed`, shrunk in tests. */
  readonly debounceMs?: number;
  /** Criterion 15's ceiling on the describe job. */
  readonly describeTimeoutMs?: number;
};

/** One open publication (§8.3): a branch, a PR, and the commits that anchor
 * the two diffs — `baseCommit` for the publication's whole story, and
 * `lastSentCommit` for what is still unsent (criterion 7). */
const persistedPublication = z.object({
  branch: z.string(),
  baseBranch: z.string(),
  baseCommit: z.string(),
  lastSentCommit: z.string(),
  prNumber: z.number().int().positive(),
  prUrl: z.string(),
  createdAt: z.string(),
});

const persistedState = z.object({
  version: z.literal(1),
  publications: z.record(z.string(), persistedPublication),
});

type Publication = z.infer<typeof persistedPublication>;

/** One generation of title + description per repo, keyed by the content hash
 * of the publication diff — a `claude` call costs real money, and the same
 * diff is never paid for twice (criterion 16). The title lives only here:
 * AI-owned, main-side, invisible (§8.4). */
type Generation = {
  readonly hash: string;
  readonly title: string;
  readonly description: string;
};

type DescribeJob = {
  readonly id: number;
  readonly controller: AbortController;
  canceled: boolean;
};

type SendJob = {
  readonly id: number;
  readonly controller: AbortController;
  canceled: boolean;
};

/**
 * An expected pipeline stop: the stable code and the product-language message
 * ride to the sheet as a `send-failed` event (criterion 26). The raw words of
 * whatever refused — git, gh, maestro — go to the console alone.
 */
class SendRefusal extends Error {
  readonly code: string;

  constructor(code: string, message: string, raw?: string) {
    super(message);
    this.name = 'SendRefusal';
    this.code = code;
    if (raw !== undefined && raw.trim() !== '') {
      console.error(`The send stopped (${code}):`, raw.trim());
    }
  }
}

/** Local plumbing is quick or broken; the network is neither. A hung push
 * must become a visible failure, not an eternal "Sending" (constraint). */
const LOCAL_GIT_TIMEOUT_MS = 15_000;
const NETWORK_TIMEOUT_MS = 60_000;

/** §8.4's ceiling on the describe job: past it the child is killed and the
 * mechanical note takes over (criterion 15). */
const DESCRIBE_TIMEOUT_MS = 60_000;

/** The patch rides in argv now, and argv is bounded by the OS — ~1 MB on
 * macOS, and a spawn that overflows it fails outright. A publication big
 * enough to reach this is far past the point where more diff buys the model
 * a better sentence, so it is cut and told so. */
const PROMPT_PATCH_LIMIT = 120_000;

/** Criterion 12's bound, and PR-title convention. */
const TITLE_LIMIT = 72;

/** The note's IPC bound (criterion 32) — a longer prefill could never be
 * sent back. */
const NOTE_LIMIT = 10_000;

export class PublishService {
  private readonly deps: PublishServiceDeps;
  private publications: Record<string, Publication> = {};
  private disposed = false;
  /** Monotonic across both job kinds — a cancel names either (decision). */
  private nextJob = 1;
  /** Serializes every temp-index build: two would share the file. */
  private indexChain: Promise<unknown> = Promise.resolve();
  /** Criterion 9's debounce over `flow:changed`. */
  private recomputeTimer: ReturnType<typeof setTimeout> | null = null;
  /** The one describe job in flight — a newer one supersedes it. */
  private describeJob: DescribeJob | null = null;
  /** The one send in flight — a second is refused, never queued (§8.3). */
  private sendJob: SendJob | null = null;
  /** One refresh at a time; a trigger during one simply rides it. */
  private refreshing = false;
  private readonly generations = new Map<string, Generation>();
  /** The describe skill's body, read once per run. `undefined` is "not read
   * yet"; `null` is "read and not there", which degrades to the mechanical
   * note without retrying a missing file on every open. */
  private instructions: string | null | undefined = undefined;

  constructor(deps: PublishServiceDeps) {
    this.deps = deps;
  }

  /** Loads the persisted publications. A corrupt file starts empty rather
   * than crashing — the next send rewrites it whole. */
  async start(): Promise<void> {
    let text: string;
    try {
      text = await readFile(this.deps.stateFile, 'utf8');
    } catch {
      return;
    }
    try {
      const state = persistedState.parse(JSON.parse(text));
      this.publications = state.publications;
    } catch (error) {
      console.error('The publications state could not be read; starting empty.', error);
      return;
    }
    // Criterion 28 — the app starting with a persisted open publication is a
    // refresh trigger; fired, never awaited: boot must not wait on GitHub.
    this.refresh();
  }

  /** Criterion 34 — no orphaned `claude` child, no live timer and no
   * still-pushing pipeline survives `before-quit`. */
  dispose(): void {
    this.disposed = true;
    if (this.recomputeTimer !== null) {
      clearTimeout(this.recomputeTimer);
      this.recomputeTimer = null;
    }
    if (this.describeJob !== null) {
      this.describeJob.canceled = true;
      this.describeJob.controller.abort();
      this.describeJob = null;
    }
    if (this.sendJob !== null) {
      this.sendJob.canceled = true;
      this.sendJob.controller.abort();
      this.sendJob = null;
    }
  }

  /**
   * Criterion 9 — the recompute rides `flow:changed`, debounced, and never
   * blocks a save: the watcher event has already left the write path when
   * this fires, and everything here is asynchronous by construction.
   */
  notifyFlowChanged(): void {
    if (this.disposed) {
      return;
    }
    if (this.recomputeTimer !== null) {
      clearTimeout(this.recomputeTimer);
    }
    this.recomputeTimer = setTimeout(() => {
      this.recomputeTimer = null;
      void this.pushFreshState();
    }, this.deps.debounceMs ?? 300);
  }

  /**
   * Criterion 9's other half — a connect or switch re-points this domain the
   * way it re-points the flow workspace: the control reflects the new repo's
   * own state at once, a describe mid-flight belongs to the old repo and is
   * put down, and the new repo's PR state is refreshed (criterion 28).
   */
  async activeRepoChanged(): Promise<void> {
    if (this.recomputeTimer !== null) {
      clearTimeout(this.recomputeTimer);
      this.recomputeTimer = null;
    }
    if (this.describeJob !== null) {
      this.describeJob.canceled = true;
      this.describeJob.controller.abort();
      this.describeJob = null;
    }
    await this.pushFreshState();
    this.refresh();
  }

  private async pushFreshState(): Promise<void> {
    const clone = this.deps.activeClone();
    if (clone === null || this.disposed) {
      return;
    }
    try {
      const state = await this.projection(clone);
      if (!this.disposed) {
        this.deps.emitChanged({ ok: true, data: state });
      }
    } catch (error) {
      console.error('The unsent set could not be recomputed:', error);
    }
  }

  // ── the describe job (§8.4, criteria 10–16) ────────────────────────────────

  /**
   * Starts writing the note and answers with the job id immediately — the
   * note itself arrives as a `described` push. One job at a time: a reopened
   * sheet supersedes the previous job silently, exactly as its close already
   * canceled it (criterion 14).
   */
  async describe(): Promise<Result<{ describeId: number }>> {
    const clone = this.deps.activeClone();
    if (clone === null) {
      return refuse(ERROR_CODES.publishNoRepo, 'No repository is connected yet.');
    }
    const baseline = await this.unsentBaseline(clone);
    const changes = await this.changeSet(clone, baseline);
    if (changes.length === 0) {
      return refuse(ERROR_CODES.publishNothingToSend, 'There is nothing new to send.');
    }
    if (this.describeJob !== null) {
      this.describeJob.canceled = true;
      this.describeJob.controller.abort();
    }
    const job: DescribeJob = {
      id: this.nextJob,
      controller: new AbortController(),
      canceled: false,
    };
    this.nextJob += 1;
    this.describeJob = job;
    void this.runDescribe(job, clone, changes);
    return { ok: true, data: { describeId: job.id } };
  }

  /** Criterion 14 — the sheet closing kills the `claude` child. The same
   * cancel serves a send's id (decision): the pipeline is aborted, says
   * nothing, and the slot frees for the next send. */
  cancel(jobId: number): Result<{ jobId: number }> {
    if (this.describeJob !== null && this.describeJob.id === jobId) {
      this.describeJob.canceled = true;
      this.describeJob.controller.abort();
      this.describeJob = null;
      return { ok: true, data: { jobId } };
    }
    if (this.sendJob !== null && this.sendJob.id === jobId) {
      this.sendJob.canceled = true;
      this.sendJob.controller.abort();
      this.sendJob = null;
      return { ok: true, data: { jobId } };
    }
    return refuse(ERROR_CODES.publishJobNotFound, `There is no publish job ${jobId}.`);
  }

  private async runDescribe(
    job: DescribeJob,
    clone: ActiveClone,
    changes: PublishChange[],
  ): Promise<void> {
    // Hoisted so the failure path caches under the real hash too: a timed-out
    // claude call may have burned budget, and criterion 16 says the same diff
    // is never paid for twice. `''` survives only when the diff itself never
    // computed — nothing was invoked, so there is nothing to protect.
    let hash = '';
    try {
      const publication = this.publications[clone.slug];
      // Criterion 11: the note describes the publication whole — its birth
      // base to the working tree — not merely what is unsent, so the PR body
      // always tells everything the review contains (criterion 23).
      const baseline =
        publication === undefined ? await this.unsentBaseline(clone) : publication.baseCommit;
      const diff = await this.publicationDiff(clone, baseline);
      hash = hashText(`${baseline}\n${diff.patch}`);
      const cached = this.generations.get(clone.slug);
      if (cached !== undefined && cached.hash === hash) {
        this.emitDescribed(job, cached.description);
        return;
      }
      const generation = await this.generate(job, changes, diff, hash);
      if (job.canceled || this.disposed) {
        return;
      }
      this.generations.set(clone.slug, generation);
      this.emitDescribed(job, generation.description);
    } catch (error) {
      if (job.canceled || this.disposed) {
        return;
      }
      // §8.4 — the AI is optional and the note is never a failure surface:
      // whatever went wrong lands in the console and the mechanical text
      // lands in the field.
      console.error('The describe job failed; using the mechanical note.', error);
      const fallback = mechanicalGeneration(hash, changes);
      this.generations.set(clone.slug, fallback);
      this.emitDescribed(job, fallback.description);
    } finally {
      if (this.describeJob === job) {
        this.describeJob = null;
      }
    }
  }

  /** The publication's full diff and listing, off one temp index. */
  private async publicationDiff(
    clone: ActiveClone,
    baseline: string,
  ): Promise<{ patch: string; entries: PublishChange[] }> {
    return this.withTempIndex(clone, baseline, async (indexEnv) => {
      // `-U25`: a flow is tens of lines, so this much context hands the model
      // each changed test essentially whole. It is what replaces the `Read`
      // tool the amended §8.4 profile no longer grants — the skill's "when the
      // diff alone does not make a test's purpose clear" case, paid for in
      // context instead of in a round trip.
      const patch = await this.git(
        clone,
        ['diff-index', '--cached', '-p', '-U25', '--no-renames', baseline],
        indexEnv,
      );
      if (patch.code !== 0) {
        throw new Error(`git diff-index -p failed: ${patch.stderr}`);
      }
      const names = await this.git(clone, this.diffArgs(baseline), indexEnv);
      if (names.code !== 0) {
        throw new Error(`git diff-index failed: ${names.stderr}`);
      }
      return {
        patch: patch.stdout,
        entries: parseNameStatus(names.stdout, `${this.deps.flowsDir}/`),
      };
    });
  }

  /**
   * One `claude -p` with the §8.4 profile as amended (2026-08-08) — no tools
   * at all, none of the user's configuration, the skill's own text as the
   * system prompt, budget capped — or the mechanical fallback wherever that
   * cannot happen (criterion 15).
   *
   * The amendment is a latency decision, measured: the profile it replaces
   * spent 14.1s to write two lines, of which ~12s was thinking the answer
   * never needed and the rest four round trips (load the skill, read two
   * files, answer). Inlining the material and disabling thinking makes the
   * same model produce the same text in 1.5s for a tenth of the cost. What
   * §8.4 guaranteed only gets stricter: a model with no tools cannot read,
   * write or run anything, and criterion 11's "the diff is the only way it
   * sees the changes" is now literal rather than merely enforced.
   */
  private async generate(
    job: DescribeJob,
    changes: PublishChange[],
    diff: { patch: string; entries: PublishChange[] },
    hash: string,
  ): Promise<Generation> {
    const claude = this.deps.resolveClaude();
    const instructions = await this.describeInstructions();
    // A model with no instructions still answers, and something is worse than
    // the mechanical note: both absences degrade the same way (criterion 15).
    if (claude === null || instructions === null) {
      return mechanicalGeneration(hash, changes);
    }
    await mkdir(this.deps.jobsDir, { recursive: true });
    const timeoutMs = this.deps.describeTimeoutMs ?? DESCRIBE_TIMEOUT_MS;
    const deadline = setTimeout(() => {
      job.controller.abort();
    }, timeoutMs);
    try {
      const result = await this.deps.run(
        claude,
        [
          '-p',
          '--model',
          this.deps.describeModel,
          '--output-format',
          'json',
          '--effort',
          'low',
          // Nothing to read, nothing to load: the material is in the prompt.
          // This is also why no `--plugin-dir` and no `--add-dir` ride here —
          // there is no tool that could use either.
          '--tools',
          '',
          '--setting-sources',
          '',
          '--strict-mcp-config',
          '--system-prompt',
          instructions,
          '--max-budget-usd',
          String(this.deps.describeBudgetUsd),
          describePrompt(diff),
        ],
        {
          cwd: this.deps.jobsDir,
          // The user's own environment — `claude` still finds its login (§9.0)
          // — plus the one knob that keeps a two-line answer from costing a
          // thousand thinking tokens.
          env: { ...this.deps.env, MAX_THINKING_TOKENS: '0' },
          timeout: timeoutMs,
          signal: job.controller.signal,
        },
      );
      if (result.code !== 0) {
        console.error('claude answered non-zero for the describe job:', result.stderr);
        return mechanicalGeneration(hash, changes);
      }
      const parsed = parseGeneration(result.stdout, hash);
      return parsed ?? mechanicalGeneration(hash, changes);
    } finally {
      clearTimeout(deadline);
    }
  }

  /**
   * The describe skill's body, read once from our own plugin (§8.4). It stays
   * a real skill file — the single place a bad note is fixed, and the plugin
   * stays what §6.0 loads for the AIPanel — but this invocation hands its text
   * over directly instead of paying a round trip for the model to load it.
   * Front matter is the loader's business, never the model's.
   */
  private async describeInstructions(): Promise<string | null> {
    if (this.instructions !== undefined) {
      return this.instructions;
    }
    const path = join(this.deps.pluginDir, 'skills', 'describe-changes', 'SKILL.md');
    try {
      this.instructions = stripFrontMatter(await readFile(path, 'utf8'));
    } catch (error) {
      console.error('The describe skill could not be read; using the mechanical note.', error);
      this.instructions = null;
    }
    return this.instructions;
  }

  private emitDescribed(job: DescribeJob, note: string): void {
    if (job.canceled || this.disposed) {
      return;
    }
    this.deps.emitEvent({ ok: true, data: { kind: 'described', describeId: job.id, note } });
  }

  // ── sending (§8.3, §8.4, criteria 18–26) ───────────────────────────────────

  /**
   * Criterion 18 — the id the moment the work is accepted; the pipeline runs
   * behind it and reports as `publish:event` pushes. What is awaited before
   * the answer is deliberate and local: the unsent set, because §8.3's
   * "nothing new to send" is a refusal on the invoke (criterion 24).
   */
  async send(note: string, openFlowPath: string | null): Promise<Result<{ sendId: number }>> {
    const clone = this.deps.activeClone();
    if (clone === null) {
      return refuse(ERROR_CODES.publishNoRepo, 'No repository is connected yet.');
    }
    if (this.sendJob !== null) {
      return refuse(ERROR_CODES.publishSendActive, 'Your changes are already being sent.');
    }
    const changes = await this.changeSet(clone, await this.unsentBaseline(clone));
    if (changes.length === 0) {
      return refuse(ERROR_CODES.publishNothingToSend, 'There is nothing new to send.');
    }
    const job: SendJob = { id: this.nextJob, controller: new AbortController(), canceled: false };
    this.nextJob += 1;
    this.sendJob = job;
    void this.runSend(job, clone, changes, note, openFlowPath);
    return { ok: true, data: { sendId: job.id } };
  }

  private async runSend(
    job: SendJob,
    clone: ActiveClone,
    changes: PublishChange[],
    note: string,
    openFlowPath: string | null,
  ): Promise<void> {
    try {
      this.emitStep(job, 'checking');
      const gh = this.deps.resolveGh();
      if (gh === null) {
        throw new SendRefusal(ERROR_CODES.repoGhMissing, 'The GitHub CLI (gh) is not installed.');
      }
      // §8.1 — installed and authenticated are different failures with
      // different fixes, told apart before any Git work.
      const auth = await this.deps.run(gh, ['auth', 'status'], {
        env: this.deps.env,
        timeout: NETWORK_TIMEOUT_MS,
        signal: job.controller.signal,
      });
      if (auth.code !== 0) {
        throw new SendRefusal(
          ERROR_CODES.repoGhUnauthenticated,
          'gh is installed but not signed in.',
          auth.stderr,
        );
      }
      await this.gate(clone, changes);
      // §8.4 — the title is the freshest generation's (the sheet always ran a
      // describe before any send), mechanical when the AI never wrote one. It
      // is AI-owned and main-side: the renderer never saw it.
      const title =
        this.generations.get(clone.slug)?.title ?? mechanicalGeneration('', changes).title;
      const publication = this.publications[clone.slug];
      if (publication === undefined) {
        await this.firstSend(job, clone, gh, title, note, openFlowPath);
      } else {
        await this.nextSend(job, clone, gh, publication, title, note);
      }
      void this.pushFreshState();
    } catch (error) {
      if (job.canceled || this.disposed) {
        return;
      }
      if (error instanceof SendRefusal) {
        this.emitSendFailed(job, error.code, error.message);
        return;
      }
      console.error('The send pipeline failed:', error);
      this.emitSendFailed(
        job,
        ERROR_CODES.publishSendFailed,
        'Your changes could not be sent. Check your connection and try again.',
      );
    } finally {
      if (this.sendJob === job) {
        this.sendJob = null;
      }
    }
  }

  /**
   * Criterion 19 — §4.2's gate over every changed flow-classified file: one
   * broken test blocks the whole send, named in product language. Only flows
   * run it (criterion 8); deletions have nothing left to check.
   */
  private async gate(clone: ActiveClone, changes: PublishChange[]): Promise<void> {
    for (const change of changes) {
      if (change.kind === 'deleted' || !hasFlowExtension(change.path, this.deps.extensions)) {
        continue;
      }
      const absolute = this.resolveInsideFlows(clone, change.path);
      if (absolute === null) {
        continue;
      }
      const content = await readFile(absolute, 'utf8').catch(() => null);
      if (content === null || flowBody(content) === null) {
        continue;
      }
      let verdict: SyntaxCheck;
      try {
        verdict = await this.deps.gateway.checkSyntax(absolute);
      } catch (error) {
        if (error instanceof MaestroNotInstalledError) {
          throw new SendRefusal(
            ERROR_CODES.publishMaestroMissing,
            'Your tests could not be checked: Maestro is not installed on this Mac.',
          );
        }
        throw error;
      }
      if (!verdict.ok) {
        throw new SendRefusal(
          ERROR_CODES.publishSyntaxError,
          `This test has an error that prevents sending: ${change.path}.`,
          verdict.message,
        );
      }
    }
  }

  /** §8.3's first click: fetch the base, branch from its tip, commit the
   * `conductor/` scope, push, open the PR — and only then persist the
   * publication, so a review that never opened is never believed in. */
  private async firstSend(
    job: SendJob,
    clone: ActiveClone,
    gh: string,
    title: string,
    note: string,
    openFlowPath: string | null,
  ): Promise<void> {
    const base = await this.baseBranch(clone);
    if (base === null) {
      // Rule 24 holds here too: the clone's HEAD was unreadable, and the
      // message must say so without a word of Git.
      throw new SendRefusal(
        ERROR_CODES.publishSendFailed,
        'The project could not be read on this Mac. Try again.',
      );
    }
    this.emitStep(job, 'sending');
    const fetch = await this.git(
      clone,
      [...credentialArgs(gh), 'fetch', 'origin', base],
      this.networkOptions(job),
    );
    if (fetch.code !== 0) {
      throw new SendRefusal(
        ERROR_CODES.publishSendFailed,
        'Your changes could not reach GitHub. Check your connection and try again.',
        fetch.stderr,
      );
    }
    const parent = await this.revParse(clone, 'FETCH_HEAD');
    if (parent === null) {
      throw new SendRefusal(
        ERROR_CODES.publishSendFailed,
        'The project could not be read after syncing. Try again.',
      );
    }
    // Criterion 20 — dated at publication birth, slugged from the flow open
    // when it was born, sanitized by resolution (§9.3), `tests` when none.
    const date = (this.deps.now?.() ?? new Date()).toISOString().slice(0, 10);
    const branch = `conductor/${date}-${this.branchSlug(clone, openFlowPath)}`;
    const commit = await this.buildCommit(job, clone, parent, title);
    await this.pushBranch(job, clone, gh, branch, commit);
    this.emitStep(job, 'opening-review');
    const { number, url } = await this.createPr(job, clone, gh, base, branch, title, note);
    this.publications = {
      ...this.publications,
      [clone.slug]: {
        branch,
        baseBranch: base,
        baseCommit: parent,
        lastSentCommit: commit,
        prNumber: number,
        prUrl: url,
        createdAt: (this.deps.now?.() ?? new Date()).toISOString(),
      },
    };
    await this.saveState();
    this.emitSent(job, false);
  }

  /** §8.3's following clicks: a commit on the same branch, parented on the
   * previous tip, and the PR refreshed to describe everything it contains
   * (criterion 23). */
  private async nextSend(
    job: SendJob,
    clone: ActiveClone,
    gh: string,
    publication: Publication,
    title: string,
    note: string,
  ): Promise<void> {
    this.emitStep(job, 'sending');
    const commit = await this.buildCommit(job, clone, publication.lastSentCommit, title);
    await this.pushBranch(job, clone, gh, publication.branch, commit);
    this.emitStep(job, 'opening-review');
    const bodyFile = await this.writeBody(job, note);
    try {
      const edit = await this.deps.run(
        gh,
        ['pr', 'edit', String(publication.prNumber), '--title', title, '--body-file', bodyFile],
        {
          cwd: clone.root,
          env: this.deps.env,
          timeout: NETWORK_TIMEOUT_MS,
          signal: job.controller.signal,
        },
      );
      if (edit.code !== 0) {
        throw new SendRefusal(
          ERROR_CODES.publishSendFailed,
          'The review could not be updated on GitHub. Try again in a moment.',
          edit.stderr,
        );
      }
    } finally {
      await rm(bodyFile, { force: true }).catch(() => {});
    }
    this.publications = {
      ...this.publications,
      [clone.slug]: { ...publication, lastSentCommit: commit },
    };
    await this.saveState();
    this.emitSent(job, true);
  }

  /**
   * Criterion 21's heart: the commit exists before any ref moves, built from
   * a temporary index — `read-tree` the parent, `add` the `conductor/` scope,
   * `write-tree`, `commit-tree` — and `update-ref` is the only ref that
   * changes. HEAD never moves; the working tree is never written.
   */
  private async buildCommit(
    job: SendJob,
    clone: ActiveClone,
    parent: string,
    title: string,
  ): Promise<string> {
    return this.withTempIndex(clone, parent, async (indexEnv) => {
      const tree = await this.git(clone, ['write-tree'], indexEnv);
      if (tree.code !== 0) {
        throw new Error(`git write-tree failed: ${tree.stderr}`);
      }
      const parentTree = await this.git(clone, ['rev-parse', `${parent}^{tree}`]);
      if (parentTree.stdout.trim() === tree.stdout.trim()) {
        // The unsent set emptied between the invoke and here — a race, and
        // §8.3 already has the words for it.
        throw new SendRefusal(ERROR_CODES.publishNothingToSend, 'There is nothing new to send.');
      }
      const commit = await this.git(
        clone,
        ['commit-tree', tree.stdout.trim(), '-p', parent, '-m', title],
        { signal: job.controller.signal },
      );
      if (commit.code !== 0) {
        throw new SendRefusal(
          ERROR_CODES.publishSendFailed,
          'Your changes could not be packaged for review. Try again.',
          commit.stderr,
        );
      }
      return commit.stdout.trim();
    });
  }

  private async pushBranch(
    job: SendJob,
    clone: ActiveClone,
    gh: string,
    branch: string,
    commit: string,
  ): Promise<void> {
    const ref = await this.git(clone, ['update-ref', `refs/heads/${branch}`, commit]);
    if (ref.code !== 0) {
      throw new Error(`git update-ref failed: ${ref.stderr}`);
    }
    const push = await this.git(
      clone,
      [...credentialArgs(gh), 'push', 'origin', branch],
      this.networkOptions(job),
    );
    if (push.code !== 0) {
      throw new SendRefusal(
        ERROR_CODES.publishSendFailed,
        'Your changes could not reach GitHub. Check your connection and try again.',
        push.stderr,
      );
    }
  }

  private async createPr(
    job: SendJob,
    clone: ActiveClone,
    gh: string,
    base: string,
    branch: string,
    title: string,
    note: string,
  ): Promise<{ number: number; url: string }> {
    const bodyFile = await this.writeBody(job, note);
    try {
      const create = await this.deps.run(
        gh,
        [
          'pr',
          'create',
          '--base',
          base,
          '--head',
          branch,
          '--title',
          title,
          '--body-file',
          bodyFile,
        ],
        {
          cwd: clone.root,
          env: this.deps.env,
          timeout: NETWORK_TIMEOUT_MS,
          signal: job.controller.signal,
        },
      );
      if (create.code !== 0) {
        throw new SendRefusal(
          ERROR_CODES.publishSendFailed,
          'The review could not be opened on GitHub. Try again in a moment.',
          create.stderr,
        );
      }
      const url = create.stdout.match(/https:\/\/github\.com\/\S+\/pull\/(\d+)/);
      const number = Number.parseInt(url?.[1] ?? '', 10);
      if (url?.[0] === undefined || Number.isNaN(number)) {
        throw new SendRefusal(
          ERROR_CODES.publishSendFailed,
          'The review could not be opened on GitHub. Try again in a moment.',
          `gh pr create answered without a PR URL: ${create.stdout}`,
        );
      }
      return { number, url: url[0] };
    } finally {
      await rm(bodyFile, { force: true }).catch(() => {});
    }
  }

  /** Criterion 20 / rule 19 — the note reaches `gh` only as a file. */
  private async writeBody(job: SendJob, note: string): Promise<string> {
    await mkdir(this.deps.jobsDir, { recursive: true });
    const bodyFile = join(this.deps.jobsDir, `body-${job.id}.md`);
    await writeFile(bodyFile, note, 'utf8');
    return bodyFile;
  }

  /** Criterion 20 — the slug from the flow open at publication birth, taken
   * only after the path resolves inside `conductor/` (§9.3). */
  private branchSlug(clone: ActiveClone, openFlowPath: string | null): string {
    if (openFlowPath === null) {
      return 'tests';
    }
    if (this.resolveInsideFlows(clone, openFlowPath) === null) {
      return 'tests';
    }
    const name = openFlowPath.split('/').at(-1) ?? '';
    const slug = name
      .replace(/\.[^.]*$/, '')
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40)
      .replace(/-+$/, '');
    return slug === '' ? 'tests' : slug;
  }

  /** §9.3 — containment by resolution, never by pattern: the absolute path
   * must land inside the clone's `conductor/` after `..` is resolved. */
  private resolveInsideFlows(clone: ActiveClone, path: string): string | null {
    const root = resolve(clone.root, this.deps.flowsDir);
    const target = resolve(root, path);
    return target === root || target.startsWith(root + sep) ? target : null;
  }

  private networkOptions(job: SendJob): RunOptions {
    return {
      env: this.deps.env,
      timeout: NETWORK_TIMEOUT_MS,
      signal: job.controller.signal,
    };
  }

  private emitStep(job: SendJob, step: 'checking' | 'sending' | 'opening-review'): void {
    if (job.canceled || this.disposed) {
      return;
    }
    this.deps.emitEvent({ ok: true, data: { kind: 'send-step', sendId: job.id, step } });
  }

  private emitSent(job: SendJob, joined: boolean): void {
    if (job.canceled || this.disposed) {
      return;
    }
    this.deps.emitEvent({ ok: true, data: { kind: 'sent', sendId: job.id, joined } });
  }

  private emitSendFailed(job: SendJob, code: string, message: string): void {
    if (this.disposed) {
      return;
    }
    this.deps.emitEvent({ ok: true, data: { kind: 'send-failed', sendId: job.id, code, message } });
  }

  // ── the publication lifecycle (criteria 28–30) ─────────────────────────────

  /**
   * Reads the PR's state through `gh pr view` — on start, on a repo change
   * and on the sheet opening, never on the send click (criterion 28). Merged
   * or closed ends the publication and fetches the base, so the next send
   * starts from the fresh tip (criterion 29); any failure keeps the stored
   * state and stays quiet — the next trigger retries (criterion 30).
   */
  private refresh(): void {
    if (this.refreshing || this.disposed) {
      return;
    }
    const clone = this.deps.activeClone();
    if (clone === null) {
      return;
    }
    const publication = this.publications[clone.slug];
    if (publication === undefined) {
      return;
    }
    this.refreshing = true;
    void this.runRefresh(clone, publication)
      .catch(() => {
        // Criterion 30 — offline or a gh hiccup: no surface, no state change.
      })
      .finally(() => {
        this.refreshing = false;
      });
  }

  private async runRefresh(clone: ActiveClone, publication: Publication): Promise<void> {
    const gh = this.deps.resolveGh();
    if (gh === null) {
      return;
    }
    const view = await this.deps.run(
      gh,
      ['pr', 'view', String(publication.prNumber), '--json', 'state,url'],
      { cwd: clone.root, env: this.deps.env, timeout: NETWORK_TIMEOUT_MS },
    );
    if (view.code !== 0 || this.disposed) {
      return;
    }
    const parsed = z
      .object({ state: z.string(), url: z.string() })
      .safeParse(JSON.parse(view.stdout));
    if (!parsed.success) {
      return;
    }
    if (parsed.data.state === 'OPEN') {
      return;
    }
    // Merged or closed: the publication is over (criterion 29). The disk is
    // the truth and is never rewritten — content still differing from base
    // simply counts as unsent again.
    const { [clone.slug]: _ended, ...rest } = this.publications;
    this.publications = rest;
    await this.saveState();
    const fetch = await this.git(
      clone,
      [...credentialArgs(gh), 'fetch', 'origin', publication.baseBranch],
      { timeout: NETWORK_TIMEOUT_MS },
    );
    if (fetch.code !== 0) {
      console.error('The base could not be fetched after the review ended:', fetch.stderr);
    }
    await this.pushFreshState();
  }

  /** Criterion 27 — main opens the stored URL, and only once it parses as a
   * GitHub PR; the renderer never sends one. */
  async openPr(): Promise<Result<{ url: string }>> {
    const clone = this.deps.activeClone();
    const publication = clone === null ? undefined : this.publications[clone.slug];
    if (publication === undefined) {
      return refuse(ERROR_CODES.publishNoReview, 'No review is open right now.');
    }
    if (!isGitHubPrUrl(publication.prUrl)) {
      console.error('The stored review URL does not parse as a GitHub PR:', publication.prUrl);
      return refuse(ERROR_CODES.publishNoReview, 'No review is open right now.');
    }
    await this.deps.openExternal(publication.prUrl);
    return { ok: true, data: { url: publication.prUrl } };
  }

  /** §8.2's atomic idiom — temp name, then rename: the state file is never
   * half-written. */
  private async saveState(): Promise<void> {
    try {
      await mkdir(dirname(this.deps.stateFile), { recursive: true });
      const partial = `${this.deps.stateFile}.partial`;
      const state = { version: 1, publications: this.publications };
      await writeFile(partial, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
      await rename(partial, this.deps.stateFile);
    } catch (error) {
      console.error('The publications state could not be saved:', error);
    }
  }

  /**
   * The projection behind the control and the sheet (criteria 1–3), and —
   * because the sheet opening and the app starting both land here — the
   * trigger for the PR-state refresh, fired and never awaited (criterion 28).
   */
  async status(): Promise<Result<PublishState>> {
    const clone = this.deps.activeClone();
    if (clone === null) {
      return refuse(ERROR_CODES.publishNoRepo, 'No repository is connected yet.');
    }
    this.refresh();
    return { ok: true, data: await this.projection(clone) };
  }

  // ── the unsent set ─────────────────────────────────────────────────────────

  private async projection(clone: ActiveClone): Promise<PublishState> {
    // One read of the publication for both halves: `reviewOpen` and the
    // baseline must describe the same moment, or a recompute racing the
    // publication's end would pair an empty set with "no review" — a torn
    // state the control would render as "Everything sent" over unsent work.
    const publication = this.publications[clone.slug];
    return {
      repo: clone.slug,
      changes: await this.changeSet(clone, await this.unsentBaseline(clone, publication)),
      reviewOpen: publication !== undefined,
    };
  }

  /**
   * Criterion 7's baseline: the open publication's last sent commit, or the
   * base branch tip — the freshest we know locally, preferring the fetched
   * `origin/<base>` so a merged publication stops counting as unsent once the
   * end-of-publication fetch lands. Never the network: the sheet opening must
   * not block on it (constraint).
   */
  private async unsentBaseline(
    clone: ActiveClone,
    publication: Publication | undefined = this.publications[clone.slug],
  ): Promise<string> {
    const candidates: string[] = publication === undefined ? [] : [publication.lastSentCommit];
    const base = await this.baseBranch(clone);
    if (base !== null) {
      candidates.push(`refs/remotes/origin/${base}`, `refs/heads/${base}`);
    }
    candidates.push('HEAD');
    for (const candidate of candidates) {
      const commit = await this.revParse(clone, candidate);
      if (commit !== null) {
        return commit;
      }
    }
    throw new Error(`No baseline commit could be resolved in ${clone.root}.`);
  }

  /** Criterion 22 — the branch the clone came with, read off the clone at
   * publish time, with the env override winning when set. */
  private async baseBranch(clone: ActiveClone): Promise<string | null> {
    if (this.deps.baseBranchOverride !== '') {
      return this.deps.baseBranchOverride;
    }
    try {
      return headBranch(await readFile(join(clone.root, '.git', 'HEAD'), 'utf8'));
    } catch {
      return null;
    }
  }

  private async revParse(clone: ActiveClone, ref: string): Promise<string | null> {
    const result = await this.git(clone, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
    if (result.code !== 0) {
      return null;
    }
    const commit = result.stdout.trim();
    return commit === '' ? null : commit;
  }

  /**
   * The working tree against `baseline`, scoped to `conductor/`, computed the
   * only way that is honest here: a temporary index seeded from the baseline
   * (`read-tree`), brought to the working tree's state of `conductor/` alone
   * (`add -A -- conductor`), then read back (`diff-index --cached`). A plain
   * `git diff <commit>` would consult the clone's *real* index — which a sent
   * publication never touched (criterion 21) — and misreport every file it
   * has never staged. The same mechanism later *is* the commit: what the
   * sheet listed is byte-for-byte what `write-tree` will send.
   */
  private async changeSet(clone: ActiveClone, baseline: string): Promise<PublishChange[]> {
    return this.withTempIndex(clone, baseline, async (indexEnv) => {
      const diff = await this.git(clone, this.diffArgs(baseline), indexEnv);
      if (diff.code !== 0) {
        throw new Error(`git diff-index failed: ${diff.stderr}`);
      }
      return parseNameStatus(diff.stdout, `${this.deps.flowsDir}/`);
    });
  }

  private diffArgs(baseline: string): string[] {
    return ['diff-index', '--cached', '--name-status', '--no-renames', '-z', baseline];
  }

  /**
   * Seeds a temporary index from `baseline`, overlays the working tree's
   * `conductor/`, and hands the caller the env every indexed call must carry.
   * The index lives in `jobsDir` — never under the clone's `.git`, whose
   * index is the user's (criterion 21). Serialized: two builds sharing a
   * file would read each other's state.
   */
  private async withTempIndex<T>(
    clone: ActiveClone,
    baseline: string,
    fn: (indexEnv: RunOptions) => Promise<T>,
  ): Promise<T> {
    const work = this.indexChain.then(async () => {
      await mkdir(this.deps.jobsDir, { recursive: true });
      const indexFile = join(this.deps.jobsDir, `${clone.slug}.index`);
      await rm(indexFile, { force: true });
      const indexEnv: RunOptions = {
        cwd: clone.root,
        env: { ...this.deps.env, GIT_INDEX_FILE: indexFile },
        timeout: LOCAL_GIT_TIMEOUT_MS,
      };
      try {
        const readTree = await this.git(clone, ['read-tree', baseline], indexEnv);
        if (readTree.code !== 0) {
          throw new Error(`git read-tree failed: ${readTree.stderr}`);
        }
        // §8.4 step 4: the scope is the folder, never `-A` over the repo. A
        // pathspec matching nothing anywhere — no folder on disk, none in the
        // baseline — exits non-zero, and that is the empty change set.
        await this.git(clone, ['add', '-A', '--', this.deps.flowsDir], indexEnv);
        return await fn(indexEnv);
      } finally {
        await rm(indexFile, { force: true }).catch(() => {});
      }
    });
    this.indexChain = work.catch(() => {});
    return work;
  }

  private git(
    clone: ActiveClone,
    args: readonly string[],
    options?: RunOptions,
  ): Promise<RunResult> {
    return this.deps.run('git', args, {
      cwd: clone.root,
      env: this.deps.env,
      timeout: LOCAL_GIT_TIMEOUT_MS,
      ...options,
    });
  }
}

/** `-z` output: `STATUS NUL path NUL …`. Only `conductor/` survives — the
 * scoped `add` keeps everything else at the baseline, so anything beyond the
 * prefix here would be a bug worth dropping loudly rather than shipping. */
function parseNameStatus(output: string, prefix: string): PublishChange[] {
  const parts = output.split('\0');
  const changes: PublishChange[] = [];
  for (let index = 0; index + 1 < parts.length; index += 2) {
    const status = parts[index];
    const path = parts[index + 1];
    if (status === undefined || path === undefined || !path.startsWith(prefix)) {
      continue;
    }
    changes.push({ path: path.slice(prefix.length), kind: kindOf(status) });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

/** A/D map to their verbs; everything else — M, T, U — reads as changed. */
function kindOf(status: string): PublishChangeKind {
  if (status.startsWith('A')) {
    return 'added';
  }
  if (status.startsWith('D')) {
    return 'deleted';
  }
  return 'changed';
}

/** What the model reads first: one `<verb> conductor/<path>` line per file. */
function listingOf(entries: PublishChange[]): string {
  return entries.map((entry) => `${entry.kind} conductor/${entry.path}\n`).join('');
}

/**
 * Criterion 11's material, inlined: the listing first, then the patch. The
 * model runs with no tools, so this prompt is not its first source but its
 * only one — which is also why the listing goes above the cut. Whoever reads
 * a truncated prompt still learns every file that changed; what is lost is
 * detail inside the last of them.
 */
function describePrompt(diff: { patch: string; entries: PublishChange[] }): string {
  const patch =
    diff.patch.length <= PROMPT_PATCH_LIMIT
      ? diff.patch
      : `${diff.patch.slice(0, PROMPT_PATCH_LIMIT)}\n… diff truncated after ${PROMPT_PATCH_LIMIT} characters; ${diff.patch.length - PROMPT_PATCH_LIMIT} more were dropped.\n`;
  return `## changed-files.txt\n\n${listingOf(diff.entries)}\n## diff.patch\n\n${patch}`;
}

/** Front matter is the skill loader's contract, not the model's: what we hand
 * over is the body alone. A file without it is already the body. Exported for
 * `conductor-plugin.test.ts`, which guards this read path and so has to run
 * this function rather than a second copy of the regex. */
export function stripFrontMatter(source: string): string {
  const match = source.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);
  return match === null ? source : source.slice(match[0].length).replace(/^\s*\n/, '');
}

/**
 * Criterion 15's mechanical text — "Update 3 tests in checkout" and a
 * description listing the files. Plain and honest: it is what publishes when
 * the AI cannot write, so it must never look like an error.
 */
function mechanicalGeneration(hash: string, changes: PublishChange[]): Generation {
  const count = changes.length;
  const folders = new Set(
    changes.map((change) => (change.path.includes('/') ? (change.path.split('/')[0] ?? '') : '')),
  );
  const folder = folders.size === 1 ? [...folders][0] : '';
  const title = `Update ${count} ${count === 1 ? 'test' : 'tests'}${
    folder === '' || folder === undefined ? '' : ` in ${folder}`
  }`;
  const groups: string[] = [];
  for (const kind of ['added', 'changed', 'deleted'] as const) {
    const paths = changes.filter((change) => change.kind === kind).map((change) => change.path);
    if (paths.length > 0) {
      groups.push(`${kind[0]?.toUpperCase()}${kind.slice(1)}: ${paths.join(', ')}.`);
    }
  }
  return { hash, title: clampTitle(title), description: groups.join(' ') };
}

/**
 * The skill's output contract (criterion 12): a `TITLE:` line and a
 * `DESCRIPTION:` tail. Anything that does not carry both is unparsable, and
 * unparsable means the mechanical note — silently (criterion 15).
 */
function parseGeneration(stdout: string, hash: string): Generation | null {
  let answer: unknown;
  try {
    answer = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (
    typeof answer !== 'object' ||
    answer === null ||
    (answer as { is_error?: unknown }).is_error !== false ||
    typeof (answer as { result?: unknown }).result !== 'string'
  ) {
    return null;
  }
  const text = (answer as { result: string }).result;
  const title = text.match(/^TITLE:[ \t]*(.+)$/m)?.[1]?.trim();
  const description = text.match(/^DESCRIPTION:[ \t]*([\s\S]+)$/m)?.[1]?.trim();
  if (title === undefined || title === '' || description === undefined || description === '') {
    return null;
  }
  return {
    hash,
    title: clampTitle(title),
    description: description.slice(0, NOTE_LIMIT),
  };
}

/** ≤ 72 and single-line, whatever the model did. */
function clampTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, TITLE_LIMIT);
}

/**
 * §8.1's auth without touching anyone's config: the fetch and the push carry
 * `gh` as a per-invocation credential helper — the empty first value resets
 * whatever helpers the machine has, so ours answers alone. Registering it
 * globally (`gh auth setup-git`) would edit the person's gitconfig behind
 * their back, which nothing here does (decision).
 */
function credentialArgs(gh: string): string[] {
  return [
    '-c',
    'credential.helper=',
    '-c',
    `credential.helper=!${shellSingleQuoted(gh)} auth git-credential`,
  ];
}

/** The helper value is run by `sh`: single quotes neutralize every character
 * a resolved path could carry, with `'` itself spelled `'\''`. */
function shellSingleQuoted(path: string): string {
  return `'${path.replaceAll("'", "'\\''")}'`;
}

/** Criterion 27 — `https://github.com/<org>/<repo>/pull/<n>`, by parsing,
 * never by substring: `github.com.evil.example` must not pass. */
function isGitHubPrUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  return (
    url.protocol === 'https:' &&
    url.host === 'github.com' &&
    /^\/[^/]+\/[^/]+\/pull\/\d+$/.test(url.pathname)
  );
}

function refuse<T>(code: string, message: string): Result<T> {
  return { ok: false, error: { code, message } };
}

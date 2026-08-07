import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { PublishEvent, PublishState, Result } from '@shared/ipc';
import { afterEach, describe, expect, it } from 'vitest';
import { MaestroNotInstalledError } from '../maestro/CliRunner';
import type { SyntaxCheck } from '../maestro/MaestroGateway';
import { type RunOptions, type RunResult, run } from '../process/run';
import { PublishService, type PublishServiceDeps } from './publish.service';

/**
 * The publish domain against real temp repositories and a recording `run`:
 * `git` calls are recorded *and* delegated to the real binary — the plumbing
 * semantics (temp index, no HEAD moves, worktree untouched) are exactly what
 * this spec exists to get right, and a fake git would hide the traps — while
 * `gh` and `claude` are scripted fakes, because the network and the model are
 * not this suite's business. Argv is asserted throughout: exact flags,
 * plumbing order, `add` scoped to `conductor`, `--body-file`, never an
 * interpolated string (§8.1, §12.19).
 */

const scratch: string[] = [];
const services: PublishService[] = [];

afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.dispose();
  }
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A valid flow: `appId:` before the `---` (§7.1). */
const FLOW = 'appId: com.lojaverde.pnp\n---\n- launchApp:\n    clearState: true\n';

/** Hermetic git: no user config, no system config, a fixed identity. The
 * service's own calls run under the same environment, so a test failure is
 * never someone's global hooks or templates. */
const GIT_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_TERMINAL_PROMPT: '0',
  GIT_AUTHOR_NAME: 'Someone Testing',
  GIT_AUTHOR_EMAIL: 'someone@example.com',
  GIT_COMMITTER_NAME: 'Someone Testing',
  GIT_COMMITTER_EMAIL: 'someone@example.com',
};

async function git(cwd: string, ...args: string[]): Promise<string> {
  const result = await run('git', args, { cwd, env: GIT_ENV });
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`);
  }
  return result.stdout.trim();
}

function write(root: string, path: string, content: string): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

/** The default clone: two flows, a workspace config, a README — committed on
 * `main`, with a local bare `origin` the way `gh repo clone` leaves one. */
const DEFAULT_FILES: Record<string, string> = {
  'conductor/checkout/pix.yml': FLOW,
  'conductor/login.yml': FLOW,
  'conductor/config.yaml': 'format: 1\n',
  'README.md': '# app\n',
};

async function plantRepo(
  cloneRoot: string,
  originDir: string,
  files: Record<string, string> = DEFAULT_FILES,
): Promise<void> {
  mkdirSync(cloneRoot, { recursive: true });
  await git(cloneRoot, 'init', '-q', '-b', 'main');
  for (const [path, content] of Object.entries(files)) {
    write(cloneRoot, path, content);
  }
  await git(cloneRoot, 'add', '-A');
  await git(cloneRoot, 'commit', '-q', '-m', 'seed');
  mkdirSync(originDir, { recursive: true });
  await git(originDir, 'init', '-q', '--bare');
  await git(cloneRoot, 'remote', 'add', 'origin', originDir);
  await git(cloneRoot, 'push', '-q', 'origin', 'main');
}

type Call = { command: string; args: readonly string[]; options?: RunOptions };

const GH = '/fake/bin/gh';
const CLAUDE = '/fake/bin/claude';

type HarnessOptions = {
  /** `null` plants nothing and answers no active clone. */
  repo?: null | { files?: Record<string, string> };
  gh?: string | null;
  authCode?: number;
  claude?: string | null;
  /** Answers the `claude` invocation. Defaults to a parsable AI note. */
  claudeRun?: (call: Call) => Promise<RunResult> | RunResult;
  /** Answers `gh pr create`. Defaults to a created PR URL on stdout. */
  prCreate?: (call: Call) => RunResult;
  prEdit?: (call: Call) => RunResult;
  prView?: (call: Call) => RunResult;
  /** Answers the gate per absolute file path. Defaults to ok. */
  syntax?: (path: string) => SyntaxCheck | Promise<SyntaxCheck>;
  maestroMissing?: boolean;
  describeTimeoutMs?: number;
  now?: () => Date;
};

const PR_URL = 'https://github.com/loja-verde/pnp/pull/41';

const AI_RESULT = JSON.stringify({
  type: 'result',
  subtype: 'success',
  is_error: false,
  result:
    'TITLE: Update the Pix checkout test\nDESCRIPTION: The checkout test now waits for the confirmation screen before finishing.',
});

async function harness(options: HarnessOptions = {}): Promise<{
  service: PublishService;
  deps: PublishServiceDeps;
  dir: string;
  cloneRoot: string;
  originDir: string;
  calls: Call[];
  events: Result<PublishEvent>[];
  changed: Result<PublishState>[];
  opened: string[];
  syntaxChecked: string[];
  gitCalls: () => Call[];
  ghCalls: () => Call[];
  claudeCalls: () => Call[];
}> {
  const dir = mkdtempSync(join(tmpdir(), 'conductor-publish-service-'));
  scratch.push(dir);
  const cloneRoot = join(dir, 'repos', 'loja-verde-pnp-1a2b3c4d');
  const originDir = join(dir, 'origin.git');
  if (options.repo !== null) {
    await plantRepo(cloneRoot, originDir, options.repo?.files);
  }

  const calls: Call[] = [];
  const events: Result<PublishEvent>[] = [];
  const changed: Result<PublishState>[] = [];
  const opened: string[] = [];
  const syntaxChecked: string[] = [];

  const deps: PublishServiceDeps = {
    stateFile: join(dir, 'publications.json'),
    jobsDir: join(dir, 'jobs'),
    pluginDir: join(dir, 'plugin', 'conductor-plugin'),
    flowsDir: 'conductor',
    extensions: ['.yml', '.yaml'],
    baseBranchOverride: '',
    aiModel: 'sonnet',
    describeBudgetUsd: 0.25,
    activeClone: () =>
      options.repo === null
        ? null
        : { slug: 'loja-verde-pnp-1a2b3c4d', org: 'loja-verde', name: 'pnp', root: cloneRoot },
    resolveGh: () => (options.gh === null ? null : (options.gh ?? GH)),
    resolveClaude: () => (options.claude === null ? null : (options.claude ?? CLAUDE)),
    gateway: {
      checkSyntax: async (path) => {
        syntaxChecked.push(path);
        if (options.maestroMissing === true) {
          throw new MaestroNotInstalledError();
        }
        return options.syntax?.(path) ?? { ok: true };
      },
    },
    run: async (command, args, runOptions) => {
      calls.push({ command, args, options: runOptions });
      if (command === 'git') {
        return run('git', args, runOptions);
      }
      if (command === (options.gh ?? GH)) {
        if (args[0] === 'auth') {
          return { stdout: '', stderr: '', code: options.authCode ?? 0 };
        }
        if (args[0] === 'pr' && args[1] === 'create') {
          const call: Call = { command, args, options: runOptions };
          return options.prCreate?.(call) ?? { stdout: `${PR_URL}\n`, stderr: '', code: 0 };
        }
        if (args[0] === 'pr' && args[1] === 'edit') {
          const call: Call = { command, args, options: runOptions };
          return options.prEdit?.(call) ?? { stdout: '', stderr: '', code: 0 };
        }
        if (args[0] === 'pr' && args[1] === 'view') {
          const call: Call = { command, args, options: runOptions };
          return (
            options.prView?.(call) ?? {
              stdout: JSON.stringify({ state: 'OPEN', url: PR_URL }),
              stderr: '',
              code: 0,
            }
          );
        }
        throw new Error(`Unexpected gh call: ${args.join(' ')}`);
      }
      if (command === (options.claude ?? CLAUDE)) {
        const call: Call = { command, args, options: runOptions };
        return options.claudeRun?.(call) ?? { stdout: AI_RESULT, stderr: '', code: 0 };
      }
      throw new Error(`Unexpected command: ${command} ${args.join(' ')}`);
    },
    env: GIT_ENV,
    emitChanged: (payload) => {
      changed.push(payload);
    },
    emitEvent: (payload) => {
      events.push(payload);
    },
    openExternal: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    now: options.now ?? (() => new Date('2026-08-07T15:00:00.000Z')),
    debounceMs: 10,
    describeTimeoutMs: options.describeTimeoutMs ?? 5_000,
  };

  const service = new PublishService(deps);
  services.push(service);
  await service.start();
  return {
    service,
    deps,
    dir,
    cloneRoot,
    originDir,
    calls,
    events,
    changed,
    opened,
    syntaxChecked,
    gitCalls: () => calls.filter((call) => call.command === 'git'),
    ghCalls: () => calls.filter((call) => call.command === (options.gh ?? GH)),
    claudeCalls: () => calls.filter((call) => call.command === (options.claude ?? CLAUDE)),
  };
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
    await new Promise((resolve) => setTimeout(resolve, 15));
  }
}

/** The event stream, unwrapped — these travel `ok` (the run:event idiom). */
function unwrapped(events: Result<PublishEvent>[]): PublishEvent[] {
  return events.map((payload) => data(payload));
}

describe('the unsent set', () => {
  it('refuses with publish/no-repo before any repo is connected', async () => {
    const { service } = await harness({ repo: null });

    expect(code(await service.status())).toBe('publish/no-repo');
  });

  /** Criterion 1 — a clean tree is the quiet truth, not a failure. */
  it('answers empty over a clean tree', async () => {
    const { service } = await harness();

    expect(data(await service.status())).toEqual({ changes: [], reviewOpen: false });
  });

  /** Criterion 7 — the difference between the working tree and the base tip,
   * scoped to `conductor/`: the README edit is invisible. */
  it('counts an edit as changed, scoped to conductor/', async () => {
    const { service, cloneRoot } = await harness();
    write(cloneRoot, 'conductor/checkout/pix.yml', `${FLOW}- tapOn: "Pagar"\n`);
    write(cloneRoot, 'README.md', '# edited\n');

    expect(data(await service.status()).changes).toEqual([
      { path: 'checkout/pix.yml', kind: 'changed' },
    ]);
  });

  /** Criterion 8 — untracked new files count as Added. */
  it('counts an untracked new file as added', async () => {
    const { service, cloneRoot } = await harness();
    write(cloneRoot, 'conductor/checkout/boleto.yml', FLOW);

    expect(data(await service.status()).changes).toEqual([
      { path: 'checkout/boleto.yml', kind: 'added' },
    ]);
  });

  it('counts a deletion as deleted', async () => {
    const { service, cloneRoot } = await harness();
    rmSync(join(cloneRoot, 'conductor/login.yml'));

    expect(data(await service.status()).changes).toEqual([{ path: 'login.yml', kind: 'deleted' }]);
  });

  /** Criterion 8 — changed non-flow files ship with the publication and
   * appear in the list. */
  it('lists changed non-flow files alongside flows', async () => {
    const { service, cloneRoot } = await harness();
    write(cloneRoot, 'conductor/config.yaml', 'format: 2\n');
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    expect(data(await service.status()).changes).toEqual([
      { path: 'config.yaml', kind: 'changed' },
      { path: 'login.yml', kind: 'changed' },
    ]);
  });

  /** The status computation is read-only plumbing: no checkout, no reset, no
   * stash, no pull, and never the real index (§8.2, criterion 21). */
  it('never touches the working tree, HEAD or the real index', async () => {
    const { service, cloneRoot, gitCalls } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    const headBefore = await git(cloneRoot, 'rev-parse', 'HEAD');
    const statusBefore = await git(cloneRoot, 'status', '--porcelain');

    await service.status();

    expect(await git(cloneRoot, 'rev-parse', 'HEAD')).toBe(headBefore);
    expect(await git(cloneRoot, 'status', '--porcelain')).toBe(statusBefore);
    for (const call of gitCalls()) {
      expect(['checkout', 'reset', 'stash', 'pull']).not.toContain(call.args[0]);
      const index = call.options?.env?.GIT_INDEX_FILE;
      if (index !== undefined) {
        expect(index.startsWith(join(cloneRoot, '.git'))).toBe(false);
      }
    }
  });
});

describe('the debounced recompute', () => {
  /** Criterion 9 — a burst of `flow:changed` becomes one recompute, pushed as
   * `publish:changed`, and a save is never blocked on it. */
  it('recomputes once off a burst of flow:changed and pushes the fresh set', async () => {
    const { service, cloneRoot, changed } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    service.notifyFlowChanged();
    service.notifyFlowChanged();
    service.notifyFlowChanged();

    await until(() => changed.length > 0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(changed).toHaveLength(1);
    expect(data(changed[0] as Result<PublishState>).changes).toEqual([
      { path: 'login.yml', kind: 'changed' },
    ]);
  });

  it('stays quiet when no repo is active', async () => {
    const { service, changed } = await harness({ repo: null });

    service.notifyFlowChanged();

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(changed).toEqual([]);
  });

  /** Criterion 9 — a switch reflects the new repo's own state, immediately. */
  it('pushes the fresh state on a repo change without waiting for a debounce', async () => {
    const { service, changed } = await harness();

    await service.activeRepoChanged();

    expect(changed).toHaveLength(1);
    expect(data(changed[0] as Result<PublishState>)).toEqual({ changes: [], reviewOpen: false });
  });
});

describe('the describe job', () => {
  it('refuses with publish/no-repo before any repo is connected', async () => {
    const { service } = await harness({ repo: null });

    expect(code(await service.describe())).toBe('publish/no-repo');
  });

  /** Criterion 10 asks for ≥ 1 unsent change; with none there is nothing to
   * describe, and §8.3 already has the words for it. */
  it('refuses with publish/nothing-to-send over a clean tree', async () => {
    const { service } = await harness();

    expect(code(await service.describe())).toBe('publish/nothing-to-send');
  });

  /** Criterion 10 — the §8.4 profile against the installed CLI: read-only
   * tools, no user settings, no MCP, our plugin, capped budget. Never
   * `--safe-mode`, never `--bare`, never `--mcp-config`. `Skill` joins the
   * three read tools because the installed `--tools` restricts the whole
   * built-in set — without it the model cannot load the very skill the
   * prompt names (verified against 2.1.224; see the spec's decisions). */
  it('invokes claude headless with exactly the §8.4 profile', async () => {
    const { service, deps, cloneRoot, events, claudeCalls } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.describe());
    await until(() => events.length > 0);

    const call = claudeCalls()[0] as Call;
    expect(call.command).toBe(CLAUDE);
    const args = [...call.args];
    const prompt = args.at(-1) as string;
    expect(prompt).toContain('describe-changes');
    const jobDir = call.options?.cwd as string;
    expect(jobDir.startsWith(deps.jobsDir)).toBe(true);
    expect(args.slice(0, -1)).toEqual([
      '-p',
      '--model',
      'sonnet',
      '--output-format',
      'json',
      '--tools',
      'Skill,Read,Glob,Grep',
      '--setting-sources',
      '',
      '--strict-mcp-config',
      '--plugin-dir',
      deps.pluginDir,
      '--add-dir',
      jobDir,
      '--add-dir',
      join(cloneRoot, 'conductor'),
      '--max-budget-usd',
      '0.25',
    ]);
    expect(call.options?.signal).toBeInstanceOf(AbortSignal);
    expect(call.options?.timeout).toBe(5_000);
  });

  /** Criterion 11 — the diff and the changed-files listing are written by us
   * into the job dir; the model never runs git and is never handed the diff
   * any other way. */
  it('hands the model the diff and the listing through the job dir', async () => {
    let seen: { patch: string; files: string } | null = null;
    const { service, cloneRoot, events } = await harness({
      claudeRun: (call) => {
        const jobDir = call.options?.cwd as string;
        seen = {
          patch: readFileSync(join(jobDir, 'diff.patch'), 'utf8'),
          files: readFileSync(join(jobDir, 'changed-files.txt'), 'utf8'),
        };
        return { stdout: AI_RESULT, stderr: '', code: 0 };
      },
    });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.describe());
    await until(() => events.length > 0);

    const captured = seen as { patch: string; files: string } | null;
    expect(captured?.patch).toContain('conductor/login.yml');
    expect(captured?.patch).toContain('+- back');
    expect(captured?.files).toBe('changed conductor/login.yml\n');
  });

  /** Criterion 13 — the note the field prefills with is the description; the
   * title never rides the event (§8.4: AI-owned, invisible). */
  it('emits the described note, tagged with its job', async () => {
    const { service, cloneRoot, events } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    const { describeId } = data(await service.describe());
    await until(() => events.length > 0);

    expect(unwrapped(events)).toEqual([
      {
        kind: 'described',
        describeId,
        note: 'The checkout test now waits for the confirmation screen before finishing.',
      },
    ]);
  });

  /** Criterion 16 — an unchanged change set never pays for claude twice. */
  it('reuses the cached note while the content hash is unchanged', async () => {
    const { service, cloneRoot, events, claudeCalls } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    data(await service.describe());
    await until(() => events.length === 1);

    data(await service.describe());
    await until(() => events.length === 2);

    expect(claudeCalls()).toHaveLength(1);
    const [first, second] = unwrapped(events);
    expect(first?.kind === 'described' && second?.kind === 'described').toBe(true);
    expect(first?.kind === 'described' ? first.note : '').toBe(
      second?.kind === 'described' ? second.note : null,
    );
  });

  it('invokes claude again once the content changed', async () => {
    const { service, cloneRoot, events, claudeCalls } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    data(await service.describe());
    await until(() => events.length === 1);

    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n- back\n`);
    data(await service.describe());
    await until(() => events.length === 2);

    expect(claudeCalls()).toHaveLength(2);
  });

  /** Criterion 15 — no claude, same sheet: the mechanical note arrives the
   * same way, and nothing errors anywhere. */
  it('falls back to mechanical text when claude is missing', async () => {
    const { service, cloneRoot, events, claudeCalls } = await harness({ claude: null });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    write(cloneRoot, 'conductor/checkout/boleto.yml', FLOW);
    rmSync(join(cloneRoot, 'conductor/config.yaml'));

    const { describeId } = data(await service.describe());
    await until(() => events.length > 0);

    expect(unwrapped(events)).toEqual([
      {
        kind: 'described',
        describeId,
        note: 'Added: checkout/boleto.yml. Changed: login.yml. Deleted: config.yaml.',
      },
    ]);
    expect(claudeCalls()).toEqual([]);
  });

  it('falls back to mechanical text when claude exits non-zero', async () => {
    const { service, cloneRoot, events } = await harness({
      claudeRun: () => ({ stdout: '', stderr: 'budget exceeded', code: 1 }),
    });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.describe());
    await until(() => events.length > 0);

    const event = unwrapped(events)[0];
    expect(event?.kind === 'described' ? event.note : null).toBe('Changed: login.yml.');
  });

  it('falls back to mechanical text when the answer is unparsable', async () => {
    const { service, cloneRoot, events } = await harness({
      claudeRun: () => ({
        stdout: JSON.stringify({ type: 'result', is_error: false, result: 'no format here' }),
        stderr: '',
        code: 0,
      }),
    });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.describe());
    await until(() => events.length > 0);

    const event = unwrapped(events)[0];
    expect(event?.kind === 'described' ? event.note : null).toBe('Changed: login.yml.');
  });

  /** Criterion 15's deadline — a hung claude is killed and the mechanical
   * note arrives instead; the field never writes forever. */
  it('kills a claude that outlives the deadline and falls back', async () => {
    let aborted = 0;
    const { service, cloneRoot, events } = await harness({
      describeTimeoutMs: 60,
      claudeRun: (call) =>
        new Promise((_resolve, reject) => {
          const signal = call.options?.signal;
          const abort = (): void => {
            aborted += 1;
            reject(new Error('The operation was aborted'));
          };
          if (signal?.aborted === true) {
            abort();
            return;
          }
          signal?.addEventListener('abort', abort);
        }),
    });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.describe());
    await until(() => events.length > 0);

    expect(aborted).toBe(1);
    const event = unwrapped(events)[0];
    expect(event?.kind === 'described' ? event.note : null).toBe('Changed: login.yml.');
  });

  /** Criterion 14 — the sheet closing kills the child, and a canceled job
   * says nothing: no note, no fallback. */
  it('kills the child on cancel and emits nothing for the canceled job', async () => {
    let aborted = 0;
    const { service, cloneRoot, events, claudeCalls } = await harness({
      claudeRun: (call) =>
        new Promise((_resolve, reject) => {
          // Like the real `run`: a child handed an already-aborted signal
          // never starts and rejects at once.
          const signal = call.options?.signal;
          const abort = (): void => {
            aborted += 1;
            reject(new Error('The operation was aborted'));
          };
          if (signal?.aborted === true) {
            abort();
            return;
          }
          signal?.addEventListener('abort', abort);
        }),
    });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    const { describeId } = data(await service.describe());
    await until(() => claudeCalls().length === 1);

    const canceled = service.cancel(describeId);

    expect(data(canceled)).toEqual({ jobId: describeId });
    await until(() => aborted === 1);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(events).toEqual([]);
  });

  it('refuses a cancel naming a job it does not hold', async () => {
    const { service } = await harness();

    expect(code(service.cancel(99))).toBe('publish/job-not-found');
  });
});

/** The last event, unwrapped — where a pipeline's verdict lands. */
function lastEvent(events: Result<PublishEvent>[]): PublishEvent | undefined {
  return unwrapped(events).at(-1);
}

/** The git subcommand behind any leading `-c key=value` pairs. */
function gitSubcommand(call: Call): string | undefined {
  let index = 0;
  while (call.args[index] === '-c') {
    index += 2;
  }
  return call.args[index];
}

async function untilSettled(events: Result<PublishEvent>[]): Promise<PublishEvent> {
  await until(
    () => {
      const last = lastEvent(events);
      return last?.kind === 'sent' || last?.kind === 'send-failed';
    },
    () => JSON.stringify(events),
  );
  return lastEvent(events) as PublishEvent;
}

describe('sending — refusals and the gate', () => {
  it('refuses with publish/no-repo before any repo is connected', async () => {
    const { service } = await harness({ repo: null });

    expect(code(await service.send('note', null))).toBe('publish/no-repo');
  });

  /** Criterion 24 — §8.3's "nothing new to send": refused on the invoke, with
   * the stable code the sheet returns to the idle truth from. */
  it('refuses with publish/nothing-to-send over a clean tree', async () => {
    const { service, events } = await harness();

    expect(code(await service.send('note', null))).toBe('publish/nothing-to-send');
    expect(events).toEqual([]);
  });

  it('refuses a second send while one is in flight', async () => {
    let release: (verdict: SyntaxCheck) => void = () => {};
    const { service, cloneRoot, events, syntaxChecked } = await harness({
      syntax: () =>
        new Promise<SyntaxCheck>((resolve) => {
          release = resolve;
        }),
    });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    data(await service.send('note', null));

    expect(code(await service.send('note', null))).toBe('publish/send-active');

    await until(() => syntaxChecked.length === 1);
    release({ ok: true });
    await untilSettled(events);
  });

  /** Criterion 26 — the gh failures reuse their specific fixes, and nothing
   * of the pipeline runs first: the failure is the first and only event. */
  it('fails with repo/gh-missing before any git work', async () => {
    const { service, cloneRoot, events, gitCalls, calls } = await harness({ gh: null });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    const before = gitCalls().length;

    const { sendId } = data(await service.send('note', null));
    const settled = await untilSettled(events);

    expect(settled).toMatchObject({ kind: 'send-failed', sendId, code: 'repo/gh-missing' });
    expect(
      gitCalls()
        .slice(before)
        .map((call) => call.args[0]),
    ).not.toContain('fetch');
    expect(calls.filter((call) => call.command !== 'git')).toEqual([]);
  });

  it('fails with repo/gh-unauthenticated when gh auth status refuses', async () => {
    const { service, cloneRoot, events, gitCalls } = await harness({ authCode: 1 });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.send('note', null));
    const settled = await untilSettled(events);

    expect(settled).toMatchObject({ kind: 'send-failed', code: 'repo/gh-unauthenticated' });
    expect(gitCalls().map((call) => call.args[0])).not.toContain('fetch');
  });

  /** Criteria 8 and 19 — every changed flow-classified file runs the gate,
   * and only those: the workspace config and the deletion stay out of it. */
  it('gates exactly the changed flow-classified files', async () => {
    const { service, cloneRoot, events, syntaxChecked } = await harness();
    write(cloneRoot, 'conductor/checkout/pix.yml', `${FLOW}- tapOn: "Pagar"\n`);
    write(cloneRoot, 'conductor/checkout/boleto.yml', FLOW);
    write(cloneRoot, 'conductor/config.yaml', 'format: 2\n');
    rmSync(join(cloneRoot, 'conductor/login.yml'));

    data(await service.send('note', null));
    await untilSettled(events);

    expect(syntaxChecked.sort()).toEqual([
      join(cloneRoot, 'conductor', 'checkout', 'boleto.yml'),
      join(cloneRoot, 'conductor', 'checkout', 'pix.yml'),
    ]);
  });

  /** Criterion 19 — the message names the file in product language; the raw
   * Maestro output never crosses. Nothing Git runs after the gate refuses. */
  it('stops with the failing file named, in product language', async () => {
    const { service, cloneRoot, events, gitCalls } = await harness({
      syntax: (path) =>
        path.endsWith('pix.yml')
          ? { ok: false, message: 'RAW MAESTRO OUTPUT line 3' }
          : { ok: true },
    });
    write(cloneRoot, 'conductor/checkout/pix.yml', `${FLOW}- tapOn: broken\n`);

    const { sendId } = data(await service.send('note', null));
    const settled = await untilSettled(events);

    expect(settled).toEqual({
      kind: 'send-failed',
      sendId,
      code: 'publish/syntax-error',
      message: 'This test has an error that prevents sending: checkout/pix.yml.',
    });
    expect(gitCalls().map((call) => call.args[0])).not.toContain('fetch');
  });

  /** Criterion 19 — no maestro at all is its own refusal, with its own fix. */
  it('fails with publish/maestro-missing when the gate cannot run', async () => {
    const { service, cloneRoot, events } = await harness({ maestroMissing: true });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.send('note', null));
    const settled = await untilSettled(events);

    expect(settled).toMatchObject({ kind: 'send-failed', code: 'publish/maestro-missing' });
  });
});

describe('the first send', () => {
  /** Criterion 18 — the id immediately, then checking → sending →
   * opening-review → sent, all pushed; and never a `pr view` on the click
   * (criterion 28). */
  it('streams the steps through to sent', async () => {
    const { service, cloneRoot, events, ghCalls } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    const { sendId } = data(await service.send('The login test now goes back.', null));
    await untilSettled(events);

    expect(unwrapped(events)).toEqual([
      { kind: 'send-step', sendId, step: 'checking' },
      { kind: 'send-step', sendId, step: 'sending' },
      { kind: 'send-step', sendId, step: 'opening-review' },
      { kind: 'sent', sendId, joined: false },
    ]);
    expect(ghCalls().map((call) => `${call.args[0]} ${call.args[1] ?? ''}`.trim())).toEqual([
      'auth status',
      'pr create',
    ]);
  });

  /** Criteria 20 and 21 — plumbing, in order, over a temporary index: fetch,
   * read-tree, add scoped to conductor, write-tree, commit-tree, update-ref,
   * push. Never checkout, reset, stash or pull; never the clone's own index. */
  it('builds the publication by plumbing, in order, scoped to conductor', async () => {
    const { service, cloneRoot, events, gitCalls } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.send('note', 'login.yml'));
    await untilSettled(events);

    // The invoke's own unsent check builds a temp index first (criterion 24),
    // and the post-sent recompute may build another after — the pipeline
    // proper runs from the fetch through the push.
    const all = gitCalls().filter((call) =>
      ['fetch', 'read-tree', 'add', 'write-tree', 'commit-tree', 'update-ref', 'push'].includes(
        gitSubcommand(call) as string,
      ),
    );
    const pipeline = all.slice(
      all.findIndex((call) => gitSubcommand(call) === 'fetch'),
      all.findIndex((call) => gitSubcommand(call) === 'push') + 1,
    );
    expect(pipeline.map((call) => gitSubcommand(call))).toEqual([
      'fetch',
      'read-tree',
      'add',
      'write-tree',
      'commit-tree',
      'update-ref',
      'push',
    ]);
    const [fetch, , add, , commitTree, updateRef, push] = pipeline;
    expect(fetch?.args).toEqual([
      '-c',
      'credential.helper=',
      '-c',
      `credential.helper=!"${GH}" auth git-credential`,
      'fetch',
      'origin',
      'main',
    ]);
    expect(fetch?.options?.timeout).toBe(60_000);
    expect(add?.args).toEqual(['add', '-A', '--', 'conductor']);
    expect(commitTree?.args.slice(0, 1)).toEqual(['commit-tree']);
    expect(updateRef?.args).toEqual([
      'update-ref',
      'refs/heads/conductor/2026-08-07-login',
      expect.stringMatching(/^[0-9a-f]{40}$/),
    ]);
    expect(push?.args.slice(-3)).toEqual(['push', 'origin', 'conductor/2026-08-07-login']);
    expect(push?.options?.timeout).toBe(60_000);
    for (const call of gitCalls()) {
      expect(['checkout', 'reset', 'stash', 'pull']).not.toContain(gitSubcommand(call));
      const index = call.options?.env?.GIT_INDEX_FILE;
      if (index !== undefined) {
        expect(index.startsWith(join(cloneRoot, '.git'))).toBe(false);
      }
    }
  });

  /** Criterion 20 — `gh pr create --base --head --title --body-file`: the
   * note travels by file, never interpolated; the body is the note as edited. */
  it('opens the PR with the note riding --body-file', async () => {
    let body: string | null = null;
    const { service, cloneRoot, events, ghCalls } = await harness({
      prCreate: (call) => {
        const flag = call.args.indexOf('--body-file');
        body = readFileSync(call.args[flag + 1] as string, 'utf8');
        return { stdout: `${PR_URL}\n`, stderr: '', code: 0 };
      },
    });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.send('The login test now goes back at the end.', 'login.yml'));
    await untilSettled(events);

    const create = ghCalls().find((call) => call.args[1] === 'create');
    expect(create?.args.slice(0, 2)).toEqual(['pr', 'create']);
    expect(create?.args).toContain('--base');
    expect(create?.args[create.args.indexOf('--base') + 1]).toBe('main');
    expect(create?.args[create.args.indexOf('--head') + 1]).toBe('conductor/2026-08-07-login');
    expect(create?.args[create.args.indexOf('--title') + 1]).toBe('Update 1 test');
    expect(create?.options?.cwd).toBe(cloneRoot);
    expect(create?.options?.timeout).toBe(60_000);
    expect(body).toBe('The login test now goes back at the end.');
  });

  /** §8.4 — the AI's title is the PR's and the commit's first line; the
   * person's note is the body. The title never crossed the renderer. */
  it('uses the freshest generation for the PR title and the commit subject', async () => {
    const { service, cloneRoot, events, ghCalls } = await harness();
    write(cloneRoot, 'conductor/checkout/pix.yml', `${FLOW}- tapOn: "Pagar"\n`);
    data(await service.describe());
    await until(() => events.length > 0);

    data(await service.send('My own words about it.', 'checkout/pix.yml'));
    await untilSettled(events);

    const create = ghCalls().find((call) => call.args[1] === 'create');
    expect(create?.args[create.args.indexOf('--title') + 1]).toBe('Update the Pix checkout test');
    expect(await git(cloneRoot, 'log', '-1', '--format=%s', 'conductor/2026-08-07-pix')).toBe(
      'Update the Pix checkout test',
    );
  });

  /** Criterion 21 — the bytes of every file under the clone are identical
   * before and after; criterion 25 — the publication survives in userData. */
  it('leaves the document untouched and persists the publication', async () => {
    const { service, deps, cloneRoot, events } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    write(cloneRoot, 'README.md', '# dirty on purpose\n');
    const headBefore = await git(cloneRoot, 'rev-parse', 'HEAD');
    const statusBefore = await git(cloneRoot, 'status', '--porcelain');

    data(await service.send('note', null));
    await untilSettled(events);

    expect(await git(cloneRoot, 'rev-parse', 'HEAD')).toBe(headBefore);
    expect(await git(cloneRoot, 'status', '--porcelain')).toBe(statusBefore);
    expect(readFileSync(join(cloneRoot, 'conductor/login.yml'), 'utf8')).toBe(`${FLOW}- back\n`);
    const persisted = JSON.parse(readFileSync(deps.stateFile, 'utf8'));
    const publication = persisted.publications['loja-verde-pnp-1a2b3c4d'];
    expect(publication).toMatchObject({
      branch: 'conductor/2026-08-07-tests',
      baseBranch: 'main',
      prNumber: 41,
      prUrl: PR_URL,
    });
    expect(publication.baseCommit).toBe(await git(cloneRoot, 'rev-parse', 'origin/main'));
    expect(publication.lastSentCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(data(await service.status())).toEqual({ changes: [], reviewOpen: true });
  });

  /** Criterion 20 — the commit carries exactly the `conductor/` scope: the
   * dirty README stays home, and the branch really is on the remote. */
  it('commits exactly the conductor scope, parented on the fetched base tip', async () => {
    const { service, cloneRoot, originDir, events } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    write(cloneRoot, 'conductor/checkout/boleto.yml', FLOW);
    rmSync(join(cloneRoot, 'conductor/config.yaml'));
    write(cloneRoot, 'README.md', '# dirty on purpose\n');

    data(await service.send('note', null));
    await untilSettled(events);

    const branch = 'conductor/2026-08-07-tests';
    const parent = await git(cloneRoot, 'rev-parse', `${branch}^`);
    expect(parent).toBe(await git(cloneRoot, 'rev-parse', 'origin/main'));
    const touched = await git(
      cloneRoot,
      'diff',
      '--name-status',
      '--no-renames',
      `${branch}^`,
      branch,
    );
    expect(touched.split('\n').sort()).toEqual([
      'A\tconductor/checkout/boleto.yml',
      'D\tconductor/config.yaml',
      'M\tconductor/login.yml',
    ]);
    expect(await git(originDir, 'rev-parse', `refs/heads/${branch}`)).toBe(
      await git(cloneRoot, 'rev-parse', branch),
    );
  });

  /** Criterion 20 — the slug comes from the open flow, sanitized by resolving
   * inside `conductor/` (§9.3); a path that escapes falls back to `tests`. */
  it('refuses a traversal in the flow path and falls back to tests', async () => {
    const { service, cloneRoot, events, gitCalls } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.send('note', '../../etc/passwd'));
    await untilSettled(events);

    const updateRef = gitCalls().find((call) => call.args[0] === 'update-ref');
    expect(updateRef?.args[1]).toBe('refs/heads/conductor/2026-08-07-tests');
  });

  /** Criterion 26 — a network that fails becomes product language with the
   * stable code; the raw git words stay in the console. */
  it('fails the send in product language when the remote is unreachable', async () => {
    const { service, cloneRoot, originDir, events, deps } = await harness();
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    rmSync(originDir, { recursive: true, force: true });

    const { sendId } = data(await service.send('note', null));
    const settled = await untilSettled(events);

    expect(settled).toMatchObject({ kind: 'send-failed', sendId, code: 'publish/send-failed' });
    expect(settled.kind === 'send-failed' ? settled.message : '').not.toContain('fatal');
    expect(existsSync(deps.stateFile)).toBe(false);
  });

  /** A PR that would not open leaves no publication behind: the next send
   * starts from a clean slate rather than believing in a review that is not
   * there. */
  it('persists nothing when the review could not be opened', async () => {
    const { service, cloneRoot, events, deps } = await harness({
      prCreate: () => ({ stdout: '', stderr: 'boom', code: 1 }),
    });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);

    data(await service.send('note', null));
    const settled = await untilSettled(events);

    expect(settled).toMatchObject({ kind: 'send-failed', code: 'publish/send-failed' });
    expect(existsSync(deps.stateFile)).toBe(false);
    expect(data(await service.status())).toMatchObject({ reviewOpen: false });
  });
});

describe('subsequent sends', () => {
  async function firstSend(bundle: Awaited<ReturnType<typeof harness>>): Promise<void> {
    write(bundle.cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    data(await bundle.service.send('First words.', 'login.yml'));
    await untilSettled(bundle.events);
    bundle.events.length = 0;
  }

  /** Criterion 23 — same branch, parent = the previous tip, `gh pr edit`
   * refreshing title and body, and the UI told the changes joined the open
   * review. */
  it('commits on the same branch and refreshes the PR', async () => {
    let body: string | null = null;
    const bundle = await harness({
      prEdit: (call) => {
        const flag = call.args.indexOf('--body-file');
        body = readFileSync(call.args[flag + 1] as string, 'utf8');
        return { stdout: '', stderr: '', code: 0 };
      },
    });
    const { service, cloneRoot, originDir, events, ghCalls, gitCalls, deps } = bundle;
    await firstSend(bundle);
    const firstTip = await git(cloneRoot, 'rev-parse', 'conductor/2026-08-07-login');
    write(cloneRoot, 'conductor/checkout/pix.yml', `${FLOW}- tapOn: "Pagar"\n`);

    const { sendId } = data(await service.send('Second words.', 'checkout/pix.yml'));
    const settled = await untilSettled(events);

    expect(settled).toEqual({ kind: 'sent', sendId, joined: true });
    expect(gitCalls().filter((call) => gitSubcommand(call) === 'fetch')).toHaveLength(1);
    const edit = ghCalls().find((call) => call.args[1] === 'edit');
    expect(edit?.args.slice(0, 3)).toEqual(['pr', 'edit', '41']);
    expect(edit?.args).toContain('--title');
    expect(edit?.args).toContain('--body-file');
    expect(body).toBe('Second words.');
    const tip = await git(cloneRoot, 'rev-parse', 'conductor/2026-08-07-login');
    expect(await git(cloneRoot, 'rev-parse', 'conductor/2026-08-07-login^')).toBe(firstTip);
    expect(await git(originDir, 'rev-parse', 'refs/heads/conductor/2026-08-07-login')).toBe(tip);
    const persisted = JSON.parse(readFileSync(deps.stateFile, 'utf8'));
    expect(persisted.publications['loja-verde-pnp-1a2b3c4d'].lastSentCommit).toBe(tip);
  });

  /** Criteria 11 and 23 — the note describes the publication whole: with a
   * review open, the diff handed to the model runs from the publication's
   * birth base to the working tree, not merely from the last send. */
  it('describes the full publication diff once a review is open', async () => {
    let patch: string | null = null;
    const bundle = await harness({
      claudeRun: (call) => {
        patch = readFileSync(join(call.options?.cwd as string, 'diff.patch'), 'utf8');
        return { stdout: AI_RESULT, stderr: '', code: 0 };
      },
    });
    const { service, cloneRoot, events } = bundle;
    await firstSend(bundle);
    write(cloneRoot, 'conductor/checkout/pix.yml', `${FLOW}- tapOn: "Pagar"\n`);

    data(await service.describe());
    await until(() => events.some((payload) => data(payload).kind === 'described'));

    expect(patch).toContain('+- back');
    expect(patch).toContain('+- tapOn: "Pagar"');
  });

  /** Criterion 7's tail — sent and untouched does not count; edited after
   * sending counts again. */
  it('counts only what changed since the last send', async () => {
    const bundle = await harness();
    const { service, cloneRoot } = bundle;
    await firstSend(bundle);

    expect(data(await service.status()).changes).toEqual([]);

    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n- back\n`);
    expect(data(await service.status()).changes).toEqual([{ path: 'login.yml', kind: 'changed' }]);
  });
});

describe('the publication lifecycle', () => {
  async function sent(bundle: Awaited<ReturnType<typeof harness>>): Promise<void> {
    write(bundle.cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    data(await bundle.service.send('First words.', 'login.yml'));
    await untilSettled(bundle.events);
    bundle.events.length = 0;
    bundle.changed.length = 0;
  }

  /** Criteria 28 and 29 — the refresh rides the sheet opening (status), and a
   * merged PR ends the publication: state cleared, base fetched, and the disk
   * — never rewritten — counts as unsent again. */
  it('ends the publication when the refresh reports the PR merged', async () => {
    let state = 'OPEN';
    const bundle = await harness({
      prView: () => ({ stdout: JSON.stringify({ state, url: PR_URL }), stderr: '', code: 0 }),
    });
    const { service, deps, changed, ghCalls, gitCalls } = bundle;
    await sent(bundle);
    state = 'MERGED';

    await service.status();
    await until(() => changed.some((payload) => data(payload).reviewOpen === false));

    expect(ghCalls().some((call) => call.args[1] === 'view')).toBe(true);
    expect(JSON.parse(readFileSync(deps.stateFile, 'utf8')).publications).toEqual({});
    expect(
      gitCalls().filter((call) => gitSubcommand(call) === 'fetch').length,
    ).toBeGreaterThanOrEqual(2);
    const last = data(changed.at(-1) as Result<PublishState>);
    expect(last.reviewOpen).toBe(false);
    expect(last.changes).toEqual([{ path: 'login.yml', kind: 'changed' }]);
  });

  /** Criterion 30 — a refresh that fails keeps the stored state and stays
   * quiet; it retries on the next trigger. */
  it('keeps the stored state when the refresh fails', async () => {
    const bundle = await harness({
      prView: () => ({ stdout: '', stderr: 'network is down', code: 1 }),
    });
    const { service, ghCalls, events } = bundle;
    await sent(bundle);

    await service.status();
    await until(() => ghCalls().some((call) => call.args[1] === 'view'));
    await new Promise((resolve) => setTimeout(resolve, 60));

    expect(data(await service.status())).toMatchObject({ reviewOpen: true });
    expect(events).toEqual([]);
  });

  /** Criterion 28 — the app starting with a persisted open publication
   * refreshes it. */
  it('refreshes on start with a persisted publication', async () => {
    const bundle = await harness();
    const { deps, ghCalls } = bundle;
    await sent(bundle);
    const viewsBefore = ghCalls().filter((call) => call.args[1] === 'view').length;

    const second = new PublishService({ ...deps });
    services.push(second);
    await second.start();

    await until(() => ghCalls().filter((call) => call.args[1] === 'view').length > viewsBefore);
  });
});

describe('View on GitHub', () => {
  it('opens the stored URL once it parses as a GitHub PR', async () => {
    const bundle = await harness();
    write(bundle.cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    data(await bundle.service.send('note', null));
    await untilSettled(bundle.events);

    const result = await bundle.service.openPr();

    expect(data(result)).toEqual({ url: PR_URL });
    expect(bundle.opened).toEqual([PR_URL]);
  });

  it('refuses with publish/no-review when nothing is open', async () => {
    const { service, opened } = await harness();

    expect(code(await service.openPr())).toBe('publish/no-review');
    expect(opened).toEqual([]);
  });

  /** Criterion 27 — a stored URL that does not parse as
   * `https://github.com/<org>/<repo>/pull/<n>` opens nothing: the validation
   * guards the stored value too, not only the renderer. */
  it('refuses a stored URL that is not a GitHub PR', async () => {
    const bundle = await harness();
    writeFileSync(
      bundle.deps.stateFile,
      JSON.stringify({
        version: 1,
        publications: {
          'loja-verde-pnp-1a2b3c4d': {
            branch: 'conductor/2026-08-07-login',
            baseBranch: 'main',
            baseCommit: 'a'.repeat(40),
            lastSentCommit: 'b'.repeat(40),
            prNumber: 41,
            prUrl: 'https://github.com.evil.example/loja-verde/pnp/pull/41',
            createdAt: '2026-08-07T15:00:00.000Z',
          },
        },
      }),
    );
    const second = new PublishService({ ...bundle.deps });
    services.push(second);
    await second.start();

    expect(code(await second.openPr())).toBe('publish/no-review');
    expect(bundle.opened).toEqual([]);
  });
});

describe('conductorPluginDir', () => {
  /** §8.4 — the plugin ships via `extraResources` and must resolve in both
   * runs, exactly the way the scrcpy jar does. */
  it('resolves beside the binary when packaged and in the repo in dev', async () => {
    const { conductorPluginDir } = await import('./publish.service');

    expect(
      conductorPluginDir({ packaged: true, resourcesPath: '/App/Resources', appPath: '/App' }),
    ).toBe(join('/App/Resources', 'conductor-plugin'));
    expect(conductorPluginDir({ packaged: false, resourcesPath: '/x', appPath: '/repo' })).toBe(
      join('/repo', 'resources', 'conductor-plugin'),
    );
  });
});

describe('dispose', () => {
  /** Criterion 34 — no `claude` child survives before-quit. */
  it('kills the in-flight describe child', async () => {
    let aborted = 0;
    const { service, cloneRoot, claudeCalls } = await harness({
      claudeRun: (call) =>
        new Promise((_resolve, reject) => {
          const signal = call.options?.signal;
          const abort = (): void => {
            aborted += 1;
            reject(new Error('The operation was aborted'));
          };
          if (signal?.aborted === true) {
            abort();
            return;
          }
          signal?.addEventListener('abort', abort);
        }),
    });
    write(cloneRoot, 'conductor/login.yml', `${FLOW}- back\n`);
    data(await service.describe());
    await until(() => claudeCalls().length === 1);

    service.dispose();

    await until(() => aborted === 1);
  });
});

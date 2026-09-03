import { createHash } from 'node:crypto';
import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { DoctorInstallEvent, DoctorState, Result } from '@shared/ipc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunOptions, RunResult } from '../process/run';
import { DoctorService, type DoctorServiceDeps } from './doctor.service';
import { DownloadError, type DownloadOptions } from './download';

/**
 * The doctor against a real temp `userData` and a fake machine: `run`
 * records every argv and answers the appendix's captured outputs, the
 * download writes a planted archive, `unzip` lays the archive out the way
 * the real one does. A row is proven by the string it shows.
 */

const scratch: string[] = [];
const services: DoctorService[] = [];

afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.dispose();
  }
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

const PINNED = '2.10.0';
const ADB = '/Users/gui/Library/Android/sdk/platform-tools/adb';
const GH = '/opt/homebrew/bin/gh';
const CLAUDE = '/Users/gui/.local/bin/claude';
const JAVA_HOME = '/Library/Java/JavaVirtualMachines/zulu-21.jdk/Contents/Home';
const JAVA = `${JAVA_HOME}/bin/java`;
const ARCHIVE_BYTES = 'zip-bytes-of-maestro';
const ARCHIVE_SHA = createHash('sha256').update(ARCHIVE_BYTES).digest('hex');

type Answer = RunResult | 'hang' | 'enoent';
type Call = { command: string; args: readonly string[]; env?: NodeJS.ProcessEnv };

/** The healthy Mac of the appendix. Tests override one key at a time. */
function healthy(): Record<string, Answer> {
  return {
    'adb --version': {
      stdout:
        'Android Debug Bridge version 1.0.41\nVersion 35.0.2-12147458\nInstalled as /Users/gui/Library/Android/sdk/platform-tools/adb\n',
      stderr: '',
      code: 0,
    },
    java_home: { stdout: `${JAVA_HOME}\n`, stderr: '', code: 0 },
    'java -version': {
      stdout: '',
      stderr:
        'openjdk version "21.0.4" 2024-07-16 LTS\nOpenJDK Runtime Environment Zulu21.36+17-CA (build 21.0.4+7-LTS)\n',
      code: 0,
    },
    'xcode-select -p': {
      stdout: '/Applications/Xcode.app/Contents/Developer\n',
      stderr: '',
      code: 0,
    },
    'pkgutil --pkg-info=com.apple.pkg.CLTools_Executables': {
      stdout: 'version: 26.1.0.0.1.1761104275\n',
      stderr: '',
      code: 0,
    },
    'gh --version': {
      stdout: 'gh version 2.91.0 (2026-04-22)\nhttps://github.com/cli/cli\n',
      stderr: '',
      code: 0,
    },
    'gh auth status --active': {
      stdout:
        'github.com\n  ✓ Logged in to github.com account GuilhermeHCDias (keyring)\n  - Active account: true\n  - Token: gho_************************************\n',
      stderr: '',
      code: 0,
    },
    'claude --version': { stdout: '2.1.258 (Claude Code)\n', stderr: '', code: 0 },
    'claude auth status': {
      stdout:
        '{\n  "loggedIn": true,\n  "authMethod": "claude.ai",\n  "apiProvider": "firstParty"\n}\n',
      stderr: '',
      code: 0,
    },
    'maestro --version': { stdout: `${PINNED}\n`, stderr: '', code: 0 },
  };
}

type HarnessOptions = {
  pinned?: string;
  override?: string;
  /** Plant a managed copy with this marker before the service starts. */
  managed?: string;
  /** Extra executables on the fake machine (the managed binary is planted
   * as a real file, so it needs no entry). */
  executables?: readonly string[];
  adb?: string | null;
  gh?: string | null;
  claude?: string | null;
  javaHome?: string;
  hidden?: readonly string[];
  answers?: Partial<Record<string, Answer>>;
  /** How the archive unzips: the real nested `maestro/` dir, a flat root,
   * an archive with no launcher, or an unzip that fails outright. */
  layout?: 'nested' | 'flat' | 'missing' | 'fails';
  /** What the downloads do. */
  archive?: 'ok' | 'http-503' | 'hang' | 'corrupt';
  checkTimeoutMs?: number;
  verifyTimeoutMs?: number;
};

function harness(options: HarnessOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'conductor-doctor-'));
  scratch.push(dir);
  const managedDir = join(dir, 'maestro');
  const installDir = join(dir, 'maestro-install');
  if (options.managed !== undefined) {
    plantManaged(managedDir, options.managed);
  }
  const executables = new Set(options.executables ?? []);
  const answers = { ...healthy(), ...options.answers };
  const calls: Call[] = [];
  const changed: DoctorState[] = [];
  const installEvents: DoctorInstallEvent[] = [];
  const downloads: string[] = [];
  let setupFinished = 0;
  let now = 1_756_800_000_000;
  let gh = options.gh === null ? null : (options.gh ?? GH);

  const respond = (key: string, signal?: AbortSignal): Promise<RunResult> => {
    const answer = answers[key];
    if (answer === undefined) {
      throw new Error(`The fake machine has no answer for: ${key}`);
    }
    if (answer === 'enoent') {
      const error = Object.assign(new Error(`spawn ${key} ENOENT`), { code: 'ENOENT' });
      return Promise.reject(error);
    }
    if (answer === 'hang') {
      return new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => {
          const error = new Error('The operation was aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
    }
    return Promise.resolve(answer);
  };

  const run = (command: string, args: readonly string[], runOptions?: RunOptions) => {
    calls.push({ command, args, env: runOptions?.env });
    const name = basename(command);
    if (name === 'unzip') {
      const target = args[3];
      if (args[0] !== '-qo' || target === undefined) {
        throw new Error(`Unexpected unzip argv: ${JSON.stringify(args)}`);
      }
      if (options.layout === 'fails') {
        return Promise.resolve({
          stdout: '',
          stderr: 'unzip: cannot find zipfile directory\n',
          code: 9,
        });
      }
      plantArchive(target, options.layout ?? 'nested');
      return Promise.resolve({ stdout: '', stderr: '', code: 0 });
    }
    if (name === 'maestro') {
      return respond(`maestro ${args.join(' ')}`, runOptions?.signal);
    }
    if (name === 'java_home') {
      return respond('java_home', runOptions?.signal);
    }
    return respond(`${name} ${args.join(' ')}`, runOptions?.signal);
  };

  const download = async (url: string, dest: string, downloadOptions: DownloadOptions) => {
    downloads.push(url);
    if (url.endsWith('checksums_sha256.txt')) {
      const digest = options.archive === 'corrupt' ? 'f'.repeat(64) : ARCHIVE_SHA;
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, `${digest}  maestro.zip\n`);
      return;
    }
    if (options.archive === 'http-503') {
      throw new DownloadError('HTTP 503');
    }
    if (options.archive === 'hang') {
      await new Promise<void>((_resolve, reject) => {
        downloadOptions.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      });
      return;
    }
    mkdirSync(dirname(dest), { recursive: true });
    downloadOptions.onProgress?.({ received: 10, total: 100 });
    downloadOptions.onProgress?.({ received: 50, total: 100 });
    writeFileSync(dest, ARCHIVE_BYTES);
    downloadOptions.onProgress?.({ received: 100, total: 100 });
  };

  const deps: DoctorServiceDeps = {
    managedDir,
    installDir,
    pinnedVersion: options.pinned ?? PINNED,
    releaseUrl: 'https://github.com/mobile-dev-inc/maestro/releases/download',
    maestroOverride: options.override ?? '',
    env:
      options.javaHome === undefined
        ? { PATH: '/usr/bin' }
        : { PATH: '/usr/bin', JAVA_HOME: options.javaHome },
    home: '/Users/someone',
    isExecutable: (path) => executables.has(path) || isExecutableFile(path),
    isFile: (path) => existsSync(path),
    resolveAdb: () => (options.adb === null ? null : (options.adb ?? ADB)),
    resolveGh: () => gh,
    resolveClaude: () => (options.claude === null ? null : (options.claude ?? CLAUDE)),
    hidden: new Set(options.hidden ?? []),
    run,
    download,
    emitChanged: (payload: Result<DoctorState>) => {
      if (payload.ok) {
        changed.push(payload.data);
      }
    },
    emitInstallEvent: (payload: Result<DoctorInstallEvent>) => {
      if (payload.ok) {
        installEvents.push(payload.data);
      }
    },
    onSetupFinished: () => {
      setupFinished += 1;
    },
    now: () => now,
    timeouts: {
      check: options.checkTimeoutMs ?? 2_000,
      verify: options.verifyTimeoutMs ?? 2_000,
      readyHold: 300,
      focusThrottle: 5_000,
    },
  };
  const service = new DoctorService(deps);
  services.push(service);
  return {
    service,
    deps,
    dir,
    managedDir,
    installDir,
    calls,
    changed,
    installEvents,
    downloads,
    setupFinished: () => setupFinished,
    advance: (ms: number) => {
      now += ms;
    },
    setGh: (path: string | null) => {
      gh = path;
    },
  };
}

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) {
      return false;
    }
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function plantManaged(managedDir: string, version: string): void {
  mkdirSync(join(managedDir, 'bin'), { recursive: true });
  mkdirSync(join(managedDir, 'lib'), { recursive: true });
  writeFileSync(join(managedDir, 'bin', 'maestro'), '#!/bin/sh\n');
  chmodSync(join(managedDir, 'bin', 'maestro'), 0o755);
  writeFileSync(join(managedDir, 'version'), `${version}\n`);
}

function plantArchive(target: string, layout: 'nested' | 'flat' | 'missing'): void {
  const root = layout === 'nested' ? join(target, 'maestro') : target;
  mkdirSync(join(root, 'lib'), { recursive: true });
  mkdirSync(join(root, 'deps'), { recursive: true });
  writeFileSync(join(root, 'lib', 'maestro-cli.jar'), 'jar');
  if (layout !== 'missing') {
    mkdirSync(join(root, 'bin'), { recursive: true });
    // As the archive ships it: no execute bit — the pipeline sets it.
    writeFileSync(join(root, 'bin', 'maestro'), '#!/bin/sh\n');
    chmodSync(join(root, 'bin', 'maestro'), 0o644);
  }
}

/** The last report pushed, once one has. */
async function report(h: ReturnType<typeof harness>) {
  await vi.waitFor(
    () => {
      expect(h.changed.at(-1)?.report).not.toBeNull();
      expect(h.changed.at(-1)?.checking).toBe(false);
    },
    { timeout: 3_000 },
  );
  const state = h.changed.at(-1);
  if (state?.report == null) {
    throw new Error('No report landed.');
  }
  return state.report;
}

function row(r: Awaited<ReturnType<typeof report>>, id: string) {
  const found = r.rows.find((entry) => entry.id === id);
  if (found === undefined) {
    throw new Error(`No row ${id}.`);
  }
  return found;
}

async function lastInstallEvent<K extends 'done' | 'failed'>(
  h: ReturnType<typeof harness>,
  kind: K,
): Promise<Extract<DoctorInstallEvent, { kind: K }>> {
  await vi.waitFor(() => {
    expect(h.installEvents.at(-1)?.kind).toBe(kind);
  });
  const event = h.installEvents.at(-1);
  if (event === undefined || event.kind !== kind) {
    throw new Error('Unreachable.');
  }
  return event as Extract<DoctorInstallEvent, { kind: K }>;
}

/* ── The report ─────────────────────────────────────────────────────────── */

describe('the report', () => {
  /** Criteria 1, 2, 4 — the healthy Mac of the appendix, row by row. */
  it('lists the eight rows in order with the machine-register details', async () => {
    const h = harness({ managed: PINNED });
    h.service.start();
    h.service.windowShown();
    const r = await report(h);

    expect(r.rows.map((entry) => [entry.id, entry.name])).toEqual([
      ['maestro', 'Maestro'],
      ['adb', 'Android platform-tools'],
      ['java', 'Java Development Kit'],
      ['xcode-clt', 'Xcode command line tools'],
      ['gh', 'GitHub CLI'],
      ['github-auth', 'GitHub'],
      ['claude', 'Claude Code'],
      ['claude-auth', 'Claude'],
    ]);
    expect(r.rows.map((entry) => entry.status)).toEqual(Array(8).fill('ok'));
    expect(row(r, 'maestro')).toMatchObject({
      label: 'Installed',
      short: '2.10.0',
      detail: `maestro 2.10.0 · ${join(h.managedDir, 'bin', 'maestro')}`,
    });
    expect(row(r, 'adb')).toMatchObject({
      label: 'Ready',
      short: 'adb 35.0.2',
      detail: `Android Debug Bridge version 1.0.41 · ${ADB}`,
    });
    expect(row(r, 'java')).toMatchObject({
      label: 'Ready',
      short: 'java 21.0.4',
      detail: `openjdk version "21.0.4" 2024-07-16 LTS · ${JAVA}`,
    });
    expect(row(r, 'xcode-clt')).toMatchObject({
      label: 'Installed',
      short: '26.1',
      detail: '26.1 · /Applications/Xcode.app/Contents/Developer',
    });
    expect(row(r, 'gh')).toMatchObject({
      label: 'Installed',
      short: 'gh 2.91.0',
      detail: `gh version 2.91.0 (2026-04-22) · ${GH}`,
    });
    expect(row(r, 'github-auth')).toMatchObject({
      label: 'Signed in',
      short: 'GuilhermeHCDias',
      detail: 'Logged in to github.com account GuilhermeHCDias (keyring)',
    });
    expect(row(r, 'claude')).toMatchObject({
      label: 'Installed',
      short: 'claude 2.1.258',
      detail: `2.1.258 (Claude Code) · ${CLAUDE}`,
    });
    expect(row(r, 'claude-auth')).toMatchObject({
      label: 'Signed in',
      short: 'claude.ai',
      detail: 'claude auth status → loggedIn: true (claude.ai)',
    });
    expect(r.issues).toBe(0);
    expect(r.checkedAt).toBe(1_756_800_000_000);
  });

  /** Criterion 5 — the masked token line never leaves main. */
  it('keeps nothing of gh auth status but its one line', async () => {
    const h = harness({ managed: PINNED });
    h.service.start();
    h.service.windowShown();
    const r = await report(h);

    expect(JSON.stringify(r)).not.toContain('gho_');
    expect(JSON.stringify(r)).not.toContain('Token');
  });

  it('runs the java check through JAVA_HOME when it is set and executable', async () => {
    const h = harness({
      managed: PINNED,
      javaHome: '/opt/jdk',
      executables: ['/opt/jdk/bin/java'],
    });
    h.service.start();
    h.service.windowShown();
    const r = await report(h);

    expect(h.calls.some((call) => basename(call.command) === 'java_home')).toBe(false);
    expect(h.calls.some((call) => call.command === '/opt/jdk/bin/java')).toBe(true);
    expect(row(r, 'java').detail).toContain('/opt/jdk/bin/java');
  });

  it('never spawns /usr/bin/java: without a JDK the row fails on java_home', async () => {
    const h = harness({
      managed: PINNED,
      answers: {
        java_home: {
          stdout: '',
          stderr: 'The operation couldn’t be completed. Unable to locate a Java Runtime.\n',
          code: 1,
        },
      },
    });
    h.service.start();
    h.service.windowShown();
    const r = await report(h);

    expect(row(r, 'java')).toMatchObject({
      status: 'fail',
      label: 'Not found',
      detail:
        '/usr/libexec/java_home → The operation couldn’t be completed. Unable to locate a Java Runtime.',
    });
    expect(h.calls.some((call) => call.command === '/usr/bin/java')).toBe(false);
    expect(r.issues).toBe(1);
  });

  it('warns about a JDK older than 17', async () => {
    const h = harness({
      managed: PINNED,
      answers: {
        'java -version': {
          stdout: '',
          stderr: 'openjdk version "11.0.2" 2019-01-15\nOpenJDK Runtime Environment 18.9\n',
          code: 0,
        },
      },
    });
    h.service.start();
    h.service.windowShown();
    const r = await report(h);

    expect(row(r, 'java')).toMatchObject({
      status: 'warn',
      label: 'Too old',
      detail: 'openjdk version "11.0.2" 2019-01-15 · Maestro needs Java 17 or newer',
      short: 'java 11.0.2',
    });
  });

  it('tells adb missing from adb not working', async () => {
    const missing = harness({ managed: PINNED, adb: null });
    missing.service.start();
    missing.service.windowShown();
    expect(row(await report(missing), 'adb')).toMatchObject({
      status: 'fail',
      label: 'Not found',
      detail: 'adb --version → command not found',
    });

    const broken = harness({
      managed: PINNED,
      answers: {
        'adb --version': { stdout: '', stderr: 'dyld: Library not loaded\nmore\n', code: 134 },
      },
    });
    broken.service.start();
    broken.service.windowShown();
    expect(row(await report(broken), 'adb')).toMatchObject({
      status: 'fail',
      label: 'Not working',
      detail: 'dyld: Library not loaded',
    });
  });

  it('reads the Xcode tools off xcode-select, with Installed as the short when no receipt exists', async () => {
    const h = harness({
      managed: PINNED,
      answers: {
        'pkgutil --pkg-info=com.apple.pkg.CLTools_Executables': {
          stdout: '',
          stderr: "No receipt for 'com.apple.pkg.CLTools_Executables' was found at '/'.\n",
          code: 1,
        },
      },
    });
    h.service.start();
    h.service.windowShown();
    const r = await report(h);

    expect(row(r, 'xcode-clt')).toMatchObject({
      status: 'ok',
      label: 'Installed',
      short: 'Installed',
      detail: 'Installed · /Applications/Xcode.app/Contents/Developer',
    });
  });

  it('fails the Xcode tools row on the xcode-select error', async () => {
    const h = harness({
      managed: PINNED,
      answers: {
        'xcode-select -p': {
          stdout: '',
          stderr:
            'xcode-select: error: unable to get active developer directory, use `sudo xcode-select --switch path/to/Xcode.app`\n',
          code: 2,
        },
      },
    });
    h.service.start();
    h.service.windowShown();

    expect(row(await report(h), 'xcode-clt')).toMatchObject({
      status: 'fail',
      label: 'Not found',
      detail:
        'xcode-select: error: unable to get active developer directory, use `sudo xcode-select --switch path/to/Xcode.app`',
    });
  });

  /** §8.1 — installed and authenticated are different failures. */
  it('reports gh missing on both gh rows, without running gh auth status', async () => {
    const h = harness({ managed: PINNED, gh: null });
    h.service.start();
    h.service.windowShown();
    const r = await report(h);

    expect(row(r, 'gh')).toMatchObject({
      status: 'fail',
      label: 'Not found',
      detail: 'gh --version → command not found',
    });
    expect(row(r, 'github-auth')).toMatchObject({
      status: 'warn',
      label: 'Signed out',
      detail: 'gh auth status → needs GitHub CLI first',
    });
    expect(h.calls.some((call) => basename(call.command) === 'gh' && call.args[0] === 'auth')).toBe(
      false,
    );
    expect(r.issues).toBe(2);
  });

  it('reports gh signed out with the transcript’s first line', async () => {
    const h = harness({
      managed: PINNED,
      answers: {
        'gh auth status --active': {
          stdout: '',
          stderr: 'You are not logged into any GitHub hosts. To log in, run: gh auth login\n',
          code: 1,
        },
      },
    });
    h.service.start();
    h.service.windowShown();

    expect(row(await report(h), 'github-auth')).toMatchObject({
      status: 'warn',
      label: 'Signed out',
      detail: 'You are not logged into any GitHub hosts. To log in, run: gh auth login',
      short: 'signed out',
    });
  });

  it('reports claude missing on both claude rows', async () => {
    const h = harness({ managed: PINNED, claude: null });
    h.service.start();
    h.service.windowShown();
    const r = await report(h);

    expect(row(r, 'claude')).toMatchObject({ status: 'fail', label: 'Not found' });
    expect(row(r, 'claude-auth')).toMatchObject({
      status: 'warn',
      label: 'Signed out',
      detail: 'claude auth status → needs Claude Code first',
    });
  });

  it('reports claude signed out on loggedIn false, and on anything unparsable', async () => {
    const out = harness({
      managed: PINNED,
      answers: { 'claude auth status': { stdout: '{"loggedIn": false}\n', stderr: '', code: 0 } },
    });
    out.service.start();
    out.service.windowShown();
    expect(row(await report(out), 'claude-auth')).toMatchObject({
      status: 'warn',
      label: 'Signed out',
      detail: 'claude auth status → loggedIn: false',
    });

    const odd = harness({
      managed: PINNED,
      answers: {
        'claude auth status': { stdout: '', stderr: 'Not logged in. Run claude login.\n', code: 1 },
      },
    });
    odd.service.start();
    odd.service.windowShown();
    expect(row(await report(odd), 'claude-auth')).toMatchObject({
      status: 'warn',
      label: 'Signed out',
      detail: 'Not logged in. Run claude login.',
    });
  });

  /** Criterion 3 — a check that hangs is a state, not a hung report. */
  it('marks a check that does not answer in time as Did not answer', async () => {
    const h = harness({
      managed: PINNED,
      checkTimeoutMs: 1_000,
      answers: { 'gh auth status --active': 'hang' },
    });
    h.service.start();
    h.service.windowShown();
    const r = await report(h);

    expect(row(r, 'github-auth')).toMatchObject({
      status: 'warn',
      label: 'Did not answer',
      detail: 'gh auth status → no answer after 1 s',
    });
    // Everything else still answered: the timeout is per check.
    expect(row(r, 'gh').status).toBe('ok');
  });

  /** Criterion 3 — the report is pushed whole, never row by row. */
  it('pushes checking, then the whole report once', async () => {
    const h = harness({ managed: PINNED });
    h.service.start();
    h.service.windowShown();
    await report(h);

    expect(h.changed.map((state) => [state.checking, state.report?.rows.length ?? null])).toEqual([
      [true, null],
      [false, 8],
    ]);
  });

  /** Criterion 6 — a trigger during a check is coalesced, never queued. */
  it('coalesces a check asked for while one is in flight', async () => {
    const h = harness({
      managed: PINNED,
      answers: { 'gh auth status --active': 'hang' },
      checkTimeoutMs: 200,
    });
    h.service.start();
    h.service.windowShown();

    expect(h.service.check()).toEqual({ ok: true, data: { started: false } });
    await report(h);
    expect(h.changed.filter((state) => state.report !== null)).toHaveLength(1);

    expect(h.service.check()).toEqual({ ok: true, data: { started: true } });
    await vi.waitFor(() => {
      expect(h.changed.filter((state) => state.report !== null)).toHaveLength(2);
    });
  });

  it('answers status with the current state', async () => {
    const h = harness({ managed: PINNED });
    h.service.start();

    expect(h.service.status()).toEqual({
      ok: true,
      data: {
        report: null,
        checking: false,
        setup: { active: false, reason: null },
        install: null,
        maestroOverridden: false,
        version: PINNED,
      },
    });
  });

  it('says so when CONFIG.MAESTRO_PATH is set', () => {
    const h = harness({ override: '/custom/maestro' });
    h.service.start();

    expect(h.service.state().maestroOverridden).toBe(true);
  });

  /** Criterion 40 — a hidden tool is absent for the doctor's own resolvers. */
  it('treats hidden java and xcode-clt as absent without running anything', async () => {
    const h = harness({ managed: PINNED, hidden: ['java', 'xcode-clt'] });
    h.service.start();
    h.service.windowShown();
    const r = await report(h);

    expect(row(r, 'java').status).toBe('fail');
    expect(row(r, 'xcode-clt').status).toBe('fail');
    expect(h.calls.some((call) => /java_home|xcode-select/.test(call.command))).toBe(false);
  });
});

/* ── Focus rechecks ─────────────────────────────────────────────────────── */

describe('on window focus', () => {
  it('re-runs only the non-ok rows and merges them, at most once per 5 s', async () => {
    const h = harness({ managed: PINNED, gh: null });
    h.service.start();
    h.service.windowShown();
    const first = await report(h);
    expect(first.issues).toBe(2);
    h.calls.length = 0;

    // The person installed gh in the terminal and came back.
    h.setGh(GH);
    h.advance(1_000);
    h.service.windowFocused();
    await vi.waitFor(() => {
      expect(h.changed.at(-1)?.report?.issues).toBe(0);
    });

    const commands = h.calls.map((call) => `${basename(call.command)} ${call.args.join(' ')}`);
    expect(commands).toEqual(['gh --version', 'gh auth status --active']);
    const merged = h.changed.at(-1)?.report;
    expect(merged?.checkedAt).toBe(1_756_800_001_000);
    expect(merged?.rows.map((entry) => entry.id)).toEqual(first.rows.map((entry) => entry.id));
    expect(merged?.rows.find((entry) => entry.id === 'adb')).toEqual(row(first, 'adb'));

    // Within the throttle window, and with nothing non-ok left: nothing runs.
    h.calls.length = 0;
    h.advance(1_000);
    h.service.windowFocused();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(h.calls).toHaveLength(0);
  });

  it('throttles a second focus inside 5 s', async () => {
    const h = harness({
      managed: PINNED,
      answers: {
        'gh auth status --active': { stdout: '', stderr: 'You are not logged in\n', code: 1 },
      },
    });
    h.service.start();
    h.service.windowShown();
    await report(h);
    h.calls.length = 0;

    h.advance(6_000);
    h.service.windowFocused();
    await vi.waitFor(() => {
      expect(h.calls.length).toBeGreaterThan(0);
    });
    await vi.waitFor(() => {
      expect(h.changed.at(-1)?.checking).toBe(false);
    });
    const ran = h.calls.length;
    h.advance(2_000);
    h.service.windowFocused();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(h.calls).toHaveLength(ran);
  });

  it('does nothing before the first report, or while every row is ok', async () => {
    const h = harness({ managed: PINNED });
    h.service.start();
    h.service.windowFocused();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.calls).toHaveLength(0);

    h.service.windowShown();
    await report(h);
    h.calls.length = 0;
    h.advance(10_000);
    h.service.windowFocused();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(h.calls).toHaveLength(0);
  });
});

/* ── The maestro row ────────────────────────────────────────────────────── */

describe('the maestro row', () => {
  it('reads the managed copy without starting a JVM', async () => {
    const h = harness({ managed: PINNED });
    h.service.start();
    h.service.windowShown();
    await report(h);

    expect(h.calls.some((call) => basename(call.command) === 'maestro')).toBe(false);
  });

  it('warns Update pending when the marker is behind the pin', async () => {
    const h = harness({ managed: '2.8.0' });
    h.service.start();
    h.service.check();

    expect(row(await report(h), 'maestro')).toMatchObject({
      status: 'warn',
      label: 'Update pending',
      detail: '2.8.0 · Conductor needs 2.10.0',
      short: '2.8.0',
    });
  });

  it('warns Using yours for a configured path or a copy on PATH', async () => {
    const own = harness({ override: '/custom/maestro', executables: ['/custom/maestro'] });
    own.service.start();
    own.service.check();
    expect(row(await report(own), 'maestro')).toMatchObject({
      status: 'warn',
      label: 'Using yours',
      detail: '/custom/maestro',
    });

    const onPath = harness({ executables: ['/usr/bin/maestro'] });
    onPath.service.start();
    onPath.service.check();
    expect(row(await report(onPath), 'maestro')).toMatchObject({
      status: 'warn',
      label: 'Using yours',
      detail: '/usr/bin/maestro',
    });
  });

  it('fails Not installed when nothing resolves', async () => {
    const h = harness();
    h.service.start();
    h.service.check();

    expect(row(await report(h), 'maestro')).toMatchObject({
      status: 'fail',
      label: 'Not installed',
      detail: 'maestro → not installed',
    });
  });
});

/* ── Setup ──────────────────────────────────────────────────────────────── */

describe('the setup decision', () => {
  /** Criterion 13 — files alone, before the window exists. */
  it('is a first run with no managed copy', () => {
    const h = harness();
    h.service.start();

    expect(h.service.state().setup).toEqual({ active: true, reason: 'first-run' });
  });

  it('is an update when the marker is behind the pin', () => {
    const h = harness({ managed: '2.8.0' });
    h.service.start();

    expect(h.service.state().setup).toEqual({ active: true, reason: 'update' });
  });

  it('is inactive when the managed copy matches the pin', () => {
    const h = harness({ managed: PINNED });
    h.service.start();

    expect(h.service.state().setup).toEqual({ active: false, reason: null });
  });

  it('is inactive when CONFIG.MAESTRO_PATH is set, whatever is managed', () => {
    const h = harness({ override: '/custom/maestro' });
    h.service.start();

    expect(h.service.state().setup).toEqual({ active: false, reason: null });
  });

  it('is a first run when the managed binary lost its execute bit or its marker', () => {
    const noMarker = harness({ managed: PINNED });
    rmSync(join(noMarker.managedDir, 'version'));
    noMarker.service.start();
    expect(noMarker.service.state().setup.active).toBe(true);

    const noBit = harness({ managed: PINNED });
    chmodSync(join(noBit.managedDir, 'bin', 'maestro'), 0o644);
    noBit.service.start();
    expect(noBit.service.state().setup.active).toBe(true);
  });
});

/* ── Installing ─────────────────────────────────────────────────────────── */

describe('installing', () => {
  /** Criterion 10 — an explicit path is the person's decision. */
  it('refuses while CONFIG.MAESTRO_PATH is set', () => {
    const h = harness({ override: '/custom/maestro' });
    h.service.start();

    expect(h.service.install()).toEqual({
      ok: false,
      error: { code: 'doctor/maestro-overridden', message: expect.any(String) },
    });
    expect(h.downloads).toEqual([]);
  });

  /** Criteria 12, 15 — the pipeline, step by step, and what it leaves. */
  it('downloads, checks, extracts, verifies and lands the copy under userData', async () => {
    const h = harness({ managed: PINNED });
    h.service.start();
    h.service.windowShown();
    await report(h);
    h.calls.length = 0;
    h.changed.length = 0;

    const started = h.service.install();
    expect(started).toEqual({ ok: true, data: { installId: 'install-1' } });
    const done = await lastInstallEvent(h, 'done');
    expect(done).toEqual({ kind: 'done', installId: 'install-1', version: PINNED });

    expect(h.downloads).toEqual([
      'https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.10.0/maestro.zip',
      'https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.10.0/checksums_sha256.txt',
    ]);
    const steps = h.installEvents.filter((event) => event.kind === 'progress');
    expect(steps.map((event) => event.step)).toEqual([
      'Downloading maestro 2.10.0',
      'Downloading maestro 2.10.0',
      'Downloading maestro 2.10.0',
      'Downloading maestro 2.10.0',
      'Checking the download',
      'Extracting',
      'Verifying installation',
      'Verifying installation',
    ]);
    expect(steps.map((event) => event.pct)).toEqual([0, 9, 45, 90, 90, 93, 98, 100]);
    for (const event of steps) {
      expect(event.installId).toBe('install-1');
    }

    // unzip through run.ts, quiet and overwriting, into the job dir.
    const unzip = h.calls.find((call) => basename(call.command) === 'unzip');
    expect(unzip?.command).toBe('/usr/bin/unzip');
    expect(unzip?.args.slice(0, 1)).toEqual(['-qo']);
    expect(unzip?.args[1]).toContain(join(h.installDir, 'install-1'));
    // The verify spawn: the managed launcher, analytics off, no device flag.
    const verify = h.calls.find((call) => basename(call.command) === 'maestro');
    expect(verify?.command).toBe(join(h.managedDir, 'bin', 'maestro'));
    expect(verify?.args).toEqual(['--version']);
    expect(verify?.env?.MAESTRO_CLI_NO_ANALYTICS).toBe('1');

    // What landed (criteria 8, 11): bin/, lib/, deps/, the marker — and the
    // job dir gone. Nothing outside userData was touched.
    expect(readFileSync(join(h.managedDir, 'version'), 'utf8')).toBe(PINNED);
    expect(isExecutableFile(join(h.managedDir, 'bin', 'maestro'))).toBe(true);
    expect(readdirSync(h.managedDir).sort()).toEqual(['bin', 'deps', 'lib', 'version']);
    expect(existsSync(h.installDir)).toBe(false);

    // The install is a state transition — pushed at start and at the end —
    // and the doctor rechecks itself once it settles (criterion 6).
    expect(h.changed[0]?.install).toEqual({
      installId: 'install-1',
      pct: 0,
      step: 'Downloading maestro 2.10.0',
    });
    await vi.waitFor(() => {
      expect(h.changed.at(-1)?.install).toBeNull();
      expect(h.changed.at(-1)?.report?.checkedAt).toBeDefined();
    });
  });

  /** Criterion 31 — the row goes ok in place even when the install settles
   * while a check is in flight: the recheck waits for it rather than being
   * dropped by the coalescing of criterion 6. */
  it('rechecks after the in-flight check when an install settles during one', async () => {
    const h = harness({
      answers: { 'gh auth status --active': 'hang' },
      checkTimeoutMs: 400,
    });
    h.service.start();
    h.service.skipSetup();
    h.service.check();
    h.service.install();
    await lastInstallEvent(h, 'done');

    await vi.waitFor(
      () => {
        expect(h.changed.at(-1)?.report?.rows.find((entry) => entry.id === 'maestro')?.status).toBe(
          'ok',
        );
        expect(h.changed.at(-1)?.checking).toBe(false);
      },
      { timeout: 3_000 },
    );
  });

  it('accepts an archive whose launcher sits at the root', async () => {
    const h = harness({ layout: 'flat' });
    h.service.start();
    h.service.install();
    await lastInstallEvent(h, 'done');

    expect(isExecutableFile(join(h.managedDir, 'bin', 'maestro'))).toBe(true);
  });

  it('replaces a previous managed copy whole', async () => {
    const h = harness({ managed: '2.8.0' });
    writeFileSync(join(h.managedDir, 'lib', 'old.jar'), 'old');
    h.service.start();
    h.service.install();
    await lastInstallEvent(h, 'done');

    expect(existsSync(join(h.managedDir, 'lib', 'old.jar'))).toBe(false);
    expect(readFileSync(join(h.managedDir, 'version'), 'utf8')).toBe(PINNED);
  });

  it('refuses a second install while one runs', async () => {
    const h = harness({ archive: 'hang' });
    h.service.start();
    expect(h.service.install().ok).toBe(true);

    expect(h.service.install()).toEqual({
      ok: false,
      error: { code: 'doctor/install-active', message: expect.any(String) },
    });
  });

  /** Criterion 12's Java clause — the install still completes; the Java row
   * carries that truth. */
  it('skips the verify step when no JDK resolves', async () => {
    const h = harness({
      answers: { java_home: { stdout: '', stderr: 'Unable to locate a Java Runtime.\n', code: 1 } },
    });
    h.service.start();
    h.service.install();
    await lastInstallEvent(h, 'done');

    expect(h.calls.some((call) => basename(call.command) === 'maestro')).toBe(false);
    expect(readFileSync(join(h.managedDir, 'version'), 'utf8')).toBe(PINNED);
  });

  /* Criterion 17 — one sentence per code, the raw cause in detail. */

  it('fails the download with the product sentence and the HTTP status', async () => {
    const h = harness({ archive: 'http-503' });
    h.service.start();
    h.service.install();
    const failed = await lastInstallEvent(h, 'failed');

    expect(failed).toEqual({
      kind: 'failed',
      installId: 'install-1',
      code: 'doctor/download-failed',
      message:
        "Conductor couldn't reach GitHub to download Maestro. Check your connection and try again.",
      detail: 'HTTP 503',
    });
    expect(h.service.state().install).toEqual({
      installId: 'install-1',
      failed: { code: 'doctor/download-failed', message: failed.message, detail: 'HTTP 503' },
    });
    expect(existsSync(h.managedDir)).toBe(false);
    expect(existsSync(h.installDir)).toBe(false);
  });

  it('carries the last install failure onto the maestro row', async () => {
    const h = harness({ archive: 'http-503' });
    h.service.start();
    h.service.install();
    await lastInstallEvent(h, 'failed');
    const r = await report(h);

    expect(row(r, 'maestro')).toMatchObject({
      status: 'fail',
      label: 'Not installed',
      detail: 'HTTP 503',
    });
  });

  it('discards an archive whose sha256 does not match the published one', async () => {
    const h = harness({ archive: 'corrupt' });
    h.service.start();
    h.service.install();
    const failed = await lastInstallEvent(h, 'failed');

    expect(failed).toMatchObject({
      code: 'doctor/checksum-mismatch',
      message: "The download didn't match what Maestro published, so it was discarded.",
    });
    expect(failed.detail).toContain(ARCHIVE_SHA);
    expect(existsSync(h.installDir)).toBe(false);
    expect(existsSync(h.managedDir)).toBe(false);
  });

  it('fails extraction with unzip’s own first stderr line', async () => {
    const h = harness({ layout: 'fails' });
    h.service.start();
    h.service.install();

    expect(await lastInstallEvent(h, 'failed')).toMatchObject({
      code: 'doctor/extract-failed',
      message: "Maestro couldn't be unpacked on this Mac.",
      detail: 'unzip: cannot find zipfile directory',
    });
    expect(existsSync(h.managedDir)).toBe(false);
  });

  it('fails extraction when the archive carries no launcher', async () => {
    const h = harness({ layout: 'missing' });
    h.service.start();
    h.service.install();

    expect(await lastInstallEvent(h, 'failed')).toMatchObject({
      code: 'doctor/extract-failed',
      detail: 'bin/maestro not found in the archive',
    });
    expect(existsSync(h.managedDir)).toBe(false);
  });

  it('fails verification when the launcher prints another version, and removes the copy', async () => {
    const h = harness({
      answers: { 'maestro --version': { stdout: '2.9.0\n', stderr: '', code: 0 } },
    });
    h.service.start();
    h.service.install();

    expect(await lastInstallEvent(h, 'failed')).toMatchObject({
      code: 'doctor/verify-failed',
      message: "Maestro was installed but didn't answer as expected.",
      detail: 'maestro --version → 2.9.0',
    });
    expect(existsSync(h.managedDir)).toBe(false);
  });

  it('fails verification when the launcher does not answer in time', async () => {
    const h = harness({ answers: { 'maestro --version': 'hang' }, verifyTimeoutMs: 50 });
    h.service.start();
    h.service.install();

    expect(await lastInstallEvent(h, 'failed')).toMatchObject({
      code: 'doctor/verify-failed',
      detail: 'maestro --version → no answer after 0 s',
    });
  });
});

/* ── The setup window's flow ────────────────────────────────────────────── */

describe('the setup flow', () => {
  /** Criteria 14, 16 — no click to start; the app presents itself after. */
  it('starts the install when the window shows, then finishes setup after the hold', async () => {
    const h = harness();
    h.service.start();
    expect(h.service.state().setup.active).toBe(true);

    h.service.windowShown();
    await lastInstallEvent(h, 'done');
    expect(h.setupFinished()).toBe(0);

    await vi.waitFor(() => {
      expect(h.setupFinished()).toBe(1);
    });
    expect(h.service.state().setup).toEqual({ active: false, reason: null });
    expect(h.changed.at(-1)?.setup.active).toBe(false);
  });

  it('keeps setup active on failure, so Try again is the same install', async () => {
    const h = harness({ archive: 'http-503' });
    h.service.start();
    h.service.windowShown();
    await lastInstallEvent(h, 'failed');

    expect(h.service.state().setup.active).toBe(true);
    expect(h.setupFinished()).toBe(0);
    expect(h.service.install()).toEqual({ ok: true, data: { installId: 'install-2' } });
  });

  /** Criterion 18. */
  it('skips setup only while it is active', async () => {
    const h = harness({ archive: 'http-503' });
    h.service.start();
    h.service.windowShown();
    await lastInstallEvent(h, 'failed');

    expect(h.service.skipSetup()).toEqual({ ok: true, data: {} });
    expect(h.setupFinished()).toBe(1);
    expect(h.service.state().setup).toEqual({ active: false, reason: null });
    expect(h.service.skipSetup()).toEqual({
      ok: false,
      error: { code: 'doctor/setup-not-active', message: expect.any(String) },
    });
  });

  it('does not run the setup install when setup is inactive', async () => {
    const h = harness({ managed: PINNED });
    h.service.start();
    h.service.windowShown();
    await report(h);

    expect(h.downloads).toEqual([]);
  });

  /** An install from the sheet completes in place — the workspace never
   * leaves for the setup window (criterion 31's main-side half). */
  it('never presents anything for an install started outside setup', async () => {
    const h = harness({ managed: '2.8.0', override: '' });
    h.service.start();
    h.service.skipSetup();
    h.service.install();
    await lastInstallEvent(h, 'done');
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(h.setupFinished()).toBe(1);
  });
});

/* ── Dispose ────────────────────────────────────────────────────────────── */

describe('dispose', () => {
  /** Criterion 20 — nothing in flight survives, and nothing half-made
   * resolves as installed. */
  it('aborts the download, removes the job dir and leaves no managed copy', async () => {
    const h = harness({ archive: 'hang' });
    h.service.start();
    h.service.install();
    await vi.waitFor(() => {
      expect(h.downloads).toHaveLength(1);
    });

    await h.service.dispose();

    expect(existsSync(h.installDir)).toBe(false);
    expect(existsSync(h.managedDir)).toBe(false);
    expect(h.installEvents.some((event) => event.kind === 'done')).toBe(false);
  });

  it('aborts a check in flight and pushes nothing after', async () => {
    const h = harness({ managed: PINNED, answers: { 'gh auth status --active': 'hang' } });
    h.service.start();
    h.service.windowShown();

    await h.service.dispose();
    const pushes = h.changed.length;
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(h.changed).toHaveLength(pushes);
    expect(h.changed.at(-1)?.report).toBeNull();
  });
});

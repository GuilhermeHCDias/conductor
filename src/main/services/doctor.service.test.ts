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
  readlinkSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { DoctorInstallEvent, DoctorLoginEvent, DoctorState, Result } from '@shared/ipc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExitReason, RunOptions, RunResult, StreamingProcess } from '../process/run';
import { DoctorService, type DoctorServiceDeps } from './doctor.service';
import { DownloadError, type DownloadOptions } from './download';
import { managedLauncher } from './tool-layout';

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
  /** Replaces the adb ladder outright — for a resolver that throws. */
  resolveAdb?: () => string | null;
  gh?: string | null;
  claude?: string | null;
  javaHome?: string;
  hidden?: readonly string[];
  answers?: Partial<Record<string, Answer>>;
  /** How the archive unzips: the real nested `maestro/` dir, a flat root,
   * an archive with no launcher, or an unzip that fails outright. */
  layout?: 'nested' | 'flat' | 'missing' | 'fails' | 'locked';
  /** What the downloads do. */
  archive?: 'ok' | 'http-503' | 'hang' | 'corrupt';
  checkTimeoutMs?: number;
  verifyTimeoutMs?: number;
  brewSilenceMs?: number;
  /** Where `brew` is on the fake machine; `null` (the default) is a Mac
   * without Homebrew — every install downloads. */
  brew?: string | null;
  arch?: string;
  shell?: string;
  /** `userData/doctor-skips.json` before the service starts. */
  skips?: Record<string, unknown>;
  /** The fake JDK under the fake `/Library/Java/JavaVirtualMachines`; false
   * plants none, so the file probe finds no Java. */
  jvm?: boolean;
  /** What the fake `brew` child does: exit 0 after its closing line, exit 1
   * with an `Error:` line, or stay silent until killed. */
  brewOutcome?: 'ok' | 'fails' | 'silent';
  /** `CONFIG.GH_PATH` / `CONFIG.ADB_PATH` — a configured tool (criterion 42). */
  ghOverride?: string;
  adbOverride?: string;
};

const GH_PINNED = '2.100.0';
const PLATFORM_TOOLS_PINNED = '37.0.1';
const ZULU_PINNED = '21.52.203';
const ZULU_JAVA = '21.0.12.1';
const LOGIN_ARGV = [
  'auth',
  'login',
  '--hostname',
  'github.com',
  '--git-protocol',
  'https',
  '--web',
  '--skip-ssh-key',
];

/** A `StreamingProcess` driven from the test's side — the fake `brew` and
 * the fake `gh auth login`. */
class FakeChild implements StreamingProcess {
  killed = 0;
  ended = 0;
  readonly written: string[] = [];
  private stdoutListener: ((chunk: string) => void) | null = null;
  private stderrListener: ((chunk: string) => void) | null = null;
  private exitListeners: Array<(reason: ExitReason) => void> = [];

  write(chunk: string): void {
    this.written.push(chunk);
  }
  endStdin(): void {
    this.ended += 1;
  }
  onStdout(listener: (chunk: string) => void): void {
    this.stdoutListener = listener;
  }
  onStderr(listener: (chunk: string) => void): void {
    this.stderrListener = listener;
  }
  onExit(listener: (reason: ExitReason) => void): void {
    this.exitListeners.push(listener);
  }
  kill(): void {
    this.killed += 1;
    this.exit({ code: null, error: null });
  }
  stdout(chunk: string): void {
    this.stdoutListener?.(chunk);
  }
  stderr(chunk: string): void {
    this.stderrListener?.(chunk);
  }
  exit(reason: ExitReason): void {
    const listeners = this.exitListeners;
    this.exitListeners = [];
    for (const listener of listeners) {
      listener(reason);
    }
  }
}

type Spawned = {
  command: string;
  args: readonly string[];
  env?: NodeJS.ProcessEnv;
  child: FakeChild;
};

function harness(options: HarnessOptions = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'conductor-doctor-'));
  scratch.push(dir);
  const managedDir = join(dir, 'maestro');
  const installDir = join(dir, 'maestro-install');
  const toolsInstallDir = join(dir, 'tools-install');
  const skipsFile = join(dir, 'doctor-skips.json');
  const home = join(dir, 'home');
  mkdirSync(home, { recursive: true });
  const jvmRoot = join(dir, 'jvms');
  if (options.jvm !== false) {
    const bin = join(jvmRoot, 'zulu-21.jdk', 'Contents', 'Home', 'bin');
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, 'java'), '#!/bin/sh\n');
    chmodSync(join(bin, 'java'), 0o755);
  }
  if (options.skips !== undefined) {
    writeFileSync(skipsFile, JSON.stringify(options.skips));
  }
  if (options.managed !== undefined) {
    plantManaged(managedDir, options.managed);
  }
  const spawned: Spawned[] = [];
  const opened: string[] = [];
  const loginEvents: DoctorLoginEvent[] = [];
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
    if (name === 'tar') {
      const archive = args[1];
      const target = args[3];
      if (args[0] !== '-xzf' || archive === undefined || args[2] !== '-C' || target === undefined) {
        throw new Error(`Unexpected tar argv: ${JSON.stringify(args)}`);
      }
      if (options.layout === 'fails') {
        return Promise.resolve({ stdout: '', stderr: 'tar: Error opening archive\n', code: 1 });
      }
      plantToolArchive(target, basename(archive), options.layout ?? 'nested');
      return Promise.resolve({ stdout: '', stderr: '', code: 0 });
    }
    if (name === 'unzip') {
      const target = args[3];
      const archive = args[1];
      if (args[0] !== '-qo' || target === undefined || archive === undefined) {
        throw new Error(`Unexpected unzip argv: ${JSON.stringify(args)}`);
      }
      if (basename(archive) !== 'maestro.zip') {
        if (options.layout === 'fails') {
          return Promise.resolve({
            stdout: '',
            stderr: 'unzip: cannot find zipfile directory\n',
            code: 9,
          });
        }
        plantToolArchive(target, basename(archive), options.layout ?? 'nested');
        return Promise.resolve({ stdout: '', stderr: '', code: 0 });
      }
      if (options.layout === 'fails') {
        return Promise.resolve({
          stdout: '',
          stderr: 'unzip: cannot find zipfile directory\n',
          code: 9,
        });
      }
      if (options.layout === 'locked') {
        // Extracted fine, but the tree cannot be moved out of its dir.
        plantArchive(target, 'nested');
        chmodSync(target, 0o555);
        return Promise.resolve({ stdout: '', stderr: '', code: 0 });
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
    if (
      (command === managedLauncher(home, 'java') ||
        command === join(home, '.conductor', 'tools', 'java', 'bin', 'java')) &&
      args[0] === '-version'
    ) {
      return respond('managed java -version', runOptions?.signal);
    }
    return respond(`${name} ${args.join(' ')}`, runOptions?.signal);
  };

  const spawn = (
    command: string,
    args: readonly string[],
    spawnOptions?: { env?: NodeJS.ProcessEnv },
  ) => {
    const child = new FakeChild();
    spawned.push({ command, args, env: spawnOptions?.env, child });
    if (basename(command) === 'brew') {
      const outcome = options.brewOutcome ?? 'ok';
      queueMicrotask(() => {
        if (outcome === 'ok') {
          child.stdout(
            args.includes('--cask')
              ? '🍺  android-platform-tools was successfully installed!\n'
              : '🍺  /opt/homebrew/Cellar/gh/2.100.0: 220 files, 45MB\n',
          );
          child.exit({ code: 0, error: null });
        } else if (outcome === 'fails') {
          child.stderr('Error: No available formula with the name "gh".\nDid you mean ghc?\n');
          child.exit({ code: 1, error: null });
        }
      });
    }
    return child;
  };

  const download = async (url: string, dest: string, downloadOptions: DownloadOptions) => {
    downloads.push(url);
    if (url.endsWith('checksums_sha256.txt')) {
      const digest = options.archive === 'corrupt' ? 'f'.repeat(64) : ARCHIVE_SHA;
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, `${digest}  maestro.zip\n`);
      return;
    }
    if (url.endsWith('_checksums.txt')) {
      const digest = options.archive === 'corrupt' ? 'f'.repeat(64) : ARCHIVE_SHA;
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(
        dest,
        `${digest}  gh_${GH_PINNED}_macOS_arm64.zip\n${'a'.repeat(64)}  gh_${GH_PINNED}_linux_amd64.tar.gz\n`,
      );
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

  const env: NodeJS.ProcessEnv = { PATH: '/usr/bin', HOME: home };
  if (options.javaHome !== undefined) {
    env.JAVA_HOME = options.javaHome;
  }
  if (options.shell !== undefined) {
    env.SHELL = options.shell;
  }
  const hidden = new Set(options.hidden ?? []);
  const isExecutable = (path: string) => executables.has(path) || isExecutableFile(path);
  /** The fake ladders: the person's own tool first (the harness option),
   * else the copy Conductor downloaded — as the real ladders read it. */
  const ladder = (own: string | null, tool: 'gh' | 'adb') => {
    if (hidden.has(tool)) {
      return null;
    }
    if (own !== null) {
      return own;
    }
    const managed = managedLauncher(home, tool);
    return isExecutable(managed) ? managed : null;
  };
  const deps: DoctorServiceDeps = {
    managedDir,
    installDir,
    toolsInstallDir,
    skipsFile,
    pinnedVersion: options.pinned ?? PINNED,
    releaseUrl: 'https://github.com/mobile-dev-inc/maestro/releases/download',
    pins: {
      ghVersion: GH_PINNED,
      ghReleaseUrl: 'https://github.com/cli/cli/releases/download',
      platformToolsVersion: PLATFORM_TOOLS_PINNED,
      platformToolsSha256: options.archive === 'corrupt' ? 'f'.repeat(64) : ARCHIVE_SHA,
      platformToolsReleaseUrl: 'https://dl.google.com/android/repository',
      zuluVersion: ZULU_PINNED,
      zuluJavaVersion: ZULU_JAVA,
      zuluSha256: options.archive === 'corrupt' ? 'f'.repeat(64) : ARCHIVE_SHA,
      zuluReleaseUrl: 'https://cdn.azul.com/zulu/bin',
    },
    arch: options.arch ?? 'arm64',
    maestroOverride: options.override ?? '',
    ghOverride: options.ghOverride ?? '',
    adbOverride: options.adbOverride ?? '',
    env,
    home,
    jvmRoots: [jvmRoot],
    isExecutable,
    isFile: (path) => existsSync(path),
    resolveAdb:
      options.resolveAdb ??
      (() => ladder(options.adb === null ? null : (options.adb ?? ADB), 'adb')),
    resolveGh: () => ladder(gh, 'gh'),
    resolveClaude: () => (options.claude === null ? null : (options.claude ?? CLAUDE)),
    homebrew: () => options.brew ?? null,
    hidden,
    run,
    spawn,
    download,
    openExternal: (url) => {
      opened.push(url);
      return Promise.resolve();
    },
    emitLoginEvent: (payload: Result<DoctorLoginEvent>) => {
      if (payload.ok) {
        loginEvents.push(payload.data);
      }
    },
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
      brewSilence: options.brewSilenceMs ?? 60_000,
    },
  };
  const service = new DoctorService(deps);
  services.push(service);
  return {
    service,
    deps,
    dir,
    home,
    managedDir,
    installDir,
    toolsInstallDir,
    skipsFile,
    calls,
    changed,
    installEvents,
    loginEvents,
    spawned,
    opened,
    downloads,
    setupFinished: () => setupFinished,
    advance: (ms: number) => {
      now += ms;
    },
    setGh: (path: string | null) => {
      gh = path;
    },
    setAnswer: (key: string, answer: Answer) => {
      answers[key] = answer;
    },
  };
}

/** A managed JDK already on disk — the file probe's first rung. */
function plantManagedJava(home: string): void {
  const bin = join(home, '.conductor', 'tools', 'java', 'bin');
  mkdirSync(bin, { recursive: true });
  writeFileSync(join(bin, 'java'), '#!/bin/sh\n');
  chmodSync(join(bin, 'java'), 0o755);
}

/** The plan, once the setup window has built it from the first report. */
async function planOf(h: ReturnType<typeof harness>) {
  await vi.waitFor(
    () => {
      expect(h.changed.at(-1)?.setup.plan).not.toBeNull();
    },
    { timeout: 3_000 },
  );
  const plan = h.changed.at(-1)?.setup.plan;
  if (plan == null) {
    throw new Error('No plan landed.');
  }
  return plan;
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

/** How each archive unzips, per the appendix — the launcher without its
 * execute bit, as shipped. `flat` puts the launcher at the extracted root
 * instead of under the archive's own directory. */
function plantToolArchive(
  target: string,
  archive: string,
  layout: 'nested' | 'flat' | 'missing' | 'fails' | 'locked',
): void {
  const plant = (nested: string, launcher: string) => {
    const root = layout === 'nested' ? join(target, nested) : target;
    mkdirSync(join(root, 'share'), { recursive: true });
    if (layout !== 'missing') {
      mkdirSync(dirname(join(root, launcher)), { recursive: true });
      writeFileSync(join(root, launcher), '#!/bin/sh\n');
      chmodSync(join(root, launcher), 0o644);
    }
  };
  if (archive.startsWith('gh_')) {
    plant(`gh_${GH_PINNED}_macOS_arm64`, join('bin', 'gh'));
  } else if (archive.startsWith('platform-tools_')) {
    plant('platform-tools', 'adb');
  } else if (archive.startsWith('zulu')) {
    plant(
      `zulu${ZULU_PINNED}-ca-jdk${ZULU_JAVA}-macosx_aarch64`,
      join('zulu-21.jdk', 'Contents', 'Home', 'bin', 'java'),
    );
  } else {
    throw new Error(`No fake layout for ${archive}`);
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

/** The last event of `kind`, once one has landed — a `done` or `failed`
 * is followed by the run's `settled`, so the tail is not the test's event. */
async function lastInstallEvent<K extends DoctorInstallEvent['kind']>(
  h: ReturnType<typeof harness>,
  kind: K,
): Promise<Extract<DoctorInstallEvent, { kind: K }>> {
  await vi.waitFor(
    () => {
      expect(h.installEvents.some((event) => event.kind === kind)).toBe(true);
    },
    { timeout: 3_000 },
  );
  const event = h.installEvents.filter((event) => event.kind === kind).at(-1);
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
        setup: { active: false, reason: null, plan: null },
        install: null,
        login: null,
        overridden: [],
        version: PINNED,
      },
    });
  });

  it('says so when CONFIG.MAESTRO_PATH is set', () => {
    const h = harness({ override: '/custom/maestro' });
    h.service.start();

    expect(h.service.state().overridden).toEqual(['maestro']);
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

/** A check that throws — a resolver with a bug — is a logged failure that
 * leaves the doctor able to check again, never an unhandled rejection in
 * main. */
describe('a check that throws', () => {
  it('settles, logs, and lets the next check run', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const h = harness({
        resolveAdb: () => {
          throw new Error('the adb ladder broke');
        },
      });
      h.service.start();
      h.service.windowShown();
      await vi.waitFor(() => {
        expect(error).toHaveBeenCalledWith(
          expect.stringContaining('check'),
          'the adb ladder broke',
        );
      });

      expect(h.service.state().checking).toBe(false);
      expect(h.changed.at(-1)?.checking).toBe(false);
      expect(h.service.check()).toEqual({ ok: true, data: { started: true } });
    } finally {
      error.mockRestore();
    }
  });
});

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

    expect(h.service.state().setup).toEqual({ active: true, reason: 'first-run', plan: null });
  });

  it('is an update when the marker is behind the pin', () => {
    const h = harness({ managed: '2.8.0' });
    h.service.start();

    expect(h.service.state().setup).toEqual({ active: true, reason: 'update', plan: null });
  });

  it('is inactive when the managed copy matches the pin', () => {
    const h = harness({ managed: PINNED });
    h.service.start();

    expect(h.service.state().setup).toEqual({ active: false, reason: null, plan: null });
  });

  it('is inactive when CONFIG.MAESTRO_PATH is set, whatever is managed', () => {
    const h = harness({ override: '/custom/maestro' });
    h.service.start();

    expect(h.service.state().setup).toEqual({ active: false, reason: null, plan: null });
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

    expect(h.service.install({ tools: ['maestro'], androidTermsAccepted: true })).toEqual({
      ok: false,
      error: { code: 'doctor/maestro-overridden', message: expect.any(String) },
    });
    expect(h.downloads).toEqual([]);
  });

  /** Criteria 12, 15 — the pipeline, step by step, and what it leaves. */
  it('downloads, checks, extracts, verifies and lands the copy under userData', async () => {
    // A first run: nothing managed yet, everything else on the Mac (criterion 7
    // never reinstalls a copy already at the pin).
    const h = harness();
    h.service.start();
    h.service.windowShown();
    await report(h);
    h.calls.length = 0;
    h.changed.length = 0;

    const started = h.service.install({ androidTermsAccepted: true });
    expect(started).toEqual({ ok: true, data: { installId: 'install-1' } });
    const done = await lastInstallEvent(h, 'done');
    expect(done).toEqual({
      kind: 'done',
      installId: 'install-1',
      tool: 'maestro',
      version: PINNED,
    });

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
      tool: 'maestro',
      pct: 0,
      step: 'Downloading maestro 2.10.0',
    });
    await vi.waitFor(() => {
      expect(h.changed.at(-1)?.install).toEqual({ installId: 'install-1', failed: {} });
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
    h.service.install({ androidTermsAccepted: true });
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
    h.service.install({ androidTermsAccepted: true });
    await lastInstallEvent(h, 'done');

    expect(isExecutableFile(join(h.managedDir, 'bin', 'maestro'))).toBe(true);
  });

  it('replaces a previous managed copy whole', async () => {
    const h = harness({ managed: '2.8.0' });
    writeFileSync(join(h.managedDir, 'lib', 'old.jar'), 'old');
    h.service.start();
    h.service.install({ androidTermsAccepted: true });
    await lastInstallEvent(h, 'done');

    expect(existsSync(join(h.managedDir, 'lib', 'old.jar'))).toBe(false);
    expect(readFileSync(join(h.managedDir, 'version'), 'utf8')).toBe(PINNED);
  });

  /** The swap moves the previous copy aside before the new one lands, so a
   * swap that cannot happen leaves the copy that was working — never a
   * gutted `userData/maestro` behind an `extract-failed`. */
  it('keeps the previous managed copy when the swap fails', async () => {
    const h = harness({ managed: '2.8.0', layout: 'locked' });
    const extractDir = join(h.installDir, 'install-1', 'extract');
    try {
      h.service.start();
      h.service.install({ androidTermsAccepted: true });
      const failed = await lastInstallEvent(h, 'failed');

      expect(failed.code).toBe('doctor/extract-failed');
      expect(readFileSync(join(h.managedDir, 'version'), 'utf8')).toBe('2.8.0\n');
      expect(isExecutableFile(join(h.managedDir, 'bin', 'maestro'))).toBe(true);
      expect(existsSync(`${h.managedDir}.old`)).toBe(false);
    } finally {
      if (existsSync(extractDir)) {
        chmodSync(extractDir, 0o755);
      }
    }
  });

  it('refuses a second install while one runs', async () => {
    const h = harness({ archive: 'hang' });
    h.service.start();
    expect(h.service.install({ androidTermsAccepted: true }).ok).toBe(true);

    expect(h.service.install({ androidTermsAccepted: true })).toEqual({
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
    h.service.install({ androidTermsAccepted: true });
    await lastInstallEvent(h, 'done');

    expect(h.calls.some((call) => basename(call.command) === 'maestro')).toBe(false);
    expect(readFileSync(join(h.managedDir, 'version'), 'utf8')).toBe(PINNED);
  });

  /* Criterion 17 — one sentence per code, the raw cause in detail. */

  it('fails the download with the product sentence and the HTTP status', async () => {
    const h = harness({ archive: 'http-503' });
    h.service.start();
    h.service.install({ androidTermsAccepted: true });
    const failed = await lastInstallEvent(h, 'failed');

    expect(failed).toEqual({
      kind: 'failed',
      installId: 'install-1',
      tool: 'maestro',
      code: 'doctor/download-failed',
      message:
        "Conductor couldn't reach GitHub to download Maestro. Check your connection and try again.",
      detail: 'HTTP 503',
    });
    await lastInstallEvent(h, 'settled');
    expect(h.service.state().install).toEqual({
      installId: 'install-1',
      failed: {
        maestro: { code: 'doctor/download-failed', message: failed.message, detail: 'HTTP 503' },
      },
    });
    expect(existsSync(h.managedDir)).toBe(false);
    expect(existsSync(h.installDir)).toBe(false);
  });

  it('carries the last install failure onto the maestro row', async () => {
    const h = harness({ archive: 'http-503' });
    h.service.start();
    h.service.install({ androidTermsAccepted: true });
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
    h.service.install({ androidTermsAccepted: true });
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
    h.service.install({ androidTermsAccepted: true });

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
    h.service.install({ androidTermsAccepted: true });

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
    h.service.install({ androidTermsAccepted: true });

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
    h.service.install({ androidTermsAccepted: true });

    expect(await lastInstallEvent(h, 'failed')).toMatchObject({
      code: 'doctor/verify-failed',
      detail: 'maestro --version → no answer after 0 s',
    });
  });
});

/* ── The setup window's flow ────────────────────────────────────────────── */

describe('the setup flow', () => {
  /** Criteria 14, 16, managed-tools 38 — a Maestro pin change alone needs no
   * click; the app presents itself after. */
  it('starts the install by itself for a pin change, then finishes setup after the hold', async () => {
    const h = harness({ managed: '2.9.0' });
    h.service.start();
    expect(h.service.state().setup.active).toBe(true);

    h.service.windowShown();
    await lastInstallEvent(h, 'done');
    expect(h.setupFinished()).toBe(0);

    await vi.waitFor(() => {
      expect(h.setupFinished()).toBe(1);
    });
    expect(h.service.state().setup).toEqual({ active: false, reason: null, plan: null });
    expect(h.changed.at(-1)?.setup.active).toBe(false);
  });

  it('keeps setup active on failure, so Try again is the same install', async () => {
    const h = harness({ archive: 'http-503', managed: '2.9.0' });
    h.service.start();
    h.service.windowShown();
    await lastInstallEvent(h, 'failed');

    expect(h.service.state().setup.active).toBe(true);
    expect(h.setupFinished()).toBe(0);
    expect(h.service.install({ androidTermsAccepted: true })).toEqual({
      ok: true,
      data: { installId: 'install-2' },
    });
  });

  /** Criterion 18. */
  it('skips setup only while it is active', async () => {
    const h = harness({ archive: 'http-503', managed: '2.9.0' });
    h.service.start();
    h.service.windowShown();
    await lastInstallEvent(h, 'failed');

    expect(h.service.skipSetup()).toEqual({ ok: true, data: {} });
    expect(h.setupFinished()).toBe(1);
    expect(h.service.state().setup).toEqual({ active: false, reason: null, plan: null });
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
    h.service.install({ androidTermsAccepted: true });
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
    h.service.install({ androidTermsAccepted: true });
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

/* ── Managed tools: the setup decision ─────────────────────────────────── */

/** Managed-tools criteria 2, 8 — files alone, four tools, skips remembered. */
describe('the setup decision over four tools', () => {
  it('is a first run when gh has no executable on its ladder, whatever Maestro says', () => {
    const h = harness({ managed: PINNED, gh: null });
    h.service.start();

    expect(h.service.state().setup).toEqual({ active: true, reason: 'first-run', plan: null });
  });

  it('is a first run when adb is missing, and when no Java is on disk', () => {
    const adb = harness({ managed: PINNED, adb: null });
    adb.service.start();
    expect(adb.service.state().setup.active).toBe(true);

    const java = harness({ managed: PINNED, jvm: false });
    java.service.start();
    expect(java.service.state().setup.active).toBe(true);
  });

  it('finds Java through JAVA_HOME or the managed JDK without running anything', () => {
    const viaHome = harness({
      managed: PINNED,
      jvm: false,
      javaHome: JAVA_HOME,
      executables: [JAVA],
    });
    viaHome.service.start();
    expect(viaHome.service.state().setup.active).toBe(false);

    const managed = harness({ managed: PINNED, jvm: false });
    plantManagedJava(managed.home);
    managed.service.start();
    expect(managed.service.state().setup.active).toBe(false);
    expect(managed.calls).toEqual([]);
  });

  it('never opens for a sign-in alone', () => {
    const h = harness({
      managed: PINNED,
      answers: {
        'gh auth status --active': {
          stdout: '',
          stderr: 'You are not logged into any GitHub hosts.\n',
          code: 1,
        },
      },
    });
    h.service.start();

    expect(h.service.state().setup.active).toBe(false);
  });

  it('stays closed for a tool skipped under the current pin, and opens again when the pin moved', () => {
    const skipped = harness({
      managed: PINNED,
      adb: null,
      skips: { adb: '2026-09-04T10:00:00.000Z', pins: { adb: PLATFORM_TOOLS_PINNED } },
    });
    skipped.service.start();
    expect(skipped.service.state().setup.active).toBe(false);

    const moved = harness({
      managed: PINNED,
      adb: null,
      skips: { adb: '2026-09-04T10:00:00.000Z', pins: { adb: '36.0.0' } },
    });
    moved.service.start();
    expect(moved.service.state().setup.active).toBe(true);
  });

  it('still opens for a Maestro pin change beside a skipped tool', () => {
    const h = harness({
      managed: '2.9.0',
      adb: null,
      skips: { adb: '2026-09-04T10:00:00.000Z', pins: { adb: PLATFORM_TOOLS_PINNED } },
    });
    h.service.start();

    expect(h.service.state().setup).toEqual({ active: true, reason: 'update', plan: null });
  });
});

/* ── Managed tools: the plan ───────────────────────────────────────────── */

/** Criteria 3–7, 36, 38 — built from the first report, pushed in the state. */
describe('the plan', () => {
  it('lists the four tools in order, with the doctor detail for what is there and the method for the rest', async () => {
    const h = harness({ gh: null, brew: '/opt/homebrew/bin/brew', shell: '/bin/zsh' });
    h.service.start();
    h.service.windowShown();
    const plan = await planOf(h);

    expect(plan).toEqual({
      tools: [
        {
          id: 'java',
          state: 'present',
          method: null,
          detail: `openjdk version "21.0.4" 2024-07-16 LTS · ${JAVA}`,
        },
        { id: 'maestro', state: 'install', method: 'direct', detail: 'Will download' },
        { id: 'gh', state: 'install', method: 'homebrew', detail: 'Will install with Homebrew' },
        {
          id: 'adb',
          state: 'present',
          method: null,
          detail: `Android Debug Bridge version 1.0.41 · ${ADB}`,
        },
      ],
      homebrew: '/opt/homebrew/bin/brew',
      androidTermsRequired: false,
      profile: '~/.zprofile',
    });
    expect(h.downloads).toEqual([]);
  });

  it('downloads everything without Homebrew, and asks for the Android terms only when adb installs', async () => {
    const h = harness({ gh: null, adb: null, shell: '/bin/bash' });
    h.service.start();
    h.service.windowShown();
    const plan = await planOf(h);

    expect(plan.tools.map((tool) => [tool.id, tool.state, tool.method])).toEqual([
      ['java', 'present', null],
      ['maestro', 'install', 'direct'],
      ['gh', 'install', 'direct'],
      ['adb', 'install', 'direct'],
    ]);
    expect(plan.homebrew).toBeNull();
    expect(plan.androidTermsRequired).toBe(true);
    expect(plan.profile).toBe('~/.bash_profile');
  });

  it('names no profile for a shell it does not write', async () => {
    const h = harness({ gh: null, shell: '/opt/homebrew/bin/fish' });
    h.service.start();
    h.service.windowShown();

    expect((await planOf(h)).profile).toBeNull();
  });

  it('makes every direct download unavailable on an Intel Mac, Maestro aside', async () => {
    const h = harness({
      gh: null,
      adb: null,
      jvm: false,
      arch: 'x64',
      answers: { java_home: { stdout: '', stderr: 'Unable to locate a Java Runtime.\n', code: 1 } },
    });
    h.service.start();
    h.service.windowShown();
    const plan = await planOf(h);

    expect(plan.tools.map((tool) => [tool.id, tool.state, tool.method, tool.detail])).toEqual([
      ['java', 'unavailable', null, 'Not available on Intel Macs'],
      ['maestro', 'install', 'direct', 'Will download'],
      ['gh', 'unavailable', null, 'Not available on Intel Macs'],
      ['adb', 'unavailable', null, 'Not available on Intel Macs'],
    ]);
    expect(plan.androidTermsRequired).toBe(false);
  });

  it('keeps Homebrew for gh and adb on an Intel Mac that has it', async () => {
    const h = harness({ gh: null, arch: 'x64', brew: '/usr/local/bin/brew' });
    h.service.start();
    h.service.windowShown();
    const plan = await planOf(h);

    expect(plan.tools.find((tool) => tool.id === 'gh')).toEqual({
      id: 'gh',
      state: 'install',
      method: 'homebrew',
      detail: 'Will install with Homebrew',
    });
  });

  it('counts a Java below 17 as missing, and a present tool as never reinstalled', async () => {
    const h = harness({
      gh: null,
      answers: {
        'java -version': { stdout: '', stderr: 'java version "1.8.0_392"\n', code: 0 },
        'gh --version': { stdout: 'gh version 2.50.0 (2025-01-01)\n', stderr: '', code: 0 },
      },
    });
    h.service.start();
    h.service.windowShown();
    const plan = await planOf(h);

    expect(plan.tools.find((tool) => tool.id === 'java')?.state).toBe('install');
    expect(plan.tools.find((tool) => tool.id === 'adb')?.state).toBe('present');
  });

  it('treats a configured Maestro as present, whatever the managed copy', async () => {
    const h = harness({ gh: null, override: '/custom/maestro', executables: ['/custom/maestro'] });
    h.service.start();
    h.service.windowShown();
    const plan = await planOf(h);

    expect(plan.tools.find((tool) => tool.id === 'maestro')).toEqual({
      id: 'maestro',
      state: 'present',
      method: null,
      detail: '/custom/maestro',
    });
  });

  it('waits for the click on a first run, and installs by itself for a pin change alone', async () => {
    const first = harness({ gh: null });
    first.service.start();
    first.service.windowShown();
    await planOf(first);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(first.installEvents).toEqual([]);

    const update = harness({ managed: '2.9.0' });
    update.service.start();
    update.service.windowShown();
    await lastInstallEvent(update, 'settled');
    expect(update.installEvents.some((event) => event.kind === 'done')).toBe(true);
  });
});

/* ── Managed tools: the install pipeline ───────────────────────────────── */

/** Criteria 9–19, 21, 26 — one tool at a time, in order, past failures. */
describe('installing the four tools', () => {
  it('downloads the JDK, Maestro, gh and adb in order, links them under ~/.conductor and writes the profile block', async () => {
    const h = harness({
      gh: null,
      adb: null,
      jvm: false,
      shell: '/bin/zsh',
      answers: {
        java_home: { stdout: '', stderr: 'Unable to locate a Java Runtime.\n', code: 1 },
        'managed java -version': {
          stdout: '',
          stderr: `openjdk version "${ZULU_JAVA}" 2026-07-21 LTS\n`,
          code: 0,
        },
        'gh --version': { stdout: `gh version ${GH_PINNED} (2026-09-03)\n`, stderr: '', code: 0 },
        'adb --version': {
          stdout: `Android Debug Bridge version 1.0.41\nVersion ${PLATFORM_TOOLS_PINNED}-13800542\n`,
          stderr: '',
          code: 0,
        },
      },
    });
    writeFileSync(join(h.home, '.zprofile'), 'eval "$(/opt/homebrew/bin/brew shellenv)"\n');
    h.service.start();
    h.service.windowShown();
    await planOf(h);

    expect(h.service.install({ androidTermsAccepted: true })).toEqual({
      ok: true,
      data: { installId: 'install-1' },
    });
    const settled = await lastInstallEvent(h, 'settled');
    expect(settled).toEqual({ kind: 'settled', installId: 'install-1', failed: [] });

    expect(h.installEvents.filter((event) => event.kind === 'done')).toEqual([
      { kind: 'done', installId: 'install-1', tool: 'java', version: ZULU_PINNED },
      { kind: 'done', installId: 'install-1', tool: 'maestro', version: PINNED },
      { kind: 'done', installId: 'install-1', tool: 'gh', version: GH_PINNED },
      { kind: 'done', installId: 'install-1', tool: 'adb', version: PLATFORM_TOOLS_PINNED },
    ]);
    expect(h.downloads).toEqual([
      `https://cdn.azul.com/zulu/bin/zulu${ZULU_PINNED}-ca-jdk${ZULU_JAVA}-macosx_aarch64.tar.gz`,
      'https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.10.0/maestro.zip',
      'https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.10.0/checksums_sha256.txt',
      `https://github.com/cli/cli/releases/download/v${GH_PINNED}/gh_${GH_PINNED}_macOS_arm64.zip`,
      `https://github.com/cli/cli/releases/download/v${GH_PINNED}/gh_${GH_PINNED}_checksums.txt`,
      `https://dl.google.com/android/repository/platform-tools_r${PLATFORM_TOOLS_PINNED}-darwin.zip`,
    ]);

    // The trees, the marker, the launcher's execute bit, the links.
    const tools = join(h.home, '.conductor', 'tools');
    const bin = join(h.home, '.conductor', 'bin');
    expect(readFileSync(join(tools, `java-${ZULU_PINNED}`, 'version'), 'utf8')).toBe(ZULU_PINNED);
    expect(readFileSync(join(tools, `gh-${GH_PINNED}`, 'version'), 'utf8')).toBe(GH_PINNED);
    expect(readFileSync(join(tools, `adb-${PLATFORM_TOOLS_PINNED}`, 'version'), 'utf8')).toBe(
      PLATFORM_TOOLS_PINNED,
    );
    expect(readlinkSync(join(bin, 'gh'))).toBe(join(tools, `gh-${GH_PINNED}`, 'bin', 'gh'));
    expect(readlinkSync(join(bin, 'adb'))).toBe(join(tools, `adb-${PLATFORM_TOOLS_PINNED}`, 'adb'));
    expect(readlinkSync(join(bin, 'java'))).toBe(
      join(tools, `java-${ZULU_PINNED}`, 'zulu-21.jdk', 'Contents', 'Home', 'bin', 'java'),
    );
    expect(readlinkSync(join(tools, 'java'))).toBe(
      join(tools, `java-${ZULU_PINNED}`, 'zulu-21.jdk', 'Contents', 'Home'),
    );
    expect(isExecutableFile(join(bin, 'adb'))).toBe(true);
    expect(existsSync(h.toolsInstallDir)).toBe(false);

    // Verified by running each launcher through its link (criterion 11).
    expect(h.calls.map((call) => [call.command, call.args.join(' ')])).toEqual(
      expect.arrayContaining([
        [join(bin, 'java'), '-version'],
        [join(bin, 'gh'), '--version'],
        [join(bin, 'adb'), '--version'],
      ]),
    );
    // Maestro's verify ran against the managed JDK (criterion 22).
    const verify = h.calls.find((call) => call.command === join(h.managedDir, 'bin', 'maestro'));
    expect(verify?.env?.JAVA_HOME).toBe(join(tools, 'java'));

    // The profile block, once, after what was there (criterion 19).
    expect(readFileSync(join(h.home, '.zprofile'), 'utf8')).toBe(
      'eval "$(/opt/homebrew/bin/brew shellenv)"\n\n# >>> Conductor >>>\nexport PATH="$HOME/.conductor/bin:$PATH"\n# <<< Conductor <<<\n',
    );
    expect(existsSync(join(h.home, '.bash_profile'))).toBe(false);

    // The plan followed each tool, and the rows were rechecked in between (criterion 16).
    const plan = h.changed.at(-1)?.setup.plan;
    expect(plan?.tools.map((tool) => tool.state)).toEqual([
      'present',
      'present',
      'present',
      'present',
    ]);
    expect(plan?.tools.find((tool) => tool.id === 'java')?.detail).toBe(
      `java ${ZULU_JAVA} · ~/.conductor/tools/java`,
    );
    // The first event of a direct install lands before the first byte, so
    // the plan screen gives way at once.
    expect(h.installEvents[0]).toEqual({
      kind: 'progress',
      installId: 'install-1',
      tool: 'java',
      pct: 0,
      step: 'Downloading Zulu JDK 21',
    });
    const rows = h.changed.at(-1)?.report?.rows ?? [];
    expect(rows.find((row) => row.id === 'gh')?.detail).toBe(
      `gh version ${GH_PINNED} (2026-09-03) · ${join(bin, 'gh')}`,
    );
    expect(h.service.state().install).toEqual({ installId: 'install-1', failed: {} });
  });

  it('streams progress by tool — bytes for a download, no percentage for Homebrew', async () => {
    const h = harness({
      gh: null,
      brew: '/opt/homebrew/bin/brew',
      managed: PINNED,
      answers: {
        'gh --version': { stdout: `gh version ${GH_PINNED} (2026-09-03)\n`, stderr: '', code: 0 },
      },
    });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    // Homebrew lands gh on its own shelf, where the ladder then finds it.
    h.setGh(GH);
    h.service.install({ androidTermsAccepted: true });
    await lastInstallEvent(h, 'settled');

    const brewSpawn = h.spawned.find((entry) => basename(entry.command) === 'brew');
    expect(brewSpawn?.args).toEqual(['install', 'gh']);
    expect(brewSpawn?.env).toMatchObject({
      HOMEBREW_NO_AUTO_UPDATE: '1',
      HOMEBREW_NO_INSTALL_CLEANUP: '1',
      HOMEBREW_NO_ENV_HINTS: '1',
      NONINTERACTIVE: '1',
      PATH: '/opt/homebrew/bin:/usr/bin',
    });
    expect(h.installEvents).toEqual([
      {
        kind: 'progress',
        installId: 'install-1',
        tool: 'gh',
        pct: null,
        step: 'Installing gh with Homebrew',
      },
      { kind: 'done', installId: 'install-1', tool: 'gh', version: expect.any(String) },
      { kind: 'settled', installId: 'install-1', failed: [] },
    ]);
    expect(h.downloads).toEqual([]);
    // Homebrew installs land on the person's machine, not under ~/.conductor: no profile block.
    expect(existsSync(join(h.home, '.zprofile'))).toBe(false);
  });

  it('skips adb without the terms, records the skip and installs the rest', async () => {
    const h = harness({
      gh: null,
      adb: null,
      managed: PINNED,
      answers: {
        'gh --version': { stdout: `gh version ${GH_PINNED} (2026-09-03)\n`, stderr: '', code: 0 },
      },
    });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.service.install({ androidTermsAccepted: false });
    await lastInstallEvent(h, 'settled');

    expect(h.installEvents.map((event) => event.kind)).toEqual([
      'skipped',
      ...Array.from({ length: 8 }, () => 'progress'),
      'done',
      'settled',
    ]);
    expect(h.installEvents[0]).toEqual({
      kind: 'skipped',
      installId: 'install-1',
      tool: 'adb',
      detail: 'Accept the Android SDK terms to install',
    });
    expect(h.changed.at(-1)?.setup.plan?.tools.find((tool) => tool.id === 'adb')).toEqual({
      id: 'adb',
      state: 'skipped',
      method: 'direct',
      detail: 'Accept the Android SDK terms to install',
    });
    expect(JSON.parse(readFileSync(h.skipsFile, 'utf8'))).toEqual({
      adb: expect.any(String),
      pins: { adb: PLATFORM_TOOLS_PINNED },
    });
    expect(h.downloads.some((url) => url.includes('platform-tools'))).toBe(false);
  });

  it('installs only the tools named, and forgets a skip once the tool lands', async () => {
    const h = harness({
      gh: null,
      adb: null,
      managed: PINNED,
      skips: { adb: '2026-09-04T10:00:00.000Z', pins: { adb: PLATFORM_TOOLS_PINNED } },
      answers: {
        'adb --version': {
          stdout: `Android Debug Bridge version 1.0.41\nVersion ${PLATFORM_TOOLS_PINNED}-13800542\n`,
          stderr: '',
          code: 0,
        },
      },
    });
    h.service.start();
    h.service.windowShown();
    await report(h);
    h.service.install({ tools: ['adb'], androidTermsAccepted: true });
    await lastInstallEvent(h, 'settled');

    expect(
      h.installEvents.filter((event) => event.kind === 'done').map((event) => event.tool),
    ).toEqual(['adb']);
    expect(JSON.parse(readFileSync(h.skipsFile, 'utf8'))).toEqual({ pins: {} });
  });

  it('carries on past a failed tool, names it in settled, and keeps setup open with the failures by tool', async () => {
    const h = harness({ gh: null, adb: null, managed: PINNED, archive: 'http-503' });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.service.install({ androidTermsAccepted: true });
    const settled = await lastInstallEvent(h, 'settled');

    expect(settled).toEqual({ kind: 'settled', installId: 'install-1', failed: ['gh', 'adb'] });
    expect(h.service.state().install).toEqual({
      installId: 'install-1',
      failed: {
        gh: {
          code: 'doctor/download-failed',
          message:
            "Conductor couldn't download the GitHub CLI. Check your connection and try again.",
          detail: 'HTTP 503',
        },
        adb: {
          code: 'doctor/download-failed',
          message:
            "Conductor couldn't download Android platform-tools. Check your connection and try again.",
          detail: 'HTTP 503',
        },
      },
    });
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(h.setupFinished()).toBe(0);
    expect(h.service.state().setup.active).toBe(true);
    // The row carries the raw cause while nothing resolves.
    expect(h.changed.at(-1)?.report?.rows.find((row) => row.id === 'gh')?.detail).toBe('HTTP 503');

    // Try again redoes only the failed ones.
    h.installEvents.length = 0;
    h.service.install({ tools: ['gh', 'adb'], androidTermsAccepted: true });
    await lastInstallEvent(h, 'settled');
    expect(
      h.installEvents.filter((event) => event.kind === 'progress').map((event) => event.tool),
    ).not.toContain('maestro');
  });

  it('discards a gh archive that does not match its published checksum, and names Azul for the JDK', async () => {
    const h = harness({
      gh: null,
      jvm: false,
      managed: PINNED,
      archive: 'corrupt',
      answers: {
        java_home: { stdout: '', stderr: 'Unable to locate a Java Runtime.\n', code: 1 },
      },
    });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.service.install({ androidTermsAccepted: true });
    await lastInstallEvent(h, 'settled');

    const state = h.service.state().install;
    const failed = state !== null && 'failed' in state ? state.failed : {};
    expect(failed.gh?.message).toBe(
      "The download didn't match what GitHub published, so it was discarded.",
    );
    expect(failed.java?.message).toBe(
      "The download didn't match what Azul published, so it was discarded.",
    );
    expect(existsSync(join(h.home, '.conductor'))).toBe(false);
  });

  it('fails a launcher that answers with another version, and removes the tree and its links', async () => {
    const h = harness({
      gh: null,
      managed: PINNED,
      answers: {
        'gh --version': { stdout: 'gh version 2.91.0 (2026-04-22)\n', stderr: '', code: 0 },
      },
    });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.service.install({ androidTermsAccepted: true });
    const settled = await lastInstallEvent(h, 'settled');

    expect(settled.failed).toEqual(['gh']);
    const state = h.service.state().install;
    const failed = state !== null && 'failed' in state ? state.failed : {};
    expect(failed.gh).toEqual({
      code: 'doctor/verify-failed',
      message: "The GitHub CLI was installed but didn't answer as expected.",
      detail: 'gh --version → gh version 2.91.0 (2026-04-22)',
    });
    expect(existsSync(join(h.home, '.conductor', 'tools', `gh-${GH_PINNED}`))).toBe(false);
    expect(existsSync(join(h.home, '.conductor', 'bin', 'gh'))).toBe(false);
  });

  it('fails extraction with the tool named, whether tar or the layout is at fault', async () => {
    const h = harness({
      gh: null,
      jvm: false,
      managed: PINNED,
      layout: 'missing',
      answers: {
        java_home: { stdout: '', stderr: 'Unable to locate a Java Runtime.\n', code: 1 },
      },
    });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.service.install({ androidTermsAccepted: true });
    await lastInstallEvent(h, 'settled');

    const state = h.service.state().install;
    const failed = state !== null && 'failed' in state ? state.failed : {};
    expect(failed.java).toEqual({
      code: 'doctor/extract-failed',
      message: "The Zulu JDK couldn't be unpacked on this Mac.",
      detail: 'zulu-21.jdk/Contents/Home/bin/java not found in the archive',
    });
    expect(failed.gh?.detail).toBe('bin/gh not found in the archive');
  });

  it('reports a Homebrew failure with its first stderr line and flips the method to direct', async () => {
    const h = harness({
      gh: null,
      brew: '/opt/homebrew/bin/brew',
      brewOutcome: 'fails',
      managed: PINNED,
    });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.service.install({ androidTermsAccepted: true });
    const settled = await lastInstallEvent(h, 'settled');

    expect(settled.failed).toEqual(['gh']);
    expect(h.installEvents.find((event) => event.kind === 'failed')).toEqual({
      kind: 'failed',
      installId: 'install-1',
      tool: 'gh',
      code: 'doctor/brew-failed',
      message:
        "Homebrew couldn't install the GitHub CLI. You can try again, or Conductor can download it instead.",
      detail: 'Error: No available formula with the name "gh".',
    });
    expect(h.changed.at(-1)?.setup.plan?.tools.find((tool) => tool.id === 'gh')?.method).toBe(
      'direct',
    );
  });

  it('downloads on the next attempt after a Homebrew failure, from the sheet as well', async () => {
    const h = harness({
      gh: null,
      brew: '/opt/homebrew/bin/brew',
      brewOutcome: 'fails',
      managed: PINNED,
      answers: {
        'gh --version': { stdout: `gh version ${GH_PINNED} (2026-09-03)\n`, stderr: '', code: 0 },
      },
    });
    h.service.start();
    h.service.skipSetup();
    h.service.windowShown();
    await report(h);
    h.service.install({ tools: ['gh'], androidTermsAccepted: true });
    await lastInstallEvent(h, 'settled');
    expect(h.spawned).toHaveLength(1);

    h.installEvents.length = 0;
    h.service.install({ tools: ['gh'], androidTermsAccepted: true });
    await lastInstallEvent(h, 'settled');

    expect(h.spawned).toHaveLength(1);
    expect(h.downloads.some((url) => url.includes('gh_'))).toBe(true);
    expect(
      h.installEvents.filter((event) => event.kind === 'done').map((event) => event.tool),
    ).toEqual(['gh']);
  });

  it('rechecks the adb row after skipping it for the terms (criterion 16)', async () => {
    const h = harness({ adb: null, managed: PINNED });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.calls.length = 0;
    h.service.install({ androidTermsAccepted: false });
    await lastInstallEvent(h, 'settled');

    expect(h.changed.filter((state) => state.report !== null).length).toBeGreaterThan(0);
    expect(h.changed.at(-1)?.report?.rows.find((row) => row.id === 'adb')?.detail).toBe(
      'adb --version → command not found',
    );
  });

  it('refuses Continue while an install runs, and cancels a sign-in it leaves behind', async () => {
    const h = harness({
      gh: null,
      brew: '/opt/homebrew/bin/brew',
      brewOutcome: 'silent',
      managed: PINNED,
    });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.service.install({ androidTermsAccepted: true });
    await vi.waitFor(() => {
      expect(h.spawned).toHaveLength(1);
    });
    expect(h.service.skipSetup()).toEqual({
      ok: false,
      error: { code: 'doctor/install-active', message: expect.any(String) },
    });
    expect(h.setupFinished()).toBe(0);

    const signing = harness({ managed: PINNED, gh: null });
    signing.service.start();
    signing.service.windowShown();
    await planOf(signing);
    signing.setGh(GH);
    signing.service.login();
    expect(signing.service.skipSetup()).toEqual({ ok: true, data: {} });
    expect(signing.spawned[0]?.child.killed).toBe(1);
    expect(signing.setupFinished()).toBe(1);
  });

  it('kills a Homebrew that prints nothing for too long', async () => {
    const h = harness({
      gh: null,
      brew: '/opt/homebrew/bin/brew',
      brewOutcome: 'silent',
      brewSilenceMs: 50,
      managed: PINNED,
    });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.service.install({ androidTermsAccepted: true });
    const settled = await lastInstallEvent(h, 'settled');

    expect(settled.failed).toEqual(['gh']);
    expect(h.spawned[0]?.child.killed).toBe(1);
    const state = h.service.state().install;
    const failed = state !== null && 'failed' in state ? state.failed : {};
    expect(failed.gh?.code).toBe('doctor/brew-failed');
    expect(failed.gh?.detail).toMatch(/nothing for/);
  });

  it('refuses a direct install on an Intel Mac and leaves the plan alone', async () => {
    const h = harness({ gh: null, arch: 'x64', managed: PINNED });
    h.service.start();
    h.service.windowShown();
    await planOf(h);

    expect(h.service.install({ tools: ['gh'], androidTermsAccepted: true })).toEqual({
      ok: false,
      error: { code: 'doctor/unsupported-arch', message: expect.any(String) },
    });
  });

  /** Criterion 42 — a configured path is the person's decision for that tool. */
  it('never offers or runs an install over a configured gh or adb path', async () => {
    const h = harness({ managed: PINNED, ghOverride: '/custom/gh', gh: null });
    h.service.start();
    expect(h.service.state().setup.active).toBe(false);
    expect(h.service.state().overridden).toEqual(['gh']);
    h.service.windowShown();
    await report(h);

    expect(h.service.install({ tools: ['gh'], androidTermsAccepted: true })).toEqual({
      ok: false,
      error: {
        code: 'doctor/maestro-overridden',
        message: expect.stringContaining('CONDUCTOR_GH_PATH'),
      },
    });
    expect(h.downloads).toEqual([]);
  });

  it('records the skips of the tools still missing on Continue', async () => {
    const h = harness({ gh: null, adb: null, managed: PINNED });
    h.service.start();
    h.service.windowShown();
    await planOf(h);

    expect(h.service.skipSetup()).toEqual({ ok: true, data: {} });
    expect(JSON.parse(readFileSync(h.skipsFile, 'utf8'))).toEqual({
      gh: expect.any(String),
      adb: expect.any(String),
      pins: { gh: GH_PINNED, adb: PLATFORM_TOOLS_PINNED },
    });
  });

  it('kills brew and removes the tools job dir on dispose', async () => {
    const h = harness({
      gh: null,
      adb: null,
      brew: '/opt/homebrew/bin/brew',
      brewOutcome: 'silent',
      managed: PINNED,
    });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.service.install({ androidTermsAccepted: true });
    await vi.waitFor(() => {
      expect(h.spawned).toHaveLength(1);
    });

    await h.service.dispose();

    expect(h.spawned[0]?.child.killed).toBe(1);
    expect(existsSync(h.toolsInstallDir)).toBe(false);
    expect(h.installEvents.some((event) => event.kind === 'settled')).toBe(false);
  });
});

/* ── Managed tools: the GitHub sign-in ─────────────────────────────────── */

/** Criteria 28–33 — gh's own device flow, driven from the app. */
describe('the GitHub sign-in', () => {
  const SIGNED_OUT = {
    stdout: '',
    stderr: 'You are not logged into any GitHub hosts. To log in, run: gh auth login\n',
    code: 1,
  };

  it('refuses without gh, and while one runs', async () => {
    const missing = harness({ gh: null, managed: PINNED });
    missing.service.start();
    expect(missing.service.login()).toEqual({
      ok: false,
      error: { code: 'doctor/gh-missing', message: expect.any(String) },
    });

    const h = harness({ managed: PINNED });
    h.service.start();
    expect(h.service.login()).toEqual({ ok: true, data: { loginId: 'login-1' } });
    expect(h.service.login()).toEqual({
      ok: false,
      error: { code: 'doctor/login-active', message: expect.any(String) },
    });
  });

  it('runs gh auth login --web with stdin closed after one newline, shows the code, then the account', async () => {
    const h = harness({ managed: PINNED, answers: { 'gh auth status --active': SIGNED_OUT } });
    h.service.start();
    h.service.windowShown();
    await report(h);
    h.calls.length = 0;

    h.service.login();
    const child = h.spawned[0];
    expect(child?.command).toBe(GH);
    expect(child?.args).toEqual(LOGIN_ARGV);
    expect(child?.child.written).toEqual(['\n']);
    expect(child?.child.ended).toBe(1);
    expect(h.service.state().login).toEqual({ loginId: 'login-1', code: null });

    child?.child.stderr('\n! First copy your one-time');
    child?.child.stderr(
      ' code: 1234-ABCD\nOpen this URL to continue in your web browser: https://github.com/login/device\n',
    );
    expect(h.loginEvents).toEqual([
      {
        kind: 'code',
        loginId: 'login-1',
        code: '1234-ABCD',
        url: 'https://github.com/login/device',
      },
    ]);
    expect(h.service.state().login).toEqual({ loginId: 'login-1', code: '1234-ABCD' });

    // The row goes signed in on exit — gh answers the recheck.
    child?.child.stderr('✓ Authentication complete.\n✓ Logged in as GuilhermeHCDias\n');
    h.setAnswer('gh auth status --active', healthy()['gh auth status --active'] as Answer);
    child?.child.exit({ code: 0, error: null });
    await vi.waitFor(() => {
      expect(h.loginEvents.at(-1)).toEqual({
        kind: 'done',
        loginId: 'login-1',
        account: 'GuilhermeHCDias',
      });
    });
    expect(h.service.state().login).toBeNull();
    expect(h.calls.map((call) => `${basename(call.command)} ${call.args.join(' ')}`)).toEqual([
      'gh --version',
      'gh auth status --active',
    ]);
    expect(h.changed.at(-1)?.report?.rows.find((row) => row.id === 'github-auth')?.status).toBe(
      'ok',
    );
  });

  it('reports a failed sign-in with the sentence and the last stderr line, and a cancel as cancelled', async () => {
    const h = harness({ managed: PINNED, answers: { 'gh auth status --active': SIGNED_OUT } });
    h.service.start();
    h.service.login();
    const first = h.spawned[0]?.child;
    first?.stderr('! First copy your one-time code: 1234-ABCD\n');
    first?.stderr('error validating token: The device code has expired\n\n');
    first?.exit({ code: 1, error: null });
    await vi.waitFor(() => {
      expect(h.loginEvents.at(-1)?.kind).toBe('failed');
    });
    expect(h.loginEvents.at(-1)).toEqual({
      kind: 'failed',
      loginId: 'login-1',
      code: 'doctor/login-failed',
      message: "GitHub sign-in didn't finish. Try again when you're ready.",
      detail: 'error validating token: The device code has expired',
    });
    expect(h.service.state().login).toEqual({
      loginId: 'login-1',
      failed: {
        code: 'doctor/login-failed',
        message: "GitHub sign-in didn't finish. Try again when you're ready.",
        detail: 'error validating token: The device code has expired',
      },
    });
    // The code line is never a detail, even when it is the last thing gh printed (criterion 29).
    h.service.login();
    h.spawned[1]?.child.stderr('! First copy your one-time code: 9Z9Z-Q1Q1\n');
    h.spawned[1]?.child.exit({ code: 1, error: null });
    await vi.waitFor(() => {
      expect(h.loginEvents.at(-1)?.kind).toBe('failed');
    });
    expect(JSON.stringify(h.loginEvents.at(-1))).not.toContain('9Z9Z-Q1Q1');
    expect(JSON.stringify(h.service.state())).not.toContain('9Z9Z-Q1Q1');

    expect(h.service.login()).toEqual({ ok: true, data: { loginId: 'login-3' } });
    expect(h.service.loginCancel()).toEqual({ ok: true, data: {} });
    expect(h.spawned[2]?.child.killed).toBe(1);
    await vi.waitFor(() => {
      expect(h.loginEvents.at(-1)).toEqual({ kind: 'cancelled', loginId: 'login-3' });
    });
    expect(h.service.state().login).toBeNull();
    expect(h.service.loginCancel()).toEqual({ ok: true, data: {} });
  });

  it('opens only the two URLs main knows', async () => {
    const h = harness({ managed: PINNED });
    h.service.start();

    expect(await h.service.openLoginUrl()).toEqual({ ok: true, data: {} });
    expect(await h.service.openUrl('android-terms')).toEqual({ ok: true, data: {} });
    expect(h.opened).toEqual([
      'https://github.com/login/device',
      'https://developer.android.com/studio/terms',
    ]);
  });

  it('holds the setup open for the sign-in after the tools land, and presents the app once signed in', async () => {
    const h = harness({
      gh: null,
      answers: {
        'gh --version': { stdout: `gh version ${GH_PINNED} (2026-09-03)\n`, stderr: '', code: 0 },
        'gh auth status --active': SIGNED_OUT,
      },
    });
    h.service.start();
    h.service.windowShown();
    await planOf(h);
    h.service.install({ androidTermsAccepted: true });
    await lastInstallEvent(h, 'settled');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(h.setupFinished()).toBe(0);
    expect(h.service.state().setup.active).toBe(true);

    h.service.login();
    h.setAnswer('gh auth status --active', healthy()['gh auth status --active'] as Answer);
    h.spawned[0]?.child.stderr('✓ Logged in as GuilhermeHCDias\n');
    h.spawned[0]?.child.exit({ code: 0, error: null });
    await vi.waitFor(() => {
      expect(h.setupFinished()).toBe(1);
    });
  });

  it('kills the sign-in child on dispose', async () => {
    const h = harness({ managed: PINNED });
    h.service.start();
    h.service.login();

    await h.service.dispose();

    expect(h.spawned[0]?.child.killed).toBe(1);
  });
});

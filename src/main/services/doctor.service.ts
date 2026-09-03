import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { chmod, mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  type DoctorInstallEvent,
  type DoctorReport,
  type DoctorRow,
  type DoctorRowId,
  type DoctorState,
  ERROR_CODES,
  type ErrorCode,
  type Result,
} from '@shared/ipc';
import {
  MANAGED_MARKER,
  managedMaestroBinary,
  managedMaestroMarker,
  resolveMaestro,
} from '../maestro/resolve-maestro';
import type { RunOptions, RunResult } from '../process/run';
import {
  firstLine,
  parseAdbVersion,
  parseChecksum,
  parseClaudeAuthStatus,
  parseClaudeVersion,
  parseCltVersion,
  parseGhAuthStatus,
  parseGhVersion,
  parseJavaVersion,
} from './doctor-parse';
import type { DownloadFn } from './download';

/**
 * The environment doctor (.context.md §10): puts Conductor's own pinned
 * Maestro on the machine — the one dependency it can honestly install — and
 * reports everything else it needs, naming each state precisely and stepping
 * back. It names `maestro`, `adb`, `java`, `gh` and `claude` (§10.1 rule 1b)
 * and creates no process: `run` and the download arrive by injection.
 *
 * Two jobs, never awaited in a handler: the check — every row concurrently,
 * each on its own 10 s clock, pushed whole when all have settled — and the
 * install pipeline, streamed as `doctor:install-event` pushes. Both abort on
 * `dispose`, and an interrupted install can never leave a copy that resolves
 * as installed: the marker lands before the rename, and the rename is the
 * only step that makes a copy visible (criterion 20).
 */

export type DoctorTimeouts = {
  /** Per check, ms. Criterion 3 says 10 s. */
  readonly check: number;
  /** The verify `maestro --version`, ms. Criterion 12 says 15 s — a JVM
   * start costs ~1.7 s here. */
  readonly verify: number;
  /** How long the setup window holds the ready state before the app
   * presents itself, ms. Criterion 16 says ≈ 800. */
  readonly readyHold: number;
  /** The focus recheck's floor, ms. Criterion 6 says 5 s. */
  readonly focusThrottle: number;
};

export const DEFAULT_TIMEOUTS: DoctorTimeouts = {
  check: 10_000,
  verify: 15_000,
  readyHold: 800,
  focusThrottle: 5_000,
};

export type DoctorServiceDeps = {
  /** `userData/maestro` — where the managed copy lives (criterion 8). */
  readonly managedDir: string;
  /** `userData/maestro-install` — one job dir per install, gone on settle. */
  readonly installDir: string;
  /** `CONFIG.MAESTRO_VERSION`. */
  readonly pinnedVersion: string;
  /** `CONFIG.MAESTRO_RELEASE_URL`. */
  readonly releaseUrl: string;
  /** `CONFIG.MAESTRO_PATH`. Non-empty means the person decided (criterion 10). */
  readonly maestroOverride: string;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly isExecutable: (path: string) => boolean;
  readonly isFile: (path: string) => boolean;
  /** `AdbBridge.resolve`, `resolve-gh`, `resolve-claude` — the app's own
   * ladders, so the doctor and the feature it explains agree. */
  readonly resolveAdb: () => string | null;
  readonly resolveGh: () => string | null;
  readonly resolveClaude: () => string | null;
  /** Criterion 40 — tools a developer asked to hide. The four binaries are
   * hidden through the executable probe every ladder walks; `java` and
   * `xcode-clt` resolve otherwise, so the doctor reads the set for them. */
  readonly hidden: ReadonlySet<string>;
  /** The one process door (§10.1). */
  readonly run: (
    command: string,
    args: readonly string[],
    options?: RunOptions,
  ) => Promise<RunResult>;
  /** Electron's `net`, streamed to disk — `download.ts`, injected. */
  readonly download: DownloadFn;
  readonly emitChanged: (payload: Result<DoctorState>) => void;
  readonly emitInstallEvent: (payload: Result<DoctorInstallEvent>) => void;
  /** The setup window is done — installed or skipped — and the composition
   * root presents connect or the workspace in the same window. */
  readonly onSetupFinished: () => void;
  /** The clock, injectable so `checkedAt` and the focus floor are assertable. */
  readonly now?: () => number;
  readonly timeouts?: DoctorTimeouts;
};

/** Criterion 1 — the rows, in order, with their names. */
const ROWS: readonly { readonly id: DoctorRowId; readonly name: string }[] = [
  { id: 'maestro', name: 'Maestro' },
  { id: 'adb', name: 'Android platform-tools' },
  { id: 'java', name: 'Java Development Kit' },
  { id: 'xcode-clt', name: 'Xcode command line tools' },
  { id: 'gh', name: 'GitHub CLI' },
  { id: 'github-auth', name: 'GitHub' },
  { id: 'claude', name: 'Claude Code' },
  { id: 'claude-auth', name: 'Claude' },
];

const ALL_IDS: readonly DoctorRowId[] = ROWS.map((row) => row.id);

/** Maestro 2.x's launcher refuses anything older ("Java 17 or higher is required"). */
const MIN_JAVA = 17;

/** Criterion 17 — one product-language sentence per code, chosen here. */
const FAILURE_MESSAGES: Record<InstallFailureCode, string> = {
  'doctor/download-failed':
    "Conductor couldn't reach GitHub to download Maestro. Check your connection and try again.",
  'doctor/checksum-mismatch':
    "The download didn't match what Maestro published, so it was discarded.",
  'doctor/extract-failed': "Maestro couldn't be unpacked on this Mac.",
  'doctor/verify-failed': "Maestro was installed but didn't answer as expected.",
};

type InstallFailureCode =
  | typeof ERROR_CODES.doctorDownloadFailed
  | typeof ERROR_CODES.doctorChecksumMismatch
  | typeof ERROR_CODES.doctorExtractFailed
  | typeof ERROR_CODES.doctorVerifyFailed;

/** A pipeline step that failed for a reason the person can be told. */
class InstallFailure extends Error {
  readonly code: InstallFailureCode;
  readonly detail: string;

  constructor(code: InstallFailureCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'InstallFailure';
    this.code = code;
    this.detail = detail;
  }
}

/** What running one check's command came to. */
type ExecOutcome =
  | { readonly kind: 'ran'; readonly result: RunResult }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'aborted' }
  | { readonly kind: 'failed'; readonly message: string };

type ExecOptions = {
  readonly signal: AbortSignal;
  readonly timeout: number;
  readonly env?: NodeJS.ProcessEnv;
};

type JavaResolution = { readonly path: string } | { readonly path: null; readonly detail: string };

export class DoctorService {
  private readonly deps: DoctorServiceDeps;
  private report: DoctorReport | null = null;
  private checking = false;
  private setup: DoctorState['setup'] = { active: false, reason: null };
  private install_: DoctorState['install'] = null;
  /** The last install failure's raw cause — what the `maestro` row shows
   * while nothing resolves (criterion 2). */
  private lastInstallFailure: string | null = null;
  private nextInstall = 1;
  private checkController: AbortController | null = null;
  private installController: AbortController | null = null;
  /** The install in flight — never rejects; awaited by `dispose`. */
  private installRunning: Promise<void> = Promise.resolve();
  private readyHold: ReturnType<typeof setTimeout> | null = null;
  private lastFocusCheck = Number.NEGATIVE_INFINITY;
  /** An install settled while a check was in flight: the recheck it owes
   * (criterion 6) runs the moment that check lands, rather than being lost
   * to coalescing — the maestro row goes ok in place (criterion 31). */
  private recheckPending = false;
  private disposed = false;

  constructor(deps: DoctorServiceDeps) {
    this.deps = deps;
  }

  /**
   * Criterion 13 — decided from files alone, before the window exists, so
   * its geometry can follow: no process runs here. A configured path is the
   * person's decision and the installer never runs over it.
   */
  start(): void {
    if (this.deps.maestroOverride !== '') {
      this.setup = { active: false, reason: null };
      return;
    }
    const marker = this.readMarker();
    const whole =
      marker !== null && this.deps.isExecutable(managedMaestroBinary(this.deps.managedDir));
    if (!whole) {
      this.setup = { active: true, reason: 'first-run' };
      return;
    }
    this.setup =
      marker === this.deps.pinnedVersion
        ? { active: false, reason: null }
        : { active: true, reason: 'update' };
  }

  /** Criterion 6 — the first report runs after first paint, never before;
   * criterion 14 — the setup window starts its install with no click. */
  windowShown(): void {
    void this.runCheck('all');
    if (this.setup.active) {
      this.install();
    }
  }

  state(): DoctorState {
    return {
      report: this.report,
      checking: this.checking,
      setup: this.setup,
      install: this.install_,
      maestroOverridden: this.deps.maestroOverride !== '',
      version: this.deps.pinnedVersion,
    };
  }

  status(): Result<DoctorState> {
    return { ok: true, data: this.state() };
  }

  /** "Check again". A check in flight coalesces the trigger (criterion 6). */
  check(): Result<{ started: boolean }> {
    if (this.checking || this.disposed) {
      return { ok: true, data: { started: false } };
    }
    void this.runCheck('all');
    return { ok: true, data: { started: true } };
  }

  /**
   * Criterion 6's focus clause — the "install it in the terminal, come back"
   * loop: only the rows that were not ok re-run, merged into the report, at
   * most once per 5 s, and never over a check in flight.
   */
  windowFocused(): void {
    if (this.disposed || this.checking || this.report === null) {
      return;
    }
    const stale = this.report.rows.filter((row) => row.status !== 'ok').map((row) => row.id);
    if (stale.length === 0) {
      return;
    }
    const now = this.now();
    if (now - this.lastFocusCheck < this.timeouts().focusThrottle) {
      return;
    }
    this.lastFocusCheck = now;
    void this.runCheck(stale);
  }

  /**
   * Criterion 15 — the id at once, the pipeline streamed. Whether this is
   * the setup window's install is read here, at the start: a Try again from
   * the Setup view is the same install, and completing it presents the app.
   */
  install(): Result<{ installId: string }> {
    if (this.disposed) {
      return refuse(ERROR_CODES.doctorInstallActive, 'Conductor is shutting down.');
    }
    if (this.deps.maestroOverride !== '') {
      return refuse(
        ERROR_CODES.doctorMaestroOverridden,
        'CONDUCTOR_MAESTRO_PATH is set, so Conductor uses that copy and installs nothing.',
      );
    }
    if (this.installController !== null) {
      return refuse(ERROR_CODES.doctorInstallActive, 'Maestro is already being installed.');
    }
    const installId = `install-${this.nextInstall}`;
    this.nextInstall += 1;
    const fromSetup = this.setup.active;
    const controller = new AbortController();
    this.installController = controller;
    const step = `Downloading maestro ${this.deps.pinnedVersion}`;
    this.install_ = { installId, pct: 0, step };
    this.emitChanged();
    this.emitInstall({ kind: 'progress', installId, pct: 0, step });
    this.installRunning = this.runInstall(installId, fromSetup, controller.signal);
    return { ok: true, data: { installId } };
  }

  /** Criterion 18 — "Continue without Maestro". The app presents itself;
   * the next launch runs the installer again until the copy matches. */
  skipSetup(): Result<Record<never, never>> {
    if (!this.setup.active) {
      return refuse(ERROR_CODES.doctorSetupNotActive, 'There is no setup to skip.');
    }
    this.finishSetup();
    return { ok: true, data: {} };
  }

  /** Criterion 20 — nothing in flight survives `before-quit`. */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.readyHold !== null) {
      clearTimeout(this.readyHold);
      this.readyHold = null;
    }
    this.checkController?.abort();
    this.installController?.abort();
    await this.installRunning;
    await rm(this.deps.installDir, { recursive: true, force: true });
  }

  /* ── The check ─────────────────────────────────────────────────────── */

  private async runCheck(ids: 'all' | readonly DoctorRowId[]): Promise<void> {
    if (this.checking || this.disposed) {
      return;
    }
    this.checking = true;
    const controller = new AbortController();
    this.checkController = controller;
    this.emitChanged();
    try {
      const wanted = ids === 'all' ? ALL_IDS : ids;
      const fresh = await this.checkRows(wanted, controller.signal);
      if (this.disposed || controller.signal.aborted) {
        return;
      }
      const previous = this.report?.rows ?? [];
      const rows = ROWS.map(({ id }) => {
        const row = fresh.get(id) ?? previous.find((entry) => entry.id === id);
        if (row === undefined) {
          throw new Error(`The doctor produced no row for ${id}.`);
        }
        return row;
      });
      this.report = {
        rows,
        checkedAt: this.now(),
        issues: rows.filter((row) => row.status !== 'ok').length,
      };
    } finally {
      if (!this.disposed) {
        this.checking = false;
        this.checkController = null;
        this.emitChanged();
        if (this.recheckPending) {
          this.recheckPending = false;
          void this.runCheck('all');
        }
      }
    }
  }

  /** Criterion 3 — every wanted row at once, each on its own clock. */
  private async checkRows(
    ids: readonly DoctorRowId[],
    signal: AbortSignal,
  ): Promise<Map<DoctorRowId, DoctorRow>> {
    const wanted = new Set(ids);
    const gh = wanted.has('gh') || wanted.has('github-auth') ? this.deps.resolveGh() : null;
    const claude =
      wanted.has('claude') || wanted.has('claude-auth') ? this.deps.resolveClaude() : null;
    const checks: Partial<Record<DoctorRowId, () => Promise<DoctorRow> | DoctorRow>> = {
      maestro: () => this.rowMaestro(),
      adb: () => this.rowAdb(signal),
      java: () => this.rowJava(signal),
      'xcode-clt': () => this.rowXcode(signal),
      gh: () => this.rowGh(gh, signal),
      'github-auth': () => this.rowGithubAuth(gh, signal),
      claude: () => this.rowClaude(claude, signal),
      'claude-auth': () => this.rowClaudeAuth(claude, signal),
    };
    const settled = await Promise.all(
      ids.map(async (id) => {
        const check = checks[id];
        if (check === undefined) {
          throw new Error(`No check for ${id}.`);
        }
        return [id, await check()] as const;
      }),
    );
    return new Map(settled);
  }

  /** Criterion 2's maestro row — marker plus executable bit, no JVM. */
  private rowMaestro(): DoctorRow {
    const { managedDir, pinnedVersion } = this.deps;
    const bin = managedMaestroBinary(managedDir);
    const resolved = resolveMaestro({
      configuredPath: this.deps.maestroOverride,
      managedDir,
      env: this.deps.env,
      home: this.deps.home,
      isExecutable: this.deps.isExecutable,
      isFile: this.deps.isFile,
    });
    if (resolved === bin) {
      const marker = this.readMarker() ?? '';
      if (marker === pinnedVersion) {
        return this.row('maestro', 'ok', 'Installed', `maestro ${marker} · ${bin}`, marker);
      }
      return this.row(
        'maestro',
        'warn',
        'Update pending',
        `${marker} · Conductor needs ${pinnedVersion}`,
        marker,
      );
    }
    if (resolved !== null) {
      return this.row('maestro', 'warn', 'Using yours', resolved, 'yours');
    }
    return this.row(
      'maestro',
      'fail',
      'Not installed',
      this.lastInstallFailure ?? 'maestro → not installed',
      'not installed',
    );
  }

  private async rowAdb(signal: AbortSignal): Promise<DoctorRow> {
    const adb = this.deps.hidden.has('adb') ? null : this.deps.resolveAdb();
    if (adb === null) {
      return this.notFound('adb', 'adb --version → command not found');
    }
    const outcome = await this.exec(adb, ['--version'], { signal, timeout: this.timeouts().check });
    if (outcome.kind !== 'ran') {
      return this.unanswered('adb', 'adb --version', outcome);
    }
    if (outcome.result.code !== 0) {
      return this.row(
        'adb',
        'fail',
        'Not working',
        firstLine(outcome.result.stderr),
        'not working',
      );
    }
    const version = parseAdbVersion(outcome.result.stdout);
    return this.row('adb', 'ok', 'Ready', `${version.first} · ${adb}`, version.short);
  }

  private async rowJava(signal: AbortSignal): Promise<DoctorRow> {
    const java = await this.resolveJava(signal);
    if (java.path === null) {
      return this.notFound('java', java.detail);
    }
    const outcome = await this.exec(java.path, ['-version'], {
      signal,
      timeout: this.timeouts().check,
    });
    if (outcome.kind !== 'ran') {
      return this.unanswered('java', 'java -version', outcome);
    }
    // `java -version` prints to stderr; a JVM that prints elsewhere is read too.
    const version =
      parseJavaVersion(outcome.result.stderr) ?? parseJavaVersion(outcome.result.stdout);
    if (version === null || outcome.result.code !== 0) {
      return this.row(
        'java',
        'fail',
        'Not working',
        firstLine(outcome.result.stderr) || firstLine(outcome.result.stdout),
        'not working',
      );
    }
    if (version.major < MIN_JAVA) {
      return this.row(
        'java',
        'warn',
        'Too old',
        `${version.first} · Maestro needs Java ${MIN_JAVA} or newer`,
        version.short,
      );
    }
    return this.row('java', 'ok', 'Ready', `${version.first} · ${java.path}`, version.short);
  }

  /**
   * Never `/usr/bin/java`: on a Mac without a JDK that stub raises the
   * system "No Java runtime present" dialog. `$JAVA_HOME` first, then
   * `/usr/libexec/java_home`, which exits 1 to stderr and shows nothing.
   */
  private async resolveJava(signal: AbortSignal): Promise<JavaResolution> {
    if (this.deps.hidden.has('java')) {
      return { path: null, detail: '/usr/libexec/java_home → hidden by CONDUCTOR_DOCTOR_HIDE' };
    }
    const home = this.deps.env.JAVA_HOME;
    if (home !== undefined && home !== '') {
      const candidate = join(home, 'bin', 'java');
      if (this.deps.isExecutable(candidate)) {
        return { path: candidate };
      }
    }
    const outcome = await this.exec('/usr/libexec/java_home', [], {
      signal,
      timeout: this.timeouts().check,
    });
    if (outcome.kind === 'ran' && outcome.result.code === 0) {
      const found = firstLine(outcome.result.stdout);
      if (found !== '') {
        return { path: join(found, 'bin', 'java') };
      }
    }
    const reason =
      outcome.kind === 'ran'
        ? firstLine(outcome.result.stderr) ||
          firstLine(outcome.result.stdout) ||
          `exited ${outcome.result.code}`
        : this.outcomeText(outcome);
    return { path: null, detail: `/usr/libexec/java_home → ${reason}` };
  }

  private async rowXcode(signal: AbortSignal): Promise<DoctorRow> {
    if (this.deps.hidden.has('xcode-clt')) {
      return this.notFound('xcode-clt', 'xcode-select -p → hidden by CONDUCTOR_DOCTOR_HIDE');
    }
    const outcome = await this.exec('/usr/bin/xcode-select', ['-p'], {
      signal,
      timeout: this.timeouts().check,
    });
    if (outcome.kind !== 'ran') {
      return this.unanswered('xcode-clt', 'xcode-select -p', outcome);
    }
    if (outcome.result.code !== 0) {
      return this.notFound(
        'xcode-clt',
        firstLine(outcome.result.stderr) || firstLine(outcome.result.stdout),
      );
    }
    const path = firstLine(outcome.result.stdout);
    const receipt = await this.exec(
      '/usr/bin/pkgutil',
      ['--pkg-info=com.apple.pkg.CLTools_Executables'],
      { signal, timeout: this.timeouts().check },
    );
    const short =
      (receipt.kind === 'ran' && receipt.result.code === 0
        ? parseCltVersion(receipt.result.stdout)
        : null) ?? 'Installed';
    return this.row('xcode-clt', 'ok', 'Installed', `${short} · ${path}`, short);
  }

  private async rowGh(gh: string | null, signal: AbortSignal): Promise<DoctorRow> {
    if (gh === null) {
      return this.notFound('gh', 'gh --version → command not found');
    }
    const outcome = await this.exec(gh, ['--version'], { signal, timeout: this.timeouts().check });
    if (outcome.kind !== 'ran') {
      return this.unanswered('gh', 'gh --version', outcome);
    }
    if (outcome.result.code !== 0) {
      return this.row('gh', 'fail', 'Not working', firstLine(outcome.result.stderr), 'not working');
    }
    const version = parseGhVersion(outcome.result.stdout);
    return this.row('gh', 'ok', 'Installed', `${version.first} · ${gh}`, version.short);
  }

  /** §8.1 — installed and authenticated are different failures. */
  private async rowGithubAuth(gh: string | null, signal: AbortSignal): Promise<DoctorRow> {
    if (gh === null) {
      return this.signedOut('github-auth', 'gh auth status → needs GitHub CLI first');
    }
    const outcome = await this.exec(gh, ['auth', 'status', '--active'], {
      signal,
      timeout: this.timeouts().check,
    });
    if (outcome.kind !== 'ran') {
      return this.unanswered('github-auth', 'gh auth status', outcome);
    }
    const output = `${outcome.result.stdout}\n${outcome.result.stderr}`;
    if (outcome.result.code !== 0) {
      return this.signedOut('github-auth', firstLine(output) || 'gh auth status → signed out');
    }
    const status = parseGhAuthStatus(output);
    if (status === null) {
      return this.row('github-auth', 'ok', 'Signed in', firstLine(output), 'signed in');
    }
    return this.row('github-auth', 'ok', 'Signed in', status.line, status.account);
  }

  private async rowClaude(claude: string | null, signal: AbortSignal): Promise<DoctorRow> {
    if (claude === null) {
      return this.notFound('claude', 'claude --version → command not found');
    }
    const outcome = await this.exec(claude, ['--version'], {
      signal,
      timeout: this.timeouts().check,
    });
    if (outcome.kind !== 'ran') {
      return this.unanswered('claude', 'claude --version', outcome);
    }
    if (outcome.result.code !== 0) {
      return this.row(
        'claude',
        'fail',
        'Not working',
        firstLine(outcome.result.stderr),
        'not working',
      );
    }
    const version = parseClaudeVersion(outcome.result.stdout);
    return this.row('claude', 'ok', 'Installed', `${version.first} · ${claude}`, version.short);
  }

  private async rowClaudeAuth(claude: string | null, signal: AbortSignal): Promise<DoctorRow> {
    if (claude === null) {
      return this.signedOut('claude-auth', 'claude auth status → needs Claude Code first');
    }
    const outcome = await this.exec(claude, ['auth', 'status'], {
      signal,
      timeout: this.timeouts().check,
    });
    if (outcome.kind !== 'ran') {
      return this.unanswered('claude-auth', 'claude auth status', outcome);
    }
    const status = outcome.result.code === 0 ? parseClaudeAuthStatus(outcome.result.stdout) : null;
    if (status === null) {
      return this.signedOut(
        'claude-auth',
        firstLine(outcome.result.stdout) ||
          firstLine(outcome.result.stderr) ||
          'claude auth status → signed out',
      );
    }
    if (!status.loggedIn) {
      return this.signedOut('claude-auth', 'claude auth status → loggedIn: false');
    }
    return this.row(
      'claude-auth',
      'ok',
      'Signed in',
      `claude auth status → loggedIn: true (${status.authMethod ?? 'unknown'})`,
      status.authMethod ?? 'signed in',
    );
  }

  /* ── The install ───────────────────────────────────────────────────── */

  private async runInstall(
    installId: string,
    fromSetup: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    const { managedDir, pinnedVersion, releaseUrl } = this.deps;
    const jobDir = join(this.deps.installDir, installId);
    const base = `${releaseUrl}/cli-${pinnedVersion}`;
    try {
      await mkdir(jobDir, { recursive: true });

      // Criterion 12 — streamed to disk, progress by bytes, 0–90.
      const archive = join(jobDir, 'maestro.zip');
      const downloading = `Downloading maestro ${pinnedVersion}`;
      await this.download(`${base}/maestro.zip`, archive, signal, ({ received, total }) => {
        const pct =
          total === null || total <= 0 ? 0 : Math.min(90, Math.floor((received / total) * 90));
        this.progress(installId, pct, downloading);
      });

      this.progress(installId, 90, 'Checking the download');
      const checksums = join(jobDir, 'checksums_sha256.txt');
      await this.download(`${base}/checksums_sha256.txt`, checksums, signal, null);
      const expected = parseChecksum(await readFile(checksums, 'utf8'), 'maestro.zip');
      if (expected === null) {
        throw new InstallFailure(
          ERROR_CODES.doctorChecksumMismatch,
          'maestro.zip is not listed in checksums_sha256.txt',
        );
      }
      const actual = await sha256(archive);
      if (actual !== expected) {
        await rm(archive, { force: true });
        throw new InstallFailure(
          ERROR_CODES.doctorChecksumMismatch,
          `sha256 ${actual} ≠ published ${expected}`,
        );
      }

      this.progress(installId, 93, 'Extracting');
      const extractDir = join(jobDir, 'extract');
      const unzip = await this.exec('/usr/bin/unzip', ['-qo', archive, '-d', extractDir], {
        signal,
        // Extraction of ~315 MB is not a check: no clock but the abort.
        timeout: Number.POSITIVE_INFINITY,
      });
      if (unzip.kind === 'aborted') {
        return;
      }
      if (unzip.kind !== 'ran') {
        throw new InstallFailure(ERROR_CODES.doctorExtractFailed, this.outcomeText(unzip));
      }
      if (unzip.result.code !== 0) {
        throw new InstallFailure(
          ERROR_CODES.doctorExtractFailed,
          firstLine(unzip.result.stderr) || `unzip exited ${unzip.result.code}`,
        );
      }
      const root = await locateRoot(extractDir);
      if (root === null) {
        throw new InstallFailure(
          ERROR_CODES.doctorExtractFailed,
          'bin/maestro not found in the archive',
        );
      }
      await chmod(join(root, 'bin', 'maestro'), 0o755);
      // The marker lands before the rename (criterion 20).
      await writeFile(join(root, MANAGED_MARKER), pinnedVersion, 'utf8');

      this.progress(installId, 98, 'Verifying installation');
      await rm(managedDir, { recursive: true, force: true });
      await rename(root, managedDir);

      // Only when a JDK resolves: without one the install still completes,
      // and the Java row carries that truth.
      const java = await this.resolveJava(signal);
      if (java.path !== null) {
        await this.verify(signal);
      }

      this.progress(installId, 100, 'Verifying installation');
      if (this.disposed) {
        return;
      }
      this.install_ = null;
      this.lastInstallFailure = null;
      this.emitInstall({ kind: 'done', installId, version: pinnedVersion });
      this.emitChanged();
      if (fromSetup) {
        // Criterion 16 — the ready state is held, then the app presents itself.
        this.readyHold = setTimeout(() => {
          this.readyHold = null;
          if (!this.disposed && this.setup.active) {
            this.finishSetup();
          }
        }, this.timeouts().readyHold);
      }
    } catch (error) {
      if (this.disposed || signal.aborted) {
        return;
      }
      const failure =
        error instanceof InstallFailure
          ? error
          : new InstallFailure(
              ERROR_CODES.doctorExtractFailed,
              error instanceof Error ? error.message : String(error),
            );
      console.error(`Maestro install ${installId} failed:`, failure.detail);
      const failed = {
        code: failure.code,
        message: FAILURE_MESSAGES[failure.code],
        detail: failure.detail,
      };
      this.install_ = { installId, failed };
      this.lastInstallFailure = failure.detail;
      this.emitInstall({ kind: 'failed', installId, ...failed });
      this.emitChanged();
    } finally {
      await rm(this.deps.installDir, { recursive: true, force: true });
      this.installController = null;
      if (!this.disposed) {
        // Criterion 6 — the report runs again once an install settles; a
        // check already in flight defers it rather than swallowing it.
        if (this.checking) {
          this.recheckPending = true;
        } else {
          void this.runCheck('all');
        }
      }
    }
  }

  /** The verify step: the managed launcher must print the pin. A copy that
   * does not is removed — the failure detail is the row's truth, and a copy
   * left in place would resolve as installed over it. */
  private async verify(signal: AbortSignal): Promise<void> {
    const { managedDir, pinnedVersion } = this.deps;
    const outcome = await this.exec(managedMaestroBinary(managedDir), ['--version'], {
      signal,
      timeout: this.timeouts().verify,
      // §12.10 on every maestro process; no `--no-reinstall-driver` — this
      // touches no device.
      env: { ...this.deps.env, MAESTRO_CLI_NO_ANALYTICS: '1' },
    });
    if (outcome.kind === 'aborted') {
      return;
    }
    let detail: string | null = null;
    if (outcome.kind === 'timeout') {
      detail = `maestro --version → no answer after ${this.seconds(this.timeouts().verify)}`;
    } else if (outcome.kind !== 'ran') {
      detail = `maestro --version → ${this.outcomeText(outcome)}`;
    } else {
      const printed = firstLine(outcome.result.stdout) || firstLine(outcome.result.stderr);
      if (outcome.result.code !== 0 || printed !== pinnedVersion) {
        detail = `maestro --version → ${printed || `exited ${outcome.result.code}`}`;
      }
    }
    if (detail !== null) {
      await rm(managedDir, { recursive: true, force: true });
      throw new InstallFailure(ERROR_CODES.doctorVerifyFailed, detail);
    }
  }

  private async download(
    url: string,
    dest: string,
    signal: AbortSignal,
    onProgress: ((progress: { received: number; total: number | null }) => void) | null,
  ): Promise<void> {
    if (signal.aborted) {
      const error = new Error('The install was aborted.');
      error.name = 'AbortError';
      throw error;
    }
    try {
      await this.deps.download(url, dest, {
        signal,
        onProgress: onProgress ?? undefined,
      });
    } catch (error) {
      if (signal.aborted) {
        throw error;
      }
      throw new InstallFailure(ERROR_CODES.doctorDownloadFailed, detailOf(error));
    }
  }

  /** One event per change of `pct` or `step`: a download delivers many
   * chunks per percent, and a store at ~10 Hz is plenty (criterion 15). */
  private progress(installId: string, pct: number, step: string): void {
    const current = this.install_;
    if (
      current !== null &&
      'pct' in current &&
      current.installId === installId &&
      current.pct === pct &&
      current.step === step
    ) {
      return;
    }
    this.install_ = { installId, pct, step };
    this.emitInstall({ kind: 'progress', installId, pct, step });
  }

  private finishSetup(): void {
    this.setup = { active: false, reason: null };
    this.emitChanged();
    this.deps.onSetupFinished();
  }

  /* ── Plumbing ──────────────────────────────────────────────────────── */

  /**
   * One command on one clock. A child that outlives its clock is aborted
   * and reported as a timeout; one that never started is `missing`; the
   * parent signal — dispose — reads as `aborted`, which no row reports.
   */
  private async exec(
    command: string,
    args: readonly string[],
    options: ExecOptions,
  ): Promise<ExecOutcome> {
    const controller = new AbortController();
    const onAbort = (): void => {
      controller.abort();
    };
    if (options.signal.aborted) {
      return { kind: 'aborted' };
    }
    options.signal.addEventListener('abort', onAbort, { once: true });
    let timedOut = false;
    const timer = Number.isFinite(options.timeout)
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, options.timeout)
      : null;
    try {
      const result = await this.deps.run(command, args, {
        signal: controller.signal,
        env: options.env ?? this.deps.env,
      });
      return { kind: 'ran', result };
    } catch (error) {
      if (options.signal.aborted) {
        return { kind: 'aborted' };
      }
      if (timedOut) {
        return { kind: 'timeout' };
      }
      if (isErrno(error, 'ENOENT')) {
        return { kind: 'missing' };
      }
      return { kind: 'failed', message: error instanceof Error ? error.message : String(error) };
    } finally {
      if (timer !== null) {
        clearTimeout(timer);
      }
      options.signal.removeEventListener('abort', onAbort);
    }
  }

  /** What a non-`ran` outcome reads as, in machine register. */
  private outcomeText(outcome: ExecOutcome): string {
    switch (outcome.kind) {
      case 'timeout':
        return `no answer after ${this.seconds(this.timeouts().check)}`;
      case 'missing':
        return 'command not found';
      case 'aborted':
        return 'aborted';
      case 'failed':
        return outcome.message;
      case 'ran':
        return '';
    }
  }

  /** Criterion 3's row for a check that did not answer; `missing` for a
   * binary that resolved but would not start is a Not found. */
  private unanswered(id: DoctorRowId, command: string, outcome: ExecOutcome): DoctorRow {
    if (outcome.kind === 'timeout') {
      return this.row(
        id,
        'warn',
        'Did not answer',
        `${command} → no answer after ${this.seconds(this.timeouts().check)}`,
        'no answer',
      );
    }
    return this.notFound(id, `${command} → ${this.outcomeText(outcome)}`);
  }

  private notFound(id: DoctorRowId, detail: string): DoctorRow {
    return this.row(id, 'fail', 'Not found', detail, 'not found');
  }

  private signedOut(id: DoctorRowId, detail: string): DoctorRow {
    return this.row(id, 'warn', 'Signed out', detail, 'signed out');
  }

  private row(
    id: DoctorRowId,
    status: DoctorRow['status'],
    label: string,
    detail: string,
    short: string,
  ): DoctorRow {
    const name = ROWS.find((entry) => entry.id === id)?.name ?? id;
    return { id, name, status, label, detail, short };
  }

  private readMarker(): string | null {
    const marker = managedMaestroMarker(this.deps.managedDir);
    if (!this.deps.isFile(marker)) {
      return null;
    }
    try {
      return readFileSync(marker, 'utf8').trim();
    } catch {
      return null;
    }
  }

  private seconds(ms: number): string {
    return `${Math.round(ms / 1000)} s`;
  }

  private timeouts(): DoctorTimeouts {
    return this.deps.timeouts ?? DEFAULT_TIMEOUTS;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private emitChanged(): void {
    this.deps.emitChanged({ ok: true, data: this.state() });
  }

  private emitInstall(event: DoctorInstallEvent): void {
    this.deps.emitInstallEvent({ ok: true, data: event });
  }
}

/** `bin/maestro` at the extracted root, or one directory down — the archive
 * today carries a single top-level `maestro/` (criterion 12). */
async function locateRoot(extractDir: string): Promise<string | null> {
  if (await isRegularFile(join(extractDir, 'bin', 'maestro'))) {
    return extractDir;
  }
  for (const entry of await readdir(extractDir, { withFileTypes: true })) {
    if (
      entry.isDirectory() &&
      (await isRegularFile(join(extractDir, entry.name, 'bin', 'maestro')))
    ) {
      return join(extractDir, entry.name);
    }
  }
  return null;
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Streamed, never buffered — the archive is ~315 MB. */
async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

function detailOf(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'detail' in error) {
    const detail = error.detail;
    if (typeof detail === 'string') {
      return detail;
    }
  }
  return error instanceof Error ? error.message : String(error);
}

function isErrno(error: unknown, code: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    error.code === code
  );
}

function refuse(code: ErrorCode, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

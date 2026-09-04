import { createHash } from 'node:crypto';
import { createReadStream, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import {
  type DoctorInstallEvent,
  type DoctorInstallFailure,
  type DoctorInstallMethod,
  type DoctorLoginEvent,
  type DoctorPlan,
  type DoctorPlanEntry,
  type DoctorReport,
  type DoctorRow,
  type DoctorRowId,
  type DoctorState,
  ERROR_CODES,
  type ErrorCode,
  type Result,
  type ToolId,
} from '@shared/ipc';
import {
  MANAGED_MARKER,
  managedMaestroBinary,
  managedMaestroMarker,
  resolveMaestro,
} from '../maestro/resolve-maestro';
import type { RunOptions, RunResult, SpawnOptions, StreamingProcess } from '../process/run';
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
import { GH_DEVICE_URL, parseLoginAccount, parseLoginCode } from './gh-login-parse';
import { type BrewToolId, brewEnv, brewFailureDetail, brewInstallArgs, brewStep } from './homebrew';
import { profileFileFor, upsertProfileBlock } from './shell-profile';
import {
  type DirectToolId,
  managedBinDir,
  managedJavaBinary,
  managedJavaHome,
  managedLauncher,
  managedToolsDir,
  TOOL_NAMES,
  TOOL_ORDER,
  type ToolLayout,
  type ToolPins,
  toolLayout,
} from './tool-layout';

/**
 * The environment doctor (.context.md §10, managed-tools amendment): puts the
 * four tools Conductor can honestly install on the machine — the Zulu JDK,
 * its own pinned Maestro, the GitHub CLI and Android platform-tools —
 * through Homebrew when the Mac has it and by direct pinned download when it
 * does not, drives GitHub's own device-flow sign-in from the app, and reports
 * everything else, naming each state precisely and stepping back. It names
 * `maestro`, `adb`, `java`, `gh`, `claude`, `brew`, `tar` and `unzip` (§10.1
 * rule 1b) and creates no process: `run`, `spawn` and the download arrive by
 * injection.
 *
 * Three jobs, never awaited in a handler: the check — every row concurrently,
 * each on its own clock, pushed whole when all have settled; the install
 * pipeline, one tool at a time in criterion 1's order, streamed as
 * `doctor:install-event` pushes and rechecked between tools; and the sign-in
 * child, streamed as `doctor:login-event`. All abort on `dispose`, and an
 * interrupted direct install can never leave a copy that resolves as
 * installed: the marker lands before the rename, and the rename is the only
 * step that makes a tree visible (criterion 18).
 */

export type DoctorTimeouts = {
  /** Per check, ms. Criterion 3 says 10 s. */
  readonly check: number;
  /** A verify version probe, ms. Criterion 11 says 15 s — a JVM start
   * costs ~1.7 s here. */
  readonly verify: number;
  /** How long the setup window holds the ready state before the app
   * presents itself, ms. Criterion 17 says ≈ 800. */
  readonly readyHold: number;
  /** The focus recheck's floor, ms. Criterion 6 says 5 s. */
  readonly focusThrottle: number;
  /** A `brew` that prints nothing for this long is killed (criterion 12). */
  readonly brewSilence: number;
};

export const DEFAULT_TIMEOUTS: DoctorTimeouts = {
  check: 10_000,
  verify: 15_000,
  readyHold: 800,
  focusThrottle: 5_000,
  brewSilence: 600_000,
};

/** The pages the renderer may ask main to open, by id (criterion 37). */
export type DoctorPage = 'android-terms';

const PAGES: Record<DoctorPage, string> = {
  'android-terms': 'https://developer.android.com/studio/terms',
};

export type DoctorInstallRequest = {
  readonly tools?: readonly ToolId[];
  readonly androidTermsAccepted: boolean;
};

export type DoctorServiceDeps = {
  /** `userData/maestro` — where the managed Maestro lives (criterion 5). */
  readonly managedDir: string;
  /** `userData/maestro-install` — Maestro's job dir, gone on settle. */
  readonly installDir: string;
  /** `userData/tools-install` — one job dir per install per tool, gone on settle. */
  readonly toolsInstallDir: string;
  /** `userData/doctor-skips.json` — the tools the person continued without (criterion 8). */
  readonly skipsFile: string;
  /** `CONFIG.MAESTRO_VERSION`. */
  readonly pinnedVersion: string;
  /** `CONFIG.MAESTRO_RELEASE_URL`. */
  readonly releaseUrl: string;
  /** The three direct-download pins (criterion 13). */
  readonly pins: ToolPins;
  /** `process.arch` — direct downloads are Apple silicon only (criterion 6). */
  readonly arch: string;
  /** `CONFIG.MAESTRO_PATH`. Non-empty means the person decided (criterion 10). */
  readonly maestroOverride: string;
  /** `CONFIG.GH_PATH`, `CONFIG.ADB_PATH` — the same decision for those two
   * (managed-tools criterion 42): never installed over. */
  readonly ghOverride: string;
  readonly adbOverride: string;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  /** Where macOS keeps installed JDKs — the file probe for Java at launch
   * (criterion 2), injected so a test plants its own. */
  readonly jvmRoots: readonly string[];
  readonly isExecutable: (path: string) => boolean;
  readonly isFile: (path: string) => boolean;
  /** `AdbBridge.resolve`, `resolve-gh`, `resolve-claude` — the app's own
   * ladders, so the doctor and the feature it explains agree. */
  readonly resolveAdb: () => string | null;
  readonly resolveGh: () => string | null;
  readonly resolveClaude: () => string | null;
  /** `findHomebrew`, bound — where `brew` is, or null (criterion 4). */
  readonly homebrew: () => string | null;
  /** Criterion 27 — tools a developer asked to hide. The binaries are
   * hidden through the executable probe every ladder walks; `java` and
   * `xcode-clt` resolve otherwise, so the doctor reads the set for them. */
  readonly hidden: ReadonlySet<string>;
  /** The one process door (§10.1). */
  readonly run: (
    command: string,
    args: readonly string[],
    options?: RunOptions,
  ) => Promise<RunResult>;
  /** The streaming door — `brew` and `gh auth login` print as they go. */
  readonly spawn: (
    command: string,
    args: readonly string[],
    options?: SpawnOptions,
  ) => StreamingProcess;
  /** Electron's `net`, streamed to disk — `download.ts`, injected. */
  readonly download: DownloadFn;
  /** `shell.openExternal`, injected — receives only the two literal URLs
   * chosen here by id (criteria 30, 37). */
  readonly openExternal: (url: string) => Promise<void>;
  readonly emitChanged: (payload: Result<DoctorState>) => void;
  readonly emitInstallEvent: (payload: Result<DoctorInstallEvent>) => void;
  readonly emitLoginEvent: (payload: Result<DoctorLoginEvent>) => void;
  /** The setup window is done — installed, signed in or skipped — and the
   * composition root presents connect or the workspace in the same window. */
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

const INTEL_DETAIL = 'Not available on Intel Macs';
const TERMS_DETAIL = 'Accept the Android SDK terms to install';
const LOGIN_FAILED_MESSAGE = "GitHub sign-in didn't finish. Try again when you're ready.";

type InstallFailureCode =
  | typeof ERROR_CODES.doctorDownloadFailed
  | typeof ERROR_CODES.doctorChecksumMismatch
  | typeof ERROR_CODES.doctorExtractFailed
  | typeof ERROR_CODES.doctorVerifyFailed
  | typeof ERROR_CODES.doctorBrewFailed;

/** Criteria 14–15 — one product-language sentence per code and tool, chosen
 * here. Maestro's are the sentences of the previous spec, unchanged. */
function failureMessage(code: InstallFailureCode, tool: ToolId): string {
  const { sentence, publisher } = TOOL_NAMES[tool];
  const capital = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  switch (code) {
    case 'doctor/download-failed':
      return tool === 'maestro'
        ? "Conductor couldn't reach GitHub to download Maestro. Check your connection and try again."
        : `Conductor couldn't download ${sentence}. Check your connection and try again.`;
    case 'doctor/checksum-mismatch':
      return `The download didn't match what ${publisher} published, so it was discarded.`;
    case 'doctor/extract-failed':
      return `${capital} couldn't be unpacked on this Mac.`;
    case 'doctor/verify-failed':
      return `${capital} was installed but didn't answer as expected.`;
    case 'doctor/brew-failed':
      return `Homebrew couldn't install ${sentence}. You can try again, or Conductor can download it instead.`;
  }
}

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

type JavaResolution =
  | { readonly path: string; readonly managed: boolean }
  | { readonly path: null; readonly detail: string };

/** `userData/doctor-skips.json` (criterion 8): the tool → when, plus the pin
 * each skip was taken under, so a moved pin forgets it. */
type Skips = {
  readonly at: Partial<Record<ToolId, string>>;
  readonly pins: Partial<Record<ToolId, string>>;
};

type Login = {
  readonly loginId: string;
  readonly child: StreamingProcess;
  /** gh's stderr so far — parsed for the code and the account, never logged. */
  stderr: string;
  code: string | null;
  cancelled: boolean;
};

export class DoctorService {
  private readonly deps: DoctorServiceDeps;
  private report: DoctorReport | null = null;
  private checking = false;
  /** The check in flight — awaited by a recheck so it never coalesces away. */
  private checkRunning: Promise<void> = Promise.resolve();
  private setup: DoctorState['setup'] = { active: false, reason: null, plan: null };
  private install_: DoctorState['install'] = null;
  private login_: DoctorState['login'] = null;
  /** The last install failure per tool — what the row shows while nothing
   * resolves (criterion 14's `detail`). */
  private readonly lastInstallFailure = new Map<ToolId, string>();
  private skips: Skips = { at: {}, pins: {} };
  /** Criterion 15 — a tool whose Homebrew install failed downloads next time,
   * from the installer or the sheet alike. */
  private readonly directNext = new Set<ToolId>();
  private nextInstall = 1;
  private nextLogin = 1;
  private checkController: AbortController | null = null;
  private installController: AbortController | null = null;
  /** The install in flight — never rejects; awaited by `dispose`. */
  private installRunning: Promise<void> = Promise.resolve();
  private activeLogin: Login | null = null;
  private readyHold: ReturnType<typeof setTimeout> | null = null;
  private lastFocusCheck = Number.NEGATIVE_INFINITY;
  /** The setup window showed and the plan waits on the first report. */
  private planPending = false;
  private disposed = false;

  constructor(deps: DoctorServiceDeps) {
    this.deps = deps;
  }

  /**
   * Criterion 2 — decided from files alone, before the window exists, so its
   * geometry can follow: no process runs here. A tool with no executable on
   * its ladder and no remembered skip opens the installer; the managed
   * Maestro behind its pin opens it whatever else; the sign-in never does.
   */
  start(): void {
    this.skips = this.readSkips();
    const maestro = this.maestroByFiles();
    const missing = TOOL_ORDER.filter((tool) => {
      if (tool === 'maestro') {
        return maestro !== 'present';
      }
      if (this.overridden().includes(tool)) {
        // A configured path is the person's decision (criterion 42).
        return false;
      }
      try {
        return !this.presentByFiles(tool);
      } catch (error) {
        // A ladder that throws is a bug, not a missing tool: the check
        // reports it; the installer never opens over it.
        console.error(`The ${tool} ladder failed at start:`, detailOf(error));
        return false;
      }
    });
    const opens = missing.filter(
      (tool) => !this.skipped(tool) || (tool === 'maestro' && maestro === 'update'),
    );
    if (opens.length === 0) {
      this.setup = { active: false, reason: null, plan: null };
      return;
    }
    const reason =
      opens.length === 1 && opens[0] === 'maestro' && maestro === 'update' ? 'update' : 'first-run';
    this.setup = { active: true, reason, plan: null };
  }

  /** Criterion 6 — the first report runs after first paint, never before;
   * criterion 3 — the setup window builds its plan from that report. */
  windowShown(): void {
    if (this.setup.active) {
      this.planPending = true;
    }
    void this.runCheck('all');
  }

  state(): DoctorState {
    return {
      report: this.report,
      checking: this.checking,
      setup: this.setup,
      install: this.install_,
      login: this.login_,
      overridden: this.overridden(),
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
   * Criterion 9 — the id at once, the pipeline streamed: the tools whose
   * plan state is `install` (all, or the ones named), in criterion 1's
   * order, one at a time, past any failure. Whether this is the setup
   * window's install is read here, at the start: a Try again from the Setup
   * view is the same install, and settling it presents the app.
   */
  install(request: DoctorInstallRequest): Result<{ installId: string }> {
    if (this.disposed) {
      return refuse(ERROR_CODES.doctorInstallActive, 'Conductor is shutting down.');
    }
    if (this.installController !== null) {
      return refuse(ERROR_CODES.doctorInstallActive, 'Conductor is already installing.');
    }
    const plan = this.currentPlan();
    const wanted = new Set(request.tools ?? TOOL_ORDER);
    const named = request.tools ?? [];
    const configured = named.find((tool) => this.overridden().includes(tool));
    if (configured !== undefined && named.every((tool) => this.overridden().includes(tool))) {
      const variable =
        configured === 'maestro'
          ? 'CONDUCTOR_MAESTRO_PATH'
          : configured === 'gh'
            ? 'CONDUCTOR_GH_PATH'
            : 'CONDUCTOR_ADB_PATH';
      return refuse(
        ERROR_CODES.doctorMaestroOverridden,
        `${variable} is set, so Conductor uses that copy and installs nothing.`,
      );
    }
    const entries = named.map((tool) => plan.tools.find((entry) => entry.id === tool));
    if (entries.length > 0 && entries.every((entry) => entry?.state === 'unavailable')) {
      return refuse(ERROR_CODES.doctorUnsupportedArch, INTEL_DETAIL);
    }
    const queue = plan.tools.filter(
      (entry) => wanted.has(entry.id) && (entry.state === 'install' || entry.state === 'skipped'),
    );
    const installId = `install-${this.nextInstall}`;
    this.nextInstall += 1;
    const fromSetup = this.setup.active;
    const controller = new AbortController();
    this.installController = controller;
    this.installRunning = this.runInstalls(
      installId,
      queue,
      request.androidTermsAccepted,
      fromSetup,
      controller.signal,
    );
    return { ok: true, data: { installId } };
  }

  /** Criterion 17's "Continue" — the app presents itself; the tools still
   * missing are remembered as skipped under their pins (criterion 8). */
  skipSetup(): Result<Record<never, never>> {
    if (!this.setup.active) {
      return refuse(ERROR_CODES.doctorSetupNotActive, 'There is no setup to skip.');
    }
    if (this.installController !== null) {
      return refuse(ERROR_CODES.doctorInstallActive, 'Conductor is still installing.');
    }
    // A sign-in left behind would land its outcome on a window nobody watches.
    this.loginCancel();
    const plan = this.setup.plan ?? this.currentPlan();
    for (const entry of plan.tools) {
      if (entry.state === 'install' || entry.state === 'skipped') {
        this.recordSkip(entry.id);
      }
    }
    this.finishSetup();
    return { ok: true, data: {} };
  }

  /* ── The sign-in ───────────────────────────────────────────────────── */

  /**
   * Criterion 28 — gh's own device flow, driven from the app: the id at
   * once, the code and the outcome as pushes. No OAuth app of ours, no
   * token in our hands (§9.0): gh keeps it in the keychain.
   */
  login(): Result<{ loginId: string }> {
    if (this.disposed) {
      return refuse(ERROR_CODES.doctorLoginActive, 'Conductor is shutting down.');
    }
    if (this.activeLogin !== null) {
      return refuse(ERROR_CODES.doctorLoginActive, 'A GitHub sign-in is already running.');
    }
    const gh = this.deps.resolveGh();
    if (gh === null) {
      return refuse(ERROR_CODES.doctorGhMissing, 'The GitHub CLI is not installed.');
    }
    const loginId = `login-${this.nextLogin}`;
    this.nextLogin += 1;
    const child = this.deps.spawn(
      gh,
      [
        'auth',
        'login',
        '--hostname',
        'github.com',
        '--git-protocol',
        'https',
        '--web',
        '--skip-ssh-key',
      ],
      { env: this.deps.env },
    );
    const login: Login = { loginId, child, stderr: '', code: null, cancelled: false };
    this.activeLogin = login;
    this.login_ = { loginId, code: null };
    child.onStderr((chunk) => {
      this.consumeLogin(login, chunk);
    });
    child.onStdout((chunk) => {
      this.consumeLogin(login, chunk);
    });
    child.onExit((reason) => {
      void this.settleLogin(login, reason.code);
    });
    // Without a TTY gh prints the code and polls; the newline covers the
    // "Press Enter" of an older gh, and a closed stdin leaves nothing to wait on.
    child.write('\n');
    child.endStdin?.();
    this.emitChanged();
    return { ok: true, data: { loginId } };
  }

  /** Criterion 31 — kills the child; the exit reports as cancelled. */
  loginCancel(): Result<Record<never, never>> {
    if (this.activeLogin !== null) {
      this.activeLogin.cancelled = true;
      this.activeLogin.child.kill();
    }
    return { ok: true, data: {} };
  }

  /** Criterion 30 — the one device-flow URL, opened by main. */
  async openLoginUrl(): Promise<Result<Record<never, never>>> {
    await this.deps.openExternal(GH_DEVICE_URL);
    return { ok: true, data: {} };
  }

  /** Criterion 37 — a page by id; the renderer never sends a URL. */
  async openUrl(page: DoctorPage): Promise<Result<Record<never, never>>> {
    await this.deps.openExternal(PAGES[page]);
    return { ok: true, data: {} };
  }

  private consumeLogin(login: Login, chunk: string): void {
    login.stderr = tail(login.stderr + chunk);
    if (login.code !== null) {
      return;
    }
    const code = parseLoginCode(login.stderr);
    if (code === null) {
      return;
    }
    login.code = code;
    this.login_ = { loginId: login.loginId, code };
    this.emitLogin({ kind: 'code', loginId: login.loginId, code, url: GH_DEVICE_URL });
    this.emitChanged();
  }

  private async settleLogin(login: Login, code: number | null): Promise<void> {
    if (this.activeLogin === login) {
      this.activeLogin = null;
    }
    if (this.disposed) {
      return;
    }
    if (login.cancelled) {
      this.login_ = null;
      this.emitLogin({ kind: 'cancelled', loginId: login.loginId });
      this.emitChanged();
      return;
    }
    if (code !== 0) {
      // Criterion 29 — the code line is never a detail, wherever it sat.
      const said = login.stderr
        .split(/\r?\n/)
        .filter((line) => !/one-time code/i.test(line))
        .join('\n');
      const failed = {
        code: ERROR_CODES.doctorLoginFailed,
        message: LOGIN_FAILED_MESSAGE,
        detail: lastLine(said) || (code === null ? 'gh was killed' : `gh exited ${code}`),
      };
      this.login_ = { loginId: login.loginId, failed };
      this.emitLogin({ kind: 'failed', loginId: login.loginId, ...failed });
      this.emitChanged();
      return;
    }
    // Criterion 31 — the rows first, so the report and the event agree.
    await this.recheck(['gh', 'github-auth']);
    if (this.disposed) {
      return;
    }
    const row = this.report?.rows.find((entry) => entry.id === 'github-auth');
    const account =
      parseLoginAccount(login.stderr) ?? (row?.status === 'ok' ? row.short : null) ?? 'GitHub';
    this.login_ = null;
    this.emitLogin({ kind: 'done', loginId: login.loginId, account });
    this.emitChanged();
    if (this.setup.active && this.installController === null) {
      this.holdThenFinish();
    }
  }

  /** Criterion 18 — nothing in flight survives `before-quit`. */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.readyHold !== null) {
      clearTimeout(this.readyHold);
      this.readyHold = null;
    }
    this.checkController?.abort();
    this.installController?.abort();
    this.activeLogin?.child.kill();
    await this.installRunning;
    await rm(this.deps.installDir, { recursive: true, force: true });
    await rm(this.deps.toolsInstallDir, { recursive: true, force: true });
  }

  /* ── The plan ──────────────────────────────────────────────────────── */

  /** Criterion 3 — from the first report; criterion 38 — a pin change alone
   * needs no click. */
  private buildPlan(): void {
    this.planPending = false;
    const plan = this.currentPlan();
    this.setup = { ...this.setup, plan };
    this.emitChanged();
    const onlyMaestro = plan.tools.every(
      (entry) => entry.state === 'present' || (entry.id === 'maestro' && entry.state === 'install'),
    );
    if (this.setup.reason === 'update' && onlyMaestro) {
      this.install({ androidTermsAccepted: false });
    }
  }

  /**
   * The plan as of now: each tool's presence from the report where one has
   * landed, from files otherwise (an install asked for before any report —
   * the sheet never does, a test may); the method of criterion 5; the Intel
   * gate of criterion 6, from which Maestro is exempt — its archive is a JVM
   * app, the same on both, and the previous spec installed it on Intel.
   */
  private currentPlan(): DoctorPlan {
    const brew = this.deps.homebrew();
    const arm = this.deps.arch === 'arm64';
    const tools = TOOL_ORDER.map((id): DoctorPlanEntry => {
      const previous = this.setup.plan?.tools.find((entry) => entry.id === id);
      const presence = this.presence(id);
      if (presence !== null) {
        return { id, state: 'present', method: null, detail: presence };
      }
      if (id !== 'maestro' && this.overridden().includes(id)) {
        const variable = id === 'gh' ? 'CONDUCTOR_GH_PATH' : 'CONDUCTOR_ADB_PATH';
        return { id, state: 'unavailable', method: null, detail: `${variable} is set` };
      }
      const method: DoctorInstallMethod =
        id === 'java' || id === 'maestro' || brew === null || this.directNext.has(id)
          ? 'direct'
          : previous?.method === 'direct'
            ? 'direct'
            : 'homebrew';
      if (method === 'direct' && !arm && id !== 'maestro') {
        return { id, state: 'unavailable', method: null, detail: INTEL_DETAIL };
      }
      if (previous?.state === 'skipped') {
        return previous;
      }
      return {
        id,
        state: 'install',
        method,
        detail: method === 'homebrew' ? 'Will install with Homebrew' : 'Will download',
      };
    });
    const profile = profileFileFor(this.deps.env.SHELL);
    return {
      tools,
      homebrew: brew,
      androidTermsRequired: tools.some((entry) => entry.id === 'adb' && entry.state === 'install'),
      profile: profile === null ? null : `~/${profile}`,
    };
  }

  /** The row's detail when the tool is present, else null. Criterion 7: a
   * Java below 17 is not present; a configured Maestro always is. */
  private presence(id: ToolId): string | null {
    if (id === 'maestro') {
      if (this.deps.maestroOverride !== '') {
        return this.rowOf('maestro')?.detail ?? this.deps.maestroOverride;
      }
      if (this.maestroByFiles() !== 'present') {
        return null;
      }
      return this.rowOf('maestro')?.detail ?? managedMaestroBinary(this.deps.managedDir);
    }
    const row = this.rowOf(id);
    if (row !== undefined) {
      return row.status === 'ok' ? row.detail : null;
    }
    return this.presentByFiles(id) ? managedLauncher(this.deps.home, id) : null;
  }

  /** The tools the person configured a path for (criteria 10, 42). */
  private overridden(): readonly ToolId[] {
    const { maestroOverride, ghOverride, adbOverride } = this.deps;
    return TOOL_ORDER.filter(
      (tool) =>
        (tool === 'maestro' && maestroOverride !== '') ||
        (tool === 'gh' && ghOverride !== '') ||
        (tool === 'adb' && adbOverride !== ''),
    );
  }

  private rowOf(id: DoctorRowId): DoctorRow | undefined {
    return this.report?.rows.find((entry) => entry.id === id);
  }

  private maestroByFiles(): 'present' | 'update' | 'missing' {
    if (this.deps.maestroOverride !== '') {
      return 'present';
    }
    const marker = this.readMarker();
    const whole =
      marker !== null && this.deps.isExecutable(managedMaestroBinary(this.deps.managedDir));
    if (!whole) {
      return 'missing';
    }
    return marker === this.deps.pinnedVersion ? 'present' : 'update';
  }

  /** Criterion 2's file probe per tool — the ladder's executables, no process. */
  private presentByFiles(tool: DirectToolId): boolean {
    switch (tool) {
      case 'gh':
        return this.deps.resolveGh() !== null;
      case 'adb':
        return this.deps.resolveAdb() !== null;
      case 'java': {
        if (this.deps.hidden.has('java')) {
          return false;
        }
        const { env, home, isExecutable, jvmRoots } = this.deps;
        if (isExecutable(managedJavaBinary(home))) {
          return true;
        }
        if (env.JAVA_HOME !== undefined && env.JAVA_HOME !== '') {
          if (isExecutable(join(env.JAVA_HOME, 'bin', 'java'))) {
            return true;
          }
        }
        return jvmRoots.some((root) =>
          listDir(root).some((entry) =>
            isExecutable(join(root, entry, 'Contents', 'Home', 'bin', 'java')),
          ),
        );
      }
    }
  }

  /* ── Skips ─────────────────────────────────────────────────────────── */

  private pinOf(tool: ToolId): string {
    const { pins, pinnedVersion } = this.deps;
    switch (tool) {
      case 'maestro':
        return pinnedVersion;
      case 'java':
        return pins.zuluVersion;
      case 'gh':
        return pins.ghVersion;
      case 'adb':
        return pins.platformToolsVersion;
    }
  }

  private skipped(tool: ToolId): boolean {
    return this.skips.at[tool] !== undefined && this.skips.pins[tool] === this.pinOf(tool);
  }

  private recordSkip(tool: ToolId): void {
    this.skips = {
      at: { ...this.skips.at, [tool]: new Date(this.now()).toISOString() },
      pins: { ...this.skips.pins, [tool]: this.pinOf(tool) },
    };
    this.writeSkips();
  }

  private clearSkip(tool: ToolId): void {
    if (this.skips.at[tool] === undefined) {
      return;
    }
    const at = { ...this.skips.at };
    const pins = { ...this.skips.pins };
    delete at[tool];
    delete pins[tool];
    this.skips = { at, pins };
    this.writeSkips();
  }

  private readSkips(): Skips {
    if (!this.deps.isFile(this.deps.skipsFile)) {
      return { at: {}, pins: {} };
    }
    try {
      const parsed: unknown = JSON.parse(readFileSync(this.deps.skipsFile, 'utf8'));
      if (typeof parsed !== 'object' || parsed === null) {
        return { at: {}, pins: {} };
      }
      const at: Partial<Record<ToolId, string>> = {};
      const pins: Partial<Record<ToolId, string>> = {};
      const rawPins = (parsed as { pins?: unknown }).pins;
      for (const tool of TOOL_ORDER) {
        const when = (parsed as Record<string, unknown>)[tool];
        if (typeof when === 'string') {
          at[tool] = when;
        }
        const pin =
          typeof rawPins === 'object' && rawPins !== null
            ? (rawPins as Record<string, unknown>)[tool]
            : undefined;
        if (typeof pin === 'string') {
          pins[tool] = pin;
        }
      }
      return { at, pins };
    } catch {
      return { at: {}, pins: {} };
    }
  }

  private writeSkips(): void {
    const file = { ...this.skips.at, pins: this.skips.pins };
    // Best-effort and synchronous — a few bytes, and the next launch reads
    // them; a skip that could not be remembered is one more installer, not
    // a failure to report.
    try {
      writeFileSync(this.deps.skipsFile, `${JSON.stringify(file, null, 2)}\n`, 'utf8');
    } catch (error) {
      console.error('The doctor skips could not be written:', detailOf(error));
    }
  }

  /* ── The check ─────────────────────────────────────────────────────── */

  private runCheck(ids: 'all' | readonly DoctorRowId[]): Promise<void> {
    if (this.checking || this.disposed) {
      return this.checkRunning;
    }
    this.checkRunning = this.doCheck(ids);
    return this.checkRunning;
  }

  private async doCheck(ids: 'all' | readonly DoctorRowId[]): Promise<void> {
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
    } catch (error) {
      // A check that throws is a bug in a resolver, not a row's truth: log it
      // and let the next trigger run, rather than an unhandled rejection.
      console.error('The doctor check failed:', detailOf(error));
    } finally {
      if (!this.disposed) {
        this.checking = false;
        this.checkController = null;
        if (this.planPending && this.report !== null) {
          this.buildPlan();
        } else {
          this.emitChanged();
        }
      }
    }
  }

  /** Criterion 16 — the rows an install or a sign-in changed, re-run after
   * any check in flight rather than lost to coalescing. */
  private async recheck(ids: readonly DoctorRowId[]): Promise<void> {
    await this.checkRunning;
    if (this.disposed) {
      return;
    }
    // Before any report there is nothing to merge into: the whole thing runs.
    await this.runCheck(this.report === null ? 'all' : ids);
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
      this.lastInstallFailure.get('maestro') ?? 'maestro → not installed',
      'not installed',
    );
  }

  private async rowAdb(signal: AbortSignal): Promise<DoctorRow> {
    const adb = this.deps.hidden.has('adb') ? null : this.deps.resolveAdb();
    if (adb === null) {
      return this.notFound(
        'adb',
        this.lastInstallFailure.get('adb') ?? 'adb --version → command not found',
      );
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
      return this.notFound('java', this.lastInstallFailure.get('java') ?? java.detail);
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
    // Criterion 26 — the managed one reads `java 21.0.12.1 · ~/.conductor/tools/java`.
    if (java.managed) {
      const detail = `${version.short} · ~/.conductor/tools/java`;
      return this.row('java', 'ok', 'Ready', detail, version.short);
    }
    return this.row('java', 'ok', 'Ready', `${version.first} · ${java.path}`, version.short);
  }

  /**
   * Criterion 26's ladder: the managed JDK, then `$JAVA_HOME`, then
   * `/usr/libexec/java_home` — which exits 1 to stderr and shows nothing.
   * Never `/usr/bin/java`: on a Mac without a JDK that stub raises the
   * system "No Java runtime present" dialog.
   */
  private async resolveJava(signal: AbortSignal): Promise<JavaResolution> {
    if (this.deps.hidden.has('java')) {
      return { path: null, detail: '/usr/libexec/java_home → hidden by CONDUCTOR_DOCTOR_HIDE' };
    }
    const managed = managedJavaBinary(this.deps.home);
    if (this.deps.isExecutable(managed)) {
      return { path: managed, managed: true };
    }
    const home = this.deps.env.JAVA_HOME;
    if (home !== undefined && home !== '') {
      const candidate = join(home, 'bin', 'java');
      if (this.deps.isExecutable(candidate)) {
        return { path: candidate, managed: false };
      }
    }
    const outcome = await this.exec('/usr/libexec/java_home', [], {
      signal,
      timeout: this.timeouts().check,
    });
    if (outcome.kind === 'ran' && outcome.result.code === 0) {
      const found = firstLine(outcome.result.stdout);
      if (found !== '') {
        return { path: join(found, 'bin', 'java'), managed: false };
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
      return this.notFound(
        'gh',
        this.lastInstallFailure.get('gh') ?? 'gh --version → command not found',
      );
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

  /** §8.1 — installed and authenticated are different failures. Criterion
   * 33 — the first line alone, never a transcript, never a token. */
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

  /* ── The installs ──────────────────────────────────────────────────── */

  /**
   * Criteria 9–10, 16–17: the queue in order, one tool at a time, a
   * failure recorded and passed, the rows rechecked after each, `settled`
   * at the end. Never rejects — `dispose` awaits it.
   */
  private async runInstalls(
    installId: string,
    queue: readonly DoctorPlanEntry[],
    androidTermsAccepted: boolean,
    fromSetup: boolean,
    signal: AbortSignal,
  ): Promise<void> {
    const failed: Partial<Record<ToolId, DoctorInstallFailure>> = {};
    let landedDirect = false;
    try {
      const todo: DoctorPlanEntry[] = [];
      for (const entry of queue) {
        if (entry.id === 'adb' && !androidTermsAccepted) {
          // Criterion 10 — declined terms skip adb and install the rest.
          this.recordSkip('adb');
          this.updatePlanEntry('adb', { state: 'skipped', detail: TERMS_DETAIL });
          this.emitInstall({ kind: 'skipped', installId, tool: 'adb', detail: TERMS_DETAIL });
          // Criterion 16 — a skip settles the row too.
          await this.recheck(['adb']);
          if (this.disposed) {
            return;
          }
          continue;
        }
        todo.push(entry);
      }
      if (todo.length === 0) {
        this.emitChanged();
      }
      for (const entry of todo) {
        if (signal.aborted) {
          return;
        }
        const method = entry.method ?? 'direct';
        try {
          if (entry.id === 'maestro') {
            await this.installMaestro(installId, signal);
          } else if (method === 'homebrew') {
            await this.installWithBrew(entry.id as BrewToolId, installId, signal);
          } else {
            await this.installDirect(entry.id, installId, signal);
            landedDirect = true;
          }
          if (signal.aborted) {
            return;
          }
          this.lastInstallFailure.delete(entry.id);
          this.clearSkip(entry.id);
          this.emitInstall({
            kind: 'done',
            installId,
            tool: entry.id,
            version: this.pinOf(entry.id),
          });
        } catch (error) {
          if (this.disposed || signal.aborted) {
            return;
          }
          const failure =
            error instanceof InstallFailure
              ? error
              : new InstallFailure(ERROR_CODES.doctorExtractFailed, detailOf(error));
          console.error(`${entry.id} install ${installId} failed:`, failure.detail);
          const record = {
            code: failure.code,
            message: failureMessage(failure.code, entry.id),
            detail: failure.detail,
          };
          failed[entry.id] = record;
          this.lastInstallFailure.set(entry.id, failure.detail);
          if (failure.code === ERROR_CODES.doctorBrewFailed && this.deps.arch === 'arm64') {
            // Criterion 15 — the next attempt downloads instead.
            this.directNext.add(entry.id);
            this.updatePlanEntry(entry.id, { method: 'direct', detail: 'Will download' });
          }
          this.emitInstall({ kind: 'failed', installId, tool: entry.id, ...record });
        }
        // Criterion 16 — that tool's row (and the sign-in after gh), before the next.
        await this.recheck(entry.id === 'gh' ? ['gh', 'github-auth'] : [entry.id]);
        if (this.disposed) {
          return;
        }
        this.refreshPlan();
      }
      if (landedDirect) {
        await this.ensureProfile();
      }
      if (this.disposed) {
        return;
      }
      this.install_ = { installId, failed };
      const failedIds = TOOL_ORDER.filter((tool) => failed[tool] !== undefined);
      this.emitInstall({ kind: 'settled', installId, failed: failedIds });
      this.emitChanged();
      if (fromSetup && failedIds.length === 0 && !this.needsSignIn()) {
        // Criterion 17 — the ready state is held, then the app presents itself.
        this.holdThenFinish();
      }
    } finally {
      // Cleanup is best-effort: a job dir that cannot be removed is not a
      // second failure to report, and must never surface as a rejection.
      await rm(this.deps.installDir, { recursive: true, force: true }).catch(() => undefined);
      await rm(this.deps.toolsInstallDir, { recursive: true, force: true }).catch(() => undefined);
      this.installController = null;
    }
  }

  /** Criterion 32 — gh resolves but the sign-in row is not ok. */
  private needsSignIn(): boolean {
    const gh = this.rowOf('gh');
    const auth = this.rowOf('github-auth');
    return gh?.status === 'ok' && auth !== undefined && auth.status !== 'ok';
  }

  private holdThenFinish(): void {
    if (this.readyHold !== null) {
      clearTimeout(this.readyHold);
    }
    this.readyHold = setTimeout(() => {
      this.readyHold = null;
      if (!this.disposed && this.setup.active) {
        this.finishSetup();
      }
    }, this.timeouts().readyHold);
  }

  /** The plan follows the rows after each tool (criterion 16). */
  private refreshPlan(): void {
    if (this.setup.plan === null) {
      this.emitChanged();
      return;
    }
    this.setup = { ...this.setup, plan: this.currentPlan() };
    this.emitChanged();
  }

  private updatePlanEntry(tool: ToolId, patch: Partial<DoctorPlanEntry>): void {
    if (this.setup.plan === null) {
      return;
    }
    const tools = this.setup.plan.tools.map((entry) =>
      entry.id === tool ? { ...entry, ...patch } : entry,
    );
    this.setup = { ...this.setup, plan: { ...this.setup.plan, tools } };
    this.emitChanged();
  }

  /**
   * Criterion 11 — the direct pipeline: download, verify the digest,
   * extract, find the launcher where the layout says (checked, never
   * assumed), mark, rename into `~/.conductor/tools`, link from
   * `~/.conductor/bin`, run the launcher's version command.
   */
  private async installDirect(
    tool: DirectToolId,
    installId: string,
    signal: AbortSignal,
  ): Promise<void> {
    if (this.deps.arch !== 'arm64') {
      throw new InstallFailure(ERROR_CODES.doctorDownloadFailed, INTEL_DETAIL);
    }
    const layout = toolLayout(tool, this.deps.pins);
    const jobDir = join(this.deps.toolsInstallDir, installId, tool);
    // Before the first byte, so the plan screen gives way at once.
    this.progress(installId, tool, 0, layout.downloadStep);
    await mkdir(jobDir, { recursive: true });
    const archive = join(jobDir, layout.archive.fileName);
    await this.download(layout.archive.url, archive, signal, ({ received, total }) => {
      this.progress(installId, tool, pctOf(received, total), layout.downloadStep);
    });

    this.progress(installId, tool, 90, 'Checking the download');
    const expected = await this.expectedDigest(layout, jobDir, signal);
    const actual = await sha256(archive);
    if (actual !== expected) {
      await rm(archive, { force: true });
      throw new InstallFailure(
        ERROR_CODES.doctorChecksumMismatch,
        `sha256 ${actual} ≠ published ${expected}`,
      );
    }

    this.progress(installId, tool, 93, 'Extracting');
    const extractDir = join(jobDir, 'extract');
    await this.extract(layout.archive.kind, archive, extractDir, signal);
    if (signal.aborted) {
      return;
    }
    const root = await locateRoot(extractDir, layout.launcher);
    if (root === null) {
      throw new InstallFailure(
        ERROR_CODES.doctorExtractFailed,
        `${layout.launcher} not found in the archive`,
      );
    }
    await chmod(join(root, layout.launcher), 0o755);
    // The marker lands before the rename (criterion 18).
    await writeFile(join(root, MANAGED_MARKER), layout.version, 'utf8');

    this.progress(installId, tool, 98, 'Verifying installation');
    const tree = join(managedToolsDir(this.deps.home), layout.treeName);
    await mkdir(managedToolsDir(this.deps.home), { recursive: true });
    await this.swapIn(root, tree);
    const link = managedLauncher(this.deps.home, tool);
    await mkdir(managedBinDir(this.deps.home), { recursive: true });
    await relink(link, join(tree, layout.launcher));
    if (layout.javaHome !== null) {
      await relink(managedJavaHome(this.deps.home), join(tree, layout.javaHome));
    }
    await this.verifyLauncher(tool, layout, link, tree, signal);
    this.progress(installId, tool, 100, 'Verifying installation');
  }

  /** The digest to compare against: pinned in `CONFIG`, or the publisher's
   * checksums file downloaded beside the archive (criterion 11). */
  private async expectedDigest(
    layout: ToolLayout,
    jobDir: string,
    signal: AbortSignal,
  ): Promise<string> {
    if (layout.checksum.kind === 'pinned') {
      return layout.checksum.sha256.toLowerCase();
    }
    const file = join(jobDir, layout.checksum.fileName);
    await this.download(layout.checksum.url, file, signal, null);
    const expected = parseChecksum(await readFile(file, 'utf8'), layout.archive.fileName);
    if (expected === null) {
      throw new InstallFailure(
        ERROR_CODES.doctorChecksumMismatch,
        `${layout.archive.fileName} is not listed in ${layout.checksum.fileName}`,
      );
    }
    return expected;
  }

  /** `.zip` through `/usr/bin/unzip -qo`, `.tar.gz` through `/usr/bin/tar
   * -xzf` — no clock but the abort: a 200 MB JDK is not a check. */
  private async extract(
    kind: ToolLayout['archive']['kind'],
    archive: string,
    extractDir: string,
    signal: AbortSignal,
  ): Promise<void> {
    await mkdir(extractDir, { recursive: true });
    const outcome =
      kind === 'zip'
        ? await this.exec('/usr/bin/unzip', ['-qo', archive, '-d', extractDir], {
            signal,
            timeout: Number.POSITIVE_INFINITY,
          })
        : await this.exec('/usr/bin/tar', ['-xzf', archive, '-C', extractDir], {
            signal,
            timeout: Number.POSITIVE_INFINITY,
          });
    if (outcome.kind === 'aborted') {
      return;
    }
    const name = kind === 'zip' ? 'unzip' : 'tar';
    if (outcome.kind !== 'ran') {
      throw new InstallFailure(ERROR_CODES.doctorExtractFailed, this.outcomeText(outcome));
    }
    if (outcome.result.code !== 0) {
      throw new InstallFailure(
        ERROR_CODES.doctorExtractFailed,
        firstLine(outcome.result.stderr) || `${name} exited ${outcome.result.code}`,
      );
    }
  }

  /** The verify step through the link, as the ladders will run it. A tree
   * that answers wrong is removed with its links — left in place it would
   * resolve as installed over the failure. */
  private async verifyLauncher(
    tool: DirectToolId,
    layout: ToolLayout,
    link: string,
    tree: string,
    signal: AbortSignal,
  ): Promise<void> {
    const outcome = await this.exec(link, layout.versionArgs, {
      signal,
      timeout: this.timeouts().verify,
    });
    if (outcome.kind === 'aborted') {
      return;
    }
    const command = `${tool} ${layout.versionArgs.join(' ')}`;
    let detail: string | null = null;
    if (outcome.kind === 'timeout') {
      detail = `${command} → no answer after ${this.seconds(this.timeouts().verify)}`;
    } else if (outcome.kind !== 'ran') {
      detail = `${command} → ${this.outcomeText(outcome)}`;
    } else if (
      outcome.result.code !== 0 ||
      !layout.versionMatches(outcome.result.stdout, outcome.result.stderr)
    ) {
      const printed = firstLine(outcome.result.stdout) || firstLine(outcome.result.stderr);
      detail = `${command} → ${printed || `exited ${outcome.result.code}`}`;
    }
    if (detail !== null) {
      await rm(link, { force: true });
      if (layout.javaHome !== null) {
        await rm(managedJavaHome(this.deps.home), { force: true });
      }
      await rm(tree, { recursive: true, force: true });
      throw new InstallFailure(ERROR_CODES.doctorVerifyFailed, detail);
    }
  }

  /**
   * Criterion 12 — `brew install`, non-interactive, streamed; a child silent
   * for ten minutes is killed. Exit 0 is not enough: the tool must then
   * resolve on its own ladder.
   */
  private installWithBrew(tool: BrewToolId, installId: string, signal: AbortSignal): Promise<void> {
    const brew = this.deps.homebrew();
    if (brew === null) {
      return Promise.reject(
        new InstallFailure(ERROR_CODES.doctorBrewFailed, 'brew → command not found'),
      );
    }
    this.progress(installId, tool, null, brewStep(tool));
    return new Promise<void>((resolve, reject) => {
      const child = this.deps.spawn(brew, brewInstallArgs(tool), {
        env: brewEnv(brew, this.deps.env),
      });
      let stderr = '';
      let silent = false;
      let timer: ReturnType<typeof setTimeout> | null = null;
      const arm = (): void => {
        if (timer !== null) {
          clearTimeout(timer);
        }
        timer = setTimeout(() => {
          silent = true;
          child.kill();
        }, this.timeouts().brewSilence);
      };
      const onAbort = (): void => {
        child.kill();
      };
      signal.addEventListener('abort', onAbort, { once: true });
      child.onStdout(() => {
        arm();
      });
      child.onStderr((chunk) => {
        stderr = tail(stderr + chunk);
        arm();
      });
      child.onExit((reason) => {
        if (timer !== null) {
          clearTimeout(timer);
        }
        signal.removeEventListener('abort', onAbort);
        if (signal.aborted) {
          resolve();
          return;
        }
        if (silent) {
          reject(
            new InstallFailure(
              ERROR_CODES.doctorBrewFailed,
              `brew printed nothing for ${Math.round(this.timeouts().brewSilence / 60_000)} minutes`,
            ),
          );
          return;
        }
        if (reason.error !== null) {
          reject(new InstallFailure(ERROR_CODES.doctorBrewFailed, reason.error.message));
          return;
        }
        if (reason.code !== 0) {
          reject(
            new InstallFailure(
              ERROR_CODES.doctorBrewFailed,
              brewFailureDetail(stderr, reason.code),
            ),
          );
          return;
        }
        const resolved = tool === 'gh' ? this.deps.resolveGh() : this.deps.resolveAdb();
        if (resolved === null) {
          reject(
            new InstallFailure(
              ERROR_CODES.doctorVerifyFailed,
              `${tool} → not found after brew install`,
            ),
          );
          return;
        }
        resolve();
      });
      arm();
    });
  }

  /** Criteria 19–20 — the marked block, once, in the profile of the
   * person's shell; no file for a shell Conductor does not write. */
  private async ensureProfile(): Promise<void> {
    const file = profileFileFor(this.deps.env.SHELL);
    if (file === null) {
      return;
    }
    const path = join(this.deps.home, file);
    let existing: string | null = null;
    try {
      existing = await readFile(path, 'utf8');
    } catch (error) {
      if (!isEnoent(error)) {
        console.error(`The shell profile ${path} could not be read:`, detailOf(error));
        return;
      }
    }
    const { content, changed } = upsertProfileBlock(existing);
    if (!changed) {
      return;
    }
    try {
      await writeFile(path, content, 'utf8');
    } catch (error) {
      console.error(`The shell profile ${path} could not be written:`, detailOf(error));
    }
  }

  /* ── Maestro's own pipeline ────────────────────────────────────────── */

  private async installMaestro(installId: string, signal: AbortSignal): Promise<void> {
    const { pinnedVersion, releaseUrl } = this.deps;
    const jobDir = join(this.deps.installDir, installId);
    const base = `${releaseUrl}/cli-${pinnedVersion}`;
    await mkdir(jobDir, { recursive: true });

    // Criterion 12 — streamed to disk, progress by bytes, 0–90.
    const archive = join(jobDir, 'maestro.zip');
    const downloading = `Downloading maestro ${pinnedVersion}`;
    this.progress(installId, 'maestro', 0, downloading);
    await this.download(`${base}/maestro.zip`, archive, signal, ({ received, total }) => {
      this.progress(installId, 'maestro', pctOf(received, total), downloading);
    });

    this.progress(installId, 'maestro', 90, 'Checking the download');
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

    this.progress(installId, 'maestro', 93, 'Extracting');
    const extractDir = join(jobDir, 'extract');
    await this.extract('zip', archive, extractDir, signal);
    if (signal.aborted) {
      return;
    }
    const root = await locateRoot(extractDir, join('bin', 'maestro'));
    if (root === null) {
      throw new InstallFailure(
        ERROR_CODES.doctorExtractFailed,
        'bin/maestro not found in the archive',
      );
    }
    await chmod(join(root, 'bin', 'maestro'), 0o755);
    // The marker lands before the rename (criterion 18).
    await writeFile(join(root, MANAGED_MARKER), pinnedVersion, 'utf8');

    this.progress(installId, 'maestro', 98, 'Verifying installation');
    await this.swapIn(root, this.deps.managedDir);

    // Only when a JDK resolves: without one the install still completes,
    // and the Java row carries that truth.
    const java = await this.resolveJava(signal);
    if (java.path !== null) {
      await this.verifyMaestro(signal, java.managed);
    }
    this.progress(installId, 'maestro', 100, 'Verifying installation');
  }

  /**
   * The swap: the previous tree moves aside, the new one moves in, and only
   * then is the old one removed — so a rename that fails (a permission, a
   * cross-device move) leaves the tree that was working, restored, rather
   * than a gutted directory behind an `extract-failed`.
   */
  private async swapIn(root: string, target: string): Promise<void> {
    const aside = `${target}.old`;
    await rm(aside, { recursive: true, force: true });
    let hadPrevious = true;
    try {
      await rename(target, aside);
    } catch (error) {
      if (!isEnoent(error)) {
        throw error;
      }
      hadPrevious = false;
    }
    try {
      await rename(root, target);
    } catch (error) {
      if (hadPrevious) {
        await rename(aside, target).catch(() => undefined);
      }
      throw error;
    }
    await rm(aside, { recursive: true, force: true });
  }

  /** The verify step: the managed launcher must print the pin. A copy that
   * does not is removed — the failure detail is the row's truth, and a copy
   * left in place would resolve as installed over it. Criterion 22 — the
   * managed JDK reaches Maestro as `JAVA_HOME`. */
  private async verifyMaestro(signal: AbortSignal, managedJava: boolean): Promise<void> {
    const { managedDir, pinnedVersion } = this.deps;
    const outcome = await this.exec(managedMaestroBinary(managedDir), ['--version'], {
      signal,
      timeout: this.timeouts().verify,
      // §12.10 on every maestro process; no `--no-reinstall-driver` — this
      // touches no device.
      env: {
        ...this.deps.env,
        MAESTRO_CLI_NO_ANALYTICS: '1',
        ...(managedJava ? { JAVA_HOME: managedJavaHome(this.deps.home) } : {}),
      },
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
  private progress(installId: string, tool: ToolId, pct: number | null, step: string): void {
    const current = this.install_;
    if (
      current !== null &&
      'pct' in current &&
      current.installId === installId &&
      current.tool === tool &&
      current.pct === pct &&
      current.step === step
    ) {
      return;
    }
    const started = current === null || !('pct' in current) || current.tool !== tool;
    this.install_ = { installId, tool, pct, step };
    if (started) {
      this.emitChanged();
    }
    this.emitInstall({ kind: 'progress', installId, tool, pct, step });
  }

  private finishSetup(): void {
    this.setup = { active: false, reason: null, plan: null };
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

  private emitLogin(event: DoctorLoginEvent): void {
    this.deps.emitLoginEvent({ ok: true, data: event });
  }
}

/** Bytes to the 0–90 of the download phase (criterion 11). */
function pctOf(received: number, total: number | null): number {
  return total === null || total <= 0 ? 0 : Math.min(90, Math.floor((received / total) * 90));
}

/** The launcher at the extracted root, or one directory down — every
 * archive here carries a single top-level directory (appendix). */
async function locateRoot(extractDir: string, launcher: string): Promise<string | null> {
  if (await isRegularFile(join(extractDir, launcher))) {
    return extractDir;
  }
  for (const entry of await readdir(extractDir, { withFileTypes: true })) {
    if (entry.isDirectory() && (await isRegularFile(join(extractDir, entry.name, launcher)))) {
      return join(extractDir, entry.name);
    }
  }
  return null;
}

/** The symlink, replaced whole — never edited in place. */
async function relink(link: string, target: string): Promise<void> {
  try {
    await lstat(link);
    await rm(link, { recursive: true, force: true });
  } catch (error) {
    if (!isEnoent(error)) {
      throw error;
    }
  }
  await symlink(target, link);
}

function listDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

async function isRegularFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/** Streamed, never buffered — the archives are 15–315 MB. */
async function sha256(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}

/** The last 4 KB of a child's output — enough for the code and the last
 * error line, never a transcript. */
function tail(text: string): string {
  return text.length > 4096 ? text.slice(-4096) : text;
}

function lastLine(text: string): string {
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '');
  return lines.at(-1)?.trim() ?? '';
}

function isEnoent(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'ENOENT'
  );
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

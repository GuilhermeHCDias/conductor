import { access, mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ERROR_CODES, type ErrorCode, type Result } from '@shared/ipc';
import type { RunEvent, RunOutcome } from '@shared/types';
import {
  type FlowRun,
  type MaestroGateway,
  RecordingFailedError,
  type RecordingSession,
  type RunProgress,
} from '../maestro/MaestroGateway';
import type { ExitReason } from '../process/run';

/**
 * The run lifecycle: materialise the in-memory flow to a temp file, spawn it
 * through `MaestroGateway.runFlow`, fan what happens to the window as
 * `run:event` pushes, and hold §4.3.2's exclusion — the CLI and our `maestro
 * mcp` child never touch the device at the same time, in either direction.
 *
 * One run at a time, per window (criterion 4). The verdict always derives
 * from the process exit — kill, code, or failure to start — never from the
 * parsed decoration (criterion 7).
 *
 * Beside every run, a recording (recording criteria 1–22): started through
 * the Gateway before the spawn, kept when the run failed with a step on
 * record and discarded otherwise, saved into the person's Movies folder, and
 * reported as the one event that may follow the terminal one.
 */

/** The slice of `SnapshotService` this service coordinates with. An interface
 * rather than the class, so the lifecycle tests drive it with a fake. */
export type SnapshotGate = {
  /** Resolves once no capture is talking to the device (criterion 12). */
  suspend: () => Promise<void>;
  resume: () => void;
};

export type RunServiceDeps = {
  readonly gateway: MaestroGateway;
  readonly snapshots: SnapshotGate;
  /** Pushes one run event at the window. */
  readonly emit: (payload: Result<RunEvent>) => void;
  /** Where run temp files live — inside the app's user-data area, never the
   * repo: the run executes a snapshot of memory, not the document (§8.2). */
  readonly runsDir: string;
  /** The person's videos folder — Electron's `app.getPath('videos')`, which
   * is `~/Movies` on macOS. A failed run's recording lands in a subfolder
   * of it (recording criterion 8). */
  readonly videosDir: string;
  /**
   * `shell.openPath`, injected the way `openExternal` is into
   * `PublishService`: answers `''` when the OS opened the file, its own
   * message otherwise. Only ever called with a path this service wrote.
   */
  readonly openPath: (path: string) => Promise<string>;
};

/** The subfolder of Movies, so Conductor's files do not mix with the person's. */
export const RECORDINGS_FOLDER = 'Conductor';

type ActiveRun = {
  readonly runId: string;
  readonly flowPath: string;
  /** The open flow's identity, `null` when it was never saved — what the
   * video is named after (recording criterion 10). */
  readonly flowIdentity: string | null;
  /** Local wall-clock start, the file name's timestamp. */
  readonly startedAt: number;
  run: FlowRun | null;
  /** Criterion 9: set before the kill, so the exit reads as `canceled` no
   * matter what code the dying JVM leaves behind. */
  canceled: boolean;
  /** The recorder beside this run, or `null` when it could not start — in
   * which case `recordingFailure` says why (recording criterion 4). */
  recording: RecordingSession | null;
  recordingFailure: string | null;
  /** Set once `dispose` cut the recorder, so a second pass cuts nothing twice. */
  recordingCut: boolean;
  /** Any step on record — a verdict without its start still counts. */
  stepsSeen: number;
  lastStepStartedAt: number | null;
  /** When the step that failed began, for criterion 13's offset. */
  failedStepStartedAt: number | null;
};

export class RunService {
  private readonly deps: RunServiceDeps;
  private active: ActiveRun | null = null;
  /** Monotonic, so a run id is never reused within a session — a late event
   * from a dead run must never wear a live one's id. */
  private nextRun = 1;
  private disposed = false;
  /** Recording criterion 17's registry: the video main saved for each run,
   * and the only paths `openRecording` will ever open. */
  private readonly savedRecordings = new Map<string, string>();
  /**
   * Every recording still settling — a save in flight while the next run
   * begins (recording criterion 22), a discard behind a pass or a refused
   * spawn — so `dispose` can cut each one and wait for it (criterion 21).
   */
  private readonly settling = new Set<{ session: RecordingSession; done: Promise<void> }>();
  /** A start between its first await and its answer, so `dispose` can wait
   * for it to notice the quit rather than race it (recording criterion 21). */
  private starting: Promise<unknown> | null = null;

  constructor(deps: RunServiceDeps) {
    this.deps = deps;
  }

  /**
   * Criterion 1. Everything before the spawn is deliberate: the active slot is
   * taken synchronously (two clicks race on the await otherwise), captures are
   * waited out (criterion 12), the flow is written atomically, the recorder is
   * started (recording criterion 1) — and then the answer leaves immediately.
   * Completion is nobody's to await (§12.16's spirit: long work is streamed,
   * never awaited in a handler).
   */
  async start(
    deviceId: string,
    yaml: string,
    flowIdentity: string | null,
  ): Promise<Result<{ runId: string }>> {
    if (this.disposed) {
      return refuse(ERROR_CODES.runActive, 'Conductor is shutting down.');
    }
    if (this.active !== null) {
      return refuse(
        ERROR_CODES.runActive,
        'A flow is already running. Stop it before starting another.',
      );
    }

    const runId = `run-${this.nextRun}`;
    this.nextRun += 1;
    const active: ActiveRun = {
      runId,
      flowPath: join(this.deps.runsDir, `${runId}.yaml`),
      flowIdentity,
      startedAt: Date.now(),
      run: null,
      canceled: false,
      recording: null,
      recordingFailure: null,
      recordingCut: false,
      stepsSeen: 0,
      lastStepStartedAt: null,
      failedStepStartedAt: null,
    };
    this.active = active;

    const launching = this.launch(active, deviceId, yaml);
    this.starting = launching;
    try {
      return await launching;
    } finally {
      this.starting = null;
    }
  }

  /**
   * The awaits between the slot and the spawn, each followed by a look at
   * `disposed`: a quit that lands mid-start must find the attempt refused,
   * nothing spawned and no recorder left running (recording criterion 21) —
   * the post-await check is what keeps a recorder from coming up under a
   * quit that already resolved.
   */
  private async launch(
    active: ActiveRun,
    deviceId: string,
    yaml: string,
  ): Promise<Result<{ runId: string }>> {
    try {
      await this.deps.snapshots.suspend();
      this.ensureLive();
      await writeFlow(active.flowPath, yaml);
      this.ensureLive();
      await this.startRecording(active, deviceId);
      this.ensureLive();
      active.run = this.deps.gateway.runFlow(deviceId, active.flowPath, {
        onProgress: (progress) => {
          this.forward(active, progress);
        },
        onExit: (reason) => {
          this.settle(active, reason);
        },
      });
    } catch (error) {
      // A start that never became a run leaves nothing behind: no suspension,
      // no file, no recorder, no events — and the next click starts clean.
      // The removal is awaited because the refusal is the whole answer: when
      // it lands, nothing of this attempt may still be settling. The recorder
      // is dropped first and synchronously, so a `dispose` waiting on this
      // start finds its discard in the registry.
      this.active = null;
      this.deps.snapshots.resume();
      if (active.recording !== null) {
        if (this.disposed) {
          active.recording.abort();
        }
        this.track(active.recording, active.recording.discard());
      }
      await removeFlow(active.flowPath);
      return refuse(codeOf(error), messageOf(error));
    }

    this.emit({ type: 'started', runId: active.runId });
    return { ok: true, data: { runId: active.runId } };
  }

  /** Criterion 9. Kill the tree now; the terminal event arrives when the exit
   * does. A cancel naming a run this service does not hold is refused and
   * emits nothing — it may have finished a frame ago, and that is a state,
   * not a bug. */
  cancel(runId: string): Result<{ runId: string }> {
    const active = this.active;
    if (active === null || active.runId !== runId || active.run === null) {
      return refuse(ERROR_CODES.runNotFound, `There is no active run ${runId}.`);
    }
    active.canceled = true;
    active.run.kill();
    return { ok: true, data: { runId } };
  }

  /**
   * Recording criteria 17–19. Opens the video this service saved for the run
   * — never a path from the renderer, which only ever sends the id. The file
   * may have been moved or deleted since; the OS may decline; each is its own
   * stable code, and nothing opens in either case.
   */
  async openRecording(runId: string): Promise<Result<{ runId: string }>> {
    const path = this.savedRecordings.get(runId);
    if (path === undefined) {
      return refuse(
        ERROR_CODES.runRecordingMissing,
        'The video is no longer in your Movies folder.',
      );
    }
    try {
      await access(path);
    } catch {
      return refuse(
        ERROR_CODES.runRecordingMissing,
        'The video is no longer in your Movies folder.',
      );
    }
    const problem = await this.deps.openPath(path);
    if (problem !== '') {
      return refuse(ERROR_CODES.runRecordingOpenFailed, problem);
    }
    return { ok: true, data: { runId } };
  }

  /**
   * Criterion 10 — no orphaned JVM survives `before-quit`; recording
   * criterion 21 — no `adb shell screenrecord` child and no `.partial` either.
   * The live recorder is cut at once and its device-side file removed; a save
   * in flight is cut short, and the disposal waits for both.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    // Synchronously first: the kill and the abort must not wait on anything.
    this.cutActive();
    // A start mid-flight sees the flag at its next await and refuses itself,
    // parking its recorder's discard in the registry cut below.
    await this.starting;
    this.cutActive();
    const pending: Promise<void>[] = [];
    for (const entry of this.settling) {
      entry.session.abort();
      pending.push(entry.done);
    }
    await Promise.allSettled(pending);
  }

  /** Kills the live run and cuts its recorder, idempotently. */
  private cutActive(): void {
    const active = this.active;
    if (active?.run != null) {
      active.canceled = true;
      active.run.kill();
    }
    if (active?.recording != null && !active.recordingCut) {
      active.recordingCut = true;
      active.recording.abort();
      this.track(active.recording, active.recording.discard());
    }
  }

  /** Throws the refusal a quit earns, so `launch`'s catch cleans up. */
  private ensureLive(): void {
    if (this.disposed) {
      throw coded(ERROR_CODES.runActive, 'Conductor is shutting down.');
    }
  }

  /** Holds a settling recording until it is done, so `dispose` can find it. */
  private track(session: RecordingSession, done: Promise<void>): Promise<void> {
    const entry = { session, done: done.catch(() => {}) };
    this.settling.add(entry);
    void entry.done.finally(() => {
      this.settling.delete(entry);
    });
    return entry.done;
  }

  /**
   * Recording criteria 1 and 4. The recorder starts before the spawn and
   * never stops the run: a recorder that cannot start is logged, and its
   * cause kept for the run to report should it fail (criterion 15).
   */
  private async startRecording(active: ActiveRun, deviceId: string): Promise<void> {
    try {
      active.recording = await this.deps.gateway.startRecording(deviceId, active.runId);
    } catch (error) {
      active.recordingFailure = messageOf(error);
      console.warn(`Run ${active.runId} is not recorded:`, active.recordingFailure);
    }
  }

  private forward(active: ActiveRun, progress: RunProgress): void {
    if (this.active !== active) {
      return;
    }
    if (progress.type !== 'log') {
      active.stepsSeen += 1;
      if (progress.type === 'step-started') {
        active.lastStepStartedAt = Date.now();
      } else if (progress.type === 'step-failed') {
        active.failedStepStartedAt = active.lastStepStartedAt;
      }
    }
    this.emit(
      progress.type === 'log'
        ? { type: 'log', runId: active.runId, lines: progress.lines }
        : { type: progress.type, runId: active.runId, label: progress.label },
    );
  }

  /**
   * The one exit, whatever it was. Resume comes first — the end-of-run
   * recapture (criterion 13) rides on the terminal event, and it must find
   * the gate already open. The terminal event goes out the moment the exit
   * is known (recording criterion 6); the recording follows on its own.
   */
  private settle(active: ActiveRun, reason: ExitReason): void {
    if (this.active !== active) {
      return;
    }
    this.active = null;
    this.deps.snapshots.resume();
    void removeFlow(active.flowPath);
    const outcome = outcomeOf(active, reason);
    // Recording criteria 7–9: kept only by a failure or an error with a step
    // on record — a run that never reached a step recorded nothing worth
    // watching.
    const keep = (outcome === 'failed' || outcome === 'error') && active.stepsSeen > 0;
    const saving = keep && active.recording !== null;
    this.emit({
      type: 'finished',
      runId: active.runId,
      outcome,
      message: settleMessage(active, reason),
      recording: saving ? 'pending' : 'none',
    });
    void this.settleRecording(active, keep);
  }

  /** Recording criteria 7–9, 13–15: what becomes of the video, and the one
   * event that says so — pushed only for a run that would have kept it. */
  private async settleRecording(active: ActiveRun, keep: boolean): Promise<void> {
    const session = active.recording;
    if (session === null) {
      if (keep && active.recordingFailure !== null) {
        this.emitRecordingFailure(active, 'record', active.recordingFailure);
      }
      return;
    }
    if (!keep) {
      await this.track(session, session.discard());
      return;
    }
    await this.track(session, this.saveRecording(active, session));
  }

  /**
   * Recording criteria 8, 10, 11, 13, 14. Into `<videos>/Conductor/`, made
   * if missing, under a `.partial` name until the pull is whole (§8.2's
   * idiom), never over an existing file — and then the one event, with the
   * name and where in the video the failed step begins.
   */
  private async saveRecording(active: ActiveRun, session: RecordingSession): Promise<void> {
    const folder = join(this.deps.videosDir, RECORDINGS_FOLDER);
    let partial: string | null = null;
    try {
      await mkdir(folder, { recursive: true });
      const fileName = await reserveName(
        folder,
        `${flowSlug(active.flowIdentity)}-${localTimestamp(active.startedAt)}`,
      );
      const path = join(folder, fileName);
      partial = `${path}.partial`;
      const { stoppedAt } = await session.save(partial);
      await rename(partial, path);
      partial = null;
      this.savedRecordings.set(active.runId, path);
      this.emit({
        type: 'recording',
        runId: active.runId,
        ok: true,
        fileName,
        fromSeconds: fromSeconds(active, session.startedAt, stoppedAt),
      });
    } catch (error) {
      if (partial !== null) {
        await rm(partial, { force: true }).catch(() => {});
      }
      this.emitRecordingFailure(
        active,
        error instanceof RecordingFailedError ? error.phase : 'save',
        messageOf(error),
      );
    }
  }

  /** Criteria 14 and 15's two sentences, the reason in the OS's or adb's own
   * words (spec constraint) — one full stop, whichever way the reason ends. */
  private emitRecordingFailure(active: ActiveRun, phase: 'record' | 'save', reason: string): void {
    const detail = reason.trim().replace(/\.$/, '');
    this.emit({
      type: 'recording',
      runId: active.runId,
      ok: false,
      message:
        phase === 'record'
          ? `This run wasn't recorded: ${detail}.`
          : `The recording couldn't be saved to your Movies folder: ${detail}.`,
    });
  }

  private emit(event: RunEvent): void {
    this.deps.emit({ ok: true, data: event });
  }
}

/** Criterion 7 — the verdict, from the exit alone. */
function outcomeOf(active: ActiveRun, reason: ExitReason): RunOutcome {
  if (active.canceled) {
    return 'canceled';
  }
  if (reason.error !== null) {
    return 'error';
  }
  if (reason.code === 0) {
    return 'passed';
  }
  if (reason.code === null) {
    // Died to a signal this service did not send.
    return 'error';
  }
  return 'failed';
}

function settleMessage(active: ActiveRun, reason: ExitReason): string | null {
  if (active.canceled) {
    return null;
  }
  if (reason.error !== null) {
    return reason.error.message;
  }
  if (reason.code === null) {
    return 'The run was interrupted before it finished.';
  }
  if (reason.code === 0) {
    return null;
  }
  return `Maestro exited with code ${reason.code}.`;
}

/**
 * Recording criterion 13: whole seconds, floored, from the recorder's start
 * to the moment the failed step began — `null` when no step failed on record,
 * or when the recorder had already stopped by then (criterion 3's cap). The
 * floor is honest: the recorder needs a beat after its spawn before the
 * first frame, so sub-second precision would be a claim, not a measurement.
 */
function fromSeconds(
  active: ActiveRun,
  recorderStartedAt: number,
  stoppedAt: number,
): number | null {
  const failedAt = active.failedStepStartedAt;
  if (failedAt === null || failedAt > stoppedAt) {
    return null;
  }
  return Math.max(0, Math.floor((failedAt - recorderStartedAt) / 1000));
}

/**
 * Recording criterion 10: the path relative to `conductor/` without its
 * extension, `/` as `-`, everything outside `[A-Za-z0-9._-]` as `-`; `flow`
 * when nothing was open — or when nothing survives the cleaning.
 */
function flowSlug(identity: string | null): string {
  if (identity === null) {
    return 'flow';
  }
  const slug = identity
    .replace(/\.[^./]*$/, '')
    .replace(/\//g, '-')
    .replace(/[^A-Za-z0-9._-]/g, '-');
  return slug === '' ? 'flow' : slug;
}

/** `YYYY-MM-DD-HHmmss`, in local time — the person's own clock. */
function localTimestamp(at: number): string {
  const date = new Date(at);
  const pad = (value: number): string => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  return `${day}-${time}`;
}

/** Recording criterion 10 — never over an existing file: `-2`, `-3`… */
async function reserveName(folder: string, base: string): Promise<string> {
  for (let attempt = 1; ; attempt += 1) {
    const name = attempt === 1 ? `${base}.mp4` : `${base}-${attempt}.mp4`;
    if (!(await exists(join(folder, name)))) {
      return name;
    }
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * §8.2's atomic write: temp name, then rename. The `maestro test` child reads
 * this exact file, and a write interrupted halfway must never hand it half a
 * YAML. The rename also makes a crash's leftover harmless — the next run of
 * the same name simply lands over it (criterion 5).
 */
async function writeFlow(path: string, yaml: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const partial = `${path}.partial`;
  await writeFile(partial, yaml, 'utf8');
  await rename(partial, path);
}

/** Best-effort, any outcome: a temp file is never worth failing a settle over. */
async function removeFlow(path: string): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // A leftover cannot break the next run — names are per-session monotonic
    // and the atomic write above lands over whatever a crash left.
  }
}

function refuse(code: ErrorCode, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

/** An error carrying one of our stable codes, for `codeOf` to read back. */
function coded(code: ErrorCode, message: string): Error {
  return Object.assign(new Error(message), { code });
}

/** Codes that are actually ours. `fs` errors carry a `code` too — `EEXIST`,
 * `ENOTDIR` — and an errno crossing the boundary as a stable code would be a
 * contract the renderer cannot read. */
const KNOWN_CODES = new Set<string>(Object.values(ERROR_CODES));

/** The thrower's own stable code — `CliRunner`'s resolver error carries one —
 * with `run/start-failed` as the honest fallback for everything else. */
function codeOf(error: unknown): ErrorCode {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    KNOWN_CODES.has(error.code)
    ? (error.code as ErrorCode)
    : ERROR_CODES.runStartFailed;
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'The run could not be started.';
}

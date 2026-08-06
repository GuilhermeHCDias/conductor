import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { ERROR_CODES, type ErrorCode, type Result } from '@shared/ipc';
import type { RunEvent, RunOutcome } from '@shared/types';
import type { FlowRun, MaestroGateway, RunProgress } from '../maestro/MaestroGateway';
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
};

type ActiveRun = {
  readonly runId: string;
  readonly flowPath: string;
  run: FlowRun | null;
  /** Criterion 9: set before the kill, so the exit reads as `canceled` no
   * matter what code the dying JVM leaves behind. */
  canceled: boolean;
};

export class RunService {
  private readonly deps: RunServiceDeps;
  private active: ActiveRun | null = null;
  /** Monotonic, so a run id is never reused within a session — a late event
   * from a dead run must never wear a live one's id. */
  private nextRun = 1;
  private disposed = false;

  constructor(deps: RunServiceDeps) {
    this.deps = deps;
  }

  /**
   * Criterion 1. Everything before the spawn is deliberate: the active slot is
   * taken synchronously (two clicks race on the await otherwise), captures are
   * waited out (criterion 12), the flow is written atomically — and then the
   * answer leaves immediately. Completion is nobody's to await (§12.16's
   * spirit: long work is streamed, never awaited in a handler).
   */
  async start(deviceId: string, yaml: string): Promise<Result<{ runId: string }>> {
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
      run: null,
      canceled: false,
    };
    this.active = active;

    try {
      await this.deps.snapshots.suspend();
      await writeFlow(active.flowPath, yaml);
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
      // no file, no events — and the next click starts clean. The removal is
      // awaited because the refusal is the whole answer: when it lands,
      // nothing of this attempt may still be settling.
      this.active = null;
      this.deps.snapshots.resume();
      await removeFlow(active.flowPath);
      return refuse(codeOf(error), messageOf(error));
    }

    if (this.disposed) {
      // `before-quit` fired while the awaits above were settling.
      active.canceled = true;
      active.run.kill();
    }

    this.emit({ type: 'started', runId });
    return { ok: true, data: { runId } };
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

  /** Criterion 10 — no orphaned JVM survives `before-quit`. */
  dispose(): void {
    this.disposed = true;
    if (this.active?.run != null) {
      this.active.canceled = true;
      this.active.run.kill();
    }
  }

  private forward(active: ActiveRun, progress: RunProgress): void {
    if (this.active !== active) {
      return;
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
   * the gate already open.
   */
  private settle(active: ActiveRun, reason: ExitReason): void {
    if (this.active !== active) {
      return;
    }
    this.active = null;
    this.deps.snapshots.resume();
    void removeFlow(active.flowPath);
    this.emit({
      type: 'finished',
      runId: active.runId,
      outcome: outcomeOf(active, reason),
      message: settleMessage(active, reason),
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

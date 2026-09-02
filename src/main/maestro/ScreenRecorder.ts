import type {
  ExitReason,
  RunOptions,
  RunResult,
  SpawnOptions,
  StreamingProcess,
} from '../process/run';
import { AdbFailedError, AdbNotFoundError, type PullOptions } from './AdbBridge';
import { RecordingFailedError, type RecordingSession } from './MaestroGateway';

/**
 * The run's video, as bytes on the device until the run is over, then a write
 * into a host path the caller names (§10.1 rules 2, 6) — or nothing at all.
 *
 * It is its own module rather than a method on `AdbBridge` for the reason
 * `ScreenCapture` is: iOS records through `xcrun simctl io recordVideo`, a
 * second implementation of exactly this and of nothing else the bridge does.
 * Today it is Android only.
 *
 * ⚠️ The recording never goes through Maestro (§4.4b, §12 rule 13 as
 * amended). Maestro's own recorder drives `screenrecord` at 100 kbps, which
 * smears text, and only switches on for its cloud analysis; ours picks the
 * bitrate, needs no edit of the flow, and follows the rule the screenshot
 * already follows: the device's picture comes from the OS.
 *
 * Like `AdbBridge` and `ScreenCapture` it *names* `adb` but does not start
 * it: the runner arrives by constructor injection, which is what lets every
 * path below be driven with no adb and no phone.
 */

/** The slice of `AdbBridge` a recording needs. One resolution order for `adb`
 * in this app, and it belongs to the bridge. */
export type RecorderAdb = {
  resolve: () => string | null;
  /** The streaming shell the recorder lives in for the length of the run. */
  shell: (deviceId: string, args: readonly string[], options?: SpawnOptions) => StreamingProcess;
  pull: (
    deviceId: string,
    remotePath: string,
    localPath: string,
    options?: PullOptions,
  ) => Promise<void>;
  apiLevel: (deviceId: string) => Promise<number | null>;
};

/** `run`, for the two one-shot calls around the recording: the stop signal
 * and the cleanup. Text in both directions. */
export type TextRunner = (
  command: string,
  args: readonly string[],
  options?: RunOptions,
) => Promise<RunResult>;

/**
 * Bits per second. Well below `screenrecord`'s 20 Mbps default and far above
 * Maestro's 100 kbps: chosen so on-screen text stays legible on the reference
 * Galaxy A07 while a minute of video stays around 30 MB. Adjusted on hardware
 * if text is not legible — never by a setting.
 */
export const RECORDING_BITRATE = 4_000_000;

/**
 * From API 34 (Android 14) on, `--time-limit 0` lifts `screenrecord`'s
 * 3-minute cap; below it the flag is rejected outright, so it stays off and
 * the cap stands (criterion 3). The same gate Maestro's own driver uses.
 */
export const UNLIMITED_TIME_LIMIT_API = 34;

/**
 * Criterion 14's deadline, counted from the run's exit and spent across the
 * stop and the pull: a minute of video at this bitrate is ~30 MB, seconds
 * over USB. A device that takes longer is a device that is not answering,
 * and the save is reported as failed rather than left spinning.
 */
export const RECORDING_SETTLE_TIMEOUT_MS = 20_000;

/** The least a pull, or the stop signal, is given once the budget is nearly
 * spent — enough for a device that is answering, finite for one that is not. */
const MIN_STEP_TIMEOUT_MS = 1_000;

/**
 * Criterion 21's bound on the cleanup. `rm` is the last thing a discard does
 * and the last thing a quit waits for; a device that stopped answering must
 * not hold either. Not part of the 20-second budget: the file is gone from
 * the person's point of view the moment the pull is, or was never wanted.
 */
export const RECORDING_CLEANUP_TIMEOUT_MS = 5_000;

/** How much of the recorder's stderr is kept for the failure message. */
const STDERR_TAIL = 2_048;

export type ScreenRecorderDeps = {
  readonly adb: RecorderAdb;
  readonly run: TextRunner;
};

export class ScreenRecorder {
  private readonly deps: ScreenRecorderDeps;

  constructor(deps: ScreenRecorderDeps) {
    this.deps = deps;
  }

  /**
   * Criterion 2, verbatim: `screenrecord --bit-rate <RECORDING_BITRATE>
   * [--time-limit 0] /sdcard/conductor-recording-<runId>.mp4`, through the
   * streaming shell because the child lives for the length of the run.
   *
   * Resolves the moment the shell is spawned, so the run is never held up
   * waiting to learn whether the device will refuse: a recorder that dies
   * early is kept as the cause and reported by the run that needed it
   * (criteria 4, 15).
   */
  async start(deviceId: string, runId: string): Promise<RecordingSession> {
    const binary = this.deps.adb.resolve();
    if (binary === null) {
      throw new AdbNotFoundError();
    }
    // A level the device did not report is not a level to guess from: the
    // flag stays off and the cap stands, which is a video rather than a
    // refusal.
    const level = await this.deps.adb.apiLevel(deviceId);
    const unlimited = level !== null && level >= UNLIMITED_TIME_LIMIT_API;
    const remotePath = `/sdcard/conductor-recording-${runId}.mp4`;
    const args = [
      'screenrecord',
      '--bit-rate',
      String(RECORDING_BITRATE),
      ...(unlimited ? ['--time-limit', '0'] : []),
      remotePath,
    ];
    const child = this.deps.adb.shell(deviceId, args);
    return new Recording({
      binary,
      deviceId,
      remotePath,
      // Criterion 5: the stop signal is aimed by this name and by nothing
      // else. The `[.]` matches the literal dot in `screenrecord`'s command
      // line and nothing in the command line of the shell that runs `pkill`
      // itself — the classic way to keep a `pkill -f` from matching itself.
      pattern: `conductor-recording-${runId}[.]mp4`,
      child,
      run: this.deps.run,
      pull: this.deps.adb.pull,
    });
  }
}

type RecordingContext = {
  readonly binary: string;
  readonly deviceId: string;
  readonly remotePath: string;
  readonly pattern: string;
  readonly child: StreamingProcess;
  readonly run: TextRunner;
  readonly pull: RecorderAdb['pull'];
};

class Recording implements RecordingSession {
  readonly startedAt = Date.now();
  private readonly ctx: RecordingContext;
  private exit: { readonly reason: ExitReason; readonly at: number } | null = null;
  /** True when the exit came after we asked for it — then its code is the
   * stop's, whatever number the device's shell chose to report. */
  private exitedAfterStop = false;
  private stopRequested = false;
  private stopping: Promise<void> | null = null;
  private discarding: Promise<void> | null = null;
  private removed = false;
  private aborted = false;
  private readonly aborter = new AbortController();
  private readonly exitWaiters = new Set<() => void>();
  private stderr = '';

  constructor(ctx: RecordingContext) {
    this.ctx = ctx;
    ctx.child.onStdout(() => {});
    ctx.child.onStderr((chunk) => {
      this.stderr = (this.stderr + chunk).slice(-STDERR_TAIL);
    });
    ctx.child.onExit((reason) => {
      this.exit = { reason, at: Date.now() };
      this.exitedAfterStop = this.stopRequested;
      for (const waiter of this.exitWaiters) {
        waiter();
      }
      this.exitWaiters.clear();
    });
  }

  async save(hostPath: string): Promise<{ stoppedAt: number }> {
    const deadline = Date.now() + RECORDING_SETTLE_TIMEOUT_MS;
    try {
      await this.stop(deadline);
      if (this.aborted) {
        throw new RecordingFailedError('save', 'Conductor is shutting down');
      }
      const failure = this.recordingFailure();
      if (failure !== null) {
        throw new RecordingFailedError('record', failure);
      }
      try {
        await this.ctx.pull(this.ctx.deviceId, this.ctx.remotePath, hostPath, {
          timeoutMs: Math.max(deadline - Date.now(), MIN_STEP_TIMEOUT_MS),
          signal: this.aborter.signal,
        });
      } catch (error) {
        // adb's own words, never its command line: the person reads this
        // after "couldn't be saved to your Movies folder:", and a device
        // path or a `pull` in that sentence would be jargon (spec constraint).
        throw new RecordingFailedError('save', reasonOf(error));
      }
      // `stop` settled, so the exit is known — the deadline would have
      // rejected otherwise.
      return { stoppedAt: this.exit?.at ?? Date.now() };
    } finally {
      // Criterion 8 — nothing is left on the device, whichever way this went.
      await this.remove();
    }
  }

  discard(): Promise<void> {
    this.discarding ??= this.doDiscard();
    return this.discarding;
  }

  abort(): void {
    this.aborted = true;
    this.aborter.abort();
    if (this.exit === null) {
      this.ctx.child.kill();
    }
    // Whoever is waiting on the device stops waiting now: the exit the kill
    // produces is not one worth a deadline, and a quit cannot spend one.
    for (const waiter of this.exitWaiters) {
      waiter();
    }
    this.exitWaiters.clear();
  }

  private async doDiscard(): Promise<void> {
    try {
      await this.stop(Date.now() + RECORDING_SETTLE_TIMEOUT_MS);
    } catch {
      // The deadline already killed the local shell; the file is removed
      // below regardless. A discard is never worth failing a settle over.
    }
    await this.remove();
  }

  private stop(deadline: number): Promise<void> {
    this.stopping ??= this.doStop(deadline);
    return this.stopping;
  }

  /**
   * Criterion 5. SIGINT to our own `screenrecord`, so it finalises the MP4,
   * then the wait for the shell to report the exit — the file is not whole
   * before that. The signal itself is best effort: the wait is what tells
   * the truth, and the deadline is what keeps it honest.
   */
  private async doStop(deadline: number): Promise<void> {
    if (this.exit !== null || this.aborted) {
      return;
    }
    this.stopRequested = true;
    // Bounded by the same budget: a device that stopped answering would
    // otherwise hang the signal itself, before the wait's timer is armed.
    await this.ctx
      .run(
        this.ctx.binary,
        ['-s', this.ctx.deviceId, 'shell', 'pkill', '-INT', '-f', this.ctx.pattern],
        { timeout: Math.max(deadline - Date.now(), MIN_STEP_TIMEOUT_MS) },
      )
      .catch(() => {});
    if (this.exit !== null || this.aborted) {
      return;
    }
    await this.waitForExit(deadline);
  }

  private waitForExit(deadline: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.exitWaiters.delete(done);
          // The device did not answer; the local child must not outlive the
          // settle by more than this. Killing it hangs the device side up.
          this.ctx.child.kill();
          reject(new RecordingFailedError('save', 'the device did not stop the recording in time'));
        },
        Math.max(0, deadline - Date.now()),
      );
      const done = (): void => {
        clearTimeout(timer);
        resolve();
      };
      this.exitWaiters.add(done);
    });
  }

  /** Criteria 4 and 15: an exit before the stop, with an error or a code, is
   * a recorder that died on its own — in its own words when it left any. */
  private recordingFailure(): string | null {
    const exit = this.exit;
    if (exit === null) {
      return null;
    }
    if (exit.reason.error !== null) {
      return exit.reason.error.message;
    }
    if (this.exitedAfterStop || exit.reason.code === 0) {
      return null;
    }
    const words = this.stderr.trim().split('\n').at(-1)?.trim() ?? '';
    if (words !== '') {
      return words;
    }
    // Plain words for the person's note: the code, never the tool's name.
    return exit.reason.code === null
      ? 'the recording was interrupted'
      : `the device stopped recording (code ${exit.reason.code})`;
  }

  private async remove(): Promise<void> {
    if (this.removed) {
      return;
    }
    this.removed = true;
    await this.ctx
      .run(this.ctx.binary, ['-s', this.ctx.deviceId, 'shell', 'rm', '-f', this.ctx.remotePath], {
        timeout: RECORDING_CLEANUP_TIMEOUT_MS,
      })
      .catch(() => {});
  }
}

/** The tool's own words when it left any, else the error's — never the
 * command line `AdbFailedError` also carries. */
function reasonOf(error: unknown): string {
  if (error instanceof AdbFailedError) {
    return error.detail;
  }
  return error instanceof Error ? error.message : 'the video could not be copied from the device';
}

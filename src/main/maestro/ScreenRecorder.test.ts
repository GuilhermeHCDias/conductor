import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ExitReason,
  RunOptions,
  RunResult,
  SpawnOptions,
  StreamingProcess,
} from '../process/run';
import { AdbFailedError, type PullOptions } from './AdbBridge';
import { RecordingFailedError } from './MaestroGateway';
import {
  RECORDING_BITRATE,
  RECORDING_CLEANUP_TIMEOUT_MS,
  RECORDING_SETTLE_TIMEOUT_MS,
  ScreenRecorder,
  UNLIMITED_TIME_LIMIT_API,
} from './ScreenRecorder';

/**
 * The run's video, recorded by the OS and never through Maestro (§4.4b, §12
 * rule 13 as amended). Everything below runs with no `adb` and no phone: the
 * runner, the shell and the pull are injected, which is the same thing that
 * makes `ScreenCapture`'s traps testable.
 */

const ADB = '/Users/someone/Library/Android/sdk/platform-tools/adb';
const DEVICE = 'R9QYC01EMXL';
const REMOTE = '/sdcard/conductor-recording-run-1.mp4';
const HOST = '/Users/someone/Movies/Conductor/login-2026-09-02-143015.mp4.partial';

type Ran = {
  readonly command: string;
  readonly args: readonly string[];
  readonly options?: RunOptions;
};
type Spawned = {
  readonly deviceId: string;
  readonly args: readonly string[];
  readonly options?: SpawnOptions;
};
type Pulled = {
  readonly deviceId: string;
  readonly remotePath: string;
  readonly localPath: string;
  readonly options?: PullOptions;
};

/** The `adb shell screenrecord` child, driven from the test's side. */
class FakeShell implements StreamingProcess {
  killed = 0;
  private stderrListener: ((chunk: string) => void) | null = null;
  private exitListeners: Array<(reason: ExitReason) => void> = [];
  private reason: ExitReason | null = null;

  write(): void {}
  onStdout(): void {}
  onStderr(listener: (chunk: string) => void): void {
    this.stderrListener = listener;
  }
  onExit(listener: (reason: ExitReason) => void): void {
    if (this.reason !== null) {
      listener(this.reason);
      return;
    }
    this.exitListeners.push(listener);
  }
  kill(): void {
    this.killed += 1;
  }

  emitStderr(chunk: string): void {
    this.stderrListener?.(chunk);
  }
  exit(reason: ExitReason): void {
    if (this.reason !== null) {
      return;
    }
    this.reason = reason;
    for (const listener of this.exitListeners) {
      listener(reason);
    }
    this.exitListeners = [];
  }
}

type Harness = {
  recorder: ScreenRecorder;
  /** Every one-shot adb call, in order. */
  ran: Ran[];
  spawned: Spawned[];
  pulled: Pulled[];
  asked: string[];
  /** One entry per side effect, in the order they happened. */
  order: string[];
  shell: () => FakeShell;
};

function recorder(
  overrides: {
    binary?: string | null;
    apiLevel?: number | null;
    apiLevelError?: Error;
    pull?: (pulled: Pulled) => Promise<void>;
    run?: (ran: Ran) => Promise<RunResult>;
  } = {},
): Harness {
  const ran: Ran[] = [];
  const spawned: Spawned[] = [];
  const pulled: Pulled[] = [];
  const asked: string[] = [];
  const order: string[] = [];
  const shells: FakeShell[] = [];

  const screen = new ScreenRecorder({
    adb: {
      resolve: () => (overrides.binary === undefined ? ADB : overrides.binary),
      shell: (deviceId, args, options) => {
        spawned.push(options === undefined ? { deviceId, args } : { deviceId, args, options });
        order.push('spawn');
        const shell = new FakeShell();
        shells.push(shell);
        return shell;
      },
      pull: (deviceId, remotePath, localPath, options) => {
        const entry: Pulled =
          options === undefined
            ? { deviceId, remotePath, localPath }
            : { deviceId, remotePath, localPath, options };
        pulled.push(entry);
        order.push('pull');
        return overrides.pull?.(entry) ?? Promise.resolve();
      },
      apiLevel: (deviceId) => {
        asked.push(deviceId);
        if (overrides.apiLevelError !== undefined) {
          return Promise.reject(overrides.apiLevelError);
        }
        return Promise.resolve(overrides.apiLevel === undefined ? 36 : overrides.apiLevel);
      },
    },
    run: (command, args, options) => {
      const entry: Ran = options === undefined ? { command, args } : { command, args, options };
      ran.push(entry);
      order.push(`run:${args[3] ?? args.join(' ')}`);
      return overrides.run?.(entry) ?? Promise.resolve({ stdout: '', stderr: '', code: 0 });
    },
  });

  return {
    recorder: screen,
    ran,
    spawned,
    pulled,
    asked,
    order,
    shell: () => {
      const shell = shells[0];
      if (shell === undefined) {
        throw new Error('No shell was spawned.');
      }
      return shell;
    },
  };
}

/** Lets every settled promise in the chain run, without touching timers. */
async function flush(): Promise<void> {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
}

const pkillOf = (ran: Ran[]): Ran | undefined => ran.find((call) => call.args[3] === 'pkill');
const rmOf = (ran: Ran[]): Ran | undefined => ran.find((call) => call.args[3] === 'rm');

afterEach(() => {
  vi.useRealTimers();
});

describe('starting a recording', () => {
  /** Criterion 2, verbatim: the bitrate is the module's one constant, the
   * file carries the run id, and the whole thing is one argument array —
   * nothing here ever composes a shell string (§12.19). */
  it('records through adb shell screenrecord, into a file named after the run', async () => {
    const { recorder: screen, spawned } = recorder({ apiLevel: 36 });

    await screen.start(DEVICE, 'run-1');

    expect(spawned).toEqual([
      {
        deviceId: DEVICE,
        args: ['screenrecord', '--bit-rate', '4000000', '--time-limit', '0', REMOTE],
      },
    ]);
    expect(RECORDING_BITRATE).toBe(4_000_000);
    expect(spawned[0]?.args.filter((arg) => arg.includes(' '))).toEqual([]);
  });

  /** Criteria 2–3. `--time-limit 0` lifts the 3-minute cap from API 34 on and
   * is rejected outright below it — the same gate Maestro's own driver uses.
   * Below 34 the flag stays off and the OS's cap stands. */
  it.each([
    [36, true],
    [34, true],
    [33, false],
    [28, false],
  ])('on API level %i, lifts the cap: %s', async (level, unlimited) => {
    const { recorder: screen, spawned } = recorder({ apiLevel: level });

    await screen.start(DEVICE, 'run-1');

    const args = spawned[0]?.args ?? [];
    expect(args.includes('--time-limit')).toBe(unlimited);
    expect(args.at(-1)).toBe(REMOTE);
  });

  /** A level the device did not report is not a level to guess from: the flag
   * is left off, and the cap — never a refusal — is what the person gets. */
  it('leaves the cap in place when the device does not say its level', async () => {
    const { recorder: screen, spawned } = recorder({ apiLevel: null });

    await screen.start(DEVICE, 'run-1');

    expect(spawned[0]?.args).toEqual(['screenrecord', '--bit-rate', '4000000', REMOTE]);
    expect(UNLIMITED_TIME_LIMIT_API).toBe(34);
  });

  it('asks the level of the device it records', async () => {
    const { recorder: screen, asked } = recorder();

    await screen.start(DEVICE, 'run-1');

    expect(asked).toEqual([DEVICE]);
  });

  /** Criterion 13's zero: the moment the device was asked to start. The
   * recorder needs a beat after this before its first frame, which is why
   * the offset built on it is floored and never claims sub-second precision. */
  it('stamps when it asked the device to start', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-02T14:30:15.250Z'));
    const { recorder: screen } = recorder();

    const session = await screen.start(DEVICE, 'run-1');

    expect(session.startedAt).toBe(new Date('2026-09-02T14:30:15.250Z').getTime());
  });

  /** §10.1 rule 3 — `deviceId` is an opaque token, passed through and never
   * parsed. Today a serial; tomorrow a remote runner's session id. */
  it('passes an opaque device id straight through', async () => {
    const { recorder: screen, spawned, asked } = recorder();

    await screen.start('session:7f3a-remote', 'run-1');

    expect(spawned[0]?.deviceId).toBe('session:7f3a-remote');
    expect(asked).toEqual(['session:7f3a-remote']);
  });

  /** One resolution order for `adb` in this app, and it is `AdbBridge`'s. */
  it('takes the binary from the bridge for the calls around the recording', async () => {
    const { recorder: screen, ran, shell } = recorder({ binary: '/custom/adb' });
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    await flush();
    shell().exit({ code: 0, error: null });
    await saving;

    expect(ran.map((call) => call.command)).toEqual(['/custom/adb', '/custom/adb']);
  });
});

/**
 * Criterion 4. The two ways a recording never begins, each with the code or
 * words the run can carry — and neither of them stops the run (that is
 * `RunService`'s half of the criterion).
 */
describe('when it cannot start', () => {
  it('reports an unresolved adb with the prerequisite’s own code, touching nothing', async () => {
    const { recorder: screen, spawned, asked } = recorder({ binary: null });

    await expect(screen.start(DEVICE, 'run-1')).rejects.toMatchObject({
      code: 'device/adb-not-found',
    });
    expect(spawned).toEqual([]);
    expect(asked).toEqual([]);
  });

  it('propagates a device that could not be asked its level', async () => {
    const { recorder: screen, spawned } = recorder({
      apiLevelError: new Error('spawn ENOENT'),
    });

    await expect(screen.start(DEVICE, 'run-1')).rejects.toThrow('spawn ENOENT');
    expect(spawned).toEqual([]);
  });
});

describe('stopping and saving', () => {
  /**
   * Criterion 5. The stop is a SIGINT to *our own* device-side `screenrecord`,
   * matched by the run's file name — never `killall screenrecord`, which would
   * take a person's own recording down with ours. The `[.]` in the pattern is
   * what keeps the shell that runs `pkill` from matching its own command line.
   */
  it('signals its own screenrecord by the run’s file name, never every screenrecord', async () => {
    const { recorder: screen, ran, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    await flush();

    expect(pkillOf(ran)).toMatchObject({
      command: ADB,
      args: ['-s', DEVICE, 'shell', 'pkill', '-INT', '-f', 'conductor-recording-run-1[.]mp4'],
    });
    expect(ran.flatMap((call) => call.args)).not.toContain('killall');
    expect(pkillOf(ran)?.args.filter((arg) => arg.includes(' '))).toEqual([]);
    shell().exit({ code: 0, error: null });
    await saving;
  });

  /** Criterion 5 — the pull waits for the device-side process to exit: a file
   * pulled while `screenrecord` is still finalising it has no index and plays
   * as nothing. */
  it('waits for the device-side recorder to exit before pulling', async () => {
    const { recorder: screen, pulled, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    await flush();
    expect(pulled).toEqual([]);

    shell().exit({ code: 0, error: null });
    await saving;
    expect(pulled).toMatchObject([{ deviceId: DEVICE, remotePath: REMOTE, localPath: HOST }]);
  });

  /** Criterion 8 and §10.1 rule 2 — the video leaves the Gateway as a write
   * into the host path the caller named; the answer says when the device
   * stopped recording, which is what bounds criterion 13's offset. */
  it('pulls into the host path the caller named and answers when the recording stopped', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-02T14:30:15.000Z'));
    const { recorder: screen, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    await flush();
    vi.setSystemTime(new Date('2026-09-02T14:31:02.400Z'));
    shell().exit({ code: 0, error: null });

    await expect(saving).resolves.toEqual({
      stoppedAt: new Date('2026-09-02T14:31:02.400Z').getTime(),
    });
  });

  /** Criterion 8 — nothing is left on the device: the file goes after the pull. */
  it('removes the device-side file after the pull', async () => {
    const { recorder: screen, ran, order, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    await flush();
    shell().exit({ code: 0, error: null });
    await saving;

    expect(rmOf(ran)).toMatchObject({
      command: ADB,
      args: ['-s', DEVICE, 'shell', 'rm', '-f', REMOTE],
    });
    expect(order).toEqual(['spawn', 'run:pkill', 'pull', 'run:rm']);
  });

  /** Spec constraint — the reason the person reads is adb's own words,
   * never Conductor's command line: no `adb`, no `pull`, no host path. */
  it('reports a failed pull in adb’s own words, never the command line', async () => {
    const stderr =
      "adb: error: failed to stat remote object '/sdcard/conductor-recording-run-1.mp4': No such file or directory";
    const { recorder: screen, shell } = recorder({
      pull: () =>
        Promise.reject(
          new AdbFailedError(['-s', DEVICE, 'pull', REMOTE, HOST], { stdout: '', stderr, code: 1 }),
        ),
    });
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    await flush();
    shell().exit({ code: 0, error: null });

    await expect(saving).rejects.toMatchObject({ phase: 'save', message: stderr });
  });

  /** Criterion 14 — a pull that failed is a save failure with its words,
   * and the device is still cleaned up behind it. */
  it('reports a failed pull as a save failure, and still cleans up', async () => {
    const {
      recorder: screen,
      ran,
      shell,
    } = recorder({
      pull: () =>
        Promise.reject(
          new Error('adb -s R9QYC01EMXL pull exited 1. adb: error: failed to copy: I/O error'),
        ),
    });
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    await flush();
    shell().exit({ code: 0, error: null });

    await expect(saving).rejects.toMatchObject({
      name: 'RecordingFailedError',
      phase: 'save',
      message: expect.stringContaining('I/O error'),
    });
    expect(rmOf(ran)).toBeDefined();
  });

  /** Criterion 3 — on Android < 14 the OS stops the recorder at three
   * minutes. That exit is a clean stop, not a failure: nothing is signalled,
   * the file is pulled, and the stop time is the cap's. */
  it('treats a recorder the OS already stopped as stopped', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-02T14:30:15.000Z'));
    const { recorder: screen, ran, pulled, shell } = recorder({ apiLevel: 33 });
    const session = await screen.start(DEVICE, 'run-1');
    vi.setSystemTime(new Date('2026-09-02T14:33:15.000Z'));
    shell().exit({ code: 0, error: null });
    vi.setSystemTime(new Date('2026-09-02T14:34:00.000Z'));

    await expect(session.save(HOST)).resolves.toEqual({
      stoppedAt: new Date('2026-09-02T14:33:15.000Z').getTime(),
    });
    expect(pkillOf(ran)).toBeUndefined();
    expect(pulled).toHaveLength(1);
  });

  /**
   * Criteria 4 and 15. A recorder that died on its own before the run ended
   * — the emulator that has no encoder, a device that refused the flag —
   * never recorded anything: the run says so in the recorder's own words,
   * pulls nothing, and still removes whatever stub the device kept.
   */
  it('reports a recorder that died before the stop as never having recorded', async () => {
    const { recorder: screen, ran, pulled, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');
    shell().emitStderr('Unable to get output buffers (err=-38)\n');
    shell().exit({ code: 2, error: null });

    await expect(session.save(HOST)).rejects.toMatchObject({
      phase: 'record',
      message: 'Unable to get output buffers (err=-38)',
    });
    expect(pulled).toEqual([]);
    expect(rmOf(ran)).toBeDefined();
  });

  it('reports a shell that never started with the spawn’s own words', async () => {
    const { recorder: screen, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');
    shell().exit({ code: null, error: new Error('spawn ENOENT') });

    await expect(session.save(HOST)).rejects.toMatchObject({
      phase: 'record',
      message: 'spawn ENOENT',
    });
  });

  /** Spec constraint — plain words: the code, never the tool's name. */
  it('names the exit code when the recorder died without a word', async () => {
    const { recorder: screen, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');
    shell().exit({ code: 1, error: null });

    await expect(session.save(HOST)).rejects.toMatchObject({
      phase: 'record',
      message: 'the device stopped recording (code 1)',
    });
  });

  /** The device's shell may report our own SIGINT as its exit status. An exit
   * that follows the stop is the stop, whatever number it carries. */
  it('does not read an exit that follows the stop as a failure', async () => {
    const { recorder: screen, pulled, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    await flush();
    shell().exit({ code: 130, error: null });

    await expect(saving).resolves.toMatchObject({ stoppedAt: expect.any(Number) });
    expect(pulled).toHaveLength(1);
  });

  it('rejects with a typed error a caller can narrow on', async () => {
    const { recorder: screen, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');
    shell().exit({ code: 1, error: null });

    await expect(session.save(HOST)).rejects.toBeInstanceOf(RecordingFailedError);
  });
});

/**
 * Criterion 14's deadline. A device that never hands the file over must
 * become a reported failure, never a save that spins forever — and the local
 * `adb shell` must not outlive the run's settle by more than the stop
 * sequence (criterion 5).
 */
describe('the deadline', () => {
  it('gives up on a device that does not stop the recorder in time, and kills the shell', async () => {
    vi.useFakeTimers();
    const { recorder: screen, ran, pulled, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    // Attached before the clock moves: the rejection lands mid-advance, and a
    // rejected promise nobody holds yet is an unhandled one.
    const outcome = expect(saving).rejects.toMatchObject({ phase: 'save' });
    await flush();
    expect(shell().killed).toBe(0);
    await vi.advanceTimersByTimeAsync(RECORDING_SETTLE_TIMEOUT_MS);

    await outcome;
    expect(shell().killed).toBe(1);
    expect(pulled).toEqual([]);
    expect(rmOf(ran)).toBeDefined();
    expect(RECORDING_SETTLE_TIMEOUT_MS).toBe(20_000);
  });

  /** The stop signal is bounded by the same budget: a device that stopped
   * answering must not hang `adb shell pkill` forever, before the wait's own
   * timer is even armed. */
  it('bounds the stop signal by the budget', async () => {
    const { recorder: screen, ran, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    await flush();
    shell().exit({ code: 0, error: null });
    await saving;

    const timeout = pkillOf(ran)?.options?.timeout ?? 0;
    expect(timeout).toBeGreaterThan(0);
    expect(timeout).toBeLessThanOrEqual(RECORDING_SETTLE_TIMEOUT_MS);
  });

  /** Criterion 21 — the cleanup is bounded too, so a device that stopped
   * answering cannot stall a quit behind an `rm` that never returns. */
  it('bounds the cleanup, so a silent device cannot stall a quit', async () => {
    const { recorder: screen, ran, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const discarding = session.discard();
    await flush();
    shell().exit({ code: 0, error: null });
    await discarding;

    expect(rmOf(ran)?.options?.timeout).toBe(RECORDING_CLEANUP_TIMEOUT_MS);
    expect(RECORDING_CLEANUP_TIMEOUT_MS).toBeGreaterThan(0);
  });

  /** One budget from the exit, spent across the stop and the pull. */
  it('gives the pull whatever remains of the budget', async () => {
    vi.useFakeTimers();
    const { recorder: screen, pulled, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const saving = session.save(HOST);
    await flush();
    await vi.advanceTimersByTimeAsync(5_000);
    shell().exit({ code: 0, error: null });
    await saving;

    expect(pulled[0]?.options?.timeoutMs).toBe(RECORDING_SETTLE_TIMEOUT_MS - 5_000);
  });
});

/** Criteria 7, 20 and 21 — the ways a recording ends with nothing kept. */
describe('discarding', () => {
  it('stops the recorder and removes the file without pulling', async () => {
    const { recorder: screen, ran, pulled, order, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const discarding = session.discard();
    await flush();
    expect(pkillOf(ran)).toBeDefined();
    shell().exit({ code: 0, error: null });
    await discarding;

    expect(pulled).toEqual([]);
    expect(order).toEqual(['spawn', 'run:pkill', 'run:rm']);
  });

  /** Best-effort, all the way down: a discard is never worth failing a
   * settle over, whatever adb says. */
  it('never rejects, even when adb refuses every call', async () => {
    const { recorder: screen, shell } = recorder({
      run: () => Promise.reject(new Error('device offline')),
    });
    const session = await screen.start(DEVICE, 'run-1');

    const discarding = session.discard();
    await flush();
    shell().exit({ code: 0, error: null });

    await expect(discarding).resolves.toBeUndefined();
  });

  it('discards once: a second discard signals and removes nothing more', async () => {
    const { recorder: screen, ran, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    const first = session.discard();
    await flush();
    shell().exit({ code: 0, error: null });
    await first;
    await session.discard();

    expect(ran.map((call) => call.args[3])).toEqual(['pkill', 'rm']);
  });

  /**
   * Criterion 21 — `before-quit` cannot wait on a device: the local shell is
   * killed at once (the device hangs the recorder up on its own), and a pull
   * in flight is cut short so no `.partial` is left growing behind the app.
   */
  it('aborts at once: kills the local shell and cancels a pull in flight', async () => {
    let signal: AbortSignal | undefined;
    const { recorder: screen, shell } = recorder({
      pull: (entry) =>
        new Promise((_resolve, reject) => {
          signal = entry.options?.signal;
          signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    });
    const session = await screen.start(DEVICE, 'run-1');
    const saving = session.save(HOST);
    await flush();
    shell().exit({ code: 0, error: null });
    await flush();
    expect(signal?.aborted).toBe(false);

    session.abort();

    expect(signal?.aborted).toBe(true);
    await expect(saving).rejects.toMatchObject({ phase: 'save' });
  });

  it('aborting a live recording kills the shell without waiting for the device', async () => {
    const { recorder: screen, shell } = recorder();
    const session = await screen.start(DEVICE, 'run-1');

    session.abort();

    expect(shell().killed).toBe(1);
    await expect(session.save(HOST)).rejects.toMatchObject({ phase: 'save' });
  });
});

/**
 * §10.1 rule 1b: a module that receives its runner by constructor injection
 * does not create processes, and so does not need — or get — the
 * `noRestrictedImports` exception. `AdbBridge`, `ScrcpySource` and
 * `ScreenCapture` already work this way; this is the fourth.
 */
describe('the module itself', () => {
  const source = readFileSync(resolvePath('src/main/maestro/ScreenRecorder.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('creates no process of its own', () => {
    expect(code).not.toMatch(/child_process/);
    expect(code).not.toMatch(/\b(execFile|spawn|exec)\s*\(/);
  });

  it('imports nothing from Electron', () => {
    expect(code).not.toMatch(/from\s+['"]electron['"]/);
  });

  /** iOS is not implemented here, and nothing about the shape prevents a
   * `simctl io recordVideo` sibling behind the same Gateway method. */
  it('names no iOS recording path yet', () => {
    expect(code).not.toMatch(/simctl|xcrun/);
  });

  /** The stop is by name, never by process name alone (spec constraint). */
  it('never reaches for killall', () => {
    expect(code).not.toMatch(/killall/);
  });
});

describe('the lint rule behind it', () => {
  const biome = JSON.parse(readFileSync(resolvePath('biome.json'), 'utf8')) as {
    overrides?: Array<{ includes?: string[] }>;
  };
  const exempted = (biome.overrides ?? []).flatMap((override) => override.includes ?? []);

  it('does not exempt ScreenRecorder from the process-creation rule', () => {
    expect(exempted).not.toContain('src/main/maestro/ScreenRecorder.ts');
  });
});

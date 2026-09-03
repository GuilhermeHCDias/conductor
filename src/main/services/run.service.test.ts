import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Result } from '@shared/ipc';
import { ERROR_CODES } from '@shared/ipc';
import type { RunEvent } from '@shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type MaestroGateway,
  RecordingFailedError,
  type RecordingSession,
  type RunFlowHandlers,
} from '../maestro/MaestroGateway';
import { RunService } from './run.service';

/**
 * The run lifecycle against a fake Gateway and a fake snapshot gate: ordering,
 * outcome-from-exit, cancellation, the temp-file's life, §4.3.2's mutual
 * exclusion — and, since the recording spec, the recorder's life beside the
 * run's: started before the spawn, kept or discarded by the outcome, saved
 * into the Movies folder, reported as one event after the terminal one. No
 * maestro, no adb, and no filesystem beyond a scratch temp dir.
 */

const YAML = 'appId: com.vtex.pnp\n---\n- launchApp\n';
const DEVICE = 'R9QYC01EMXL';

type StartedRun = {
  deviceId: string;
  flowPath: string;
  handlers: RunFlowHandlers;
  killed: number;
};

/** The recorder's session, driven from the test's side. */
class FakeRecording implements RecordingSession {
  readonly startedAt = Date.now();
  readonly saved: string[] = [];
  discarded = 0;
  aborted = 0;
  private settle: (() => void) | null = null;
  private cut: (() => void) | null = null;

  private releaseDiscard: (() => void) | null = null;

  constructor(
    private readonly options: {
      stoppedAt?: () => number;
      saveError?: unknown;
      holdSave?: boolean;
      /** A discard that takes its time — the stop's wait on the device. */
      holdDiscard?: boolean;
    },
  ) {}

  save(hostPath: string): Promise<{ stoppedAt: number }> {
    this.saved.push(hostPath);
    return new Promise((resolve, reject) => {
      const settle = (): void => {
        if (this.options.saveError !== undefined) {
          reject(this.options.saveError);
          return;
        }
        // The pull writes the file — a stub is enough for the rename.
        writeFileSync(hostPath, 'mp4');
        resolve({ stoppedAt: this.options.stoppedAt?.() ?? Date.now() });
      };
      if (this.options.holdSave === true) {
        this.settle = settle;
        this.cut = () => reject(new RecordingFailedError('save', 'Conductor is shutting down'));
        return;
      }
      settle();
    });
  }

  discard(): Promise<void> {
    this.discarded += 1;
    if (this.options.holdDiscard === true) {
      return new Promise((resolve) => {
        this.releaseDiscard = resolve;
      });
    }
    return Promise.resolve();
  }

  /** Like the real session: an abort releases whoever waits on the device. */
  abort(): void {
    this.aborted += 1;
    this.cut?.();
    this.releaseDiscard?.();
  }

  /** Lets a held save finish. */
  releaseSave(): void {
    this.settle?.();
  }
}

function coded(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
});

type Harness = {
  service: RunService;
  runs: StartedRun[];
  events: RunEvent[];
  gateCalls: string[];
  /** The Gateway's calls in order — what came before the spawn is the point. */
  order: string[];
  recordings: FakeRecording[];
  opened: string[];
  releaseSuspend: () => void;
  /** Lets a held `startRecording` answer with its session. */
  releaseRecord: () => void;
  runsDir: string;
  videosDir: string;
};

function harness(
  overrides: {
    spawnError?: Error;
    holdSuspend?: boolean;
    holdRecord?: boolean;
    recorder?:
      | 'refuses'
      | {
          stoppedAt?: () => number;
          saveError?: unknown;
          holdSave?: boolean;
          holdDiscard?: boolean;
        };
    openAnswer?: string;
  } = {},
): Harness {
  const dir = mkdtempSync(join(tmpdir(), 'conductor-run-service-'));
  scratch.push(dir);
  const runsDir = join(dir, 'runs');
  const videosDir = join(dir, 'videos');

  const runs: StartedRun[] = [];
  const order: string[] = [];
  const recordings: FakeRecording[] = [];
  let releaseRecord: () => void = () => {};
  const gateway = {
    listDevices: () => Promise.reject(new Error('RunService does not list devices.')),
    deviceProperties: () => Promise.reject(new Error('RunService does not read properties.')),
    appIdentity: () => Promise.reject(new Error('RunService does not read app identity.')),
    hierarchy: () => Promise.reject(new Error('RunService never touches the mcp child.')),
    screenshot: () => Promise.reject(new Error('RunService does not capture.')),
    startMirror: () => Promise.reject(new Error('RunService does not open mirrors.')),
    startRecording: (deviceId: string, name: string): Promise<RecordingSession> => {
      order.push(`record:${deviceId}:${name}`);
      if (overrides.recorder === 'refuses') {
        return Promise.reject(
          coded(
            ERROR_CODES.adbNotFound,
            'No adb found. Install the Android platform-tools, or set CONDUCTOR_ADB_PATH.',
          ),
        );
      }
      const recording = new FakeRecording(
        overrides.recorder === undefined ? {} : overrides.recorder,
      );
      recordings.push(recording);
      if (overrides.holdRecord === true) {
        return new Promise((resolve) => {
          releaseRecord = () => resolve(recording);
        });
      }
      return Promise.resolve(recording);
    },
    runFlow: (deviceId: string, flowPath: string, handlers: RunFlowHandlers) => {
      order.push('spawn');
      if (overrides.spawnError !== undefined) {
        throw overrides.spawnError;
      }
      const started: StartedRun = { deviceId, flowPath, handlers, killed: 0 };
      runs.push(started);
      return {
        kill: () => {
          started.killed += 1;
        },
      };
    },
  } as unknown as MaestroGateway;

  const gateCalls: string[] = [];
  let releaseSuspend: () => void = () => {};
  const snapshots = {
    suspend: (): Promise<void> => {
      gateCalls.push('suspend');
      order.push('suspend');
      if (overrides.holdSuspend === true) {
        return new Promise((resolve) => {
          releaseSuspend = resolve;
        });
      }
      return Promise.resolve();
    },
    resume: (): void => {
      gateCalls.push('resume');
    },
  };

  const events: RunEvent[] = [];
  const opened: string[] = [];
  const service = new RunService({
    gateway,
    snapshots,
    runsDir,
    videosDir,
    openPath: (path) => {
      opened.push(path);
      return Promise.resolve(overrides.openAnswer ?? '');
    },
    emit: (payload: Result<RunEvent>) => {
      if (payload.ok) {
        events.push(payload.data);
      }
    },
  });

  return {
    service,
    runs,
    events,
    gateCalls,
    order,
    recordings,
    opened,
    releaseSuspend: () => releaseSuspend(),
    releaseRecord: () => releaseRecord(),
    runsDir,
    videosDir,
  };
}

function runId(result: Result<{ runId: string }>): string {
  if (!result.ok) {
    throw new Error(`Expected a run, got ${result.error.code}: ${result.error.message}`);
  }
  return result.data.runId;
}

function code(result: Result<unknown>): string {
  if (result.ok) {
    throw new Error('Expected a refusal, got a success.');
  }
  return result.error.code;
}

const recordingEvents = (events: RunEvent[]): RunEvent[] =>
  events.filter((event) => event.type === 'recording');

/** A local wall-clock moment, so the file name reads in the person's time. */
const RUN_STARTED = new Date(2026, 8, 2, 14, 30, 15);

/** Runs a flow through one started step and the given exit. */
async function failedRun(
  bundle: Harness,
  identity: string | null = 'login.yml',
  exit: { code: number | null; error: Error | null } = { code: 1, error: null },
): Promise<void> {
  await bundle.service.start(DEVICE, YAML, identity);
  bundle.runs[0]?.handlers.onProgress({ type: 'step-started', label: 'Tap on "Entrar"' });
  bundle.runs[0]?.handlers.onProgress({ type: 'step-failed', label: 'Tap on "Entrar"' });
  bundle.runs[0]?.handlers.onExit(exit);
}

describe('starting a run', () => {
  /** Criterion 1 — the id comes back the moment the child is spawned; the
   * run's completion is nowhere in this answer. */
  it('answers a fresh run id as soon as the child is spawned', async () => {
    const { service, runs, events } = harness();

    const result = await service.start(DEVICE, YAML, null);

    expect(runId(result)).toBe('run-1');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.deviceId).toBe(DEVICE);
    expect(events.filter((event) => event.type === 'finished')).toEqual([]);
  });

  /** Criterion 1 — the in-memory flow, materialised where the app owns files. */
  it('writes the flow text to the temp file it hands maestro', async () => {
    const { service, runs, runsDir } = harness();

    await service.start(DEVICE, YAML, null);

    const flowPath = runs[0]?.flowPath ?? '';
    expect(flowPath.startsWith(runsDir)).toBe(true);
    expect(readFileSync(flowPath, 'utf8')).toBe(YAML);
  });

  /** Criterion 6 — started first, then progress, every event tagged. */
  it('emits started and forwards progress tagged with the run id', async () => {
    const { service, runs, events } = harness();
    await service.start(DEVICE, YAML, null);

    runs[0]?.handlers.onProgress({ type: 'step-started', label: 'Launch app "x"' });
    runs[0]?.handlers.onProgress({ type: 'log', lines: ['Running on R9QYC01EMXL'] });

    expect(events).toEqual([
      { type: 'started', runId: 'run-1' },
      { type: 'step-started', runId: 'run-1', label: 'Launch app "x"' },
      { type: 'log', runId: 'run-1', lines: ['Running on R9QYC01EMXL'] },
    ]);
  });

  /** Criterion 4 — one run at a time, per window. */
  it('refuses a second start while one is active', async () => {
    const { service, runs } = harness();
    await service.start(DEVICE, YAML, null);

    expect(code(await service.start(DEVICE, YAML, null))).toBe(ERROR_CODES.runActive);
    expect(runs).toHaveLength(1);
  });

  it('allows a new run once the previous one settled', async () => {
    const { service, runs } = harness();
    await service.start(DEVICE, YAML, null);
    runs[0]?.handlers.onExit({ code: 0, error: null });

    expect(runId(await service.start(DEVICE, YAML, null))).toBe('run-2');
  });

  /** Criterion 3 — the resolver's own code crosses, and the failed start
   * leaves nothing behind: no file, no suspension, no events. */
  it('answers the resolver’s code when maestro is missing, and cleans up', async () => {
    const missing = coded(ERROR_CODES.runMaestroNotFound, 'The Maestro CLI is not installed.');
    const { service, events, gateCalls, runsDir } = harness({ spawnError: missing });

    const result = await service.start(DEVICE, YAML, null);

    expect(code(result)).toBe(ERROR_CODES.runMaestroNotFound);
    expect(events).toEqual([]);
    expect(gateCalls).toEqual(['suspend', 'resume']);
    expect(existsSync(join(runsDir, 'run-1.yaml'))).toBe(false);
    // The slot was cleared: the next click reaches the resolver again instead
    // of being refused as run/active over a run that never began.
    expect(code(await service.start(DEVICE, YAML, null))).toBe(ERROR_CODES.runMaestroNotFound);
  });

  it('answers run/start-failed when the temp file cannot be written', async () => {
    const { service, runsDir, gateCalls } = harness();
    // The runs dir's place is taken by a file, so mkdir cannot create it.
    writeFileSync(runsDir, 'not a directory');

    expect(code(await service.start(DEVICE, YAML, null))).toBe(ERROR_CODES.runStartFailed);
    expect(gateCalls).toEqual(['suspend', 'resume']);
  });
});

describe('the outcome', () => {
  /** Criterion 7 — the verdict is the exit's, never the parser's. */
  it.each([
    ['passed', { code: 0, error: null }, null],
    ['failed', { code: 1, error: null }, 'Maestro exited with code 1.'],
  ] as const)('exit %s', async (outcome, reason, message) => {
    const { service, runs, events } = harness();
    await service.start(DEVICE, YAML, null);

    runs[0]?.handlers.onExit(reason);

    expect(events.at(-1)).toEqual({
      type: 'finished',
      runId: 'run-1',
      outcome,
      message,
      recording: 'none',
    });
  });

  it('reports a child that never started as an error with its cause', async () => {
    const { service, runs, events } = harness();
    await service.start(DEVICE, YAML, null);

    runs[0]?.handlers.onExit({ code: null, error: new Error('spawn maestro ENOENT') });

    expect(events.at(-1)).toEqual({
      type: 'finished',
      runId: 'run-1',
      outcome: 'error',
      message: 'spawn maestro ENOENT',
      recording: 'none',
    });
  });

  it('reports a signal nobody sent as an error', async () => {
    const { service, runs, events } = harness();
    await service.start(DEVICE, YAML, null);

    runs[0]?.handlers.onExit({ code: null, error: null });

    expect(events.at(-1)).toMatchObject({ type: 'finished', outcome: 'error' });
  });

  /** Criterion 5 — gone when the run ends, whatever the outcome. */
  it.each([
    ['a pass', { code: 0, error: null }],
    ['a failure', { code: 1, error: null }],
  ] as const)('deletes the temp file after %s', async (_label, reason) => {
    const { service, runs } = harness();
    await service.start(DEVICE, YAML, null);
    const flowPath = runs[0]?.flowPath ?? '';
    expect(existsSync(flowPath)).toBe(true);

    runs[0]?.handlers.onExit(reason);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(existsSync(flowPath)).toBe(false);
  });
});

describe('cancellation', () => {
  /** Criterion 9 — kill now, and the exit that follows reads as canceled, not
   * as whatever code the dying JVM happened to leave. */
  it('kills the child and reports the settle as canceled', async () => {
    const { service, runs, events } = harness();
    const started = await service.start(DEVICE, YAML, null);

    const result = service.cancel(runId(started));
    expect(result.ok).toBe(true);
    expect(runs[0]?.killed).toBe(1);

    runs[0]?.handlers.onExit({ code: 143, error: null });
    expect(events.at(-1)).toEqual({
      type: 'finished',
      runId: 'run-1',
      outcome: 'canceled',
      message: null,
      recording: 'none',
    });
  });

  /** Criterion 9 — unknown or finished: refused, and *nothing* emitted. */
  it('refuses a cancel for a run it does not hold', async () => {
    const { service, runs, events } = harness();
    await service.start(DEVICE, YAML, null);
    const before = events.length;

    expect(code(service.cancel('run-99'))).toBe(ERROR_CODES.runNotFound);
    expect(runs[0]?.killed).toBe(0);
    expect(events).toHaveLength(before);
  });

  it('refuses a cancel for a run that already settled', async () => {
    const { service, runs } = harness();
    await service.start(DEVICE, YAML, null);
    runs[0]?.handlers.onExit({ code: 0, error: null });

    expect(code(service.cancel('run-1'))).toBe(ERROR_CODES.runNotFound);
  });
});

describe('the §4.3.2 exclusion', () => {
  /** Criteria 11–12: captures are held off before the CLI ever spawns, and
   * released the moment the run settles — any outcome. */
  it('suspends captures before spawning and resumes on settle', async () => {
    const { service, runs, gateCalls } = harness();

    await service.start(DEVICE, YAML, null);
    expect(gateCalls).toEqual(['suspend']);

    runs[0]?.handlers.onExit({ code: 1, error: null });
    expect(gateCalls).toEqual(['suspend', 'resume']);
  });

  it('waits an in-flight capture out before the CLI spawns', async () => {
    const { service, runs, releaseSuspend } = harness({ holdSuspend: true });

    const starting = service.start(DEVICE, YAML, null);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(runs).toHaveLength(0);

    releaseSuspend();
    runId(await starting);
    expect(runs).toHaveLength(1);
  });
});

describe('dispose', () => {
  /** Criterion 10 — no orphaned JVM survives `before-quit`. */
  it('kills a live run child', async () => {
    const { service, runs } = harness();
    await service.start(DEVICE, YAML, null);

    void service.dispose();

    expect(runs[0]?.killed).toBe(1);
  });

  it('refuses a start once disposed', async () => {
    const { service } = harness();
    await service.dispose();

    expect((await service.start(DEVICE, YAML, null)).ok).toBe(false);
  });
});

/** Recording criteria 1, 2 and 4 — the recorder beside the run. */
describe('recording the run', () => {
  /** Criterion 1 — the recorder is asked before the child is spawned, after
   * the gate, and named after the run so its file carries the id. */
  it('starts the recorder before spawning maestro, named after the run', async () => {
    const { service, order, recordings } = harness();

    await service.start(DEVICE, YAML, 'login.yml');

    expect(order).toEqual(['suspend', `record:${DEVICE}:run-1`, 'spawn']);
    expect(recordings).toHaveLength(1);
  });

  /** Criteria 1 and 4 — a recorder that cannot start does not stop the run;
   * the cause is logged, and kept (criterion 15 reads it). */
  it('runs the flow anyway when the recorder cannot start, and logs why', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { service, runs } = harness({ recorder: 'refuses' });

    const result = await service.start(DEVICE, YAML, 'login.yml');

    expect(result.ok).toBe(true);
    expect(runs).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('not recorded'),
      expect.stringContaining('No adb found'),
    );
  });

  /** A start that dies after the recorder began leaves no recorder behind. */
  it('discards the recording when the spawn itself fails', async () => {
    const missing = coded(ERROR_CODES.runMaestroNotFound, 'The Maestro CLI is not installed.');
    const { service, recordings } = harness({ spawnError: missing });

    await service.start(DEVICE, YAML, 'login.yml');
    await service.settled();

    expect(recordings[0]?.discarded).toBe(1);
    expect(recordings[0]?.saved).toEqual([]);
  });
});

/** Recording criteria 7–9 and 12 — what the outcome decides. */
describe('keeping or discarding the recording', () => {
  /** Criterion 7 — a pass or a cancel leaves nothing behind and says nothing. */
  it.each([
    ['passed', { code: 0, error: null }, false],
    ['canceled', { code: 143, error: null }, true],
  ] as const)('discards after a %s run and pushes no recording event', async (_o, exit, cancel) => {
    const bundle = harness();
    await bundle.service.start(DEVICE, YAML, 'login.yml');
    bundle.runs[0]?.handlers.onProgress({ type: 'step-started', label: 'Launch app "x"' });
    if (cancel) {
      bundle.service.cancel('run-1');
    }

    bundle.runs[0]?.handlers.onExit(exit);
    await bundle.service.settled();

    expect(bundle.events.at(-1)).toMatchObject({ type: 'finished', recording: 'none' });
    expect(bundle.recordings[0]?.discarded).toBe(1);
    expect(bundle.recordings[0]?.saved).toEqual([]);
    expect(recordingEvents(bundle.events)).toEqual([]);
  });

  /** Criterion 9 — a failure that never reached a step recorded nothing
   * worth watching: discarded, and `none`. */
  it('discards a failure that never reached a step, reporting none', async () => {
    const bundle = harness();
    await bundle.service.start(DEVICE, YAML, 'login.yml');
    bundle.runs[0]?.handlers.onProgress({ type: 'log', lines: ['Invalid syntax'] });

    bundle.runs[0]?.handlers.onExit({ code: 1, error: null });
    await bundle.service.settled();

    expect(bundle.events.at(-1)).toMatchObject({
      type: 'finished',
      outcome: 'failed',
      recording: 'none',
    });
    expect(bundle.recordings[0]?.discarded).toBe(1);
    expect(recordingEvents(bundle.events)).toEqual([]);
  });

  /** Criteria 8 and 12 — a failure or an error with a step on record keeps
   * the video: `pending` on the terminal event, the file in Movies after. */
  it.each([
    ['failed', { code: 1, error: null }],
    ['error', { code: null, error: null }],
  ] as const)('saves after a %s run with a step started, announcing pending', async (o, exit) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(RUN_STARTED);
    const bundle = harness();

    await failedRun(bundle, 'login.yml', exit);
    const finished = bundle.events.find((event) => event.type === 'finished');
    expect(finished).toMatchObject({ outcome: o, recording: 'pending' });
    await bundle.service.settled();

    const file = join(bundle.videosDir, 'Conductor', 'login-2026-09-02-143015.mp4');
    expect(existsSync(file)).toBe(true);
    expect(bundle.recordings[0]?.discarded).toBe(0);
    expect(recordingEvents(bundle.events)).toEqual([
      {
        type: 'recording',
        runId: 'run-1',
        ok: true,
        fileName: 'login-2026-09-02-143015.mp4',
        fromSeconds: 0,
      },
    ]);
  });

  /** "A step started" is any step on record — a verdict without its start
   * still means the device did something. */
  it('counts a step whose start was never seen', async () => {
    const bundle = harness();
    await bundle.service.start(DEVICE, YAML, 'login.yml');
    bundle.runs[0]?.handlers.onProgress({ type: 'step-passed', label: 'Launch app "x"' });

    bundle.runs[0]?.handlers.onExit({ code: 1, error: null });

    expect(bundle.events.at(-1)).toMatchObject({ type: 'finished', recording: 'pending' });
  });
});

/** Recording criteria 8, 10 and 11 — the file in the Movies folder. */
describe('the saved file', () => {
  /** Criterion 10 — the flow identity, made safe for a file name; the local
   * time the run started; `flow` when nothing was open. */
  it.each([
    ['checkout/pix.yml', 'checkout-pix'],
    ['login.yaml', 'login'],
    ['fluxos/açaí bowl.yml', 'fluxos-a-a--bowl'],
    ['.yml', 'flow'],
    [null, 'flow'],
  ])('names the file after the flow identity %s', async (identity, slug) => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(RUN_STARTED);
    const bundle = harness();

    await failedRun(bundle, identity);
    await bundle.service.settled();

    expect(recordingEvents(bundle.events)[0]).toMatchObject({
      fileName: `${slug}-2026-09-02-143015.mp4`,
    });
    expect(existsSync(join(bundle.videosDir, 'Conductor', `${slug}-2026-09-02-143015.mp4`))).toBe(
      true,
    );
  });

  /** Criterion 10 — an existing file is never overwritten. */
  it('suffixes the name when the file already exists', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(RUN_STARTED);
    const bundle = harness();
    const dir = join(bundle.videosDir, 'Conductor');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'login-2026-09-02-143015.mp4'), 'earlier');
    writeFileSync(join(dir, 'login-2026-09-02-143015-2.mp4'), 'earlier still');

    await failedRun(bundle);
    await bundle.service.settled();

    expect(recordingEvents(bundle.events)[0]).toMatchObject({
      fileName: 'login-2026-09-02-143015-3.mp4',
    });
    expect(readFileSync(join(dir, 'login-2026-09-02-143015.mp4'), 'utf8')).toBe('earlier');
  });

  /** Criterion 11 — the folder is made, recursively, before the first write. */
  it('creates the Conductor folder when it is missing', async () => {
    const bundle = harness();
    expect(existsSync(bundle.videosDir)).toBe(false);

    await failedRun(bundle);
    await bundle.service.settled();

    expect(existsSync(join(bundle.videosDir, 'Conductor'))).toBe(true);
  });

  /** Criterion 8 — §8.2's idiom: the pull lands under a `.partial` name and
   * only a complete file is renamed into place. */
  it('pulls under a .partial name and renames on completion', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(RUN_STARTED);
    const bundle = harness();

    await failedRun(bundle);
    await bundle.service.settled();

    const dir = join(bundle.videosDir, 'Conductor');
    expect(bundle.recordings[0]?.saved).toEqual([join(dir, 'login-2026-09-02-143015.mp4.partial')]);
    expect(existsSync(join(dir, 'login-2026-09-02-143015.mp4.partial'))).toBe(false);
    expect(existsSync(join(dir, 'login-2026-09-02-143015.mp4'))).toBe(true);
  });
});

/** Recording criteria 6 and 13–16 — the one event after the terminal one. */
describe('the follow-up event', () => {
  /** Criterion 6 — the outcome goes out the moment the exit is known; the
   * video follows, however long the device takes. */
  it('never delays finished for the recording', async () => {
    const bundle = harness({ recorder: { holdSave: true } });

    await failedRun(bundle);

    expect(bundle.events.at(-1)).toMatchObject({ type: 'finished', recording: 'pending' });
    await vi.waitFor(() => expect(bundle.recordings[0]?.saved).toHaveLength(1));
    expect(recordingEvents(bundle.events)).toEqual([]);

    bundle.recordings[0]?.releaseSave();
    await bundle.service.settled();
    expect(recordingEvents(bundle.events)).toHaveLength(1);
  });

  /** Criterion 13 — whole seconds, floored, from the recorder's start to the
   * moment the failed step started. */
  it('reports the failed step’s offset from the recorder’s start, floored', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(RUN_STARTED);
    const bundle = harness();
    await bundle.service.start(DEVICE, YAML, 'login.yml');
    const handlers = bundle.runs[0]?.handlers;
    vi.setSystemTime(RUN_STARTED.getTime() + 3_000);
    handlers?.onProgress({ type: 'step-started', label: 'Launch app "x"' });
    handlers?.onProgress({ type: 'step-passed', label: 'Launch app "x"' });
    vi.setSystemTime(RUN_STARTED.getTime() + 12_900);
    handlers?.onProgress({ type: 'step-started', label: 'Tap on "Entrar"' });
    vi.setSystemTime(RUN_STARTED.getTime() + 20_000);
    handlers?.onProgress({ type: 'step-failed', label: 'Tap on "Entrar"' });
    handlers?.onExit({ code: 1, error: null });
    await bundle.service.settled();

    expect(recordingEvents(bundle.events)[0]).toMatchObject({ ok: true, fromSeconds: 12 });
  });

  it('reports null when no step failed on record', async () => {
    const bundle = harness();
    await bundle.service.start(DEVICE, YAML, 'login.yml');
    bundle.runs[0]?.handlers.onProgress({ type: 'step-started', label: 'Launch app "x"' });
    bundle.runs[0]?.handlers.onProgress({ type: 'step-passed', label: 'Launch app "x"' });

    bundle.runs[0]?.handlers.onExit({ code: 1, error: null });
    await bundle.service.settled();

    expect(recordingEvents(bundle.events)[0]).toMatchObject({ ok: true, fromSeconds: null });
  });

  /** Criterion 13 with criterion 3 — the recorder stopped at the OS's cap
   * before the failed step began: the step is not in the video. */
  it('reports null when the failed step began after the recorder had stopped', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(RUN_STARTED);
    const cap = RUN_STARTED.getTime() + 180_000;
    const bundle = harness({ recorder: { stoppedAt: () => cap } });
    await bundle.service.start(DEVICE, YAML, 'login.yml');
    vi.setSystemTime(cap + 5_000);
    bundle.runs[0]?.handlers.onProgress({ type: 'step-started', label: 'Tap on "Entrar"' });
    bundle.runs[0]?.handlers.onProgress({ type: 'step-failed', label: 'Tap on "Entrar"' });

    bundle.runs[0]?.handlers.onExit({ code: 1, error: null });
    await bundle.service.settled();

    expect(recordingEvents(bundle.events)[0]).toMatchObject({ ok: true, fromSeconds: null });
  });

  /** Criterion 14 — a save that failed says so in the OS's words, and the
   * outcome stays exactly what the exit said. */
  it('reports a save that failed, leaving the outcome as the exit said', async () => {
    const bundle = harness({
      recorder: { saveError: new RecordingFailedError('save', 'EACCES: permission denied') },
    });

    await failedRun(bundle);
    await bundle.service.settled();

    expect(bundle.events.find((event) => event.type === 'finished')).toMatchObject({
      outcome: 'failed',
      message: 'Maestro exited with code 1.',
    });
    expect(recordingEvents(bundle.events)).toEqual([
      {
        type: 'recording',
        runId: 'run-1',
        ok: false,
        message:
          "The recording couldn't be saved to your Movies folder: EACCES: permission denied.",
      },
    ]);
  });

  /** A rejection without words — not an `Error` at all — gets the sentence
   * for a save, never the run's own fallback. */
  it('reports a save that failed without a word, in the save’s own words', async () => {
    const bundle = harness({ recorder: { saveError: 'EACCES' } });

    await failedRun(bundle);
    await bundle.service.settled();

    expect(recordingEvents(bundle.events)).toEqual([
      {
        type: 'recording',
        runId: 'run-1',
        ok: false,
        message:
          "The recording couldn't be saved to your Movies folder: the video could not be saved.",
      },
    ]);
  });

  /** Criterion 14 — a folder that will not take the file is the same failure,
   * and no `.partial` is left behind. Criteria 5 and 21 — the recorder is
   * stopped and its file removed all the same: a refused write must not leave
   * a `screenrecord` running on the device, out of a quit's reach. */
  it('reports a folder that refused the write, and still discards the recording', async () => {
    const bundle = harness();
    mkdirSync(bundle.videosDir, { recursive: true });
    // `Conductor`'s place is taken by a file, so nothing can be written there.
    writeFileSync(join(bundle.videosDir, 'Conductor'), 'not a folder');

    await failedRun(bundle);
    await bundle.service.settled();

    expect(recordingEvents(bundle.events)[0]).toMatchObject({
      ok: false,
      message: expect.stringMatching(
        /^The recording couldn't be saved to your Movies folder: .+\.$/,
      ),
    });
    expect(bundle.recordings[0]?.saved).toEqual([]);
    expect(bundle.recordings[0]?.discarded).toBe(1);
  });

  /** Criterion 15 — a recorder that never started, on a run that would have
   * kept the video: the person learns why there is none. */
  it('reports a run that was never recorded, in the recorder’s words', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bundle = harness({ recorder: 'refuses' });

    await failedRun(bundle);
    await bundle.service.settled();

    expect(bundle.events.find((event) => event.type === 'finished')).toMatchObject({
      recording: 'none',
    });
    expect(recordingEvents(bundle.events)).toEqual([
      {
        type: 'recording',
        runId: 'run-1',
        ok: false,
        message:
          "This run wasn't recorded: No adb found. Install the Android platform-tools, or set CONDUCTOR_ADB_PATH.",
      },
    ]);
  });

  /** Criteria 4 and 15 — a recorder the device refused after the spawn is
   * the same story, told when the save finds out. */
  it('reports a recorder the device refused after the spawn', async () => {
    const bundle = harness({
      recorder: {
        saveError: new RecordingFailedError('record', 'Unable to get output buffers (err=-38)'),
      },
    });

    await failedRun(bundle);
    await bundle.service.settled();

    expect(recordingEvents(bundle.events)).toEqual([
      {
        type: 'recording',
        runId: 'run-1',
        ok: false,
        message: "This run wasn't recorded: Unable to get output buffers (err=-38).",
      },
    ]);
  });

  /** Criterion 7 with 15 — a recorder that failed says nothing on a pass. */
  it('says nothing about a failed recorder when the run passed', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const bundle = harness({ recorder: 'refuses' });
    await bundle.service.start(DEVICE, YAML, 'login.yml');
    bundle.runs[0]?.handlers.onProgress({ type: 'step-started', label: 'Launch app "x"' });

    bundle.runs[0]?.handlers.onExit({ code: 0, error: null });
    await bundle.service.settled();

    expect(recordingEvents(bundle.events)).toEqual([]);
  });

  /** Criterion 13 — exactly one, and criterion 16 — tagged with its run. */
  it('pushes exactly one recording event, tagged with the run', async () => {
    const bundle = harness();

    await failedRun(bundle);
    await bundle.service.settled();

    expect(recordingEvents(bundle.events)).toHaveLength(1);
    expect(recordingEvents(bundle.events)[0]).toMatchObject({ runId: 'run-1' });
  });
});

/** Recording criteria 17–19 — the shortcut to the OS player. */
describe('opening the video', () => {
  it('opens the file main saved for that run, and nothing else', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(RUN_STARTED);
    const bundle = harness();
    await failedRun(bundle);
    await bundle.service.settled();

    const result = await bundle.service.openRecording('run-1');

    expect(result).toEqual({ ok: true, data: { runId: 'run-1' } });
    expect(bundle.opened).toEqual([
      join(bundle.videosDir, 'Conductor', 'login-2026-09-02-143015.mp4'),
    ]);
  });

  /** The report clears when the next run starts (criterion 28), and so does
   * what main would open for it: a run before the current one answers as a
   * video that is gone, and the registry stays bounded by construction. */
  it('forgets the previous run’s video once a new run starts', async () => {
    const bundle = harness();
    await failedRun(bundle);
    await bundle.service.settled();

    await bundle.service.start(DEVICE, YAML, 'login.yml');

    expect(code(await bundle.service.openRecording('run-1'))).toBe(ERROR_CODES.runRecordingMissing);
    expect(bundle.opened).toEqual([]);
  });

  /** Criterion 19 — an id with no saved video opens nothing. */
  it('refuses a run that saved no video', async () => {
    const bundle = harness();
    await bundle.service.start(DEVICE, YAML, 'login.yml');
    bundle.runs[0]?.handlers.onExit({ code: 0, error: null });
    await bundle.service.settled();

    const result = await bundle.service.openRecording('run-1');

    expect(code(result)).toBe(ERROR_CODES.runRecordingMissing);
    expect(code(await bundle.service.openRecording('run-99'))).toBe(
      ERROR_CODES.runRecordingMissing,
    );
    expect(bundle.opened).toEqual([]);
  });

  /** Criterion 18 — the person moved or deleted it since. */
  it('refuses a video that has since left the Movies folder', async () => {
    const bundle = harness();
    await failedRun(bundle);
    await bundle.service.settled();
    rmSync(join(bundle.videosDir, 'Conductor'), { recursive: true, force: true });

    const result = await bundle.service.openRecording('run-1');

    expect(result).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.runRecordingMissing,
        message: 'The video is no longer in your Movies folder.',
      },
    });
    expect(bundle.opened).toEqual([]);
  });

  /** Criterion 18 — the OS's refusal, in its own words. */
  it('reports a player that would not open it', async () => {
    const bundle = harness({ openAnswer: 'No application knows how to open this file.' });
    await failedRun(bundle);
    await bundle.service.settled();

    const result = await bundle.service.openRecording('run-1');

    expect(result).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.runRecordingOpenFailed,
        message: 'No application knows how to open this file.',
      },
    });
  });
});

/** Recording criteria 20–22 — the recorder through the run's lifecycle. */
describe('the recorder’s lifecycle', () => {
  /** Criterion 20 — a cancel stops the recorder and keeps nothing. */
  it('discards the recording when the run is canceled', async () => {
    const bundle = harness();
    await bundle.service.start(DEVICE, YAML, 'login.yml');
    bundle.runs[0]?.handlers.onProgress({ type: 'step-started', label: 'Launch app "x"' });
    bundle.service.cancel('run-1');

    bundle.runs[0]?.handlers.onExit({ code: 143, error: null });
    await bundle.service.settled();

    expect(bundle.recordings[0]?.discarded).toBe(1);
    expect(bundle.recordings[0]?.saved).toEqual([]);
  });

  /** Criterion 21 — `before-quit`: the recorder is cut at once and its file
   * removed, and the disposal waits for that. */
  it('aborts and discards a live recording on dispose', async () => {
    const bundle = harness();
    await bundle.service.start(DEVICE, YAML, 'login.yml');

    const disposing = bundle.service.dispose();
    expect(bundle.recordings[0]?.aborted).toBe(1);
    await disposing;

    expect(bundle.recordings[0]?.discarded).toBe(1);
  });

  /** Criterion 21 — a save in flight is cut short, and its `.partial` goes. */
  it('cuts a save in flight short on dispose, leaving no partial behind', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(RUN_STARTED);
    const bundle = harness({ recorder: { holdSave: true } });
    await failedRun(bundle);
    await vi.waitFor(() => expect(bundle.recordings[0]?.saved).toHaveLength(1));
    const partial = join(bundle.videosDir, 'Conductor', 'login-2026-09-02-143015.mp4.partial');
    writeFileSync(partial, 'half');

    await bundle.service.dispose();

    expect(bundle.recordings[0]?.aborted).toBe(1);
    expect(existsSync(partial)).toBe(false);
    expect(recordingEvents(bundle.events)[0]).toMatchObject({ ok: false });
  });

  /** Criterion 21 — a quit that lands while a start is still waiting on the
   * gate: the start is refused, nothing is spawned, no recorder is asked. */
  it('refuses a start still waiting on the gate when the app quits, spawning nothing', async () => {
    const bundle = harness({ holdSuspend: true });

    const starting = bundle.service.start(DEVICE, YAML, 'login.yml');
    const disposing = bundle.service.dispose();
    bundle.releaseSuspend();

    expect((await starting).ok).toBe(false);
    await disposing;
    expect(bundle.runs).toEqual([]);
    expect(bundle.recordings).toEqual([]);
  });

  /** Criterion 21 — a recorder that came up while the app was quitting is
   * cut at once and its file removed; the disposal waits for that, and
   * maestro is never spawned. */
  it('cuts a recorder that came up while the app was quitting', async () => {
    const bundle = harness({ holdRecord: true });

    const starting = bundle.service.start(DEVICE, YAML, 'login.yml');
    await vi.waitFor(() => expect(bundle.recordings).toHaveLength(1));
    const disposing = bundle.service.dispose();
    bundle.releaseRecord();

    expect((await starting).ok).toBe(false);
    await disposing;
    expect(bundle.runs).toEqual([]);
    expect(bundle.recordings[0]?.aborted).toBe(1);
    expect(bundle.recordings[0]?.discarded).toBe(1);
  });

  /** Criterion 21 — the discard behind a refused spawn, still waiting on the
   * device, is ours to cut; the disposal waits for it and no longer. */
  it('cuts the discard behind a refused spawn on dispose', async () => {
    const missing = coded(ERROR_CODES.runMaestroNotFound, 'The Maestro CLI is not installed.');
    const bundle = harness({ spawnError: missing, recorder: { holdDiscard: true } });
    await bundle.service.start(DEVICE, YAML, 'login.yml');

    await bundle.service.dispose();

    expect(bundle.recordings[0]?.aborted).toBe(1);
    expect(bundle.recordings[0]?.discarded).toBe(1);
  });

  /** Criterion 22 — a new run while the previous video is still saving is
   * accepted; the earlier save finishes on its own, tagged with its run. */
  it('accepts a new run while the previous save is in flight', async () => {
    const bundle = harness({ recorder: { holdSave: true } });
    await failedRun(bundle);
    await vi.waitFor(() => expect(bundle.recordings[0]?.saved).toHaveLength(1));

    const second = await bundle.service.start(DEVICE, YAML, 'login.yml');
    expect(runId(second)).toBe('run-2');

    bundle.recordings[0]?.releaseSave();
    await bundle.service.settled();
    expect(recordingEvents(bundle.events)).toEqual([
      expect.objectContaining({ runId: 'run-1', ok: true }),
    ]);
  });
});

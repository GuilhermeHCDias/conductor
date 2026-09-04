import type { Result } from '@shared/ipc';
import type { RunEvent } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_LOG_LINES, resetRunStore, useRunStore } from './run.store';

/**
 * The projection of a run as the window holds it: started by the only actions
 * allowed to invoke the run channels (criterion 26), fed by `run:event`
 * payloads, and honest about the cap on its log (constraint: unbounded volume,
 * visible truncation).
 */

const DEVICE = 'R9QYC01EMXL';
const YAML = 'appId: com.vtex.pnp\n---\n- launchApp\n';

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

function event(data: RunEvent): Result<RunEvent> {
  return { ok: true, data };
}

/** Starts a run against a conductor whose answer the test controls. */
async function startRun(runId = 'run-1'): Promise<void> {
  window.conductor.runStart = vi.fn(() => Promise.resolve(ok({ runId })));
  await useRunStore.getState().start(DEVICE, YAML, 'login.yml');
}

beforeEach(() => {
  resetRunStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('starting', () => {
  it('invokes run:start with the device, the flow text and the flow identity', async () => {
    const runStart = vi.fn(() => Promise.resolve(ok({ runId: 'run-1' })));
    window.conductor.runStart = runStart;

    await useRunStore.getState().start(DEVICE, YAML, 'login.yml');

    expect(runStart).toHaveBeenCalledWith(DEVICE, YAML, 'login.yml');
    expect(useRunStore.getState().running).toBe(true);
    expect(useRunStore.getState().runId).toBe('run-1');
    expect(useRunStore.getState().outcome).toBeNull();
  });

  /** Criterion 22 — a run refused before it began still reaches the panel as
   * a failure, never as the empty state over a dead click. */
  it('surfaces a refused start as an error outcome', async () => {
    window.conductor.runStart = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'run/maestro-not-found', message: 'The Maestro CLI is not installed.' },
      }),
    );

    await useRunStore.getState().start(DEVICE, YAML, 'login.yml');

    const state = useRunStore.getState();
    expect(state.running).toBe(false);
    expect(state.outcome).toBe('error');
    expect(state.outcomeMessage).toBe('The Maestro CLI is not installed.');
  });

  /** Criterion 21 — the previous run stays readable until, and only until,
   * the next one starts. */
  it('clears the previous run’s report when a new one starts', async () => {
    await startRun('run-1');
    const apply = useRunStore.getState().applyEvent;
    apply(event({ type: 'step-started', runId: 'run-1', label: 'Launch app "x"' }));
    apply(event({ type: 'log', runId: 'run-1', lines: ['Running on device'] }));
    apply(
      event({
        type: 'finished',
        runId: 'run-1',
        outcome: 'failed',
        message: 'code 1',
        recording: 'none',
      }),
    );

    await startRun('run-2');

    const state = useRunStore.getState();
    expect(state.steps).toEqual([]);
    expect(state.logLines).toEqual([]);
    expect(state.outcome).toBeNull();
    expect(state.outcomeMessage).toBeNull();
    expect(state.runId).toBe('run-2');
  });

  it('starts once while a start is already in flight', async () => {
    let releaseStart: (value: Result<{ runId: string }>) => void = () => {};
    const runStart = vi.fn(
      () =>
        new Promise<Result<{ runId: string }>>((resolve) => {
          releaseStart = resolve;
        }),
    );
    window.conductor.runStart = runStart;

    const first = useRunStore.getState().start(DEVICE, YAML, 'login.yml');
    const second = useRunStore.getState().start(DEVICE, YAML, 'login.yml');
    releaseStart(ok({ runId: 'run-1' }));
    await Promise.all([first, second]);

    expect(runStart).toHaveBeenCalledTimes(1);
  });
});

describe('step events', () => {
  it('appends a running step when Maestro starts one', async () => {
    await startRun();

    useRunStore
      .getState()
      .applyEvent(event({ type: 'step-started', runId: 'run-1', label: 'Launch app "x"' }));

    expect(useRunStore.getState().steps).toEqual([
      { id: 'run-1-step-1', label: 'Launch app "x"', status: 'running', duration: undefined },
    ]);
  });

  /** Criterion 19 — the running step settles with the verdict, and carries
   * how long Maestro took on it. */
  it('settles the running step with its verdict and duration', async () => {
    vi.useFakeTimers();
    await startRun();
    const apply = useRunStore.getState().applyEvent;

    apply(event({ type: 'step-started', runId: 'run-1', label: 'Launch app "x"' }));
    vi.advanceTimersByTime(4_200);
    apply(event({ type: 'step-passed', runId: 'run-1', label: 'Launch app "x"' }));

    expect(useRunStore.getState().steps).toEqual([
      { id: 'run-1-step-1', label: 'Launch app "x"', status: 'pass', duration: '0:04' },
    ]);
  });

  it('marks a failing step as fail', async () => {
    await startRun();
    const apply = useRunStore.getState().applyEvent;

    apply(event({ type: 'step-started', runId: 'run-1', label: 'Assert "x"' }));
    apply(event({ type: 'step-failed', runId: 'run-1', label: 'Assert "x"' }));

    expect(useRunStore.getState().steps[0]?.status).toBe('fail');
  });

  /** Best-effort decoration degrades, never breaks: a verdict with no start
   * still lands as a settled step. */
  it('appends a settled step when the verdict arrives without a start', async () => {
    await startRun();

    useRunStore
      .getState()
      .applyEvent(event({ type: 'step-passed', runId: 'run-1', label: 'Tap on "x"' }));

    expect(useRunStore.getState().steps).toEqual([
      { id: 'run-1-step-1', label: 'Tap on "x"', status: 'pass', duration: undefined },
    ]);
  });

  /** Criterion 6 — the tag is what keeps a late event from a canceled run out
   * of the run that replaced it. */
  it('drops an event wearing another run’s id', async () => {
    await startRun('run-2');

    useRunStore
      .getState()
      .applyEvent(event({ type: 'step-started', runId: 'run-1', label: 'stale' }));

    expect(useRunStore.getState().steps).toEqual([]);
  });
});

describe('the log', () => {
  it('appends lines in order, batched per event', async () => {
    await startRun();
    const apply = useRunStore.getState().applyEvent;

    apply(event({ type: 'log', runId: 'run-1', lines: ['Running on device', ' > Flow x'] }));
    apply(event({ type: 'log', runId: 'run-1', lines: ['Launch app "x"... COMPLETED'] }));

    expect(useRunStore.getState().logLines).toEqual([
      'Running on device',
      ' > Flow x',
      'Launch app "x"... COMPLETED',
    ]);
    expect(useRunStore.getState().droppedLines).toBe(0);
  });

  /** The constraint verbatim: the cap keeps the newest lines and is visible,
   * never silent — a looping flow must not eat the window's memory. */
  it('caps the buffer at the newest lines and counts what it dropped', async () => {
    await startRun();
    const apply = useRunStore.getState().applyEvent;
    const lines = Array.from({ length: MAX_LOG_LINES + 10 }, (_, index) => `line ${index + 1}`);

    apply(event({ type: 'log', runId: 'run-1', lines }));

    const state = useRunStore.getState();
    expect(state.logLines).toHaveLength(MAX_LOG_LINES);
    expect(state.logLines[0]).toBe('line 11');
    expect(state.logLines.at(-1)).toBe(`line ${MAX_LOG_LINES + 10}`);
    expect(state.droppedLines).toBe(10);
  });
});

describe('finishing', () => {
  it('lands the outcome and stops running', async () => {
    await startRun();

    useRunStore.getState().applyEvent(
      event({
        type: 'finished',
        runId: 'run-1',
        outcome: 'passed',
        message: null,
        recording: 'none',
      }),
    );

    const state = useRunStore.getState();
    expect(state.running).toBe(false);
    expect(state.outcome).toBe('passed');
    expect(state.completedRuns).toBe(1);
  });

  /** Criterion 21 — the final step states: a step still marked running when
   * the run settles is settled by the outcome. */
  it.each([
    ['passed', 'pass'],
    ['failed', 'fail'],
    ['error', 'fail'],
    ['canceled', 'idle'],
  ] as const)('a still-running step under a %s run reads %s', async (outcome, status) => {
    await startRun();
    const apply = useRunStore.getState().applyEvent;
    apply(event({ type: 'step-started', runId: 'run-1', label: 'Assert "x"' }));

    apply(event({ type: 'finished', runId: 'run-1', outcome, message: null, recording: 'none' }));

    expect(useRunStore.getState().steps[0]?.status).toBe(status);
  });

  it('keeps the log readable after the run', async () => {
    await startRun();
    const apply = useRunStore.getState().applyEvent;
    apply(event({ type: 'log', runId: 'run-1', lines: ['some output'] }));

    apply(
      event({
        type: 'finished',
        runId: 'run-1',
        outcome: 'failed',
        message: 'code 1',
        recording: 'none',
      }),
    );

    expect(useRunStore.getState().logLines).toEqual(['some output']);
    expect(useRunStore.getState().outcomeMessage).toBe('code 1');
  });
});

/** Recording criteria 23–29 — the video of the open run, as the panel reads it. */
describe('the recording', () => {
  const failed = (recording: 'pending' | 'none'): Result<RunEvent> =>
    event({ type: 'finished', runId: 'run-1', outcome: 'failed', message: 'code 1', recording });

  /** Criterion 23 — the terminal event says a video is on its way. */
  it('marks the video as saving when the terminal event says one is on its way', async () => {
    await startRun();

    useRunStore.getState().applyEvent(failed('pending'));

    expect(useRunStore.getState().recording).toEqual({ status: 'saving' });
    expect(useRunStore.getState().recordingNote).toBeNull();
  });

  /** Criterion 27 — nothing to show when nothing is coming. */
  it('holds no recording state when the terminal event says none', async () => {
    await startRun();

    useRunStore.getState().applyEvent(failed('none'));

    expect(useRunStore.getState().recording).toBeNull();
  });

  /** Criterion 24 — the saved video, with its name and where the failed
   * step begins. */
  it('lands the saved video with its name and offset', async () => {
    await startRun();
    const apply = useRunStore.getState().applyEvent;
    apply(failed('pending'));

    apply(
      event({
        type: 'recording',
        runId: 'run-1',
        ok: true,
        fileName: 'login-2026-09-02-143015.mp4',
        fromSeconds: 12,
      }),
    );

    expect(useRunStore.getState().recording).toEqual({
      status: 'saved',
      fileName: 'login-2026-09-02-143015.mp4',
      fromSeconds: 12,
    });
  });

  /** Criterion 26 — a video that could not be saved is a note, and no action. */
  it('lands a failed save as a note, with no video to open', async () => {
    await startRun();
    const apply = useRunStore.getState().applyEvent;
    apply(failed('pending'));

    apply(
      event({
        type: 'recording',
        runId: 'run-1',
        ok: false,
        message: "The recording couldn't be saved to your Movies folder: EACCES.",
      }),
    );

    expect(useRunStore.getState().recording).toBeNull();
    expect(useRunStore.getState().recordingNote).toBe(
      "The recording couldn't be saved to your Movies folder: EACCES.",
    );
  });

  /** Criterion 16 — the previous run's late video never lands on this one. */
  it('drops a recording event wearing another run’s id', async () => {
    await startRun('run-2');

    useRunStore.getState().applyEvent(
      event({
        type: 'recording',
        runId: 'run-1',
        ok: true,
        fileName: 'a.mp4',
        fromSeconds: null,
      }),
    );

    expect(useRunStore.getState().recording).toBeNull();
  });

  /** Criterion 28 — readable until the next run starts, cleared by it. */
  it('clears the video state when a new run starts', async () => {
    await startRun('run-1');
    const apply = useRunStore.getState().applyEvent;
    apply(failed('pending'));
    apply(
      event({
        type: 'recording',
        runId: 'run-1',
        ok: false,
        message: 'This run wasn’t recorded: x.',
      }),
    );

    await startRun('run-2');

    expect(useRunStore.getState().recording).toBeNull();
    expect(useRunStore.getState().recordingNote).toBeNull();
  });

  /** Criterion 29 — a recording event touches only its own slice: the steps
   * and the log keep their identity, so the panels that select them do not
   * re-render for it. */
  it('leaves the steps and the log untouched', async () => {
    await startRun();
    const apply = useRunStore.getState().applyEvent;
    apply(event({ type: 'step-started', runId: 'run-1', label: 'Tap on "x"' }));
    apply(event({ type: 'log', runId: 'run-1', lines: ['a line'] }));
    apply(failed('pending'));
    const { steps, logLines } = useRunStore.getState();

    apply(
      event({ type: 'recording', runId: 'run-1', ok: true, fileName: 'a.mp4', fromSeconds: 3 }),
    );

    expect(useRunStore.getState().steps).toBe(steps);
    expect(useRunStore.getState().logLines).toBe(logLines);
  });
});

/** Recording criterion 25 — the only renderer code invoking `run:open-recording`. */
describe('opening the video', () => {
  async function savedRun(): Promise<void> {
    await startRun();
    const apply = useRunStore.getState().applyEvent;
    apply(
      event({
        type: 'finished',
        runId: 'run-1',
        outcome: 'failed',
        message: null,
        recording: 'pending',
      }),
    );
    apply(
      event({ type: 'recording', runId: 'run-1', ok: true, fileName: 'a.mp4', fromSeconds: null }),
    );
  }

  it('invokes run:open-recording with the run’s id, and nothing else', async () => {
    await savedRun();
    const runOpenRecording = vi.fn(() => Promise.resolve(ok({ runId: 'run-1' })));
    window.conductor.runOpenRecording = runOpenRecording;

    await useRunStore.getState().openRecording();

    expect(runOpenRecording).toHaveBeenCalledExactlyOnceWith('run-1');
    expect(useRunStore.getState().recordingNote).toBeNull();
  });

  /** Criterion 25 — a refusal shows in the outcome bar; the action stays,
   * because the OS may open it on the next try. */
  it('shows a refusal as the note beneath the outcome', async () => {
    await savedRun();
    window.conductor.runOpenRecording = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        error: {
          code: 'run/recording-missing',
          message: 'The video is no longer in your Movies folder.',
        },
      }),
    );

    await useRunStore.getState().openRecording();

    expect(useRunStore.getState().recordingNote).toBe(
      'The video is no longer in your Movies folder.',
    );
    expect(useRunStore.getState().recording).toMatchObject({ status: 'saved' });
  });

  it('does nothing while no video is saved', async () => {
    await startRun();
    const runOpenRecording = vi.fn(() => Promise.resolve(ok({ runId: 'run-1' })));
    window.conductor.runOpenRecording = runOpenRecording;

    await useRunStore.getState().openRecording();

    expect(runOpenRecording).not.toHaveBeenCalled();
  });

  /** A refusal that lands after the next run started belongs to a dead run. */
  it('drops a refusal that arrives after the next run started', async () => {
    await savedRun();
    let refuse: (result: Result<{ runId: string }>) => void = () => {};
    window.conductor.runOpenRecording = vi.fn(
      () =>
        new Promise<Result<{ runId: string }>>((resolve) => {
          refuse = resolve;
        }),
    );

    const opening = useRunStore.getState().openRecording();
    await startRun('run-2');
    refuse({ ok: false, error: { code: 'run/recording-missing', message: 'gone' } });
    await opening;

    expect(useRunStore.getState().recordingNote).toBeNull();
  });
});

describe('canceling', () => {
  /** Criterion 16 — Stop asks; only the terminal event flips the button. */
  it('invokes run:cancel and stays running until the terminal event', async () => {
    await startRun();
    const runCancel = vi.fn(() => Promise.resolve(ok({ runId: 'run-1' })));
    window.conductor.runCancel = runCancel;

    await useRunStore.getState().cancel();

    expect(runCancel).toHaveBeenCalledWith('run-1');
    expect(useRunStore.getState().running).toBe(true);

    useRunStore.getState().applyEvent(
      event({
        type: 'finished',
        runId: 'run-1',
        outcome: 'canceled',
        message: null,
        recording: 'none',
      }),
    );
    expect(useRunStore.getState().running).toBe(false);
    expect(useRunStore.getState().outcome).toBe('canceled');
  });

  it('does nothing while no run is active', async () => {
    const runCancel = vi.fn(() => Promise.resolve(ok({ runId: 'run-1' })));
    window.conductor.runCancel = runCancel;

    await useRunStore.getState().cancel();

    expect(runCancel).not.toHaveBeenCalled();
  });
});

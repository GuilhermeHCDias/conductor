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
  await useRunStore.getState().start(DEVICE, YAML);
}

beforeEach(() => {
  resetRunStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('starting', () => {
  it('invokes run:start with the device and the flow text', async () => {
    const runStart = vi.fn(() => Promise.resolve(ok({ runId: 'run-1' })));
    window.conductor.runStart = runStart;

    await useRunStore.getState().start(DEVICE, YAML);

    expect(runStart).toHaveBeenCalledWith(DEVICE, YAML);
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

    await useRunStore.getState().start(DEVICE, YAML);

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
    apply(event({ type: 'finished', runId: 'run-1', outcome: 'failed', message: 'code 1' }));

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

    const first = useRunStore.getState().start(DEVICE, YAML);
    const second = useRunStore.getState().start(DEVICE, YAML);
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

    useRunStore
      .getState()
      .applyEvent(event({ type: 'finished', runId: 'run-1', outcome: 'passed', message: null }));

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

    apply(event({ type: 'finished', runId: 'run-1', outcome, message: null }));

    expect(useRunStore.getState().steps[0]?.status).toBe(status);
  });

  it('keeps the log readable after the run', async () => {
    await startRun();
    const apply = useRunStore.getState().applyEvent;
    apply(event({ type: 'log', runId: 'run-1', lines: ['some output'] }));

    apply(event({ type: 'finished', runId: 'run-1', outcome: 'failed', message: 'code 1' }));

    expect(useRunStore.getState().logLines).toEqual(['some output']);
    expect(useRunStore.getState().outcomeMessage).toBe('code 1');
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

    useRunStore
      .getState()
      .applyEvent(event({ type: 'finished', runId: 'run-1', outcome: 'canceled', message: null }));
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

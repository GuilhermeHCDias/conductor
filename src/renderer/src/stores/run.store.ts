import type { Result } from '@shared/ipc';
import type { RunEvent, RunOutcome } from '@shared/types';
import { create } from 'zustand';
import { formatClock } from '../lib/clock';

/**
 * The open run, as the window holds it: main owns the truth — the child, the
 * temp file, the exit — and this store is a projection of the `run:event`
 * stream plus the id the start answered with. Its actions are the only
 * renderer code invoking the run channels (criterion 26).
 *
 * Every event is tagged with its run and checked against the one this store
 * holds (criterion 6): a late event from a canceled run must never decorate
 * the run that replaced it.
 */

export type Failure = { readonly code: string; readonly message: string };

/** What a step's dot can say. `idle` is the settle of a canceled run — the
 * step neither passed nor failed; the run went away under it. */
export type RunStepStatus = 'pass' | 'fail' | 'running' | 'idle';

export type RunStep = {
  readonly id: string;
  /** Exactly as Maestro printed it — the one honest name a step has. */
  readonly label: string;
  readonly status: RunStepStatus;
  /** `m:ss` once the step settled; nothing while it runs — a zero would read
   * as "finished instantly". */
  readonly duration?: string;
};

/**
 * The log cap (spec constraint): volume is unbounded — a looping flow writes
 * forever — so the buffer keeps the newest lines and *says* it dropped the
 * rest. Thousands, because a person debugging scrolls far; bounded, because
 * the window's memory is not.
 */
export const MAX_LOG_LINES = 5000;

/**
 * The video of the open run (recording criteria 23–24): `saving` while the
 * terminal event says one is on its way, `saved` once it landed with its name
 * and where the failed step begins — `null` seconds when that is unknown.
 */
export type RunRecording =
  | { readonly status: 'saving' }
  | { readonly status: 'saved'; readonly fileName: string; readonly fromSeconds: number | null };

export type RunData = {
  readonly running: boolean;
  /** The active run — or the last one, kept so its late events still land and
   * its report stays readable until the next start (criterion 21). */
  readonly runId: string | null;
  readonly steps: readonly RunStep[];
  readonly logLines: readonly string[];
  /** How many earlier lines the cap dropped. The panel says so when > 0. */
  readonly droppedLines: number;
  readonly outcome: RunOutcome | null;
  readonly outcomeMessage: string | null;
  /** Monotonic. The inspector watches it for §5.5's end-of-run recapture
   * (criterion 13), the way it watches `inputsSettled` for taps. */
  readonly completedRuns: number;
  /** The run's video, or `null` while there is none to speak of (recording
   * criterion 27). Its own slice, so a recording event re-renders only the
   * row and the bar that read it (criterion 29). */
  readonly recording: RunRecording | null;
  /** What the outcome bar says beneath the label about the video — a save
   * that failed, a run that was never recorded, an open the OS refused
   * (recording criteria 25–26). */
  readonly recordingNote: string | null;
};

export type RunActions = {
  /** Criterion 15 — what you see is what runs: the caller hands the open
   * flow's current in-memory YAML, dirty state included — and the flow's
   * identity, which names a failed run's video (recording criterion 31). */
  start: (deviceId: string, yaml: string, flowPath: string | null) => Promise<void>;
  /** Criterion 16 — asks; only the terminal event flips `running` back. */
  cancel: () => Promise<void>;
  /** Recording criterion 25 — asks main to open the video it saved for this
   * run; the renderer never knows where it is. A refusal lands as the note. */
  openRecording: () => Promise<void>;
  /** Applies one pushed event, however it arrived. */
  applyEvent: (payload: Result<RunEvent>) => void;
};

export type RunState = RunData & RunActions;

function createRunData(): RunData {
  return {
    running: false,
    runId: null,
    steps: [],
    logLines: [],
    droppedLines: 0,
    outcome: null,
    outcomeMessage: null,
    completedRuns: 0,
    recording: null,
    recordingNote: null,
  };
}

/**
 * Wall-clock starts of the steps still running, and the in-flight start guard.
 * Beside the store rather than in it because nothing renders them — the same
 * pattern as `device.store`'s text batching.
 */
const stepStartedAt = new Map<string, number>();
let startInFlight = false;

export const useRunStore = create<RunState>((set, get) => ({
  ...createRunData(),

  start: async (deviceId, yaml, flowPath) => {
    // Two clicks racing the invoke would start two runs; main would refuse
    // the second, and its refusal would then paint an error over the first.
    if (startInFlight || get().running) {
      return;
    }
    startInFlight = true;
    try {
      const result = await window.conductor.runStart(deviceId, yaml, flowPath);
      stepStartedAt.clear();
      if (!result.ok) {
        // Criterion 22: a run refused before it began is still a reported
        // failure — never the empty state over a dead click.
        set({
          ...createRunData(),
          completedRuns: get().completedRuns,
          outcome: 'error',
          outcomeMessage: result.error.message,
        });
        return;
      }
      // Criterion 21's other half: the previous report is cleared by the next
      // start, and by nothing else.
      set({
        ...createRunData(),
        completedRuns: get().completedRuns,
        running: true,
        runId: result.data.runId,
      });
    } finally {
      startInFlight = false;
    }
  },

  cancel: async () => {
    const { running, runId } = get();
    if (!running || runId === null) {
      return;
    }
    // The store changes nothing here: the run is over when main says it is —
    // the terminal event — not when the request leaves (criterion 16).
    await window.conductor.runCancel(runId);
  },

  openRecording: async () => {
    const { runId, recording } = get();
    if (runId === null || recording?.status !== 'saved') {
      return;
    }
    const result = await window.conductor.runOpenRecording(runId);
    // A refusal belongs to the run it was asked for: a start in between
    // cleared the report, and a dead run's note must not land on the new one.
    if (!result.ok && get().runId === runId) {
      set({ recordingNote: result.error.message });
    }
  },

  applyEvent: (payload) => {
    if (!payload.ok) {
      return;
    }
    const event = payload.data;
    const state = get();
    if (event.runId !== state.runId) {
      return;
    }

    switch (event.type) {
      case 'started':
        // Informational: the invoke's answer already flipped the state, and
        // arriving-order between a push and an invoke's resolution is not
        // worth depending on.
        return;
      case 'step-started': {
        const id = `${event.runId}-step-${state.steps.length + 1}`;
        stepStartedAt.set(id, Date.now());
        set({
          steps: [
            ...state.steps,
            { id, label: event.label, status: 'running', duration: undefined },
          ],
        });
        return;
      }
      case 'step-passed':
      case 'step-failed':
        set({ steps: settleStep(state.steps, event) });
        return;
      case 'log': {
        const merged = [...state.logLines, ...event.lines];
        const overflow = merged.length - MAX_LOG_LINES;
        set(
          overflow > 0
            ? { logLines: merged.slice(overflow), droppedLines: state.droppedLines + overflow }
            : { logLines: merged },
        );
        return;
      }
      case 'finished':
        stepStartedAt.clear();
        set({
          running: false,
          outcome: event.outcome,
          outcomeMessage: event.message,
          steps: settleRun(state.steps, event.outcome),
          completedRuns: state.completedRuns + 1,
          // Recording criterion 23 — `pending` is the one word that puts
          // "Saving video…" on the failed row.
          recording: event.recording === 'pending' ? { status: 'saving' } : null,
        });
        return;
      case 'recording':
        // The one event after the terminal one (recording criterion 13) —
        // its own slice and nothing else, so the log and the steps keep
        // their identity (criterion 29).
        set(
          event.ok
            ? {
                recording: {
                  status: 'saved',
                  fileName: event.fileName,
                  fromSeconds: event.fromSeconds,
                },
                recordingNote: null,
              }
            : { recording: null, recordingNote: event.message },
        );
        return;
    }
  },
}));

/** The verdict lands on the step that is running — or, when the start was
 * never seen (best-effort decoration degrades), as a fresh settled step. */
function settleStep(
  steps: readonly RunStep[],
  event: { runId: string; type: 'step-passed' | 'step-failed'; label: string },
): readonly RunStep[] {
  const status: RunStepStatus = event.type === 'step-passed' ? 'pass' : 'fail';
  let runningAt = -1;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (steps[index]?.status === 'running') {
      runningAt = index;
      break;
    }
  }
  if (runningAt === -1) {
    return [
      ...steps,
      {
        id: `${event.runId}-step-${steps.length + 1}`,
        label: event.label,
        status,
        duration: undefined,
      },
    ];
  }
  return steps.map((step, index) =>
    index === runningAt ? { ...step, status, duration: durationOf(step.id) } : step,
  );
}

/** Criterion 21 — the final step states: nothing may keep spinning under a
 * settled run. A cancel settles the step as `idle`; it neither passed nor
 * failed. */
function settleRun(steps: readonly RunStep[], outcome: RunOutcome): readonly RunStep[] {
  const status: RunStepStatus =
    outcome === 'passed' ? 'pass' : outcome === 'canceled' ? 'idle' : 'fail';
  return steps.map((step) => (step.status === 'running' ? { ...step, status } : step));
}

function durationOf(stepId: string): string | undefined {
  const startedAt = stepStartedAt.get(stepId);
  stepStartedAt.delete(stepId);
  if (startedAt === undefined) {
    return undefined;
  }
  return formatClock((Date.now() - startedAt) / 1000);
}

/** Restores the initial state — the timing map and the in-flight guard live
 * outside the store, where no `setState` reaches. */
export function resetRunStore(): void {
  stepStartedAt.clear();
  startInFlight = false;
  useRunStore.setState(createRunData());
}

/** One field each, primitives out — log appends arrive continuously and a
 * selector that allocated would re-render its subscriber per chunk. */
export function selectRunning(state: RunState): boolean {
  return state.running;
}

export function selectSteps(state: RunState): readonly RunStep[] {
  return state.steps;
}

export function selectLogLines(state: RunState): readonly string[] {
  return state.logLines;
}

export function selectDroppedLines(state: RunState): number {
  return state.droppedLines;
}

export function selectOutcome(state: RunState): RunOutcome | null {
  return state.outcome;
}

export function selectOutcomeMessage(state: RunState): string | null {
  return state.outcomeMessage;
}

export function selectCompletedRuns(state: RunState): number {
  return state.completedRuns;
}

/** Recording criterion 29 — the slice the failed row reads; it changes only
 * on the terminal event and the one that follows it, never per log chunk. */
export function selectRecording(state: RunState): RunRecording | null {
  return state.recording;
}

export function selectRecordingNote(state: RunState): string | null {
  return state.recordingNote;
}

/** Criterion 24's numerator: steps that settled, against the flow's own
 * command count. A primitive, so App re-renders per settle — not per frame. */
export function selectSettledStepCount(state: RunState): number {
  return state.steps.filter((step) => step.status === 'pass' || step.status === 'fail').length;
}

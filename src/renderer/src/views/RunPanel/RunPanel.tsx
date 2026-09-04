import type { JSX } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { StatusDot } from '../../components/StatusDot/StatusDot';
import { formatClock } from '../../lib/clock';
import { recordingRowIndex } from '../../lib/recording-row';
import {
  type RunRecording,
  selectOutcome,
  selectOutcomeMessage,
  selectRecording,
  selectRecordingNote,
  selectRunning,
  selectSteps,
  useRunStore,
} from '../../stores/run.store';
import styles from './RunPanel.module.css';

/**
 * The run report (run criteria 19–23): the parsed step list growing as Maestro
 * advances and the outcome when the terminal event lands — and, on a failed
 * run, the video (recording criteria 23–28): the failed step's row carries
 * the action to open it, the outcome bar the note when there is none. The
 * raw Maestro log is not shown (criterion 20 as amended, 2026-09-04): the
 * step list already tells the story, and the text under it read as noise.
 * The store still buffers it; nothing here selects it, so its appends
 * re-render nothing (criterion 26). Everything is `run.store`'s; the panel
 * only selects — narrowly, so a recording event re-renders the failed row
 * and the bar, never the mirror (recording criterion 29).
 */

const OUTCOME_LABEL = {
  passed: 'Run passed',
  failed: 'Run failed',
  canceled: 'Run canceled',
  error: 'Run error',
} as const;

/**
 * Recording criteria 23–24: what sits in the action's place on the failed
 * row — "Saving video…" while the file is on its way, non-interactive; then
 * the action, with the caption saying where in the video the step begins.
 * The action is the DS ghost button, small, drawn inline the way the kit
 * draws its pills.
 */
function RecordingAction({
  recording,
  onOpen,
}: {
  recording: RunRecording;
  onOpen: () => void;
}): JSX.Element {
  if (recording.status === 'saving') {
    return <span className={styles.saving}>Saving video…</span>;
  }
  return (
    <>
      <button className={styles.action} onClick={onOpen} type="button">
        <Icon name="play" size={12} />
        Open video
      </button>
      {recording.fromSeconds !== null ? (
        <span className={styles.caption}>from {formatClock(recording.fromSeconds)}</span>
      ) : null}
    </>
  );
}

export function RunPanel(): JSX.Element {
  const running = useRunStore(selectRunning);
  const steps = useRunStore(selectSteps);
  const outcome = useRunStore(selectOutcome);
  const outcomeMessage = useRunStore(selectOutcomeMessage);
  const recording = useRunStore(selectRecording);
  const recordingNote = useRunStore(selectRecordingNote);
  const openRecording = useRunStore((state) => state.openRecording);
  const hasLog = useRunStore((state) => state.logLines.length > 0);

  // Criterion 23 — the empty state belongs to "no run has ever happened", and
  // to nothing else: a live run with no output yet, or a run that died before
  // its first step (22), are both reports.
  if (!running && outcome === null && steps.length === 0 && !hasLog) {
    return (
      <div className={styles.empty}>
        <Icon className={styles.emptyGlyph} name="play" size={18} />
        <p className={styles.emptyText}>Run the flow and every step reports here as it executes.</p>
      </div>
    );
  }

  // Recording criterion 27 — the store holds `recording` only for a run that
  // kept (or is keeping) a video, so a pass or a cancel finds nothing here.
  const failedAt = recording === null ? -1 : recordingRowIndex(steps);

  return (
    <div className={styles.report}>
      {steps.length > 0 ? (
        <ol className={styles.steps}>
          {steps.map((step, index) => (
            <li className={styles.step} key={step.id}>
              <span aria-hidden="true" className={styles.connector} data-testid="step-connector" />
              <span className={styles.dotWell}>
                <StatusDot
                  className={styles.dot}
                  data-testid="step-dot"
                  size={step.status === 'running' ? 'lg' : 'sm'}
                  state={step.status}
                />
              </span>
              <span className={styles.label}>{step.label}</span>
              {/* The kit's third column, `auto`: the duration, and on the
                  failed row the video's action and caption before it. */}
              <span className={styles.trail}>
                {recording !== null && index === failedAt ? (
                  <RecordingAction onOpen={() => void openRecording()} recording={recording} />
                ) : null}
                <span className={styles.duration} data-testid="step-duration">
                  {step.duration}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {outcome !== null ? (
        // Criterion 21 — the outcome, and its message when there is one. The
        // report above and the log below stay readable under it. Recording
        // criteria 25–26: the video's note goes beneath the label, in the
        // message's own treatment.
        <div className={styles.outcome} data-outcome={outcome} data-testid="run-outcome">
          <span className={styles.outcomeLabel}>{OUTCOME_LABEL[outcome]}</span>
          {outcomeMessage !== null ? (
            <span className={styles.outcomeMessage}>{outcomeMessage}</span>
          ) : null}
          {recordingNote !== null ? (
            <span className={styles.outcomeNote}>{recordingNote}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

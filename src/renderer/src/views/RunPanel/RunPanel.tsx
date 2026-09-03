import { type JSX, memo, type UIEvent, useEffect, useRef } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { StatusDot } from '../../components/StatusDot/StatusDot';
import { formatClock } from '../../lib/clock';
import { recordingRowIndex } from '../../lib/recording-row';
import {
  type RunRecording,
  selectDroppedLines,
  selectLogLines,
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
 * advances, the raw log streaming beneath it, and the outcome when the
 * terminal event lands — and, on a failed run, the video (recording criteria
 * 23–28): the failed step's row carries the action to open it, the outcome
 * bar the note when there is none. Everything is `run.store`'s; the panel
 * only selects — narrowly, because log appends arrive continuously
 * (criterion 26) and a recording event must not re-render the log or the
 * mirror (recording criterion 29).
 */

const OUTCOME_LABEL = {
  passed: 'Run passed',
  failed: 'Run failed',
  canceled: 'Run canceled',
  error: 'Run error',
} as const;

/** How close to the bottom still counts as "at the bottom" — one line of
 * slack, so a sub-pixel scroll position cannot unpin the tail. */
const PIN_SLACK_PX = 24;

/**
 * Criterion 20: pinned to the bottom while the person hasn't scrolled up,
 * holding position when they have. The pin is a ref, not state — scrolling is
 * not a render. Memoised with no props: it re-renders for its own slices and
 * never because the panel around it did — a recording event lands on the
 * failed row, not on thousands of log lines (recording criterion 29).
 */
const RunLog = memo(function RunLog(): JSX.Element | null {
  const lines = useRunStore(selectLogLines);
  const dropped = useRunStore(selectDroppedLines);
  const region = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  useEffect(() => {
    const element = region.current;
    if (lines.length > 0 && pinned.current && element !== null) {
      element.scrollTop = element.scrollHeight;
    }
  }, [lines]);

  if (lines.length === 0) {
    return null;
  }

  const onScroll = (event: UIEvent<HTMLDivElement>): void => {
    const element = event.currentTarget;
    pinned.current =
      element.scrollHeight - element.scrollTop - element.clientHeight <= PIN_SLACK_PX;
  };

  return (
    <div aria-label="Run log" className={styles.log} onScroll={onScroll} ref={region} role="log">
      {dropped > 0 ? (
        // The cap is visible, never silent: a looping flow's tail is real,
        // and pretending the buffer is the whole story would be a lie.
        <div className={styles.droppedNote}>… earlier output dropped</div>
      ) : null}
      {/* One pre-wrap block, not a node per line: the buffer is thousands of
          lines and every chunk appends — a text node replace beats keying. */}
      <div className={styles.logText} data-testid="log-text">
        {lines.join('\n')}
      </div>
    </div>
  );
});

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

      <RunLog />
    </div>
  );
}

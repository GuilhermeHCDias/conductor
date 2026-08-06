import { type JSX, type UIEvent, useEffect, useRef } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { StatusDot } from '../../components/StatusDot/StatusDot';
import {
  selectDroppedLines,
  selectLogLines,
  selectOutcome,
  selectOutcomeMessage,
  selectRunning,
  selectSteps,
  useRunStore,
} from '../../stores/run.store';
import styles from './RunPanel.module.css';

/**
 * The run report (run criteria 19–23): the parsed step list growing as Maestro
 * advances, the raw log streaming beneath it, and the outcome when the
 * terminal event lands. Everything is `run.store`'s; the panel only selects —
 * narrowly, because log appends arrive continuously (criterion 26).
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
 * not a render.
 */
function RunLog(): JSX.Element | null {
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
}

export function RunPanel(): JSX.Element {
  const running = useRunStore(selectRunning);
  const steps = useRunStore(selectSteps);
  const outcome = useRunStore(selectOutcome);
  const outcomeMessage = useRunStore(selectOutcomeMessage);
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

  return (
    <div className={styles.report}>
      {steps.length > 0 ? (
        <ol className={styles.steps}>
          {steps.map((step) => (
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
              <span className={styles.duration} data-testid="step-duration">
                {step.duration}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {outcome !== null ? (
        // Criterion 21 — the outcome, and its message when there is one. The
        // report above and the log below stay readable under it.
        <div className={styles.outcome} data-outcome={outcome} data-testid="run-outcome">
          <span className={styles.outcomeLabel}>{OUTCOME_LABEL[outcome]}</span>
          {outcomeMessage !== null ? (
            <span className={styles.outcomeMessage}>{outcomeMessage}</span>
          ) : null}
        </div>
      ) : null}

      <RunLog />
    </div>
  );
}

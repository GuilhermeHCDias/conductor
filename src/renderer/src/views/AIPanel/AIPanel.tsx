import type { JSX } from 'react';
import { Icon } from '../../components/Icon/Icon';
import {
  type AiThreadEntry,
  selectActivity,
  selectAvailability,
  selectThread,
  useAiStore,
} from '../../stores/ai.store';
import { selectOpenPath, useFlowStore } from '../../stores/flow.store';
import styles from './AIPanel.module.css';

/**
 * Criterion 22 — app-authored, in the UI's own language, inviting the
 * headline journeys; the assistant's replies follow the person's language
 * (the skills own that). The fixtures' app-specific Portuguese lines were
 * review props and left with them.
 */
const SUGGESTIONS: readonly string[] = [
  'Write a test for the login flow',
  'Test the checkout journey',
  'Add a check to the open test',
];

/** The assistant's byline — the window's own quiet voice. */
function Byline(): JSX.Element {
  return (
    <div className={styles.byline}>
      <span className={styles.bylineMark}>
        <Icon name="sparkles" size={11} />
      </span>
      <span className={styles.bylineName}>Conductor</span>
    </div>
  );
}

/**
 * One turn (criterion 21). The assistant speaks unbubbled under the byline;
 * the person's words are bubbled, the way a message they sent should read. A
 * stopped turn keeps its partial text, marked. There is no code surface and
 * no insert affordance: a flow is delivered as the file, never as chat text
 * (§12.21).
 */
function Turn({ entry }: { readonly entry: AiThreadEntry }): JSX.Element {
  if (entry.role === 'notice') {
    return (
      <div className={styles.notice} data-testid="chat-notice">
        {entry.text}
      </div>
    );
  }

  return (
    <div
      className={styles.turn}
      data-role={entry.role === 'person' ? 'user' : 'assistant'}
      data-testid="chat-turn"
    >
      {entry.role === 'assistant' ? <Byline /> : null}
      <div className={styles.body}>{entry.text}</div>
      {entry.role === 'assistant' && entry.status === 'stopped' ? (
        <div className={styles.stopped}>Stopped</div>
      ) : null}
    </div>
  );
}

/** The assistant thread (criteria 21–22), fed by `ai.store`. */
export function AIPanel(): JSX.Element {
  const thread = useAiStore(selectThread);
  const activity = useAiStore(selectActivity);
  const send = useAiStore((state) => state.send);
  const availability = useAiStore(selectAvailability);
  const openPath = useFlowStore(selectOpenPath);

  // The composer's gate (criterion 23) reaches the pills too: a click while
  // the assistant is unavailable would paint a refusal notice over the
  // greeting and hide the suggestions for good.
  const blocked = availability !== null && !availability.ready;

  if (thread.length === 0) {
    return (
      <div className={styles.thread}>
        <div className={styles.turn} data-role="assistant">
          <Byline />
          <div className={styles.body}>
            Tell me what the test should do — I’ll write it while you watch.
          </div>
        </div>
        <div className={styles.pills}>
          {SUGGESTIONS.map((suggestion) => (
            <button
              className={styles.pill}
              disabled={blocked}
              key={suggestion}
              onClick={() => {
                void send(suggestion, openPath);
              }}
              type="button"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.thread}>
      {thread.map((entry) => (
        <Turn entry={entry} key={entry.id} />
      ))}

      {/* Criterion 8's activity — what the assistant is doing while tools
          run, in product language, never a tool name. */}
      {activity === null ? null : (
        <div className={styles.activity} data-testid="chat-activity">
          <span className={styles.activityMark}>
            <Icon name="loader-circle" size={11} />
          </span>
          {activity}
        </div>
      )}
    </div>
  );
}

import type { JSX } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { type ChatTurn, SUGGESTIONS } from '../../fixtures/flows';
import { useUiStore } from '../../stores/ui.store';
import styles from './AIPanel.module.css';

/**
 * One turn. The assistant speaks in the window's own voice — unbubbled, under a
 * quiet label — while the user's words are bubbled, the way a message they sent
 * should read (criterion 33).
 */
function Turn({ turn }: { readonly turn: ChatTurn }): JSX.Element {
  return (
    <div className={styles.turn} data-role={turn.role} data-testid="chat-turn">
      {turn.role === 'assistant' ? (
        <div className={styles.byline}>
          <span className={styles.bylineMark}>
            <Icon name="sparkles" size={11} />
          </span>
          <span className={styles.bylineName}>Conductor</span>
        </div>
      ) : null}

      <div className={styles.body}>{turn.body}</div>

      {turn.code === undefined ? null : (
        <div className={styles.code} data-testid="chat-code">
          <div className={styles.codeHeader}>
            <Icon className={styles.codeGlyph} name="file-code" size={12} />
            <span className={styles.codeLabel}>flow.yaml</span>
          </div>
          <pre className={styles.codeBody}>{turn.code}</pre>
          <div className={styles.codeActions}>
            <button className={styles.insert} type="button">
              <Icon name="plus" size={12} />
              Insert into flow
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** The assistant thread (criterion 33). */
export function AIPanel(): JSX.Element {
  const thread = useUiStore((state) => state.thread);

  return (
    <div className={styles.thread}>
      {thread.map((turn) => (
        <Turn key={turn.id} turn={turn} />
      ))}

      {/* The opening message on its own is a prompt for a first move. */}
      {thread.length === 1 ? (
        <div className={styles.pills}>
          {SUGGESTIONS.map((suggestion) => (
            <button className={styles.pill} key={suggestion} type="button">
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

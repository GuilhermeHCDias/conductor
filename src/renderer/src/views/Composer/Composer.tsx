import { type JSX, type KeyboardEvent, useState } from 'react';
import { IconButton } from '../../components/IconButton/IconButton';
import { selectAvailability, selectStreaming, useAiStore } from '../../stores/ai.store';
import { selectOpenPath, useFlowStore } from '../../stores/flow.store';
import styles from './Composer.module.css';

/**
 * The foot of the working area (criterion 23): the draft is local state —
 * ephemeral, nothing else reads it — and the send crosses through the ai
 * store's action, the open flow riding along (criterion 19). Enter sends,
 * Shift+Enter breaks the line; while a turn streams the send control becomes
 * Stop; and the assistant's availability gates the whole surface, with the
 * reason nearby.
 *
 * Everything AI-facing focuses `--glow-ai`; everything else focuses the accent.
 */
export function Composer(): JSX.Element {
  const [draft, setDraft] = useState('');
  const send = useAiStore((state) => state.send);
  const cancel = useAiStore((state) => state.cancel);
  const streaming = useAiStore(selectStreaming);
  const availability = useAiStore(selectAvailability);
  const openPath = useFlowStore(selectOpenPath);

  const blocked = availability !== null && !availability.ready;

  const submit = (): void => {
    const message = draft.trim();
    if (message === '' || streaming || blocked) {
      return;
    }
    void send(message, openPath).then((accepted) => {
      // Criterion 23 — the draft clears only when the turn actually started;
      // a refused send keeps the person's words where they typed them.
      if (accepted) {
        setDraft('');
      }
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return;
    }
    event.preventDefault();
    submit();
  };

  return (
    <div className={styles.footer}>
      {blocked ? <div className={styles.reason}>{availability.message}</div> : null}
      <div className={styles.surface}>
        <textarea
          aria-label="Ask Conductor"
          className={styles.input}
          disabled={blocked}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          onKeyDown={onKeyDown}
          placeholder="Ask Conductor to write a test…"
          rows={2}
          value={draft}
        />
        <div className={styles.actions}>
          {streaming ? (
            <IconButton
              icon="circle-stop"
              label="Stop"
              onClick={() => {
                void cancel();
              }}
              size="sm"
              variant="ai"
            />
          ) : (
            <IconButton
              disabled={blocked || draft.trim() === ''}
              icon="send"
              label="Send"
              onClick={submit}
              size="sm"
              variant="ai"
            />
          )}
        </div>
      </div>
    </div>
  );
}

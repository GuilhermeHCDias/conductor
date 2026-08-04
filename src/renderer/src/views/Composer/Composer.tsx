import { type JSX, useState } from 'react';
import { IconButton } from '../../components/IconButton/IconButton';
import styles from './Composer.module.css';

/**
 * The foot of the working area (criterion 34). The draft is local state: it is
 * ephemeral, nothing else in the window reads it, and this spec has no
 * assistant to send it to.
 *
 * Everything AI-facing focuses `--glow-ai`; everything else focuses the accent.
 */
export function Composer(): JSX.Element {
  const [draft, setDraft] = useState('');

  return (
    <div className={styles.footer}>
      <div className={styles.surface}>
        <textarea
          aria-label="Ask Conductor"
          className={styles.input}
          onChange={(event) => {
            setDraft(event.target.value);
          }}
          placeholder="Ask Conductor to write a step…"
          rows={2}
          value={draft}
        />
        <div className={styles.actions}>
          <IconButton icon="send" label="Send" size="sm" variant="ai" />
        </div>
      </div>
    </div>
  );
}

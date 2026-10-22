import { type JSX, useEffect, useId, useRef } from 'react';
import styles from './TestAlert.module.css';

/**
 * Throwaway Teste probe (spec: teste-button): a giant TESTEI alert on the
 * window. It only shows and hides; no state is persisted and nothing calls IPC.
 * The scrim blocks clicks on the content behind it, as PublishSheet does.
 */
export function TestAlert({ onDismiss }: { readonly onDismiss: () => void }): JSX.Element {
  const titleId = useId();
  const dismissRef = useRef<HTMLButtonElement>(null);

  // Opening the alert moves focus into it; Escape closes it from anywhere.
  useEffect(() => {
    dismissRef.current?.focus();
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        onDismiss();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
    };
  }, [onDismiss]);

  return (
    <>
      <div
        aria-hidden="true"
        className={styles.scrim}
        data-testid="test-alert-scrim"
        onClick={onDismiss}
      />
      <div aria-labelledby={titleId} className={styles.panel} role="alertdialog">
        <h2 className={styles.message} id={titleId}>
          TESTEI
        </h2>
        <button className={styles.dismiss} onClick={onDismiss} ref={dismissRef} type="button">
          Fechar
        </button>
      </div>
    </>
  );
}

import type { JSX } from 'react';
import { Icon } from '../Icon/Icon';
import styles from './SignInCard.module.css';

/**
 * The GitHub sign-in card (managed-tools criteria 40, 43): the copy and
 * "Sign in with GitHub", then the one-time code with Copy, the device URL
 * line and Open GitHub, then "Signed in as …" — or the failure sentence
 * and Try again. Props in, callbacks out; it knows no store. The installer
 * puts it in place of its method line, the doctor sheet under the GitHub
 * row. The code is shown, never stored (§9.0).
 */

const SIGN_IN_COPY =
  'Conductor sends your tests to GitHub through the GitHub CLI. Sign in happens in your browser — Conductor never sees your password or token.';

export type SignInCardProps = {
  /** The sign-in in flight, with the code once gh printed it. */
  readonly running: { readonly code: string | null } | null;
  readonly signedInAs: string | null;
  readonly failedMessage: string | null;
  readonly onSignIn: () => void;
  /** "Skip for now" — absent where there is nothing to skip (the sheet). */
  readonly onSkip?: () => void;
  readonly onOpen: () => void;
  readonly onCancel: () => void;
};

export function SignInCard({
  running,
  signedInAs,
  failedMessage,
  onSignIn,
  onSkip,
  onOpen,
  onCancel,
}: SignInCardProps): JSX.Element {
  if (signedInAs !== null && running === null) {
    return (
      <div className={styles.card}>
        <p className={styles.signedIn}>
          <Icon className={styles.check} data-testid="setup-check" name="check" size={13} />
          Signed in as {signedInAs}
        </p>
      </div>
    );
  }
  return (
    <div className={styles.card}>
      <h2 className={styles.cardTitle}>Sign in to GitHub</h2>
      {running === null ? (
        <>
          {failedMessage === null ? (
            <p className={styles.cardCopy}>{SIGN_IN_COPY}</p>
          ) : (
            <p className={styles.failure} role="alert">
              {failedMessage}
            </p>
          )}
          <div className={styles.actions}>
            {onSkip !== undefined ? (
              <button className={styles.ghost} onClick={onSkip} type="button">
                Skip for now
              </button>
            ) : null}
            <button className={styles.primary} onClick={onSignIn} type="button">
              {failedMessage === null ? 'Sign in with GitHub' : 'Try again'}
            </button>
          </div>
        </>
      ) : (
        <>
          {running.code === null ? (
            <p className={styles.cardCopy}>Asking GitHub for your one-time code…</p>
          ) : (
            <>
              <div className={styles.codeLine}>
                <span className={styles.code} data-testid="login-code">
                  {running.code}
                </span>
                <button
                  className={styles.ghost}
                  onClick={() => {
                    void navigator.clipboard.writeText(running.code ?? '');
                  }}
                  type="button"
                >
                  Copy code
                </button>
              </div>
              <p className={styles.cardCopy}>
                Enter it at github.com/login/device{' '}
                <button className={styles.link} onClick={onOpen} type="button">
                  Open GitHub
                </button>
              </p>
            </>
          )}
          <div className={styles.actions}>
            <button className={styles.ghost} onClick={onCancel} type="button">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}

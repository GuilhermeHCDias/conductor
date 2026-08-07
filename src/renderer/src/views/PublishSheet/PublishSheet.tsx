import type { PublishChange } from '@shared/ipc';
import type { JSX } from 'react';
import { Dialog } from '../../components/Dialog/Dialog';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { selectOpenPath, useFlowStore } from '../../stores/flow.store';
import { selectSheetPhase, usePublishStore } from '../../stores/publish.store';
import styles from './PublishSheet.module.css';

/**
 * The publish sheet (spec criteria 5–6, 13, 17–18, 24–27) — the kit's
 * `CSendSheet` over the app's `Dialog`: what changed as rows a person can
 * read, one editable note, one button. Ephemeral, never a form (§8.5): the
 * note is AI-prefilled and optional, and everything Git-shaped stays in main
 * — the single sanctioned exception is the literal "View on GitHub".
 */

/** Criterion 8's vocabulary, drawn the kit's way. */
const CHANGE_KIND: Record<
  PublishChange['kind'],
  { readonly verb: string; readonly icon: IconName }
> = {
  added: { verb: 'Added', icon: 'plus' },
  changed: { verb: 'Changed', icon: 'pencil' },
  deleted: { verb: 'Deleted', icon: 'trash-2' },
};

/** The step labels §8.4 names — checking, sending, opening the review. */
const STEP_LABEL = {
  checking: 'Checking',
  sending: 'Sending',
  'opening-review': 'Opening the review',
} as const;

export function PublishSheet(): JSX.Element | null {
  const sheetOpen = usePublishStore((state) => state.sheetOpen);
  const changes = usePublishStore((state) => state.changes);
  const reviewOpen = usePublishStore((state) => state.reviewOpen);
  const phase = usePublishStore(selectSheetPhase);
  const note = usePublishStore((state) => state.note);
  const writing = usePublishStore((state) => state.writing);
  const sendStep = usePublishStore((state) => state.sendStep);
  const failure = usePublishStore((state) => state.failure);
  const closeSheet = usePublishStore((state) => state.closeSheet);
  const editNote = usePublishStore((state) => state.editNote);
  const sendForReview = usePublishStore((state) => state.sendForReview);
  const openOnGitHub = usePublishStore((state) => state.openOnGitHub);
  const openPath = useFlowStore(selectOpenPath);

  if (!sheetOpen) {
    return null;
  }

  const sending = phase === 'sending';
  const sent = phase === 'sent';
  const count = changes.length;
  const title = sent
    ? 'Waiting for review'
    : count === 0
      ? 'Everything sent'
      : `Send ${count} ${count === 1 ? 'change' : 'changes'}`;
  // Criterion 6 — with a review already open, the sheet says these changes
  // join it; there is never a second review.
  const subtitle = sent
    ? 'Your team will look at these and put them in the shared project. You can keep working — new changes join the same review.'
    : reviewOpen
      ? 'These changes will join the review your team is already looking at.'
      : 'Your work is already saved on this Mac. Sending puts it in front of your team, who adds it to the shared project.';

  // The kit blocks every exit mid-send: a send is quick or visibly failing,
  // never abandoned half-told.
  const onClose = (): void => {
    if (!sending) {
      closeSheet();
    }
  };

  return (
    <Dialog
      footer={
        <>
          <span className={styles.scope}>
            <Icon name="folder" size={12} />
            conductor/
          </span>
          {sent ? (
            <>
              <button
                className={styles.ghost}
                onClick={() => {
                  void openOnGitHub();
                }}
                type="button"
              >
                View on GitHub
              </button>
              <button className={styles.primary} onClick={closeSheet} type="button">
                Done
              </button>
            </>
          ) : (
            <>
              <button className={styles.ghost} disabled={sending} onClick={onClose} type="button">
                Not yet
              </button>
              <button
                className={styles.primary}
                disabled={sending || count === 0}
                onClick={() => {
                  void sendForReview(openPath);
                }}
                type="button"
              >
                <Icon
                  className={sending ? styles.spin : undefined}
                  name={sending ? 'loader-circle' : 'send'}
                  size={13}
                />
                {sending ? STEP_LABEL[sendStep ?? 'sending'] : 'Send for review'}
              </button>
            </>
          )}
        </>
      }
      icon={sent ? 'clock' : 'send'}
      onClose={onClose}
      subtitle={subtitle}
      title={title}
      width={520}
    >
      {sent || count === 0 ? null : (
        <ul className={styles.rows}>
          {changes.map((change) => (
            <ChangeRow change={change} key={change.path} />
          ))}
        </ul>
      )}
      {sent ? null : (
        <label className={styles.field}>
          <span className={styles.label}>
            What changed? <span className={styles.optional}>Optional — it helps the reviewer.</span>
            {writing ? (
              <span className={styles.writing}>
                <Icon className={styles.spin} name="loader-circle" size={12} />
                Writing…
              </span>
            ) : null}
          </span>
          <textarea
            className={styles.note}
            disabled={sending}
            onChange={(event) => {
              editNote(event.target.value);
            }}
            placeholder="Fixed the checkout test after the button moved"
            rows={2}
            value={note}
          />
        </label>
      )}
      {failure === null ? null : (
        <p className={styles.failure} role="alert">
          {failure.message}
        </p>
      )}
    </Dialog>
  );
}

/** One unsent change (criterion 5): icon + verb, file name, and where it
 * lives under `conductor/`. */
function ChangeRow({ change }: { readonly change: PublishChange }): JSX.Element {
  const kind = CHANGE_KIND[change.kind];
  const separator = change.path.lastIndexOf('/');
  const name = separator === -1 ? change.path : change.path.slice(separator + 1);
  const folder = separator === -1 ? '' : `${change.path.slice(0, separator)}/`;
  return (
    <li className={styles.row} data-kind={change.kind}>
      <Icon className={styles.rowIcon} name={kind.icon} size={13} />
      <span className={styles.file}>
        <span className={styles.name}>{name}</span>
        <span className={styles.place}>conductor/{folder}</span>
      </span>
      <span className={styles.verb}>{kind.verb}</span>
    </li>
  );
}

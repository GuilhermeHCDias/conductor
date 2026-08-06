import { type JSX, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { IconButton } from '../../components/IconButton/IconButton';
import { type FlowChange, REVIEWER } from '../../fixtures/flows';
import { counted } from '../../lib/plural';
import { type ChangedFlow, selectUnsentChanges, useUiStore } from '../../stores/ui.store';
import styles from './PublishSheet.module.css';

/**
 * §8.5's ephemeral publication sheet — a folha, not a panel. The person is not
 * a developer, so nothing here says "pull request", "branch" or "commit": you
 * change tests, you send them, someone looks at them, they go in. The only
 * place GitHub's vocabulary appears is the "View on GitHub" link, because it
 * leads somewhere the word is written anyway.
 *
 * Everything renders and transitions on fixture state in `ui.store.ts` — the
 * real `gh pr create` belongs to `PublishService`, in a later spec.
 */

/**
 * What Tab may land on inside the sheet. The dialog itself is `tabindex="-1"`
 * — focusable by script, skipped by Tab — so it is excluded here.
 */
const FOCUSABLE =
  'button:not([disabled]), textarea:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

/** How each kind of change presents; the colours ride on `data-kind` in CSS. */
const KIND: Record<FlowChange, { readonly icon: IconName; readonly verb: string }> = {
  new: { icon: 'plus', verb: 'Added' },
  edited: { icon: 'pencil', verb: 'Changed' },
  deleted: { icon: 'trash-2', verb: 'Deleted' },
};

function ChangeRow({ change }: { readonly change: ChangedFlow }): JSX.Element {
  const kind = KIND[change.change];

  return (
    <div className={styles.row} data-kind={change.change}>
      <Icon
        className={styles.rowGlyph}
        data-testid={`change-glyph-${change.change}`}
        name={kind.icon}
        size={13}
      />
      <span className={styles.rowText}>
        <span className={styles.rowName}>{change.name}</span>
        <span className={styles.rowPath}>
          conductor/{change.folder === undefined ? '' : `${change.folder}/`}
        </span>
      </span>
      <span className={styles.rowVerb}>{kind.verb}</span>
    </div>
  );
}

/**
 * The open sheet. Its own component so the note — local state, never sent
 * anywhere — unmounts with it and a reopened sheet starts blank.
 */
function SendSheet(): JSX.Element {
  const phase = useUiStore((state) => state.sendPhase);
  const unsent = useUiStore(selectUnsentChanges);
  const sentChanges = useUiStore((state) => state.sentChanges);
  const send = useUiStore((state) => state.send);
  const closeSend = useUiStore((state) => state.closeSend);
  const [note, setNote] = useState('');
  const titleId = useId();
  const noteId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);

  // `aria-modal` promises the rest of the window is unreachable while this is
  // open, so the promise has to be kept rather than only declared: focus
  // enters the sheet on open and returns to whatever opened it on close.
  // Mounting IS opening — `PublishSheet` renders nothing when it is shut.
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    sheetRef.current?.focus();
    return () => {
      opener?.focus();
    };
  }, []);

  // The other half of that promise: Tab cycles inside the sheet instead of
  // walking out into the toolbar the scrim only *looks* like it is covering.
  function trapTab(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key !== 'Tab' || sheetRef.current === null) {
      return;
    }
    const focusable = [...sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable.at(0);
    const last = focusable.at(-1);
    if (first === undefined || last === undefined) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  const sending = phase === 'sending';
  const sent = phase === 'review';
  // Criterion 11: once sent, the sheet speaks about the frozen batch — work
  // that piles up meanwhile is the toolbar pill's +n, not this list.
  const changes = sent ? sentChanges : unsent;

  return (
    <div className={styles.plane}>
      {/* The scrim is decoration that happens to be clickable, so it sits
          BEHIND the dialog as an aria-hidden sibling — never around it, which
          would hide the dialog from the screen reader. Escape, the keyboard
          path to the same dismissal, is useWindowShortcuts' job. */}
      <div
        aria-hidden="true"
        className={styles.scrim}
        data-testid="sheet-scrim"
        onClick={sending ? undefined : closeSend}
      />
      <div className={styles.frame}>
        <div
          aria-labelledby={titleId}
          aria-modal="true"
          className={styles.sheet}
          onKeyDown={trapTab}
          ref={sheetRef}
          role="dialog"
          tabIndex={-1}
        >
          <div className={styles.header}>
            <span className={styles.emblem} data-sent={sent ? 'true' : undefined}>
              <Icon name={sent ? 'clock' : 'send'} size={15} />
            </span>
            <div className={styles.heading}>
              <h2 className={styles.title} id={titleId}>
                {sent ? 'Waiting for review' : `Send ${counted(changes.length, 'change')}`}
              </h2>
              <p className={styles.subtitle}>
                {sent
                  ? `${REVIEWER} will look at these and put them in the shared project. You can keep working — new changes join the same review.`
                  : `Your work is already saved on this Mac. Sending puts it in front of ${REVIEWER}, who adds it to the shared project.`}
              </p>
            </div>
            {sending ? null : <IconButton icon="x" label="Close" onClick={closeSend} size="sm" />}
          </div>

          <div className={styles.body}>
            <div className={styles.list}>
              {changes.map((change) => (
                <ChangeRow change={change} key={change.id} />
              ))}
            </div>
            {sent ? null : (
              <div className={styles.note}>
                <span className={styles.noteHead}>
                  <label htmlFor={noteId}>What changed?</label>{' '}
                  <span className={styles.noteHelper}>Optional — it helps the reviewer.</span>
                </span>
                <textarea
                  className={styles.noteInput}
                  disabled={sending}
                  id={noteId}
                  onChange={(event) => {
                    setNote(event.target.value);
                  }}
                  placeholder="Fixed the checkout test after the button moved"
                  rows={2}
                  value={note}
                />
              </div>
            )}
          </div>

          <div className={styles.footer} data-testid="sheet-footer">
            <span className={styles.footerPath}>
              <Icon name="folder" size={12} />
              conductor/
            </span>
            {sent ? (
              <>
                <button className={styles.ghost} type="button">
                  View on GitHub
                </button>
                <button className={styles.primary} onClick={closeSend} type="button">
                  Done
                </button>
              </>
            ) : (
              <>
                <button
                  className={styles.ghost}
                  disabled={sending}
                  onClick={closeSend}
                  type="button"
                >
                  Not yet
                </button>
                <button className={styles.primary} disabled={sending} onClick={send} type="button">
                  {sending ? null : <Icon name="send" size={13} />}
                  {sending ? 'Sending' : 'Send for review'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function PublishSheet(): JSX.Element | null {
  const open = useUiStore((state) => state.sendOpen);

  if (!open) {
    return null;
  }
  return <SendSheet />;
}

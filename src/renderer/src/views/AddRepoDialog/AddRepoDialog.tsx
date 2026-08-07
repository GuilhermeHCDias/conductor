import type { JSX } from 'react';
import { Dialog } from '../../components/Dialog/Dialog';
import { RepoResolver } from '../../components/RepoResolver/RepoResolver';
import { useRepoStore } from '../../stores/repo.store';
import styles from './AddRepoDialog.module.css';

/**
 * Adding a repo later is the same act as the first one, so it is the same
 * resolver — only the container changes, from a window to a sheet
 * (CRepo.jsx `CAddRepoDialog`). The store resets the field on open, and a
 * confirm closes the sheet the moment the repo becomes active.
 */
export function AddRepoDialog(): JSX.Element | null {
  const addOpen = useRepoStore((state) => state.addOpen);
  const url = useRepoStore((state) => state.url);
  const phase = useRepoStore((state) => state.phase);
  const step = useRepoStore((state) => state.step);
  const found = useRepoStore((state) => state.found);
  const resolveError = useRepoStore((state) => state.resolveError);
  const setUrl = useRepoStore((state) => state.setUrl);
  const submit = useRepoStore((state) => state.submit);
  const confirm = useRepoStore((state) => state.confirm);
  const closeAdd = useRepoStore((state) => state.closeAdd);
  const pasteFromClipboard = useRepoStore((state) => state.pasteFromClipboard);
  const copyCommand = useRepoStore((state) => state.copyCommand);

  if (!addOpen) {
    return null;
  }

  return (
    <Dialog
      footer={
        <>
          <button className={styles.cancel} onClick={closeAdd} type="button">
            Cancel
          </button>
          <button
            className={styles.open}
            disabled={phase !== 'found'}
            onClick={() => {
              void confirm();
            }}
            type="button"
          >
            {phase === 'found' && found !== null ? `Open ${found.appName}` : 'Open project'}
          </button>
        </>
      }
      icon="git-branch"
      onClose={closeAdd}
      subtitle="Conductor reads the app, its bundle id and the conductor/ folder from the repo."
      title="Add repository"
      width={520}
    >
      <RepoResolver
        autoFocus
        error={resolveError}
        found={found}
        onCopyCommand={(command) => {
          void copyCommand(command);
        }}
        onPaste={() => {
          void pasteFromClipboard();
        }}
        onSubmit={() => {
          void submit();
        }}
        onUrlChange={setUrl}
        phase={phase}
        step={step}
        url={url}
      />
    </Dialog>
  );
}

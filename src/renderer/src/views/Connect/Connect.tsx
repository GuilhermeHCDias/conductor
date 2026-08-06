import type { JSX } from 'react';
import icon from '../../../../../build/icon.png';
import { RepoResolver } from '../../components/RepoResolver/RepoResolver';
import { useRepoStore } from '../../stores/repo.store';
import styles from './Connect.module.css';

/**
 * First run (CRepo.jsx `CConnectWindow`): a small window, nothing between
 * the person and the app but one pasted address. The mark is the real
 * Conductor icon — `build/icon.png` — in place of the kit's gradient "C"
 * (spec decision). The window chrome is the OS's own; the top strip only
 * gives the frameless window something to drag by.
 */
export function Connect(): JSX.Element {
  const url = useRepoStore((state) => state.url);
  const phase = useRepoStore((state) => state.phase);
  const step = useRepoStore((state) => state.step);
  const found = useRepoStore((state) => state.found);
  const resolveError = useRepoStore((state) => state.resolveError);
  const setUrl = useRepoStore((state) => state.setUrl);
  const submit = useRepoStore((state) => state.submit);
  const confirm = useRepoStore((state) => state.confirm);
  const pasteFromClipboard = useRepoStore((state) => state.pasteFromClipboard);
  const copyCommand = useRepoStore((state) => state.copyCommand);

  return (
    <section aria-label="Connect a repository" className={styles.connect}>
      <div aria-hidden="true" className={styles.drag} />
      <div className={styles.body}>
        <div className={styles.heading}>
          <img alt="" className={styles.mark} data-testid="connect-mark" src={icon} />
          <h1 className={styles.title}>Point Conductor at a repository</h1>
          <p className={styles.copy}>
            Everything comes from the repo: the app to launch, its bundle id, and the conductor/
            folder your flows live in. You can add more later.
          </p>
        </div>
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
      </div>
      <div className={styles.footer}>
        <span className={styles.footerNote}>Nothing is pushed without you</span>
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
      </div>
    </section>
  );
}

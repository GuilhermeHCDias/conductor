import { type JSX, useState } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { RepoPopover } from '../../components/RepoPopover/RepoPopover';
import { primaryBundleId } from '../../lib/repo-labels';
import { selectActiveRepo, useRepoStore } from '../../stores/repo.store';
import styles from './RepoBar.module.css';

/**
 * The sidebar's top bar (CRepo.jsx `CRepoBar`): it names the project the
 * whole sidebar belongs to, and carries the two facts that change under you
 * — the branch and the app being launched. Clicking it opens the switcher;
 * "Add repository…" hands off to the add sheet through the store.
 */
export function RepoBar(): JSX.Element | null {
  const repos = useRepoStore((state) => state.repos);
  const activeSlug = useRepoStore((state) => state.active);
  const active = useRepoStore(selectActiveRepo);
  const switchRepo = useRepoStore((state) => state.switchRepo);
  const openAdd = useRepoStore((state) => state.openAdd);
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  if (active === null) {
    return null;
  }
  const bundle = primaryBundleId(active.appId);
  const meta = active.branch === null ? bundle : `${active.branch} · ${bundle}`;

  return (
    <div className={styles.bar}>
      <button
        aria-expanded={at !== null}
        aria-haspopup="menu"
        className={styles.trigger}
        data-open={at === null ? undefined : 'true'}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAt(at === null ? { x: Math.round(rect.left), y: Math.round(rect.bottom + 5) } : null);
        }}
        type="button"
      >
        <span aria-hidden="true" className={styles.tile}>
          {active.appName.charAt(0)}
        </span>
        <span className={styles.names}>
          <span className={styles.name}>{active.name}</span>
          <span className={styles.meta}>{meta}</span>
        </span>
        <Icon className={styles.chevrons} name="chevrons-up-down" size={13} />
      </button>
      {at !== null ? (
        <RepoPopover
          activeSlug={activeSlug}
          at={at}
          onAdd={() => {
            setAt(null);
            openAdd();
          }}
          onClose={() => {
            setAt(null);
          }}
          onSelect={(slug) => {
            setAt(null);
            void switchRepo(slug);
          }}
          repos={repos}
        />
      ) : null}
    </div>
  );
}

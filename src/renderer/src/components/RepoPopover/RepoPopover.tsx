import type { ConnectedRepo } from '@shared/ipc';
import { type JSX, useEffect } from 'react';
import { primaryBundleId } from '../../lib/repo-labels';
import { Icon } from '../Icon/Icon';
import styles from './RepoPopover.module.css';

/**
 * A project picker, not a menu (CRepo.jsx): each row carries the bundle id,
 * which is how people tell two builds of the same app apart, and the flow
 * count says how much lives there. The third floating layer after the
 * command menu and the dialog — presentational, positioned by its caller.
 */

export type RepoPopoverProps = {
  /** Client px, from the trigger's rect. */
  readonly at: { readonly x: number; readonly y: number };
  readonly repos: readonly ConnectedRepo[];
  readonly activeSlug: string | null;
  readonly onSelect: (slug: string) => void;
  readonly onAdd: () => void;
  readonly onClose: () => void;
};

export function RepoPopover({
  at,
  repos,
  activeSlug,
  onSelect,
  onAdd,
  onClose,
}: RepoPopoverProps): JSX.Element {
  // Window-wide, like the dialog: Escape must work wherever focus sits.
  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <>
      <button
        aria-label="Dismiss"
        className={styles.backdrop}
        data-testid="repo-popover-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div className={styles.menu} role="menu" style={{ left: at.x, top: at.y }}>
        <span className={styles.label}>Repositories</span>
        {repos.map((repo) => (
          <RepoRow
            active={repo.slug === activeSlug}
            key={repo.slug}
            onSelect={onSelect}
            repo={repo}
          />
        ))}
        <span aria-hidden="true" className={styles.divider} />
        <button className={styles.add} onClick={onAdd} role="menuitem" type="button">
          <Icon className={styles.addGlyph} name="plus" size={13} />
          Add repository…
        </button>
      </div>
    </>
  );
}

type RepoRowProps = {
  readonly repo: ConnectedRepo;
  readonly active: boolean;
  readonly onSelect: (slug: string) => void;
};

/** Every row carries its flow count (the criterion asks for it on all of
 * them); the active one wears the check beside its count, not instead. */
function RepoRow({ repo, active, onSelect }: RepoRowProps): JSX.Element {
  return (
    <button
      className={styles.row}
      data-active={active ? 'true' : undefined}
      onClick={() => {
        onSelect(repo.slug);
      }}
      role="menuitem"
      type="button"
    >
      <span className={styles.tile}>{repo.appName.charAt(0)}</span>
      <span className={styles.names}>
        <span className={styles.rowName}>{repo.name}</span>
        <span className={styles.rowBundle}>{primaryBundleId(repo.appId)}</span>
      </span>
      <span className={styles.trailing}>
        <span className={styles.count}>{repo.flowCount}</span>
        {active ? (
          <Icon className={styles.check} data-testid="repo-active-check" name="check" size={13} />
        ) : null}
      </span>
    </button>
  );
}

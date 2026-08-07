import type { ConnectedRepo } from '@shared/ipc';
import { type JSX, type KeyboardEvent, useEffect, useRef } from 'react';
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
  const menuRef = useRef<HTMLDivElement | null>(null);

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

  // `role="menu"` promises the ARIA menu pattern: focus enters on open —
  // the active row, or the first item — and goes back where it came from
  // when the popover leaves.
  useEffect(() => {
    const menu = menuRef.current;
    const before = document.activeElement;
    const active = menu?.querySelector<HTMLElement>('[role="menuitem"][data-active]');
    (active ?? menu?.querySelector<HTMLElement>('[role="menuitem"]'))?.focus();
    return () => {
      if (before instanceof HTMLElement && before.isConnected) {
        before.focus();
      }
    };
  }, []);

  const walkItems = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      return;
    }
    const menu = menuRef.current;
    if (menu === null) {
      return;
    }
    const items = [...menu.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    if (items.length === 0) {
      return;
    }
    event.preventDefault();
    const focused = document.activeElement;
    const current = focused instanceof HTMLElement ? items.indexOf(focused) : -1;
    let next: number;
    if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = items.length - 1;
    } else if (event.key === 'ArrowDown') {
      next = current === -1 ? 0 : (current + 1) % items.length;
    } else {
      next = current <= 0 ? items.length - 1 : current - 1;
    }
    items[next]?.focus();
  };

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
      <div
        className={styles.menu}
        onKeyDown={walkItems}
        ref={menuRef}
        role="menu"
        style={{ left: at.x, top: at.y }}
      >
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

import type { ConnectedRepo } from '@shared/ipc';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RepoPopover, type RepoPopoverProps } from './RepoPopover';

/** The switcher: every connected repo with its bundle id and flow count,
 * the active one checked, a row click switching, and one way in for the
 * next repo. */

function repo(slug: string, name: string, flowCount: number): ConnectedRepo {
  return {
    url: `https://github.com/loja-verde/${name}`,
    org: 'loja-verde',
    name,
    slug,
    appName: name,
    appId: { android: `com.lojaverde.${slug}`, ios: null },
    branch: 'main',
    flowCount,
    connectedAt: '2026-08-06T12:00:00.000Z',
  };
}

function popover(overrides: Partial<RepoPopoverProps> = {}): RepoPopoverProps {
  return {
    at: { x: 12, y: 48 },
    repos: [repo('pnp-slug', 'pnp-fast-mode', 4), repo('other-slug', 'other-app', 0)],
    activeSlug: 'pnp-slug',
    onSelect: vi.fn(),
    onAdd: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  };
}

describe('the repo popover', () => {
  /** Criterion: every connected repo, bundle id AND flow count — the check
   * marks the active row in addition to its count, never instead of it. */
  it('lists every connected repo with its bundle id and flow count', () => {
    render(<RepoPopover {...popover()} />);

    const active = screen.getByRole('menuitem', { name: /pnp-fast-mode/ });
    expect(within(active).getByText('com.lojaverde.pnp-slug')).toBeInTheDocument();
    expect(within(active).getByText('4')).toBeInTheDocument();
    const other = screen.getByRole('menuitem', { name: /other-app/ });
    expect(within(other).getByText('com.lojaverde.other-slug')).toBeInTheDocument();
    expect(within(other).getByText('0')).toBeInTheDocument();
  });

  it('checks only the active repo', () => {
    render(<RepoPopover {...popover()} />);

    const active = screen.getByRole('menuitem', { name: /pnp-fast-mode/ });
    expect(within(active).getByTestId('repo-active-check')).toBeInTheDocument();
    const other = screen.getByRole('menuitem', { name: /other-app/ });
    expect(within(other).queryByTestId('repo-active-check')).not.toBeInTheDocument();
  });

  it('switches on a row click', async () => {
    const props = popover();
    render(<RepoPopover {...props} />);

    await userEvent.click(screen.getByRole('menuitem', { name: /other-app/ }));

    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith('other-slug');
  });

  it('opens the add sheet from its last row', async () => {
    const props = popover();
    render(<RepoPopover {...props} />);

    await userEvent.click(screen.getByRole('menuitem', { name: 'Add repository…' }));

    expect(props.onAdd).toHaveBeenCalled();
  });

  it('closes on the backdrop and on Escape', async () => {
    const props = popover();
    render(<RepoPopover {...props} />);

    await userEvent.click(screen.getByTestId('repo-popover-backdrop'));
    expect(props.onClose).toHaveBeenCalledTimes(1);

    await userEvent.keyboard('{Escape}');
    expect(props.onClose).toHaveBeenCalledTimes(2);
  });

  /** `role="menu"` is a promise (the ARIA menu pattern): focus lands
   * inside on open, the arrows walk the items with wrap, Home/End jump,
   * and whoever had focus gets it back when the popover leaves. */
  it('focuses the active row on open, the first when none is active', () => {
    const { unmount } = render(<RepoPopover {...popover()} />);
    expect(screen.getByRole('menuitem', { name: /pnp-fast-mode/ })).toHaveFocus();
    unmount();

    render(<RepoPopover {...popover({ activeSlug: null })} />);
    expect(screen.getByRole('menuitem', { name: /pnp-fast-mode/ })).toHaveFocus();
  });

  it('walks the items with the arrows, wrapping at both ends', async () => {
    render(<RepoPopover {...popover()} />);

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /other-app/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Add repository…' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: /pnp-fast-mode/ })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Add repository…' })).toHaveFocus();
  });

  it('jumps with Home and End', async () => {
    render(<RepoPopover {...popover()} />);

    await userEvent.keyboard('{End}');
    expect(screen.getByRole('menuitem', { name: 'Add repository…' })).toHaveFocus();
    await userEvent.keyboard('{Home}');
    expect(screen.getByRole('menuitem', { name: /pnp-fast-mode/ })).toHaveFocus();
  });

  it('hands focus back where it was when it unmounts', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<RepoPopover {...popover()} />);
    expect(trigger).not.toHaveFocus();
    unmount();

    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});

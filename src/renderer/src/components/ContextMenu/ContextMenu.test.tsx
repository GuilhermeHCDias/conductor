import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';

/**
 * The command menu — "the core interaction of Conductor" per the design
 * system. Groups via label and separator items, mono command labels with their
 * glyphs, fixed positioning at the cursor, and criterion 26's exits: Escape
 * and a click outside both close it writing nothing.
 */

const ITEMS: readonly ContextMenuItem[] = [
  { type: 'label', label: 'Interact' },
  { type: 'command', id: 'tapOn', label: 'tapOn', icon: 'mouse-pointer-click', mono: true },
  { type: 'command', id: 'inputText', label: 'inputText', icon: 'text-cursor-input', mono: true },
  { type: 'separator' },
  { type: 'label', label: 'Assert' },
  { type: 'command', id: 'assertVisible', label: 'assertVisible', icon: 'eye', mono: true },
];

function renderMenu(over: Partial<Parameters<typeof ContextMenu>[0]> = {}): {
  onSelect: ReturnType<typeof vi.fn>;
  onClose: ReturnType<typeof vi.fn>;
} {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  render(
    <ContextMenu
      items={ITEMS}
      onClose={onClose}
      onSelect={onSelect}
      title='Button · "Entrar"'
      x={120}
      y={90}
      {...over}
    />,
  );
  return { onSelect, onClose };
}

describe('ContextMenu', () => {
  it('opens at the cursor as a menu titled with the element', () => {
    renderMenu();
    const menu = screen.getByRole('menu');

    expect(menu).toHaveStyle({ left: '120px', top: '90px' });
    expect(screen.getByText('Button · "Entrar"')).toBeInTheDocument();
  });

  /** Criterion 24 — groups as labels, commands as menu items with glyphs. */
  it('renders group labels and one menuitem per command', () => {
    renderMenu();

    expect(screen.getByText('Interact')).toBeInTheDocument();
    expect(screen.getByText('Assert')).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'tapOn',
      'inputText',
      'assertVisible',
    ]);
  });

  it('reports the picked command by id', async () => {
    const { onSelect } = renderMenu();

    await userEvent.click(screen.getByRole('menuitem', { name: 'inputText' }));

    expect(onSelect).toHaveBeenCalledWith('inputText');
  });

  /** Criterion 26 — Escape closes, writing nothing. */
  it('closes on Escape without selecting', async () => {
    const { onSelect, onClose } = renderMenu();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  /** Criterion 26 — a click outside closes, writing nothing. */
  it('closes on a click outside without selecting', async () => {
    const { onSelect, onClose } = renderMenu();

    await userEvent.click(screen.getByTestId('menu-backdrop'));

    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  /** Criterion 25's second half — a right-click outside must not summon the
   * browser's own menu on the way out. */
  it('suppresses the native context menu on the backdrop', () => {
    const { onClose } = renderMenu();
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    screen.getByTestId('menu-backdrop').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  /** The menu is keyboard-first: arrows walk the commands, Enter picks. */
  it('moves focus with the arrows and activates with Enter', async () => {
    const { onSelect } = renderMenu();

    expect(screen.getByRole('menuitem', { name: 'tapOn' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'inputText' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    // Past the end wraps to the top.
    expect(screen.getByRole('menuitem', { name: 'tapOn' })).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'assertVisible' })).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(onSelect).toHaveBeenCalledWith('assertVisible');
  });

  /** Criterion 27 — §5.4 makes the warning mandatory before the user picks. */
  it('shows the fragility warning above the commands when given one', () => {
    renderMenu({ warning: 'Position-based selector — this step is fragile.' });

    expect(screen.getByText('Position-based selector — this step is fragile.')).toBeInTheDocument();
  });

  it('shows no warning otherwise', () => {
    renderMenu();

    expect(screen.queryByText(/fragile/)).not.toBeInTheDocument();
  });
});

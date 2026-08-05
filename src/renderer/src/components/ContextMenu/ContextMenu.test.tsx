import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  /**
   * "At the cursor" must still mean "readable": near an edge, an unclamped
   * menu opens with its commands outside the window. jsdom lays nothing out,
   * so the menu's box is stated through its offset sizes — the layout fact the
   * clamp actually reads.
   */
  describe('near the viewport edges', () => {
    const MENU = { width: 232, height: 320 };

    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(MENU.width);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(MENU.height);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('opens at the cursor while there is room', () => {
      renderMenu({ x: 120, y: 90 });

      expect(screen.getByRole('menu')).toHaveStyle({ left: '120px', top: '90px' });
    });

    it('flips left of the cursor when it would leave the right edge', () => {
      const x = window.innerWidth - 20;
      renderMenu({ x, y: 90 });

      expect(screen.getByRole('menu')).toHaveStyle({ left: `${x - MENU.width}px`, top: '90px' });
    });

    it('slides up when it would leave the bottom edge', () => {
      renderMenu({ x: 120, y: window.innerHeight - 40 });

      expect(screen.getByRole('menu')).toHaveStyle({
        left: '120px',
        top: `${window.innerHeight - 8 - MENU.height}px`,
      });
    });

    it('pins to the margin when not even flipping makes it fit', () => {
      // A menu taller and wider than the window fits nowhere: the flip would
      // land negative and the slide before the top. Both pin to the margin —
      // clipped at the far edge, but the first commands stay readable.
      vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(window.innerWidth - 30);
      vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(
        window.innerHeight + 100,
      );
      renderMenu({ x: window.innerWidth / 2, y: 400 });

      expect(screen.getByRole('menu')).toHaveStyle({ left: '8px', top: '8px' });
    });
  });
});

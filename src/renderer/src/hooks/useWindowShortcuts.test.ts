import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetFlowStore, useFlowStore } from '../stores/flow.store';
import { resetUiStore, selectSidebarVisible, useUiStore } from '../stores/ui.store';
import { useWindowShortcuts } from './useWindowShortcuts';

const ui = () => useUiStore.getState();
const flow = () => useFlowStore.getState();

/** Dispatches a real keydown on `window` and reports whether it was consumed. */
function press(key: string, { meta = false, shift = false } = {}): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    metaKey: meta,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    window.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

beforeEach(() => {
  resetUiStore();
  resetFlowStore();
});

/** Criteria 47–50. */
describe('useWindowShortcuts', () => {
  it('toggles the sidebar on ⌘B', () => {
    renderHook(() => {
      useWindowShortcuts();
    });
    ui().setWindowWidth(1440);
    expect(selectSidebarVisible(ui())).toBe(true);

    expect(press('b', { meta: true })).toBe(true);

    expect(selectSidebarVisible(ui())).toBe(false);
  });

  it('flips the lower panel on ⌘J', () => {
    renderHook(() => {
      useWindowShortcuts();
    });
    expect(ui().lowerPanel).toBe('assistant');

    expect(press('j', { meta: true })).toBe(true);

    expect(ui().lowerPanel).toBe('run');
  });

  // ⌘B and ⌘J while caps lock is on are still ⌘B and ⌘J.
  it.each(['B', 'J'])('accepts %s in upper case', (key) => {
    renderHook(() => {
      useWindowShortcuts();
    });

    press(key, { meta: true });

    if (key === 'B') {
      expect(ui().sidebarPreference).not.toBe('auto');
    } else {
      expect(ui().lowerPanel).toBe('run');
    }
  });

  it('ignores b and j without the meta key', () => {
    renderHook(() => {
      useWindowShortcuts();
    });

    expect(press('b')).toBe(false);
    expect(press('j')).toBe(false);

    expect(ui().sidebarPreference).toBe('auto');
    expect(ui().lowerPanel).toBe('assistant');
  });

  /** Criterion 27 — ⌘N starts a new-flow draft, ⇧⌘N a new-folder draft. */
  it('starts a flow draft on ⌘N', () => {
    renderHook(() => {
      useWindowShortcuts();
    });

    expect(press('n', { meta: true })).toBe(true);

    expect(flow().draft).toMatchObject({ kind: 'flow', folder: '', renaming: null });
  });

  it('starts a folder draft on ⇧⌘N', () => {
    renderHook(() => {
      useWindowShortcuts();
    });

    expect(press('n', { meta: true, shift: true })).toBe(true);

    expect(flow().draft).toMatchObject({ kind: 'folder', folder: '', renaming: null });
  });

  /** Criterion 27 — Escape cancels the draft before it touches the search. */
  it('cancels a draft on Escape, leaving the search alone', () => {
    renderHook(() => {
      useWindowShortcuts();
    });
    ui().setQuery('check');
    act(() => {
      flow().startDraft('flow', '');
    });

    expect(press('Escape')).toBe(true);

    expect(flow().draft).toBeNull();
    expect(ui().query).toBe('check');
  });

  it('closes the row menu on Escape', () => {
    renderHook(() => {
      useWindowShortcuts();
    });
    act(() => {
      flow().openMenu({ kind: 'flow', identity: 'pix.yaml', x: 1, y: 1 });
    });

    expect(press('Escape')).toBe(true);

    expect(flow().menu).toBeNull();
  });

  it('dismisses the delete confirmation on Escape', () => {
    renderHook(() => {
      useWindowShortcuts();
    });
    act(() => {
      flow().askDelete('flow', 'pix.yaml');
    });

    expect(press('Escape')).toBe(true);

    expect(flow().confirm).toBeNull();
  });

  it('clears the sidebar search on Escape', () => {
    renderHook(() => {
      useWindowShortcuts();
    });
    ui().setQuery('check');

    press('Escape');

    expect(ui().query).toBe('');
  });

  // Escape has other jobs in a macOS window — it must not be consumed when the
  // search field is already empty.
  it('leaves Escape alone when the search is empty', () => {
    renderHook(() => {
      useWindowShortcuts();
    });

    expect(press('Escape')).toBe(false);
  });

  it('stops listening once unmounted', () => {
    const { unmount } = renderHook(() => {
      useWindowShortcuts();
    });
    ui().setWindowWidth(1440);

    unmount();
    press('b', { meta: true });
    press('j', { meta: true });

    expect(selectSidebarVisible(ui())).toBe(true);
    expect(ui().lowerPanel).toBe('assistant');
  });
});

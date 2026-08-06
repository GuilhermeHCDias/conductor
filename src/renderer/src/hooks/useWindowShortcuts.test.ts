import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetUiStore, selectSidebarVisible, useUiStore } from '../stores/ui.store';
import { useWindowShortcuts } from './useWindowShortcuts';

const ui = () => useUiStore.getState();

/** Dispatches a real keydown on `window` and reports whether it was consumed. */
function press(key: string, { meta = false } = {}): boolean {
  const event = new KeyboardEvent('keydown', {
    key,
    metaKey: meta,
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

  /**
   * Criteria 16–17 of aurora-rehue-toolbar-publish — while the Send sheet is
   * open it owns Escape: it closes ahead of the search clearing, and nothing
   * closes it mid-send.
   */
  describe('with the Send sheet open', () => {
    it('closes the sheet without touching the phase', () => {
      renderHook(() => {
        useWindowShortcuts();
      });
      ui().openSend();

      expect(press('Escape')).toBe(true);

      expect(ui().sendOpen).toBe(false);
      expect(ui().sendPhase).toBe('idle');
    });

    it('closes the sheet before it clears the search', () => {
      renderHook(() => {
        useWindowShortcuts();
      });
      ui().setQuery('check');
      ui().openSend();

      press('Escape');

      expect(ui().sendOpen).toBe(false);
      expect(ui().query).toBe('check');
    });

    // The sheet sits over the whole window, so a shortcut that rearranged the
    // panes behind it would move furniture the person cannot see or reach.
    it('ignores ⌘B and ⌘J', () => {
      renderHook(() => {
        useWindowShortcuts();
      });
      ui().setWindowWidth(1440);
      ui().openSend();

      press('b', { meta: true });
      press('j', { meta: true });

      expect(selectSidebarVisible(ui())).toBe(true);
      expect(ui().lowerPanel).toBe('assistant');
    });

    it('ignores Escape while the send is in flight', () => {
      renderHook(() => {
        useWindowShortcuts();
      });
      ui().openSend();
      useUiStore.setState({ sendPhase: 'sending' });

      press('Escape');

      expect(ui().sendOpen).toBe(true);
      expect(ui().sendPhase).toBe('sending');
    });
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

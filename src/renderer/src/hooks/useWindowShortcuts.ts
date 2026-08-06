import { useEffect } from 'react';
import { useUiStore } from '../stores/ui.store';

/**
 * The window's three keyboard shortcuts (criteria 47–49). Mounted once, by the
 * shell: they belong to the window, not to any one pane.
 *
 * Meta only. Conductor is a macOS app — `titleBarStyle`, the traffic-light
 * inset and the vibrancy in this layout are all macOS — and the criteria name
 * ⌘B and ⌘J, not their Windows equivalents.
 */
export function useWindowShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const { toggleSidebar, toggleLowerPanel, clearQuery, closeSend, query, sendOpen, sendPhase } =
        useUiStore.getState();

      // The Send sheet owns the window while it is open — it sits over
      // everything, so nothing under it may react, ⌘B and ⌘J included:
      // rearranging the panes behind a modal moves furniture the person can
      // neither see nor reach. Escape is the one key it answers, and even that
      // is swallowed mid-send, when the batch is already on its way
      // (criteria 16–17 of the publish spec).
      if (sendOpen) {
        if (event.key === 'Escape' && sendPhase !== 'sending') {
          event.preventDefault();
          closeSend();
        }
        return;
      }

      if (event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === 'b') {
          event.preventDefault();
          toggleSidebar();
        }
        if (key === 'j') {
          event.preventDefault();
          toggleLowerPanel();
        }
        return;
      }

      // Escape has other jobs in a macOS window; only take it when there is
      // actually a search to clear.
      if (event.key === 'Escape' && query !== '') {
        event.preventDefault();
        clearQuery();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

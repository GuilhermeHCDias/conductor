import { useEffect } from 'react';
import { useFlowStore } from '../stores/flow.store';
import { useUiStore } from '../stores/ui.store';

/**
 * The window's keyboard shortcuts, mounted once by the shell: they belong to
 * the window, not to any one pane. ⌘B and ⌘J are the layout's (criteria
 * 47–49); ⌘N and ⇧⌘N start the sidebar's drafts (criterion 27).
 *
 * Meta only. Conductor is a macOS app — `titleBarStyle`, the traffic-light
 * inset and the vibrancy in this layout are all macOS — and the criteria name
 * ⌘B and ⌘J, not their Windows equivalents.
 */
export function useWindowShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const { toggleSidebar, toggleLowerPanel, clearQuery, query } = useUiStore.getState();
      const flow = useFlowStore.getState();

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
        // Criterion 27 — ⌘N a flow, ⇧⌘N a folder, both drafted at the root.
        if (key === 'n') {
          event.preventDefault();
          flow.startDraft(event.shiftKey ? 'folder' : 'flow', '');
        }
        return;
      }

      // Escape settles the most volatile thing first: a draft, then an open
      // menu, then the delete confirmation, then the search (criterion 27).
      // The draft input's own Escape stops propagating before this runs, so
      // reaching here with a draft means focus already wandered elsewhere.
      if (event.key === 'Escape') {
        if (flow.draft !== null) {
          event.preventDefault();
          flow.cancelDraft();
          return;
        }
        if (flow.menu !== null) {
          event.preventDefault();
          flow.closeMenu();
          return;
        }
        if (flow.confirm !== null) {
          event.preventDefault();
          flow.cancelDelete();
          return;
        }
        if (query !== '') {
          event.preventDefault();
          clearQuery();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

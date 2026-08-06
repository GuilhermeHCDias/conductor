import { useEffect } from 'react';
import { useFlowStore } from '../stores/flow.store';

/**
 * The app-wide flow subscription, mounted once by the shell: `flow:changed`
 * lands in the store whether the change came from Conductor, the AI or an
 * external editor — one event, one path (§12.21) — and the mount asks for the
 * first index so the sidebar never waits for a disk event to exist.
 *
 * The window closing is the one save trigger no debounce can be trusted with
 * (criterion 6): `beforeunload` fires the flush, whose invoke is posted
 * before the renderer dies — main finishes the write on its own.
 */
export function useFlowIndex(): void {
  const applyIndex = useFlowStore((state) => state.applyIndex);
  const refresh = useFlowStore((state) => state.refresh);
  const flushSave = useFlowStore((state) => state.flushSave);

  useEffect(() => {
    const unsubscribe = window.conductor.onFlowChanged(applyIndex);
    void refresh();
    const onBeforeUnload = (): void => {
      void flushSave();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      unsubscribe();
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [applyIndex, refresh, flushSave]);
}

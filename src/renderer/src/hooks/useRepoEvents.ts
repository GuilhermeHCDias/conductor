import { useEffect } from 'react';
import { useRepoStore } from '../stores/repo.store';

/**
 * The app-wide repo subscription (mounted by `App`, like the flow index):
 * the boot query plus the two pushes — state changes and resolve progress —
 * written into the store, undone in cleanup. The connect-or-workspace
 * branch waits on the state this loads, so a persisted repo never flashes
 * the connect screen.
 */
export function useRepoEvents(): void {
  const init = useRepoStore((state) => state.init);
  const applyState = useRepoStore((state) => state.applyState);
  const applyResolveEvent = useRepoStore((state) => state.applyResolveEvent);

  useEffect(() => {
    const unsubscribeState = window.conductor.onRepoChanged(applyState);
    const unsubscribeResolve = window.conductor.onRepoResolveEvent(applyResolveEvent);
    void init();
    return () => {
      unsubscribeState();
      unsubscribeResolve();
    };
  }, [init, applyState, applyResolveEvent]);
}

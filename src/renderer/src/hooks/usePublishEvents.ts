import { useEffect } from 'react';
import { usePublishStore } from '../stores/publish.store';

/**
 * The app-wide publish subscription (criterion 9's renderer half): the unsent
 * set and the review state arrive on `publish:changed`, describe notes and
 * send progress on `publish:event`, and the boot query fills the gap before
 * the first push. Mounted once by `App`, undone in cleanup.
 */
export function usePublishEvents(): void {
  const init = usePublishStore((state) => state.init);
  const applyState = usePublishStore((state) => state.applyState);
  const applyEvent = usePublishStore((state) => state.applyEvent);

  useEffect(() => {
    const unsubscribeState = window.conductor.onPublishChanged(applyState);
    const unsubscribeEvents = window.conductor.onPublishEvent(applyEvent);
    void init();
    return () => {
      unsubscribeState();
      unsubscribeEvents();
    };
  }, [init, applyState, applyEvent]);
}

import { useEffect } from 'react';
import { useDeviceStore } from '../stores/device.store';

/**
 * Subscribes the store to the snapshots main pushes, and asks for one on mount
 * — main polls on its own clock, so a view that mounted between two ticks would
 * otherwise sit empty for up to two seconds.
 *
 * The subscription returns its own unsubscribe and the effect calls it: a
 * listener left behind on a channel that fires every 2s is a memory leak with a
 * clock on it.
 */
export function useDeviceStream(): void {
  const applySnapshot = useDeviceStore((state) => state.applySnapshot);
  const refresh = useDeviceStore((state) => state.refresh);

  useEffect(() => {
    const unsubscribe = window.conductor.onDeviceChanged(applySnapshot);
    void refresh();
    return unsubscribe;
  }, [applySnapshot, refresh]);
}

import { useEffect } from 'react';
import { useRunStore } from '../stores/run.store';

/**
 * Subscribes the run store to `run:event`. Mounted from `App.tsx`, app-wide:
 * the run outlives whichever lower tab is showing, and a log that only
 * accumulated while the Run tab was open would be a report with holes in it.
 *
 * The subscription returns its own unsubscribe and the effect consumes it
 * (criterion 25) — a run's log alone is thousands of events.
 */
export function useRunEvents(): void {
  const applyEvent = useRunStore((state) => state.applyEvent);

  useEffect(() => window.conductor.onRunEvent(applyEvent), [applyEvent]);
}

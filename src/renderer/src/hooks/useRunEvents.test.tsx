import type { PushPayload } from '@shared/ipc';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetRunStore, useRunStore } from '../stores/run.store';
import { useRunEvents } from './useRunEvents';

/**
 * The app-wide half of the run loop: `run:event` in, store writes out. Mounted
 * from `App.tsx` rather than a view, because the run outlives whichever tab is
 * showing — switching to Assistant must not lose the step list.
 */

type RunListener = (payload: PushPayload<'run:event'>) => void;

function wire(): {
  emit: (payload: PushPayload<'run:event'>) => void;
  unsubscribed: () => number;
  subscriptions: () => number;
} {
  let listener: RunListener | null = null;
  let subscriptions = 0;
  let unsubscribed = 0;
  window.conductor.onRunEvent = (next: RunListener) => {
    subscriptions += 1;
    listener = next;
    return () => {
      unsubscribed += 1;
      listener = null;
    };
  };
  return {
    emit: (payload) => listener?.(payload),
    unsubscribed: () => unsubscribed,
    subscriptions: () => subscriptions,
  };
}

beforeEach(() => {
  resetRunStore();
});

describe('useRunEvents', () => {
  it('writes pushed events into the run store', () => {
    const { emit } = wire();
    useRunStore.setState({ running: true, runId: 'run-1' });
    renderHook(() => useRunEvents());

    act(() => {
      emit({ ok: true, data: { type: 'log', runId: 'run-1', lines: ['Running on device'] } });
    });

    expect(useRunStore.getState().logLines).toEqual(['Running on device']);
  });

  it('subscribes once and unsubscribes on cleanup', () => {
    const { subscriptions, unsubscribed } = wire();

    const hook = renderHook(() => useRunEvents());
    expect(subscriptions()).toBe(1);

    hook.unmount();
    expect(unsubscribed()).toBe(1);
  });

  /** The push carries a `Result` like every channel; a failure payload has no
   * run to decorate and must not throw out of the listener. */
  it('ignores a failure payload', () => {
    const { emit } = wire();
    renderHook(() => useRunEvents());

    expect(() => {
      act(() => {
        emit({ ok: false, error: { code: 'x/y', message: 'z' } });
      });
    }).not.toThrow();
  });
});

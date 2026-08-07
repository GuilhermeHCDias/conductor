import type { ConductorApi, PublishEvent, PublishState, Result } from '@shared/ipc';
import { render } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetPublishStore, usePublishStore } from '../stores/publish.store';
import { usePublishEvents } from './usePublishEvents';

/**
 * The app-wide publish subscription: both channels wired into the store, the
 * boot query fired, and every listener undone in cleanup — a leaked listener
 * outlives its window.
 */

type StateListener = (payload: Result<PublishState>) => void;
type EventListener = (payload: Result<PublishEvent>) => void;

let stateListeners: StateListener[];
let eventListeners: EventListener[];
let unsubscribed: number;
let status: ReturnType<typeof vi.fn>;

function Host(): null {
  usePublishEvents();
  return null;
}

beforeEach(() => {
  resetPublishStore();
  stateListeners = [];
  eventListeners = [];
  unsubscribed = 0;
  status = vi.fn(() => Promise.resolve({ ok: true, data: { changes: [], reviewOpen: false } }));
  window.conductor = {
    ...window.conductor,
    publishStatus: status,
    onPublishChanged: (listener: StateListener) => {
      stateListeners.push(listener);
      return () => {
        unsubscribed += 1;
      };
    },
    onPublishEvent: (listener: EventListener) => {
      eventListeners.push(listener);
      return () => {
        unsubscribed += 1;
      };
    },
  } as ConductorApi;
});

describe('usePublishEvents', () => {
  it('subscribes to both channels and asks for the boot state', () => {
    render(<Host />);

    expect(stateListeners).toHaveLength(1);
    expect(eventListeners).toHaveLength(1);
    expect(status).toHaveBeenCalledOnce();
  });

  it('routes a publish:changed push into the store', () => {
    render(<Host />);

    act(() => {
      stateListeners[0]?.({
        ok: true,
        data: { changes: [{ path: 'login.yml', kind: 'added' }], reviewOpen: true },
      });
    });

    expect(usePublishStore.getState().changes).toEqual([{ path: 'login.yml', kind: 'added' }]);
    expect(usePublishStore.getState().reviewOpen).toBe(true);
  });

  it('unsubscribes both on unmount', () => {
    const { unmount } = render(<Host />);

    unmount();

    expect(unsubscribed).toBe(2);
  });
});

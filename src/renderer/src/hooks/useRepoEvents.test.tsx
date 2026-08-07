import type { ConductorApi, PushPayload } from '@shared/ipc';
import { renderHook, waitFor } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetRepoStore, useRepoStore } from '../stores/repo.store';
import { useRepoEvents } from './useRepoEvents';

/**
 * The app-wide repo subscription: the boot query plus the two pushes —
 * state changes and resolve progress — written into the store, undone on
 * unmount. The window's connect-or-workspace branch hangs off what this
 * hook loads.
 */

type StateListener = (payload: PushPayload<'repo:changed'>) => void;
type ResolveListener = (payload: PushPayload<'repo:resolve-event'>) => void;

let stateListeners: StateListener[];
let resolveListeners: ResolveListener[];
let unsubscribed: number;
let repoList: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetRepoStore();
  stateListeners = [];
  resolveListeners = [];
  unsubscribed = 0;
  repoList = vi.fn(() => Promise.resolve({ ok: true as const, data: { repos: [], active: null } }));
  window.conductor = {
    ...window.conductor,
    repoList,
    onRepoChanged: (listener: StateListener) => {
      stateListeners.push(listener);
      return () => {
        unsubscribed += 1;
      };
    },
    onRepoResolveEvent: (listener: ResolveListener) => {
      resolveListeners.push(listener);
      return () => {
        unsubscribed += 1;
      };
    },
  } as ConductorApi;
});

describe('useRepoEvents', () => {
  it('asks for the state once on mount', async () => {
    renderHook(() => {
      useRepoEvents();
    });

    await waitFor(() => {
      expect(useRepoStore.getState().loaded).toBe(true);
    });
    expect(repoList).toHaveBeenCalledTimes(1);
  });

  it('writes a pushed state change into the store', async () => {
    renderHook(() => {
      useRepoEvents();
    });

    act(() => {
      stateListeners[0]?.({ ok: true, data: { repos: [], active: 'some-slug' } });
    });

    expect(useRepoStore.getState().active).toBe('some-slug');
  });

  it('routes resolve events through the store guard', async () => {
    renderHook(() => {
      useRepoEvents();
    });

    // No resolution is pending, so a stray event changes nothing — proof the
    // event went through `applyResolveEvent` rather than straight to state.
    act(() => {
      resolveListeners[0]?.({ ok: true, data: { kind: 'step', resolveId: 9, step: 2 } });
    });

    expect(useRepoStore.getState().step).toBe(0);
  });

  it('unsubscribes both channels on unmount', () => {
    const { unmount } = renderHook(() => {
      useRepoEvents();
    });

    unmount();

    expect(unsubscribed).toBe(2);
  });
});

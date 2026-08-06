import type { ConductorApi, PushPayload } from '@shared/ipc';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFlowStore, useFlowStore } from '../stores/flow.store';
import { useFlowIndex } from './useFlowIndex';

/**
 * The app-wide flow subscription (AGENTS.md names it): `flow:changed` lands in
 * the store, the mount asks for the first index, and the window closing
 * flushes the pending save (criterion 6) — with everything unsubscribed on
 * cleanup, because a leaked listener re-renders the tree per disk event.
 */

type FlowListener = (payload: PushPayload<'flow:changed'>) => void;

const INDEX = {
  flows: [{ path: 'pix.yaml', name: 'pix.yaml', folder: '', commandCount: 1, hash: 'abc' }],
  folders: [],
};

let listeners: FlowListener[];
let unsubscribed: number;
let flowList: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetFlowStore();
  listeners = [];
  unsubscribed = 0;
  flowList = vi.fn(() => Promise.resolve({ ok: true as const, data: { flows: [], folders: [] } }));
  window.conductor = {
    ...window.conductor,
    flowList,
    onFlowChanged: (listener: FlowListener) => {
      listeners.push(listener);
      return () => {
        unsubscribed += 1;
      };
    },
  } as ConductorApi;
});

describe('useFlowIndex', () => {
  it('asks for the index on mount', async () => {
    renderHook(() => {
      useFlowIndex();
    });

    await waitFor(() => {
      expect(flowList).toHaveBeenCalledTimes(1);
    });
  });

  it('writes pushed indexes into the store', async () => {
    renderHook(() => {
      useFlowIndex();
    });

    act(() => {
      listeners[0]?.({ ok: true, data: INDEX });
    });

    await waitFor(() => {
      expect(useFlowStore.getState().index?.flows[0]?.path).toBe('pix.yaml');
    });
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => {
      useFlowIndex();
    });

    unmount();

    expect(unsubscribed).toBe(1);
  });

  /** Criterion 6 — the invoke is posted before the renderer dies; main
   * finishes the write. */
  it('flushes the pending save when the window closes', async () => {
    const save = vi.fn((path: string) => Promise.resolve({ ok: true as const, data: { path } }));
    window.conductor.flowSave = save;
    window.conductor.flowRead = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { yaml: 'appId: x\n---\n' } }),
    );
    renderHook(() => {
      useFlowIndex();
    });
    await act(async () => {
      await useFlowStore.getState().openFlow('pix.yaml');
    });
    act(() => {
      useFlowStore.getState().edit('appId: typed\n---\n');
    });

    window.dispatchEvent(new Event('beforeunload'));

    await waitFor(() => {
      expect(save).toHaveBeenCalledExactlyOnceWith('pix.yaml', 'appId: typed\n---\n');
    });
  });

  it('stops flushing after unmount', () => {
    const save = vi.fn();
    window.conductor.flowSave = save;
    const { unmount } = renderHook(() => {
      useFlowIndex();
    });

    unmount();
    window.dispatchEvent(new Event('beforeunload'));

    expect(save).not.toHaveBeenCalled();
  });
});

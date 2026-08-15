import type { PushPayload } from '@shared/ipc';
import { renderHook } from '@testing-library/react';
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAiStore, useAiStore } from '../stores/ai.store';
import { resetFlowStore, useFlowStore } from '../stores/flow.store';
import { useAiEvents } from './useAiEvents';

/**
 * The app-wide half of the assistant loop (criterion 24): `ai:event` in,
 * store writes out — plus the two couplings only a hook may own, because they
 * read two stores at once: a `file-edited` for a flow that is not open opens
 * it (criterion 26), and the editor's `ai` wash is computed when the
 * assistant's edit lands through the watcher's reload (criterion 27).
 */

type AiListener = (payload: PushPayload<'ai:event'>) => void;

function wire(): {
  emit: (payload: PushPayload<'ai:event'>) => void;
  unsubscribed: () => number;
  subscriptions: () => number;
} {
  let listener: AiListener | null = null;
  let subscriptions = 0;
  let unsubscribed = 0;
  window.conductor.onAiEvent = (next: AiListener) => {
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

/** A turn the store recognizes, so turn-scoped events land. */
function openTurn(turnId = 'turn-1'): void {
  useAiStore.setState({
    activeTurnId: turnId,
    thread: [{ id: turnId, role: 'assistant', text: '', status: 'streaming' }],
  });
}

beforeEach(() => {
  resetAiStore();
  resetFlowStore();
});

afterEach(() => {
  resetFlowStore();
});

describe('useAiEvents', () => {
  it('writes pushed events into the ai store', () => {
    const { emit } = wire();
    openTurn();
    renderHook(() => useAiEvents());

    act(() => {
      emit({ ok: true, data: { kind: 'text-delta', turnId: 'turn-1', text: 'Oi' } });
    });

    expect(useAiStore.getState().thread.at(-1)).toMatchObject({ text: 'Oi' });
  });

  it('subscribes once and unsubscribes on cleanup', () => {
    const { subscriptions, unsubscribed } = wire();

    const hook = renderHook(() => useAiEvents());
    expect(subscriptions()).toBe(1);

    hook.unmount();
    expect(unsubscribed()).toBe(1);
  });

  /** The wash watcher is the hook's second subscription — cleanup must take
   * both, or every remount would stack another flow-store listener. */
  it('stops watching the flow store after unmount', () => {
    wire();
    const hook = renderHook(() => useAiEvents());
    act(() => {
      useFlowStore.setState({ openPath: 'login.yml', yaml: 'a\n', dirty: false });
    });

    hook.unmount();
    act(() => {
      useAiStore.setState({ pendingEditPath: 'login.yml' });
      useFlowStore.setState({ yaml: 'a\nb\n' });
    });

    expect(useAiStore.getState().washPath).toBeNull();
  });

  it('asks for the availability on mount', async () => {
    wire();
    const status = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { ready: true as const } }),
    );
    window.conductor.aiStatus = status;

    renderHook(() => useAiEvents());
    await act(async () => {});

    expect(status).toHaveBeenCalledOnce();
    expect(useAiStore.getState().availability).toEqual({ ready: true });
  });

  it('re-asks the availability when a reset is pushed', async () => {
    const { emit } = wire();
    const status = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { ready: true as const } }),
    );
    window.conductor.aiStatus = status;
    renderHook(() => useAiEvents());
    await act(async () => {});

    await act(async () => {
      emit({ ok: true, data: { kind: 'reset' } });
    });

    expect(status).toHaveBeenCalledTimes(2);
  });

  it('ignores a failure payload', () => {
    const { emit } = wire();
    renderHook(() => useAiEvents());

    expect(() => {
      act(() => {
        emit({ ok: false, error: { code: 'x/y', message: 'z' } });
      });
    }).not.toThrow();
  });
});

describe('the assistant edits a flow', () => {
  /** The stream's own rule — a late event from a killed turn never decorates
   * a live one (`ipc.ts`) — reaches the editor too: after a reset emptied
   * the thread, a dying turn's edit must not yank a flow open. */
  it('leaves the editor alone when the edit wears a stale turn id', async () => {
    const { emit } = wire();
    window.conductor.flowRead = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { yaml: 'appId: x\n' } }),
    );
    renderHook(() => useAiEvents());

    await act(async () => {
      emit({ ok: true, data: { kind: 'file-edited', turnId: 'turn-9', path: 'login.yml' } });
    });

    expect(useFlowStore.getState().openPath).toBeNull();
  });

  /** Criterion 26 — the person watches the test being written: an edit to a
   * flow that is not open pulls it into the editor and the sidebar. */
  it('opens a flow the assistant edited that was not open', async () => {
    const { emit } = wire();
    openTurn();
    window.conductor.flowRead = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { yaml: 'appId: x\n---\n- launchApp\n' } }),
    );
    renderHook(() => useAiEvents());

    await act(async () => {
      emit({ ok: true, data: { kind: 'file-edited', turnId: 'turn-1', path: 'login.yml' } });
    });

    expect(useFlowStore.getState().openPath).toBe('login.yml');
    // The whole file is the assistant's work — every line washes.
    expect(useAiStore.getState().washPath).toBe('login.yml');
    expect(useAiStore.getState().washLines).toEqual([1, 2, 3]);
  });

  /** Criterion 27 — the edit lands through the watcher's reload; the wash is
   * the diff against the text the editor held. */
  it('washes the changed lines when the open flow reloads under the pending edit', () => {
    const { emit } = wire();
    openTurn();
    renderHook(() => useAiEvents());
    act(() => {
      useFlowStore.setState({ openPath: 'login.yml', yaml: 'a\nb\nc\n', dirty: false });
    });

    act(() => {
      emit({ ok: true, data: { kind: 'file-edited', turnId: 'turn-1', path: 'login.yml' } });
      useFlowStore.setState({ yaml: 'a\nB\nc\n' });
    });

    expect(useAiStore.getState().washPath).toBe('login.yml');
    expect(useAiStore.getState().washLines).toEqual([2]);
  });

  it('clears the wash when the person edits the file', () => {
    wire();
    renderHook(() => useAiEvents());
    act(() => {
      useFlowStore.setState({ openPath: 'login.yml', yaml: 'a\nb\n', dirty: false });
      useAiStore.getState().setWash('login.yml', [2]);
    });

    act(() => {
      useFlowStore.getState().edit('a\nb\nc\n');
    });

    expect(useAiStore.getState().washPath).toBeNull();
    expect(useAiStore.getState().washLines).toEqual([]);
  });

  it('clears the wash when the person switches to another flow', async () => {
    wire();
    window.conductor.flowRead = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { yaml: 'other\n' } }),
    );
    renderHook(() => useAiEvents());
    act(() => {
      useFlowStore.setState({ openPath: 'login.yml', yaml: 'a\n', dirty: false });
      useAiStore.getState().setWash('login.yml', [1]);
    });

    await act(async () => {
      await useFlowStore.getState().openFlow('checkout/pix.yml');
    });

    expect(useAiStore.getState().washPath).toBeNull();
  });

  /** An external reload nobody's pending edit claims moves lines under a held
   * wash — a wash on the wrong rows is worse than none. */
  it('clears a held wash when the file reloads without a pending edit', () => {
    wire();
    renderHook(() => useAiEvents());
    act(() => {
      useFlowStore.setState({ openPath: 'login.yml', yaml: 'a\nb\n', dirty: false });
      useAiStore.getState().setWash('login.yml', [2]);
    });

    act(() => {
      useFlowStore.setState({ yaml: 'x\na\nb\n' });
    });

    expect(useAiStore.getState().washPath).toBeNull();
  });
});

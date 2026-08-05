import type { ConductorApi, Result } from '@shared/ipc';
import type { SnapshotView } from '@shared/types';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDeviceStore, useDeviceStore } from '../stores/device.store';
import {
  INTERACTION_DEBOUNCE_MS,
  resetInspectStore,
  useInspectStore,
} from '../stores/inspect.store';
import { resetRunStore, useRunStore } from '../stores/run.store';
import { useInspectSnapshot } from './useInspectSnapshot';

/**
 * The snapshot cadence, wired to the mirror's life (criteria 18–20, 22): a
 * capture when the stream starts, a debounced recapture when inputs settle or
 * the stream changes size, and a cleared inspector the moment the mirror is
 * gone.
 */

const device = () => useDeviceStore.getState();
const inspect = () => useInspectStore.getState();

const VIEW: SnapshotView = {
  snapshotId: 'snapshot-1',
  tree: {
    bounds: null,
    className: null,
    text: null,
    resourceId: null,
    contentDescription: null,
    hintText: null,
    scrollable: null,
    clickable: null,
    enabled: null,
    focused: null,
    selected: null,
    checked: null,
    children: [],
  },
  screenshotWidth: 720,
  screenshotHeight: 1600,
  scale: 1,
};

let conductor: {
  maestroSnapshot: ReturnType<typeof vi.fn>;
  mirrorInput: ReturnType<typeof vi.fn>;
  mirrorStart: ReturnType<typeof vi.fn>;
  mirrorStop: ReturnType<typeof vi.fn>;
  deviceAppInfo: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  resetDeviceStore();
  resetInspectStore();
  resetRunStore();
  conductor = {
    maestroSnapshot: vi.fn(() => Promise.resolve<Result<SnapshotView>>({ ok: true, data: VIEW })),
    mirrorInput: vi.fn(() => Promise.resolve({ ok: true, data: { sessionId: 'mirror-1' } })),
    mirrorStart: vi.fn(() =>
      Promise.resolve({
        ok: true,
        data: { sessionId: 'mirror-1', codec: 'h264', width: 464, height: 1024, control: true },
      }),
    ),
    mirrorStop: vi.fn(() => Promise.resolve({ ok: true, data: { sessionId: 'mirror-1' } })),
    // `applySnapshot` reads the app identity of a newly selected device; a
    // conductor without this stub turns that read into an unhandled rejection.
    deviceAppInfo: vi.fn(() =>
      Promise.resolve({ ok: false, error: { code: 'test/stub', message: 'stub' } }),
    ),
  };
  window.conductor = conductor as unknown as ConductorApi;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** Puts the device store where a live mirror would: selected and streaming. */
async function streaming(): Promise<void> {
  act(() => {
    device().applySnapshot({
      ok: true,
      data: {
        devices: [{ id: 'R9QYC01EMXL', model: 'SM_G991B', state: 'device' }],
        selectedId: 'R9QYC01EMXL',
        properties: null,
      },
    });
  });
  await act(async () => {
    await device().startMirror('R9QYC01EMXL');
  });
}

describe('the snapshot cadence', () => {
  /** Criterion 18 — the stream starts, the snapshot follows. */
  it('captures when the mirror starts streaming', async () => {
    renderHook(() => {
      useInspectSnapshot();
    });
    await streaming();

    await waitFor(() => {
      expect(conductor.maestroSnapshot).toHaveBeenCalledWith('R9QYC01EMXL');
    });
    // Once: the stream's initial size is not a rotation (criterion 20).
    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
  });

  it('captures nothing while nothing streams', () => {
    renderHook(() => {
      useInspectSnapshot();
    });

    expect(conductor.maestroSnapshot).not.toHaveBeenCalled();
  });

  /** Criterion 19 — an input the device took schedules a debounced recapture. */
  it('recaptures after inputs settle', async () => {
    renderHook(() => {
      useInspectSnapshot();
    });
    await streaming();
    await waitFor(() => {
      expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
    });

    vi.useFakeTimers();
    act(() => {
      device().sendInput({ type: 'back' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERACTION_DEBOUNCE_MS);
    });

    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(2);
  });

  /** Criterion 20 — a rotation is a new screen; the tree must follow it. */
  it('recaptures when the stream reports a new size', async () => {
    renderHook(() => {
      useInspectSnapshot();
    });
    await streaming();
    await waitFor(() => {
      expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
    });

    act(() => {
      device().mirrorResized('mirror-1', 1024, 464);
    });

    await waitFor(() => {
      expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(2);
    });
  });

  /** Criterion 22 — the mirror is gone; so is everything derived from it. */
  it('clears the snapshot when the mirror ends', async () => {
    renderHook(() => {
      useInspectSnapshot();
    });
    await streaming();
    await waitFor(() => {
      expect(inspect().snapshot).not.toBeNull();
    });

    act(() => {
      device().mirrorEnded('mirror-1', { code: 'mirror/device-lost', message: 'gone' });
    });

    expect(inspect().snapshot).toBeNull();
    expect(inspect().hoveredPath).toBeNull();
  });

  it('clears the snapshot when the panel unmounts', async () => {
    const { unmount } = renderHook(() => {
      useInspectSnapshot();
    });
    await streaming();
    await waitFor(() => {
      expect(inspect().snapshot).not.toBeNull();
    });

    unmount();

    expect(inspect().snapshot).toBeNull();
  });
});

/** Run criteria 11 and 13 — the inspector during and after a flow run. */
describe('while a flow runs', () => {
  /** The renderer half of criterion 11: main refuses mid-run captures anyway,
   * but the polite client never schedules them — the overlay stays quietly
   * stale instead of collecting refusals per tap. */
  it('schedules no recapture for inputs while the run is active', async () => {
    renderHook(() => {
      useInspectSnapshot();
    });
    await streaming();
    await waitFor(() => {
      expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
    });
    act(() => {
      useRunStore.setState({ running: true, runId: 'run-1' });
    });

    vi.useFakeTimers();
    act(() => {
      device().sendInput({ type: 'back' });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(INTERACTION_DEBOUNCE_MS * 2);
    });

    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
  });

  /** Criterion 13 — the §5.5 end-of-flow recapture, automatic: the overlay
   * recovers without the person touching anything. */
  it('recaptures the moment the run ends', async () => {
    renderHook(() => {
      useInspectSnapshot();
    });
    await streaming();
    await waitFor(() => {
      expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
    });
    act(() => {
      useRunStore.setState({ running: true, runId: 'run-1' });
    });

    act(() => {
      useRunStore.getState().applyEvent({
        ok: true,
        data: { type: 'finished', runId: 'run-1', outcome: 'passed', message: null },
      });
    });

    await waitFor(() => {
      expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(2);
    });
  });

  it('captures nothing for a run that ended with no mirror on screen', async () => {
    renderHook(() => {
      useInspectSnapshot();
    });

    act(() => {
      useRunStore.setState({ completedRuns: 1 });
    });

    expect(conductor.maestroSnapshot).not.toHaveBeenCalled();
  });
});

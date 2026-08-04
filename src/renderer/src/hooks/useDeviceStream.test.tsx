import type { ConductorApi, Device, DeviceSnapshot, Result } from '@shared/ipc';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDeviceStore, selectSelectedId, useDeviceStore } from '../stores/device.store';
import { useDeviceStream } from './useDeviceStream';

const PHONE: Device = { id: 'R9QYC01EMXL', model: 'SM_G991B', state: 'device' };

const SNAPSHOT: Result<DeviceSnapshot> = {
  ok: true,
  data: { devices: [PHONE], selectedId: PHONE.id, properties: null },
};

let listeners: Array<(payload: Result<DeviceSnapshot>) => void>;
let unsubscribe: ReturnType<typeof vi.fn>;
let deviceList: ReturnType<typeof vi.fn>;

beforeEach(() => {
  resetDeviceStore();
  listeners = [];
  unsubscribe = vi.fn();
  deviceList = vi.fn(() =>
    Promise.resolve<Result<DeviceSnapshot>>({
      ok: true,
      data: { devices: [], selectedId: null, properties: null },
    }),
  );
  window.conductor = {
    deviceList,
    deviceAppInfo: vi.fn(() => Promise.resolve({ ok: false, error: { code: 'x', message: 'x' } })),
    onDeviceChanged: (listener: (payload: Result<DeviceSnapshot>) => void) => {
      listeners.push(listener);
      return unsubscribe;
    },
  } as unknown as ConductorApi;
});

/** Criterion 34. */
describe('useDeviceStream', () => {
  it('subscribes to the pushes main sends', () => {
    renderHook(() => {
      useDeviceStream();
    });

    expect(listeners).toHaveLength(1);
  });

  it('writes what arrives into the store', async () => {
    renderHook(() => {
      useDeviceStream();
    });

    act(() => {
      for (const listener of listeners) {
        listener(SNAPSHOT);
      }
    });

    expect(useDeviceStore.getState().devices).toEqual([PHONE]);
    await waitFor(() => {
      expect(selectSelectedId(useDeviceStore.getState())).toBe(PHONE.id);
    });
  });

  // Main polls on its own clock. A view mounting between two ticks would sit
  // empty for up to a full interval without this.
  it('asks for the current state on mount', async () => {
    renderHook(() => {
      useDeviceStream();
    });

    await waitFor(() => {
      expect(deviceList).toHaveBeenCalledTimes(1);
    });
  });

  /** A listener left on a channel that fires every 2s is a leak with a clock. */
  it('unsubscribes when the view goes away', () => {
    const { unmount } = renderHook(() => {
      useDeviceStream();
    });

    unmount();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('does not stack a second subscription on re-render', () => {
    const { rerender } = renderHook(() => {
      useDeviceStream();
    });

    rerender();
    rerender();

    expect(listeners).toHaveLength(1);
    expect(unsubscribe).not.toHaveBeenCalled();
  });
});

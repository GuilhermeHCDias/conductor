import type { AppIdentity, ConductorApi, Device, DeviceSnapshot, Result } from '@shared/ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDeviceStore, selectSelectedId, useDeviceStore } from './device.store';

/**
 * `window.conductor` is the only seam mocked here — no store, no hook, no
 * component (criterion 39).
 */

const PHONE: Device = { id: 'R9QYC01EMXL', model: 'SM_G991B', state: 'device' };
const SECOND: Device = { id: 'emulator-5554', model: 'sdk_gphone64', state: 'device' };

const IDENTITY: AppIdentity = {
  appId: 'com.vtex.pnp',
  installed: true,
  versionName: '4.0.2',
  running: true,
  foreground: true,
};

const snapshot = (over: Partial<DeviceSnapshot> = {}): Result<DeviceSnapshot> => ({
  ok: true,
  data: {
    devices: [PHONE],
    selectedId: PHONE.id,
    properties: { model: 'SM-G991B', release: '14', size: null, density: null },
    ...over,
  },
});

const store = () => useDeviceStore.getState();

let conductor: {
  deviceList: ReturnType<typeof vi.fn>;
  deviceAppInfo: ReturnType<typeof vi.fn>;
  viewerOpen: ReturnType<typeof vi.fn>;
  onDeviceChanged: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  resetDeviceStore();
  conductor = {
    deviceList: vi.fn(() => Promise.resolve(snapshot())),
    deviceAppInfo: vi.fn(() => Promise.resolve({ ok: true, data: IDENTITY })),
    viewerOpen: vi.fn(() => Promise.resolve({ ok: true, data: { url: 'http://127.0.0.1:9999/' } })),
    onDeviceChanged: vi.fn(() => () => {}),
  };
  window.conductor = conductor as unknown as ConductorApi;
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Lets the app-identity round-trip the store fires settle. */
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('applying a snapshot', () => {
  it('projects what main sent', async () => {
    store().applySnapshot(snapshot());
    await settle();

    expect(store().devices).toEqual([PHONE]);
    expect(selectSelectedId(store())).toBe(PHONE.id);
    expect(store().loaded).toBe(true);
  });

  it('is the same path whether it arrived by push or by invoke', async () => {
    await store().refresh();
    await settle();

    expect(conductor.deviceList).toHaveBeenCalledTimes(1);
    expect(store().devices).toEqual([PHONE]);
  });

  it('reads the app identity of the newly selected device', async () => {
    store().applySnapshot(snapshot());
    await settle();

    expect(conductor.deviceAppInfo).toHaveBeenCalledWith(PHONE.id);
    expect(store().appIdentity).toEqual(IDENTITY);
  });

  // The list is re-enumerated every 2s. Re-reading the app identity on every
  // one of them would be four adb calls a second, for nothing.
  it('does not re-read the app identity while the selection holds', async () => {
    store().applySnapshot(snapshot());
    await settle();
    store().applySnapshot(snapshot());
    await settle();

    expect(conductor.deviceAppInfo).toHaveBeenCalledTimes(1);
  });

  it('re-reads it when the selected device changes', async () => {
    store().applySnapshot(snapshot());
    await settle();
    store().applySnapshot(snapshot({ devices: [SECOND], selectedId: SECOND.id }));
    await settle();

    expect(conductor.deviceAppInfo).toHaveBeenLastCalledWith(SECOND.id);
  });

  it('drops the app identity when the device goes away', async () => {
    store().applySnapshot(snapshot());
    await settle();
    store().applySnapshot(snapshot({ devices: [], selectedId: null, properties: null }));
    await settle();

    expect(store().appIdentity).toBeNull();
    expect(selectSelectedId(store())).toBeNull();
  });

  it('keeps the failure main reported, with its code', () => {
    store().applySnapshot({
      ok: false,
      error: { code: 'device/adb-not-found', message: 'No adb.' },
    });

    expect(store().deviceError).toEqual({ code: 'device/adb-not-found', message: 'No adb.' });
    expect(store().loaded).toBe(true);
  });

  // Whatever was on screen was about a phone we can no longer see.
  it('clears the device state a failure invalidates', async () => {
    store().applySnapshot(snapshot());
    await settle();

    store().applySnapshot({ ok: false, error: { code: 'device/adb-failed', message: 'no' } });

    expect(store().devices).toEqual([]);
    expect(store().appIdentity).toBeNull();
    expect(store().properties).toBeNull();
  });

  it('clears an earlier failure once a snapshot arrives', async () => {
    store().applySnapshot({ ok: false, error: { code: 'device/adb-not-found', message: 'x' } });

    store().applySnapshot(snapshot());
    await settle();

    expect(store().deviceError).toBeNull();
  });

  it('keeps no app identity when the read itself failed', async () => {
    conductor.deviceAppInfo.mockResolvedValue({
      ok: false,
      error: { code: 'device/adb-failed', message: 'x' },
    });

    store().applySnapshot(snapshot());
    await settle();

    expect(store().appIdentity).toBeNull();
  });
});

/** Criterion 6's other half: main declines to choose, so the person does. */
describe('picking a device', () => {
  const two = snapshot({ devices: [PHONE, SECOND], selectedId: null, properties: null });

  it('selects nothing until the person picks', async () => {
    store().applySnapshot(two);
    await settle();

    expect(selectSelectedId(store())).toBeNull();
    expect(conductor.deviceAppInfo).not.toHaveBeenCalled();
  });

  it('reads the app identity of what was picked', async () => {
    store().applySnapshot(two);
    store().pick(SECOND.id);
    await settle();

    expect(selectSelectedId(store())).toBe(SECOND.id);
    expect(conductor.deviceAppInfo).toHaveBeenCalledWith(SECOND.id);
  });

  it('keeps the pick across the polls that follow', async () => {
    store().applySnapshot(two);
    store().pick(SECOND.id);
    await settle();
    store().applySnapshot(two);
    await settle();

    expect(selectSelectedId(store())).toBe(SECOND.id);
    expect(conductor.deviceAppInfo).toHaveBeenCalledTimes(1);
  });

  // A pick naming a device nobody can see any more is not a pick.
  it('drops a pick when that device is unplugged', async () => {
    store().applySnapshot(two);
    store().pick(SECOND.id);
    await settle();
    store().applySnapshot(snapshot());
    await settle();

    expect(store().pickedId).toBeNull();
    expect(selectSelectedId(store())).toBe(PHONE.id);
  });

  it('ignores a pick of what is already selected', async () => {
    store().applySnapshot(snapshot());
    await settle();

    store().pick(PHONE.id);
    await settle();

    expect(conductor.deviceAppInfo).toHaveBeenCalledTimes(1);
  });
});

/** Criterion 29 — the first open pays a JVM cold start, so it has to show. */
describe('opening the viewer', () => {
  it('reports progress while the child starts, and stops when it is up', async () => {
    const gate: { release: ((value: Result<{ url: string }>) => void) | null } = { release: null };
    conductor.viewerOpen.mockReturnValue(
      new Promise<Result<{ url: string }>>((resolve) => {
        gate.release = resolve;
      }),
    );

    const opening = store().openViewer();
    expect(store().viewerOpening).toBe(true);

    gate.release?.({ ok: true, data: { url: 'http://127.0.0.1:9999/' } });
    await opening;

    expect(store().viewerOpening).toBe(false);
    expect(store().viewerError).toBeNull();
  });

  it('keeps the failure code main reported', async () => {
    conductor.viewerOpen.mockResolvedValue({
      ok: false,
      error: { code: 'viewer/maestro-not-found', message: 'Install Maestro.' },
    });

    await store().openViewer();

    expect(store().viewerError).toEqual({
      code: 'viewer/maestro-not-found',
      message: 'Install Maestro.',
    });
    expect(store().viewerOpening).toBe(false);
  });

  it('clears a previous failure when tried again', async () => {
    conductor.viewerOpen.mockResolvedValueOnce({
      ok: false,
      error: { code: 'viewer/call-failed', message: 'x' },
    });
    await store().openViewer();

    await store().openViewer();

    expect(store().viewerError).toBeNull();
  });

  // The JVM start is slow enough that a second click is the natural reaction.
  it('does not start a second open while one is in flight', async () => {
    conductor.viewerOpen.mockReturnValue(new Promise(() => {}));

    void store().openViewer();
    void store().openViewer();

    expect(conductor.viewerOpen).toHaveBeenCalledTimes(1);
  });
});

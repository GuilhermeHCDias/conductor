import type { AppIdentity, ConductorApi, Device, DeviceSnapshot, Result } from '@shared/ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetDeviceStore,
  selectMirrorError,
  selectMirrorHeight,
  selectMirrorStatus,
  selectMirrorWidth,
  selectSelectedId,
  useDeviceStore,
} from './device.store';

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
  mirrorStart: ReturnType<typeof vi.fn>;
  mirrorStop: ReturnType<typeof vi.fn>;
  onDeviceChanged: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  resetDeviceStore();
  conductor = {
    deviceList: vi.fn(() => Promise.resolve(snapshot())),
    deviceAppInfo: vi.fn(() => Promise.resolve({ ok: true, data: IDENTITY })),
    viewerOpen: vi.fn(() => Promise.resolve({ ok: true, data: { url: 'http://127.0.0.1:9999/' } })),
    mirrorStart: vi.fn(() =>
      Promise.resolve({
        ok: true,
        data: { sessionId: 'mirror-1', codec: 'h264', width: 464, height: 1024 },
      }),
    ),
    mirrorStop: vi.fn(() => Promise.resolve({ ok: true, data: { sessionId: 'mirror-1' } })),
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

/**
 * The mirror half. Frames never reach this store — they go from the
 * subscription straight to the decoder — so what lives here is status only, in
 * flat fields, because a selector returning a fresh object would re-render the
 * whole panel every time main polls (criterion 42).
 */
describe('the mirror', () => {
  const STREAM = { sessionId: 'mirror-1', codec: 'h264', width: 464, height: 1024 };

  beforeEach(() => {
    conductor.mirrorStart = vi.fn(() => Promise.resolve({ ok: true, data: STREAM }));
    conductor.mirrorStop = vi.fn(() =>
      Promise.resolve({ ok: true, data: { sessionId: 'mirror-1' } }),
    );
  });

  it('is idle before anything is asked of it', () => {
    expect(store().mirrorStatus).toBe('idle');
    expect(store().mirrorSessionId).toBeNull();
  });

  it('records the stream main opened', async () => {
    await store().startMirror(PHONE.id);

    expect(conductor.mirrorStart).toHaveBeenCalledWith(PHONE.id);
    expect(store()).toMatchObject({
      mirrorStatus: 'streaming',
      mirrorSessionId: 'mirror-1',
      mirrorWidth: 464,
      mirrorHeight: 1024,
      mirrorError: null,
    });
  });

  /** The server has to start on the device, so there is a real gap to report. */
  it('says it is starting while main is working', async () => {
    conductor.mirrorStart = vi.fn(() => new Promise(() => {}));

    void store().startMirror(PHONE.id);

    expect(store().mirrorStatus).toBe('starting');
  });

  it('records a start that failed, with the code main gave it', async () => {
    conductor.mirrorStart = vi.fn(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'mirror/start-failed', message: 'Could not find "/data/local/tmp/s.jar"' },
      }),
    );

    await store().startMirror(PHONE.id);

    expect(store()).toMatchObject({
      mirrorStatus: 'failed',
      mirrorSessionId: null,
      mirrorError: {
        code: 'mirror/start-failed',
        message: 'Could not find "/data/local/tmp/s.jar"',
      },
    });
  });

  it('does not ask main twice while a start is in flight', async () => {
    conductor.mirrorStart = vi.fn(() => new Promise(() => {}));

    void store().startMirror(PHONE.id);
    void store().startMirror(PHONE.id);

    expect(conductor.mirrorStart).toHaveBeenCalledTimes(1);
  });

  it('stops the session it holds and goes back to idle', async () => {
    await store().startMirror(PHONE.id);

    await store().stopMirror();

    expect(conductor.mirrorStop).toHaveBeenCalledWith('mirror-1');
    expect(store()).toMatchObject({
      mirrorStatus: 'idle',
      mirrorSessionId: null,
      mirrorWidth: null,
      mirrorHeight: null,
    });
  });

  it('asks main for nothing when there is no session to stop', async () => {
    await store().stopMirror();

    expect(conductor.mirrorStop).not.toHaveBeenCalled();
  });

  /** Criterion 25 — the phone went away, and the panel must not stall on the
   * last frame it drew. */
  it('records a session that ended on its own', async () => {
    await store().startMirror(PHONE.id);

    store().mirrorEnded('mirror-1', {
      code: 'mirror/device-lost',
      message: 'The device closed the mirror stream.',
    });

    expect(store()).toMatchObject({
      mirrorStatus: 'failed',
      mirrorSessionId: null,
      mirrorError: { code: 'mirror/device-lost' },
    });
  });

  /** A session that ended after its replacement started must not put the new
   * one away. */
  it('ignores the end of a session it is no longer showing', async () => {
    await store().startMirror(PHONE.id);

    store().mirrorEnded('mirror-0', { code: 'mirror/device-lost', message: 'stale' });

    expect(store()).toMatchObject({ mirrorStatus: 'streaming', mirrorSessionId: 'mirror-1' });
  });

  /** Criterion 43 — no WebCodecs is a state of its own, not a blank canvas. */
  it('records a renderer with no decoder', () => {
    store().mirrorUnsupported();

    expect(store().mirrorStatus).toBe('unsupported');
  });

  it('does not try to start a mirror it could never decode', async () => {
    store().mirrorUnsupported();

    await store().startMirror(PHONE.id);

    expect(conductor.mirrorStart).not.toHaveBeenCalled();
    expect(store().mirrorStatus).toBe('unsupported');
  });

  it('is put back by the reset the tests share', async () => {
    await store().startMirror(PHONE.id);

    resetDeviceStore();

    expect(store()).toMatchObject({ mirrorStatus: 'idle', mirrorSessionId: null });
  });
});

/**
 * Criterion 42 — one field per selector, and never a fresh object. A selector
 * returning `{ width, height }` would be a new reference on every render, so a
 * poll tick two seconds apart would re-render the panel that draws the frames.
 */
describe('the mirror selectors', () => {
  it('each read a single field straight off the state', () => {
    const state = store();

    expect(selectMirrorStatus(state)).toBe(state.mirrorStatus);
    expect(selectMirrorWidth(state)).toBe(state.mirrorWidth);
    expect(selectMirrorHeight(state)).toBe(state.mirrorHeight);
    expect(selectMirrorError(state)).toBe(state.mirrorError);
  });

  it('are stable across calls while the stream is unchanged', async () => {
    await store().startMirror(PHONE.id);

    expect(selectMirrorStatus(store())).toBe(selectMirrorStatus(store()));
    expect(selectMirrorWidth(store())).toBe(selectMirrorWidth(store()));
    expect(selectMirrorError(store())).toBe(selectMirrorError(store()));
  });
});

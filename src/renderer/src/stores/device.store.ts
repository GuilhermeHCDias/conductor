import type { AppIdentity, Device, DeviceProperties, DeviceSnapshot, Result } from '@shared/ipc';
import { create } from 'zustand';
import type { MirrorStatus } from '../lib/device-state';

/**
 * What is plugged in, and what the app under test is doing on it. Main owns all
 * of it: this store is a projection of the snapshots main pushes, plus the two
 * pieces of state that are genuinely the window's — which device the person
 * picked when there was more than one, and whether the Viewer is starting.
 *
 * Its actions are the only renderer code that calls `window.conductor`.
 */

export type Failure = { readonly code: string; readonly message: string };

export type { MirrorStatus };

export type DeviceData = {
  readonly devices: readonly Device[];
  /** Main's own selection: set only when exactly one device is usable. */
  readonly autoSelectedId: string | null;
  /**
   * The person's pick, when main declined to choose. There is no channel that
   * sets a selection in main — nor should there be one before something on the
   * device needs it — so this is window state, and it never outlives the device
   * it names.
   */
  readonly pickedId: string | null;
  /** Of main's selected device, so never stale against a local pick. */
  readonly properties: DeviceProperties | null;
  /** Set when the device list could not be read at all. */
  readonly deviceError: Failure | null;
  readonly appIdentity: AppIdentity | null;
  /** False until the first snapshot lands: the panel claims nothing before it. */
  readonly loaded: boolean;
  /** True while the `maestro mcp` child is coming up — the JVM cold start. */
  readonly viewerOpening: boolean;
  readonly viewerError: Failure | null;
  /**
   * The mirror, as five flat fields rather than one object. Criterion 42: a
   * selector that built `{ status, width, height }` would return a fresh object
   * on every render and re-render the panel on every poll tick.
   *
   * There is deliberately no frame here. Frames go from the subscription
   * straight into the decoder — putting 30 of them a second through a store
   * would re-render the window at the framerate of the phone.
   */
  readonly mirrorStatus: MirrorStatus;
  readonly mirrorSessionId: string | null;
  readonly mirrorWidth: number | null;
  readonly mirrorHeight: number | null;
  readonly mirrorError: Failure | null;
};

export type DeviceActions = {
  /** Applies a snapshot, however it arrived — the push and the invoke are one path. */
  applySnapshot: (payload: Result<DeviceSnapshot>) => void;
  refresh: () => Promise<void>;
  pick: (deviceId: string) => void;
  openViewer: () => Promise<void>;
  startMirror: (deviceId: string) => Promise<void>;
  stopMirror: () => Promise<void>;
  /** A session main says is over. Named, so a late report cannot put away the
   * session that replaced it. */
  mirrorEnded: (sessionId: string, failure: Failure) => void;
  /** This renderer has no `VideoDecoder`. Nothing here can fix that, so nothing
   * tries to start a stream it could never draw. */
  mirrorUnsupported: () => void;
};

export type DeviceState = DeviceData & DeviceActions;

function createDeviceData(): DeviceData {
  return {
    devices: [],
    autoSelectedId: null,
    pickedId: null,
    properties: null,
    deviceError: null,
    appIdentity: null,
    loaded: false,
    viewerOpening: false,
    viewerError: null,
    mirrorStatus: 'idle',
    mirrorSessionId: null,
    mirrorWidth: null,
    mirrorHeight: null,
    mirrorError: null,
  };
}

export const useDeviceStore = create<DeviceState>((set, get) => ({
  ...createDeviceData(),

  applySnapshot: (payload) => {
    if (!payload.ok) {
      // A device list that cannot be read leaves nothing worth keeping on
      // screen: the app identity beside it would be about a phone we can no
      // longer see.
      set({
        devices: [],
        autoSelectedId: null,
        pickedId: null,
        properties: null,
        appIdentity: null,
        deviceError: payload.error,
        loaded: true,
      });
      return;
    }

    const { devices, selectedId, properties } = payload.data;
    const before = selectSelectedId(get());
    // A pick that names a device nobody can see any more is not a pick.
    const pickedId = devices.some((device) => device.id === get().pickedId) ? get().pickedId : null;

    set({
      devices,
      autoSelectedId: selectedId,
      pickedId,
      properties,
      deviceError: null,
      loaded: true,
    });

    const after = pickedId ?? selectedId;
    if (after !== before) {
      set({ appIdentity: null });
      void loadAppIdentity(set, after);
    }
  },

  refresh: async () => {
    get().applySnapshot(await window.conductor.deviceList());
  },

  pick: (deviceId) => {
    if (deviceId === selectSelectedId(get())) {
      return;
    }
    set({ pickedId: deviceId, appIdentity: null });
    void loadAppIdentity(set, deviceId);
  },

  openViewer: async () => {
    if (get().viewerOpening) {
      return;
    }
    set({ viewerOpening: true, viewerError: null });
    const result = await window.conductor.viewerOpen();
    set({ viewerOpening: false, viewerError: result.ok ? null : result.error });
  },

  startMirror: async (deviceId) => {
    const { mirrorStatus } = get();
    // A second start while one is in flight would leave main holding a session
    // this store has no id for — and main stops the old one to make room, so the
    // picture would go away rather than arrive twice.
    if (mirrorStatus === 'starting' || mirrorStatus === 'unsupported') {
      return;
    }

    set({ mirrorStatus: 'starting', mirrorError: null });
    const result = await window.conductor.mirrorStart(deviceId);
    if (!result.ok) {
      set({
        mirrorStatus: 'failed',
        mirrorSessionId: null,
        mirrorWidth: null,
        mirrorHeight: null,
        mirrorError: result.error,
      });
      return;
    }

    set({
      mirrorStatus: 'streaming',
      mirrorSessionId: result.data.sessionId,
      mirrorWidth: result.data.width,
      mirrorHeight: result.data.height,
      mirrorError: null,
    });
  },

  stopMirror: async () => {
    const sessionId = get().mirrorSessionId;
    // Cleared first, so a frame or an `ended` arriving mid-flight finds no
    // session to belong to.
    set(idleMirror());
    if (sessionId !== null) {
      await window.conductor.mirrorStop(sessionId);
    }
  },

  mirrorEnded: (sessionId, failure) => {
    if (get().mirrorSessionId !== sessionId) {
      return;
    }
    set({
      mirrorStatus: 'failed',
      mirrorSessionId: null,
      mirrorWidth: null,
      mirrorHeight: null,
      mirrorError: failure,
    });
  },

  mirrorUnsupported: () => {
    set({ ...idleMirror(), mirrorStatus: 'unsupported' });
  },
}));

/** The mirror, showing nothing and holding nothing. */
function idleMirror(): Pick<
  DeviceData,
  'mirrorStatus' | 'mirrorSessionId' | 'mirrorWidth' | 'mirrorHeight' | 'mirrorError'
> {
  return {
    mirrorStatus: 'idle',
    mirrorSessionId: null,
    mirrorWidth: null,
    mirrorHeight: null,
    mirrorError: null,
  };
}

/** Restores the initial state. Used by tests, which share one module instance. */
export function resetDeviceStore(): void {
  useDeviceStore.setState(createDeviceData());
}

async function loadAppIdentity(
  set: (partial: Partial<DeviceData>) => void,
  deviceId: string | null,
): Promise<void> {
  if (deviceId === null) {
    set({ appIdentity: null });
    return;
  }

  const result = await window.conductor.deviceAppInfo(deviceId);
  // A device that went away mid-flight must not paint its answer over whatever
  // replaced it.
  if (selectSelectedId(useDeviceStore.getState()) !== deviceId) {
    return;
  }
  set({ appIdentity: result.ok ? result.data : null });
}

/** Criterion 30 — each of these is one field, so a component subscribing to it
 * re-renders when that field changes and not when the poll ticks. */
export function selectSelectedId(state: DeviceState): string | null {
  return state.pickedId ?? state.autoSelectedId;
}

export function selectDevices(state: DeviceState): readonly Device[] {
  return state.devices;
}

export function selectProperties(state: DeviceState): DeviceProperties | null {
  return state.properties;
}

/**
 * Criterion 42. One field each, and never a fresh object: frames arrive ~30
 * times a second into the same panel these feed, so a selector that allocated
 * would re-render the window at the framerate of the phone.
 */
export function selectMirrorStatus(state: DeviceState): MirrorStatus {
  return state.mirrorStatus;
}

export function selectMirrorWidth(state: DeviceState): number | null {
  return state.mirrorWidth;
}

export function selectMirrorHeight(state: DeviceState): number | null {
  return state.mirrorHeight;
}

export function selectMirrorError(state: DeviceState): Failure | null {
  return state.mirrorError;
}

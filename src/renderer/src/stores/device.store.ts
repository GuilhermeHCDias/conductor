import type {
  AppIdentity,
  Device,
  DeviceProperties,
  DeviceSnapshot,
  MirrorInput,
  Result,
} from '@shared/ipc';
import { ERROR_CODES, MAX_INPUT_TEXT_LENGTH } from '@shared/ipc';
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
  /**
   * Criterion 4. Whether this session can be driven as well as watched. False
   * before one is open, false for a session that arrived without a control
   * channel, and false again the moment one is refused — the picture is
   * unaffected by all three.
   */
  readonly mirrorControl: boolean;
  /** Criterion 16. Why control is unavailable, when it once was. Kept apart from
   * `mirrorError`, which is the picture's, and would put the phone away. */
  readonly mirrorControlError: Failure | null;
};

export type DeviceActions = {
  /** Applies a snapshot, however it arrived — the push and the invoke are one path. */
  applySnapshot: (payload: Result<DeviceSnapshot>) => void;
  refresh: () => Promise<void>;
  pick: (deviceId: string) => void;
  openViewer: () => Promise<void>;
  startMirror: (deviceId: string) => Promise<void>;
  stopMirror: () => Promise<void>;
  /**
   * Criteria 6 and 11–14. Sends one input at the open session — or holds it, if
   * it is text: a contiguous run is coalesced into one `INJECT_TEXT`, and
   * anything else flushes that run in front of itself.
   *
   * Deliberately not a promise. The order is guaranteed by the queue inside, and
   * a caller awaiting each keystroke would serialise typing against the round
   * trip to the device.
   */
  sendInput: (input: MirrorInput) => void;
  /** A session main says is over. Named, so a late report cannot put away the
   * session that replaced it. */
  mirrorEnded: (sessionId: string, failure: Failure) => void;
  /**
   * The stream changed size mid-session — a rotation. Only the SPS announces
   * it and only the decoded frames carry it, so the report comes from the
   * decoder's output, named like `mirrorEnded` for the same reason.
   */
  mirrorResized: (sessionId: string, width: number, height: number) => void;
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
    mirrorControl: false,
    mirrorControlError: null,
  };
}

/**
 * Criterion 11's batching, and the ordering it puts at risk.
 *
 * Held text lives here rather than in the store's state because nothing renders
 * it: a keystroke that re-rendered the window on its way to the device would
 * cost more than the message it saves. What the state does hold is the outcome —
 * whether control is still there.
 *
 * ⚠️ The queue is the important half. Text may be *coalesced*, but nothing may
 * ever be reordered: holding "abc" for a few milliseconds while Enter went
 * straight out would submit an empty field and then type into whatever came
 * next. So every send goes through one chain, and anything that is not text
 * flushes the held run in front of itself.
 */
let pendingText = '';
let flushTimer: ReturnType<typeof setTimeout> | null = null;
/** Which session the held text was typed at — it outlives none of them. */
let pendingSessionId: string | null = null;
let queue: Promise<void> = Promise.resolve();

/**
 * One frame. Long enough to coalesce a burst — a paste, a fast typist, anything
 * programmatic — and short enough that nobody feels the key they pressed
 * waiting on it.
 */
export const TEXT_BATCH_MS = 16;

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
      // A new session's control is its own, and the last one's failure is not
      // this one's — the panel would otherwise stay ungrabbable after a replug.
      mirrorControl: result.data.control,
      mirrorControlError: null,
    });
  },

  stopMirror: async () => {
    const sessionId = get().mirrorSessionId;
    // Cleared first, so a frame or an `ended` arriving mid-flight finds no
    // session to belong to.
    discardPendingText();
    set(idleMirror());
    if (sessionId !== null) {
      await window.conductor.mirrorStop(sessionId);
    }
  },

  sendInput: (input) => {
    const { mirrorSessionId, mirrorControl } = get();
    // Criterion 15. Nothing is streaming, or nothing can be reached: there is no
    // target, and a message with no session to name would be a message at
    // whatever replaced it.
    if (mirrorSessionId === null || !mirrorControl) {
      return;
    }

    if (input.type === 'text') {
      holdText(input.text, mirrorSessionId, get);
      return;
    }

    // Criterion 12 and 14: everything that is not text goes now — behind
    // whatever was already typed, and in front of nothing.
    flushPendingText(get);
    enqueue(() => deliver(mirrorSessionId, input, get));
  },

  mirrorEnded: (sessionId, failure) => {
    if (get().mirrorSessionId !== sessionId) {
      return;
    }
    discardPendingText();
    set({
      mirrorStatus: 'failed',
      mirrorSessionId: null,
      mirrorWidth: null,
      mirrorHeight: null,
      mirrorError: failure,
      mirrorControl: false,
      mirrorControlError: null,
    });
  },

  mirrorResized: (sessionId, width, height) => {
    if (get().mirrorSessionId !== sessionId) {
      return;
    }
    set({ mirrorWidth: width, mirrorHeight: height });
  },

  mirrorUnsupported: () => {
    discardPendingText();
    set({ ...idleMirror(), mirrorStatus: 'unsupported' });
  },
}));

type Getter = () => DeviceState;

/** One chain, so nothing can overtake anything. A refused send must not stop the
 * ones behind it — the person is still typing. */
function enqueue(work: () => Promise<void>): void {
  queue = queue.then(work, work);
}

/**
 * Criterion 11. Holds the character against the run being typed, and starts the
 * clock if it is the first of one.
 *
 * The cap is the server's: `ControlMessageReader` reads at most
 * `INJECT_TEXT_MAX_LENGTH` bytes, so a run past it goes out in pieces rather
 * than being refused at the far end. Measured against the byte count, because
 * that is what the server allocates.
 */
function holdText(text: string, sessionId: string, get: Getter): void {
  if (pendingSessionId !== sessionId) {
    // The run belongs to whatever is streaming now; anything held for an older
    // session was typed at a picture that is gone.
    discardPendingText();
    pendingSessionId = sessionId;
  }

  for (const character of text) {
    if (byteLength(pendingText + character) > MAX_INPUT_TEXT_LENGTH) {
      flushPendingText(get);
      pendingSessionId = sessionId;
    }
    pendingText += character;
  }

  if (flushTimer === null) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushPendingText(get);
    }, TEXT_BATCH_MS);
  }
}

/** Puts the held run on the queue, ahead of whatever is about to join it. */
function flushPendingText(get: Getter): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingText === '') {
    return;
  }

  const text = pendingText;
  const sessionId = pendingSessionId;
  pendingText = '';
  pendingSessionId = null;
  if (sessionId !== null) {
    enqueue(() => deliver(sessionId, { type: 'text', text }, get));
  }
}

/** The session is gone, so what was typed at it has nowhere to land. */
function discardPendingText(): void {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  pendingText = '';
  pendingSessionId = null;
}

/**
 * Criterion 16. One send, and what its refusal means — read from the code,
 * which is the reason criterion 16 asked for a distinct one. Only
 * `mirror/control-failed` means the channel itself is gone, and only that puts
 * the tap target away; a stale session id or an argument the boundary refused
 * leaves the socket exactly as it was, so control survives and just says what
 * happened. Either way the picture, which none of this speaks to, keeps
 * streaming (criterion 4).
 */
async function deliver(sessionId: string, input: MirrorInput, get: Getter): Promise<void> {
  // The session may have been replaced while this waited its turn in the queue.
  if (get().mirrorSessionId !== sessionId) {
    return;
  }

  const result = await window.conductor.mirrorInput(sessionId, input);
  if (result.ok || get().mirrorSessionId !== sessionId) {
    return;
  }
  useDeviceStore.setState(
    result.error.code === ERROR_CODES.mirrorControlFailed
      ? { mirrorControl: false, mirrorControlError: result.error }
      : { mirrorControlError: result.error },
  );
}

/** What the wire counts, and what the server's cap is measured in. */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** The mirror, showing nothing and holding nothing. */
function idleMirror(): Pick<
  DeviceData,
  | 'mirrorStatus'
  | 'mirrorSessionId'
  | 'mirrorWidth'
  | 'mirrorHeight'
  | 'mirrorError'
  | 'mirrorControl'
  | 'mirrorControlError'
> {
  return {
    mirrorStatus: 'idle',
    mirrorSessionId: null,
    mirrorWidth: null,
    mirrorHeight: null,
    mirrorError: null,
    mirrorControl: false,
    mirrorControlError: null,
  };
}

/** Restores the initial state. Used by tests, which share one module instance —
 * including the text held outside it, which no `setState` would reach. */
export function resetDeviceStore(): void {
  discardPendingText();
  queue = Promise.resolve();
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
 * Criterion 42. One field each, and never a fresh object: frames arrive ~60
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

/** Criterion 15 — what the panel gates the tap target, the keyboard and the back
 * control on, beside the status itself. */
export function selectMirrorControl(state: DeviceState): boolean {
  return state.mirrorControl;
}

export function selectMirrorControlError(state: DeviceState): Failure | null {
  return state.mirrorControlError;
}

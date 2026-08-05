import type { AppIdentity, ConductorApi, Device, DeviceSnapshot, Result } from '@shared/ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetDeviceStore,
  selectMirrorControl,
  selectMirrorError,
  selectMirrorHeight,
  selectMirrorStatus,
  selectMirrorWidth,
  selectSelectedId,
  TEXT_BATCH_MS,
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
  mirrorStart: ReturnType<typeof vi.fn>;
  mirrorStop: ReturnType<typeof vi.fn>;
  mirrorInput: ReturnType<typeof vi.fn>;
  onDeviceChanged: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  resetDeviceStore();
  conductor = {
    deviceList: vi.fn(() => Promise.resolve(snapshot())),
    deviceAppInfo: vi.fn(() => Promise.resolve({ ok: true, data: IDENTITY })),
    mirrorStart: vi.fn(() =>
      Promise.resolve({
        ok: true,
        data: { sessionId: 'mirror-1', codec: 'h264', width: 464, height: 1024, control: true },
      }),
    ),
    mirrorStop: vi.fn(() => Promise.resolve({ ok: true, data: { sessionId: 'mirror-1' } })),
    mirrorInput: vi.fn(() => Promise.resolve({ ok: true, data: { sessionId: 'mirror-1' } })),
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

  /** A rotation swaps the stream's size mid-session — announced only by the
   * SPS, carried only by the frames. The fit follows what is actually drawn. */
  it('follows a mid-session resize of the session it is showing', async () => {
    await store().startMirror(PHONE.id);

    store().mirrorResized('mirror-1', 1024, 464);

    expect(store()).toMatchObject({
      mirrorStatus: 'streaming',
      mirrorWidth: 1024,
      mirrorHeight: 464,
    });
  });

  it('ignores a resize from a session it is no longer showing', async () => {
    await store().startMirror(PHONE.id);

    store().mirrorResized('mirror-0', 1024, 464);

    expect(store()).toMatchObject({ mirrorWidth: 464, mirrorHeight: 1024 });
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
    expect(selectMirrorControl(state)).toBe(state.mirrorControl);
  });

  it('are stable across calls while the stream is unchanged', async () => {
    await store().startMirror(PHONE.id);

    expect(selectMirrorStatus(store())).toBe(selectMirrorStatus(store()));
    expect(selectMirrorWidth(store())).toBe(selectMirrorWidth(store()));
    expect(selectMirrorError(store())).toBe(selectMirrorError(store()));
  });
});

/**
 * Criteria 4–6 and 11–16, from the store's side. The batching is the delicate
 * part: characters may be coalesced, but nothing may ever be *reordered*, and a
 * run of text held for a few milliseconds must go out in front of whatever
 * interrupts it.
 */
/**
 * Criterion 19's trigger. The inspector recaptures after an interaction
 * settles, so the store counts deliveries — and only the ones the device
 * actually took: a refused tap changed nothing worth re-photographing.
 */
describe('inputs settling', () => {
  const TAP = { type: 'tap', x: 232, y: 534, screenWidth: 464, screenHeight: 1024 } as const;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const drain = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(TEXT_BATCH_MS);
    await vi.advanceTimersByTimeAsync(0);
  };

  it('counts an input the device took', async () => {
    await store().startMirror(PHONE.id);

    store().sendInput(TAP);
    store().sendInput({ type: 'back' });
    await drain();

    expect(store().inputsSettled).toBe(2);
  });

  it('does not count a refused input', async () => {
    conductor.mirrorInput.mockResolvedValue({
      ok: false,
      error: { code: 'mirror/control-failed', message: 'gone' },
    });
    await store().startMirror(PHONE.id);

    store().sendInput(TAP);
    await drain();

    expect(store().inputsSettled).toBe(0);
  });

  it('does not count an input whose session was replaced mid-flight', async () => {
    let release: (value: { ok: true; data: { sessionId: string } }) => void = () => {};
    conductor.mirrorInput.mockReturnValueOnce(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    await store().startMirror(PHONE.id);

    store().sendInput(TAP);
    await drain();
    store().mirrorEnded('mirror-1', { code: 'mirror/device-lost', message: 'gone' });
    release({ ok: true, data: { sessionId: 'mirror-1' } });
    await drain();

    expect(store().inputsSettled).toBe(0);
  });
});

describe('driving the device', () => {
  const TAP = { type: 'tap', x: 232, y: 534, screenWidth: 464, screenHeight: 1024 } as const;

  /** Flushes the batch window and lets the send chain settle. */
  const drain = async (): Promise<void> => {
    await vi.advanceTimersByTimeAsync(TEXT_BATCH_MS);
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('reads whether the session it started can be driven', async () => {
    await store().startMirror(PHONE.id);

    expect(store().mirrorControl).toBe(true);
  });

  /** Criterion 4 — a picture with no control is a session, and the panel needs
   * to know before it offers a tap target. */
  it('records a session that arrived without control', async () => {
    conductor.mirrorStart.mockResolvedValueOnce({
      ok: true,
      data: { sessionId: 'mirror-1', codec: 'h264', width: 464, height: 1024, control: false },
    });

    await store().startMirror(PHONE.id);

    expect(store().mirrorControl).toBe(false);
    expect(store().mirrorStatus).toBe('streaming');
  });

  it('sends a tap at the session that is open', async () => {
    await store().startMirror(PHONE.id);

    store().sendInput(TAP);
    await drain();

    expect(conductor.mirrorInput).toHaveBeenCalledWith('mirror-1', TAP);
  });

  /** Criterion 15 — there is nothing to reach when nothing is streaming. */
  it('sends nothing when no session is open', async () => {
    store().sendInput(TAP);
    await drain();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  it('sends nothing at a session that arrived without control', async () => {
    conductor.mirrorStart.mockResolvedValueOnce({
      ok: true,
      data: { sessionId: 'mirror-1', codec: 'h264', width: 464, height: 1024, control: false },
    });
    await store().startMirror(PHONE.id);

    store().sendInput(TAP);
    await drain();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  /** Criterion 11 — the protocol carries a whole string, so a run of typing is
   * one message rather than one per keystroke. */
  it('batches a contiguous run of characters into one message', async () => {
    await store().startMirror(PHONE.id);

    store().sendInput({ type: 'text', text: 'h' });
    store().sendInput({ type: 'text', text: 'i' });
    store().sendInput({ type: 'text', text: '!' });
    await drain();

    expect(conductor.mirrorInput).toHaveBeenCalledTimes(1);
    expect(conductor.mirrorInput).toHaveBeenCalledWith('mirror-1', { type: 'text', text: 'hi!' });
  });

  it('starts a new run once the last one has gone out', async () => {
    await store().startMirror(PHONE.id);

    store().sendInput({ type: 'text', text: 'a' });
    await drain();
    store().sendInput({ type: 'text', text: 'b' });
    await drain();

    expect(conductor.mirrorInput.mock.calls.map((call) => call[1])).toEqual([
      { type: 'text', text: 'a' },
      { type: 'text', text: 'b' },
    ]);
  });

  /**
   * ⚠️ The trap batching creates. Holding 'abc' for a few milliseconds while
   * Enter goes out immediately would submit an empty field and then type into
   * whatever came next.
   */
  it('flushes held text in front of anything that interrupts it', async () => {
    await store().startMirror(PHONE.id);

    store().sendInput({ type: 'text', text: 'a' });
    store().sendInput({ type: 'text', text: 'b' });
    store().sendInput({ type: 'key', key: 'enter' });
    await drain();

    expect(conductor.mirrorInput.mock.calls.map((call) => call[1])).toEqual([
      { type: 'text', text: 'ab' },
      { type: 'key', key: 'enter' },
    ]);
  });

  it('flushes held text in front of a tap', async () => {
    await store().startMirror(PHONE.id);

    store().sendInput({ type: 'text', text: 'x' });
    store().sendInput(TAP);
    await drain();

    expect(conductor.mirrorInput.mock.calls.map((call) => call[1])).toEqual([
      { type: 'text', text: 'x' },
      TAP,
    ]);
  });

  it('flushes held text in front of the back action', async () => {
    await store().startMirror(PHONE.id);

    store().sendInput({ type: 'text', text: 'q' });
    store().sendInput({ type: 'back' });
    await drain();

    expect(conductor.mirrorInput.mock.calls.map((call) => call[1])).toEqual([
      { type: 'text', text: 'q' },
      { type: 'back' },
    ]);
  });

  /** The server reads a bounded buffer; a run longer than that goes out in
   * pieces rather than being refused. */
  it('breaks a run longer than the server will read', async () => {
    await store().startMirror(PHONE.id);

    for (let index = 0; index < 320; index += 1) {
      store().sendInput({ type: 'text', text: 'a' });
    }
    await drain();

    const texts = conductor.mirrorInput.mock.calls.map((call) => call[1].text);
    expect(texts.length).toBeGreaterThan(1);
    expect(texts.join('')).toBe('a'.repeat(320));
    for (const text of texts) {
      expect(text.length).toBeLessThanOrEqual(300);
    }
  });

  /** Criterion 16 — control failing puts the tap target away, and says why. */
  it('reports control as gone when a send comes back refused', async () => {
    await store().startMirror(PHONE.id);
    conductor.mirrorInput.mockResolvedValueOnce({
      ok: false,
      error: { code: 'mirror/control-failed', message: 'the control socket is gone' },
    });

    store().sendInput({ type: 'back' });
    await drain();

    expect(store().mirrorControl).toBe(false);
    expect(store().mirrorControlError).toEqual({
      code: 'mirror/control-failed',
      message: 'the control socket is gone',
    });
  });

  /** Criterion 16 gave control its own code so it could be told apart from the
   * rest. A stale session id or a rejected argument says nothing about the
   * socket, so the tap target stays: latching on those would retire the phone
   * over a message the control channel never even saw. */
  it('keeps control when a send is refused for a reason that is not control failing', async () => {
    await store().startMirror(PHONE.id);
    conductor.mirrorInput.mockResolvedValueOnce({
      ok: false,
      error: { code: 'mirror/session-not-found', message: 'there is no mirror session mirror-1' },
    });

    store().sendInput({ type: 'back' });
    await drain();

    expect(store().mirrorControl).toBe(true);
    expect(store().mirrorControlError).toEqual({
      code: 'mirror/session-not-found',
      message: 'there is no mirror session mirror-1',
    });
  });

  /** Criterion 4 — and the picture is untouched by any of it. */
  it('leaves the stream alone when control fails', async () => {
    await store().startMirror(PHONE.id);
    conductor.mirrorInput.mockResolvedValueOnce({
      ok: false,
      error: { code: 'mirror/control-failed', message: 'gone' },
    });

    store().sendInput({ type: 'back' });
    await drain();

    expect(store().mirrorStatus).toBe('streaming');
    expect(store().mirrorSessionId).toBe('mirror-1');
    expect(store().mirrorError).toBeNull();
  });

  it('drops text held for a session that has been stopped', async () => {
    await store().startMirror(PHONE.id);

    store().sendInput({ type: 'text', text: 'held' });
    await store().stopMirror();
    await drain();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  it('drops text held for a session that ended under it', async () => {
    await store().startMirror(PHONE.id);

    store().sendInput({ type: 'text', text: 'held' });
    store().mirrorEnded('mirror-1', { code: 'mirror/device-lost', message: 'gone' });
    await drain();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  /** A new session starts clean: control is whatever *this* one reported, and
   * the last one's failure is not this one's. */
  it('forgets the last session’s control failure when a new one starts', async () => {
    await store().startMirror(PHONE.id);
    conductor.mirrorInput.mockResolvedValueOnce({
      ok: false,
      error: { code: 'mirror/control-failed', message: 'gone' },
    });
    store().sendInput({ type: 'back' });
    await drain();

    await store().stopMirror();
    await store().startMirror(PHONE.id);

    expect(store().mirrorControl).toBe(true);
    expect(store().mirrorControlError).toBeNull();
  });
});

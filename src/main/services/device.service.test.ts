import type {
  AppIdentity,
  Device,
  DeviceProperties,
  DeviceSnapshot,
  MirrorEvent,
  MirrorInput,
  Result,
} from '@shared/ipc';
import { ERROR_CODES } from '@shared/ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdbNotFoundError } from '../maestro/AdbBridge';
import type { MaestroGateway, MirrorHandlers, MirrorSession } from '../maestro/MaestroGateway';
import { DeviceService, POLL_INTERVAL_MS } from './device.service';

/**
 * Driven entirely by a fake Gateway: the service's job is selection, change
 * detection and the poll loop, and none of that needs adb to exist.
 */

const APP_ID = 'com.vtex.pnp';

const PHONE: Device = { id: 'R9QYC01EMXL', model: 'SM_G991B', state: 'device' };
const EMULATOR: Device = { id: 'emulator-5554', model: 'sdk_gphone64', state: 'device' };
const UNAUTHORIZED: Device = { id: '9A271FFAZ005LN', model: null, state: 'unauthorized' };

const PROPERTIES: DeviceProperties = {
  model: 'SM-G991B',
  release: '14',
  size: { width: 1080, height: 2400 },
  density: 420,
};

const IDENTITY: AppIdentity = {
  appId: APP_ID,
  installed: true,
  versionName: '4.0.2',
  running: true,
  foreground: true,
};

/** One started mirror, plus the handles a test needs to drive it: the handlers
 * the service registered, and how many times it was stopped. */
type FakeSession = MirrorSession & {
  stops: number;
  handlers: MirrorHandlers;
  /** Every input the service forwarded, in order. */
  sent: MirrorInput[];
  /** Set to make the next `send` refuse, the way a dead control socket does. */
  sendFailure: Error | null;
};

type Gateway = MaestroGateway & {
  devices: Device[];
  failure: Error | null;
  listCalls: number;
  propertyCalls: string[];
  identityCalls: Array<{ deviceId: string; appId: string }>;
  mirrorCalls: string[];
  mirrorFailure: Error | null;
  sessions: FakeSession[];
};

function fakeGateway(devices: Device[] = [PHONE]): Gateway {
  const gateway: Gateway = {
    devices,
    failure: null,
    listCalls: 0,
    propertyCalls: [],
    identityCalls: [],
    mirrorCalls: [],
    mirrorFailure: null,
    sessions: [],
    listDevices: () => {
      gateway.listCalls += 1;
      return gateway.failure === null
        ? Promise.resolve(gateway.devices)
        : Promise.reject(gateway.failure);
    },
    deviceProperties: (deviceId) => {
      gateway.propertyCalls.push(deviceId);
      return Promise.resolve(PROPERTIES);
    },
    appIdentity: (deviceId, appId) => {
      gateway.identityCalls.push({ deviceId, appId });
      return Promise.resolve({ ...IDENTITY, appId });
    },
    startMirror: (deviceId, handlers) => {
      gateway.mirrorCalls.push(deviceId);
      if (gateway.mirrorFailure !== null) {
        return Promise.reject(gateway.mirrorFailure);
      }
      const session: FakeSession = {
        deviceName: 'SM-A075M',
        codec: 'h264',
        width: 464,
        height: 1024,
        control: true,
        stops: 0,
        handlers,
        sent: [],
        sendFailure: null,
        send: (input) => {
          if (session.sendFailure !== null) {
            return Promise.reject(session.sendFailure);
          }
          session.sent.push(input);
          return Promise.resolve();
        },
        stop: () => {
          session.stops += 1;
          return Promise.resolve();
        },
      };
      gateway.sessions.push(session);
      return Promise.resolve(session);
    },
  };
  return gateway;
}

function makeService(gateway: Gateway): {
  service: DeviceService;
  emitted: Array<Result<DeviceSnapshot>>;
  mirrored: Array<Result<MirrorEvent>>;
} {
  const emitted: Array<Result<DeviceSnapshot>> = [];
  const mirrored: Array<Result<MirrorEvent>> = [];
  const service = new DeviceService({
    gateway,
    appId: APP_ID,
    emit: (payload) => emitted.push(payload),
    emitMirror: (payload) => mirrored.push(payload),
  });
  return { service, emitted, mirrored };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('reading the current state', () => {
  it('reports every attached device, in whatever state adb gave it', async () => {
    const { service } = makeService(fakeGateway([PHONE, UNAUTHORIZED]));

    await expect(service.snapshot()).resolves.toMatchObject({
      ok: true,
      data: { devices: [PHONE, UNAUTHORIZED] },
    });
  });

  /** Criterion 6. */
  it('selects the one usable device automatically', async () => {
    const { service } = makeService(fakeGateway([PHONE]));

    await expect(service.snapshot()).resolves.toMatchObject({
      ok: true,
      data: { selectedId: PHONE.id },
    });
  });

  it('selects none when two devices are usable, so the person picks', async () => {
    const { service } = makeService(fakeGateway([PHONE, EMULATOR]));

    await expect(service.snapshot()).resolves.toMatchObject({
      ok: true,
      data: { selectedId: null },
    });
  });

  // An unauthorized phone is not usable, so it is not "the one device" — and
  // the panel has an RSA prompt to tell the person about instead.
  it('does not count an unauthorized device towards the selection', async () => {
    const { service } = makeService(fakeGateway([UNAUTHORIZED]));

    await expect(service.snapshot()).resolves.toMatchObject({
      ok: true,
      data: { selectedId: null, properties: null },
    });
  });

  it('selects the usable one when the other is offline', async () => {
    const { service } = makeService(fakeGateway([PHONE, { ...EMULATOR, state: 'offline' }]));

    await expect(service.snapshot()).resolves.toMatchObject({
      ok: true,
      data: { selectedId: PHONE.id },
    });
  });

  /** Criterion 7 — read for the selected device, and only for it. */
  it('reads the properties of the selected device', async () => {
    const gateway = fakeGateway([PHONE]);
    const { service } = makeService(gateway);

    await expect(service.snapshot()).resolves.toMatchObject({
      ok: true,
      data: { properties: PROPERTIES },
    });
    expect(gateway.propertyCalls).toEqual([PHONE.id]);
  });

  it('reads no properties when nothing is selected', async () => {
    const gateway = fakeGateway([PHONE, EMULATOR]);
    const { service } = makeService(gateway);

    await service.snapshot();

    expect(gateway.propertyCalls).toEqual([]);
  });

  /** Criterion 2 — a stable code, so the doctor can tell this from a failure. */
  it('reports adb-not-found as a failure Result rather than an empty list', async () => {
    const gateway = fakeGateway();
    gateway.failure = new AdbNotFoundError();
    const { service } = makeService(gateway);

    await expect(service.snapshot()).resolves.toEqual({
      ok: false,
      error: { code: 'device/adb-not-found', message: expect.any(String) },
    });
  });

  it('reports an adb that ran and refused under its own code', async () => {
    const gateway = fakeGateway();
    gateway.failure = new Error('adb: no permissions');
    const { service } = makeService(gateway);

    await expect(service.snapshot()).resolves.toMatchObject({
      ok: false,
      error: { code: 'device/adb-failed' },
    });
  });
});

describe('the app identity', () => {
  /** Criterion 8 — the service holds the one app id and callers cannot pick one. */
  it('identifies the app by the configured id', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);

    await expect(service.appInfo(PHONE.id)).resolves.toEqual({ ok: true, data: IDENTITY });
    expect(gateway.identityCalls).toEqual([{ deviceId: PHONE.id, appId: APP_ID }]);
  });

  it('reports a failing adb as a failure Result', async () => {
    const gateway = fakeGateway();
    gateway.appIdentity = () => Promise.reject(new AdbNotFoundError());
    const { service } = makeService(gateway);

    await expect(service.appInfo(PHONE.id)).resolves.toMatchObject({
      ok: false,
      error: { code: 'device/adb-not-found' },
    });
  });
});

describe('the poll loop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  /** Criterion 5 — the UI must not wait 2s for its first paint. */
  it('emits the current state as soon as it starts', async () => {
    const { service, emitted } = makeService(fakeGateway());

    service.start();
    await vi.advanceTimersByTimeAsync(0);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ ok: true, data: { selectedId: PHONE.id } });
    service.dispose();
  });

  it('re-enumerates every 2 seconds', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

    expect(POLL_INTERVAL_MS).toBe(2000);
    expect(gateway.listCalls).toBe(4);
    service.dispose();
  });

  /** Criterion 5 — a push per poll would re-render the panel at 0.5 Hz forever. */
  it('does not emit again while nothing has changed', async () => {
    const { service, emitted } = makeService(fakeGateway());

    service.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4);

    expect(emitted).toHaveLength(1);
    service.dispose();
  });

  it('emits when a device is plugged in', async () => {
    const gateway = fakeGateway([]);
    const { service, emitted } = makeService(gateway);

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    gateway.devices = [PHONE];
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(emitted).toHaveLength(2);
    expect(emitted[1]).toMatchObject({ ok: true, data: { selectedId: PHONE.id } });
    service.dispose();
  });

  it('emits when a device is unplugged', async () => {
    const gateway = fakeGateway([PHONE]);
    const { service, emitted } = makeService(gateway);

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    gateway.devices = [];
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(emitted[1]).toMatchObject({ ok: true, data: { devices: [], selectedId: null } });
    service.dispose();
  });

  // Accepting the RSA prompt changes only the state field, and it is the change
  // the person is waiting to see reflected.
  it('emits when a device changes state in place', async () => {
    const gateway = fakeGateway([UNAUTHORIZED]);
    const { service, emitted } = makeService(gateway);

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    gateway.devices = [{ ...UNAUTHORIZED, state: 'device' }];
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(emitted).toHaveLength(2);
    service.dispose();
  });

  it('emits a failure once rather than every 2 seconds', async () => {
    const gateway = fakeGateway();
    gateway.failure = new AdbNotFoundError();
    const { service, emitted } = makeService(gateway);

    service.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4);

    expect(emitted).toHaveLength(1);
    expect(emitted[0]).toMatchObject({ ok: false, error: { code: 'device/adb-not-found' } });
    service.dispose();
  });

  it('emits again when adb comes back', async () => {
    const gateway = fakeGateway();
    gateway.failure = new AdbNotFoundError();
    const { service, emitted } = makeService(gateway);

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    gateway.failure = null;
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(emitted).toHaveLength(2);
    expect(emitted[1]).toMatchObject({ ok: true });
    service.dispose();
  });

  // A slow adb must not stack polls on top of each other: the next one is
  // scheduled after the last one answered, so "at most every 2 seconds" holds
  // even when a call takes longer than the interval.
  it('waits for the previous enumeration before scheduling the next', async () => {
    const gateway = fakeGateway();
    const gate: { release: (() => void) | null } = { release: null };
    gateway.listDevices = () => {
      gateway.listCalls += 1;
      return new Promise<Device[]>((resolve) => {
        gate.release = () => resolve([PHONE]);
      });
    };
    const { service } = makeService(gateway);

    service.start();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 3);

    expect(gateway.listCalls).toBe(1);

    gate.release?.();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    expect(gateway.listCalls).toBe(2);
    service.dispose();
  });

  /** No orphaned timer survives `before-quit`. */
  it('stops polling once disposed', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);

    service.start();
    await vi.advanceTimersByTimeAsync(0);
    const calls = gateway.listCalls;
    service.dispose();
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 5);

    expect(gateway.listCalls).toBe(calls);
  });

  it('emits nothing after being disposed mid-enumeration', async () => {
    const gateway = fakeGateway();
    const gate: { release: ((devices: Device[]) => void) | null } = { release: null };
    gateway.listDevices = () =>
      new Promise<Device[]>((resolve) => {
        gate.release = resolve;
      });
    const { service, emitted } = makeService(gateway);

    service.start();
    service.dispose();
    gate.release?.([PHONE]);
    await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);

    expect(emitted).toEqual([]);
  });

  it('survives being disposed twice', () => {
    const { service } = makeService(fakeGateway());

    service.start();
    service.dispose();

    expect(() => {
      service.dispose();
    }).not.toThrow();
  });
});

/**
 * The mirror half. Main owns the sessions because main is what has to be able to
 * end them — on a stop, on a renderer reload, and on quit. The spike left an
 * `app_process` alive on the device that survived `pkill` and needed `kill -9`
 * by pid, so "nothing survives" is written against a failure that was observed.
 */
describe('mirroring a device', () => {
  const PACKET = {
    config: false,
    keyFrame: true,
    pts: 652021984203,
    payload: new Uint8Array([0, 0, 0, 1, 0x65, 0x88]),
  };

  /** Criterion 28 — the session and the stream's own size, immediately. */
  it('answers with the session and the stream the device opened', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);

    const result = await service.startMirror(PHONE.id);

    expect(gateway.mirrorCalls).toEqual([PHONE.id]);
    expect(result).toEqual({
      ok: true,
      data: { sessionId: 'mirror-1', codec: 'h264', width: 464, height: 1024, control: true },
    });
  });

  /** Criterion 4 — a picture with no control is a session, not a failure. */
  it('passes on that a session could not be driven, without failing the start', async () => {
    const gateway = fakeGateway();
    const start = gateway.startMirror.bind(gateway);
    gateway.startMirror = async (deviceId, handlers) => ({
      ...(await start(deviceId, handlers)),
      control: false,
    });
    const { service } = makeService(gateway);

    const result = await service.startMirror(PHONE.id);

    expect(result).toMatchObject({ ok: true, data: { control: false } });
  });

  it('gives each session an id of its own', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);

    const first = await service.startMirror(PHONE.id);
    const second = await service.startMirror(PHONE.id);

    expect(first).toMatchObject({ ok: true, data: { sessionId: 'mirror-1' } });
    expect(second).toMatchObject({ ok: true, data: { sessionId: 'mirror-2' } });
  });

  /** Criterion 29 — frames are bytes on a push channel, never a return value
   * and never a path. */
  it('pushes every packet as a frame event tagged with its session', async () => {
    const gateway = fakeGateway();
    const { service, mirrored } = makeService(gateway);
    await service.startMirror(PHONE.id);

    gateway.sessions[0]?.handlers.onPacket(PACKET);

    expect(mirrored).toEqual([
      {
        ok: true,
        data: {
          type: 'frame',
          sessionId: 'mirror-1',
          config: false,
          keyFrame: true,
          pts: 652021984203,
          data: PACKET.payload,
        },
      },
    ]);
  });

  it('never blocks the start on a frame', async () => {
    const gateway = fakeGateway();
    const { service, mirrored } = makeService(gateway);

    await service.startMirror(PHONE.id);

    expect(mirrored).toEqual([]);
  });

  /**
   * The codec header and the first packets can share one TCP chunk, so the
   * stream may deliver packets *while* the start is still settling — before the
   * service has the session in its map. Dropping those loses the config packet,
   * and a decoder that never sees one shows black for the whole session.
   */
  it('holds packets that arrive while the start is settling, then pushes them in order', async () => {
    const gateway = fakeGateway();
    const start = gateway.startMirror.bind(gateway);
    gateway.startMirror = (deviceId, handlers) => {
      // Same tick as the handshake, exactly as one coalesced chunk plays out.
      handlers.onPacket({ ...PACKET, config: true, keyFrame: false });
      return start(deviceId, handlers);
    };
    const { service, mirrored } = makeService(gateway);

    await service.startMirror(PHONE.id);
    gateway.sessions[0]?.handlers.onPacket(PACKET);

    expect(
      mirrored.map((event) => (event.ok && event.data.type === 'frame' ? event.data.config : null)),
    ).toEqual([true, false]);
  });

  /** Criterion 25 — the phone went away, and the panel has to be told which
   * session died and why. */
  it('pushes a terminal event when a session ends on its own', async () => {
    const gateway = fakeGateway();
    const { service, mirrored } = makeService(gateway);
    await service.startMirror(PHONE.id);

    gateway.sessions[0]?.handlers.onEnded({
      code: ERROR_CODES.mirrorDeviceLost,
      message: 'The device closed the mirror stream.',
    });

    expect(mirrored).toEqual([
      {
        ok: true,
        data: {
          type: 'ended',
          sessionId: 'mirror-1',
          code: ERROR_CODES.mirrorDeviceLost,
          message: 'The device closed the mirror stream.',
        },
      },
    ]);
  });

  it('forgets a session that ended on its own', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);
    gateway.sessions[0]?.handlers.onEnded({ code: ERROR_CODES.mirrorDeviceLost, message: 'gone' });

    const stopped = await service.stopMirror('mirror-1');

    expect(stopped).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.mirrorSessionNotFound },
    });
  });

  /** Criterion 31 — a start that failed is a value with the thrower's code, not
   * an exception across the boundary. */
  it('reports a start that failed with the code it was given', async () => {
    const gateway = fakeGateway();
    gateway.mirrorFailure = Object.assign(new Error('adb push refused'), {
      code: ERROR_CODES.mirrorStartFailed,
    });
    const { service } = makeService(gateway);

    expect(await service.startMirror(PHONE.id)).toEqual({
      ok: false,
      error: { code: ERROR_CODES.mirrorStartFailed, message: 'adb push refused' },
    });
  });

  it('falls back to the mirror’s own code when the thrower had none', async () => {
    const gateway = fakeGateway();
    gateway.mirrorFailure = new Error('something went sideways');
    const { service } = makeService(gateway);

    expect(await service.startMirror(PHONE.id)).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.mirrorStartFailed },
    });
  });

  it('reports a missing adb under its own code, so the panel names the right fix', async () => {
    const gateway = fakeGateway();
    gateway.mirrorFailure = new AdbNotFoundError();
    const { service } = makeService(gateway);

    expect(await service.startMirror(PHONE.id)).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.adbNotFound },
    });
  });
});

/**
 * The outbound half. The service forwards and nothing more — the encoding is the
 * protocol module's and the socket is the session's, so what is worth pinning
 * here is *which* session an input reaches and what happens when it cannot.
 */
describe('sending input at a mirror', () => {
  const TAP = { type: 'tap', x: 232, y: 534, screenWidth: 464, screenHeight: 1024 } as const;
  const PACKET = {
    config: false,
    keyFrame: true,
    pts: 652021984203,
    payload: new Uint8Array([0, 0, 0, 1, 0x65, 0x88]),
  };

  it('forwards the input to the session the renderer named', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);

    const result = await service.sendInput('mirror-1', TAP);

    expect(result).toEqual({ ok: true, data: { sessionId: 'mirror-1' } });
    expect(gateway.sessions[0]?.sent).toEqual([TAP]);
  });

  /**
   * A tap aimed at a session that has already been replaced must not land on
   * whatever is streaming now — the coordinates were read off a different
   * picture, and on a rotated phone they point somewhere else entirely.
   */
  it('refuses an input aimed at a session that is already gone', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);
    await service.stopMirror('mirror-1');

    expect(await service.sendInput('mirror-1', TAP)).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.mirrorSessionNotFound },
    });
  });

  it('reaches only the session named, when a second one has replaced it', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);
    await service.startMirror(PHONE.id);

    expect(await service.sendInput('mirror-1', TAP)).toMatchObject({ ok: false });
    expect(await service.sendInput('mirror-2', TAP)).toMatchObject({ ok: true });
    expect(gateway.sessions[0]?.sent).toEqual([]);
    expect(gateway.sessions[1]?.sent).toEqual([TAP]);
  });

  /** Criterion 16 — a control failure keeps its own code all the way up. */
  it('passes a control failure up with the code the session gave it', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);
    const failure = Object.assign(new Error('the control socket is gone'), {
      code: ERROR_CODES.mirrorControlFailed,
    });
    (gateway.sessions[0] as { sendFailure: Error | null }).sendFailure = failure;

    expect(await service.sendInput('mirror-1', TAP)).toEqual({
      ok: false,
      error: {
        code: ERROR_CODES.mirrorControlFailed,
        message: 'the control socket is gone',
      },
    });
  });

  /** Criterion 4 — the picture is untouched by any of this. */
  it('leaves the session running after an input it could not send', async () => {
    const gateway = fakeGateway();
    const { service, mirrored } = makeService(gateway);
    await service.startMirror(PHONE.id);
    (gateway.sessions[0] as { sendFailure: Error | null }).sendFailure = new Error('broken pipe');

    await service.sendInput('mirror-1', TAP);
    gateway.sessions[0]?.handlers.onPacket(PACKET);

    expect(gateway.sessions[0]?.stops).toBe(0);
    expect(mirrored.at(-1)).toMatchObject({ ok: true, data: { type: 'frame' } });
  });

  it('falls back to the control code when the thrower named none', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);
    (gateway.sessions[0] as { sendFailure: Error | null }).sendFailure = new Error('sideways');

    expect(await service.sendInput('mirror-1', TAP)).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.mirrorControlFailed },
    });
  });
});

/** Criterion 22 — a stop leaves nothing behind, and criteria 23–24 say who else
 * may order one. */
describe('ending mirror sessions', () => {
  it('stops the session the renderer named', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);

    const result = await service.stopMirror('mirror-1');

    expect(result).toEqual({ ok: true, data: { sessionId: 'mirror-1' } });
    expect(gateway.sessions[0]?.stops).toBe(1);
  });

  it('reports a stop naming a session that is not there', async () => {
    const { service } = makeService(fakeGateway());

    expect(await service.stopMirror('mirror-9')).toMatchObject({
      ok: false,
      error: { code: ERROR_CODES.mirrorSessionNotFound },
    });
  });

  it('pushes nothing more once a session has been stopped', async () => {
    const gateway = fakeGateway();
    const { service, mirrored } = makeService(gateway);
    await service.startMirror(PHONE.id);
    await service.stopMirror('mirror-1');

    gateway.sessions[0]?.handlers.onPacket({
      config: false,
      keyFrame: false,
      pts: 1,
      payload: new Uint8Array([1]),
    });

    expect(mirrored).toEqual([]);
  });

  /**
   * One session, one device, one cable. Starting a second without ending the
   * first is exactly how the orphaned `app_process` happens.
   */
  it('ends the session already running when a new one starts', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);

    await service.startMirror(EMULATOR.id);

    expect(gateway.sessions[0]?.stops).toBe(1);
    expect(gateway.sessions[1]?.stops).toBe(0);
  });

  /** Criterion 24 — a renderer that reloaded is not coming back for its session,
   * and nothing should wait for `before-quit` to notice. */
  it('stops every session on demand, without being disposed', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);

    await service.stopMirrors();

    expect(gateway.sessions[0]?.stops).toBe(1);
    expect(await service.startMirror(PHONE.id)).toMatchObject({ ok: true });
  });

  /** Criterion 23 — `before-quit` leaves no server alive on the device. */
  it('stops every session on dispose', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);
    await service.startMirror(EMULATOR.id);

    await service.dispose();

    expect(gateway.sessions.map((session) => session.stops)).toEqual([1, 1]);
  });

  it('starts nothing once disposed', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);

    await service.dispose();

    expect(await service.startMirror(PHONE.id)).toMatchObject({ ok: false });
    expect(gateway.mirrorCalls).toEqual([]);
  });

  it('survives a session whose stop refused, and stops the rest anyway', async () => {
    const gateway = fakeGateway();
    const { service } = makeService(gateway);
    await service.startMirror(PHONE.id);
    await service.startMirror(EMULATOR.id);
    const first = gateway.sessions[0];
    if (first !== undefined) {
      first.stop = () => Promise.reject(new Error('adb vanished'));
    }

    await expect(service.dispose()).resolves.toBeUndefined();
    expect(gateway.sessions[1]?.stops).toBe(1);
  });
});

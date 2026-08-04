import type { AppIdentity, Device, DeviceProperties, DeviceSnapshot, Result } from '@shared/ipc';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdbNotFoundError } from '../maestro/AdbBridge';
import type { MaestroGateway } from '../maestro/MaestroGateway';
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

type Gateway = MaestroGateway & {
  devices: Device[];
  failure: Error | null;
  listCalls: number;
  propertyCalls: string[];
  identityCalls: Array<{ deviceId: string; appId: string }>;
};

function fakeGateway(devices: Device[] = [PHONE]): Gateway {
  const gateway: Gateway = {
    devices,
    failure: null,
    listCalls: 0,
    propertyCalls: [],
    identityCalls: [],
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
  };
  return gateway;
}

function makeService(gateway: Gateway): {
  service: DeviceService;
  emitted: Array<Result<DeviceSnapshot>>;
} {
  const emitted: Array<Result<DeviceSnapshot>> = [];
  const service = new DeviceService({
    gateway,
    appId: APP_ID,
    emit: (payload) => emitted.push(payload),
  });
  return { service, emitted };
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

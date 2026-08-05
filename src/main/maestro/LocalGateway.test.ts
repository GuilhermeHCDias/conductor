import { describe, expect, it } from 'vitest';
import type { AdbBridge } from './AdbBridge';
import { LocalGateway } from './LocalGateway';
import type { MirrorHandlers, MirrorSession } from './MaestroGateway';
import type { ScrcpySource } from './ScrcpySource';

/**
 * Delegation, and the seam that matters: every device capability arrives through
 * this one class, so the day execution moves to a remote runner there is exactly
 * one implementation to write beside it (.context.md §10.1).
 *
 * Both collaborators are fakes. What is asserted is that the Gateway routes and
 * adds nothing — a Gateway that started parsing would be the leak §10.1 exists
 * to prevent.
 */

const SESSION: MirrorSession = {
  deviceName: 'SM-A075M',
  codec: 'h264',
  width: 464,
  height: 1024,
  control: true,
  send: () => Promise.resolve(),
  stop: () => Promise.resolve(),
};

const HANDLERS: MirrorHandlers = { onPacket: () => {}, onEnded: () => {} };

function gateway(): {
  gateway: LocalGateway;
  calls: Array<{ method: string; args: readonly unknown[] }>;
} {
  const calls: Array<{ method: string; args: readonly unknown[] }> = [];
  const record =
    (method: string, result: unknown) =>
    (...args: readonly unknown[]): Promise<unknown> => {
      calls.push({ method, args });
      return Promise.resolve(result);
    };

  const adb = {
    listDevices: record('listDevices', []),
    properties: record('properties', { model: null, release: null, size: null, density: null }),
    appIdentity: record('appIdentity', {
      appId: 'com.vtex.pnp',
      installed: false,
      versionName: null,
      running: false,
      foreground: false,
    }),
  } as unknown as AdbBridge;

  const scrcpy = { start: record('start', SESSION) } as unknown as ScrcpySource;

  return { gateway: new LocalGateway(adb, scrcpy), calls };
}

describe('the local gateway', () => {
  it('reads the device list through the bridge', async () => {
    const { gateway: local, calls } = gateway();

    await local.listDevices();

    expect(calls).toEqual([{ method: 'listDevices', args: [] }]);
  });

  it('reads a device’s properties through the bridge', async () => {
    const { gateway: local, calls } = gateway();

    await local.deviceProperties('R9QYC01EMXL');

    expect(calls).toEqual([{ method: 'properties', args: ['R9QYC01EMXL'] }]);
  });

  it('reads the app under test through the bridge', async () => {
    const { gateway: local, calls } = gateway();

    await local.appIdentity('R9QYC01EMXL', 'com.vtex.pnp');

    expect(calls).toEqual([{ method: 'appIdentity', args: ['R9QYC01EMXL', 'com.vtex.pnp'] }]);
  });

  /**
   * The mirror is a Gateway capability rather than a service of its own because
   * `RemoteGateway` will have to serve it too: "where the device lives" is the
   * Gateway's secret, and a `MirrorService` calling adb would be leak #1 in
   * §10.1's table on day one.
   */
  it('opens a mirror through the scrcpy source', async () => {
    const { gateway: local, calls } = gateway();

    const session = await local.startMirror('R9QYC01EMXL', HANDLERS);

    expect(calls).toEqual([{ method: 'start', args: ['R9QYC01EMXL', HANDLERS] }]);
    expect(session).toBe(SESSION);
  });
});

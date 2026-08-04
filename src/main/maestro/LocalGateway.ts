import type { AppIdentity, Device, DeviceProperties } from '@shared/ipc';
import type { AdbBridge } from './AdbBridge';
import type { MaestroGateway, MirrorHandlers, MirrorSession } from './MaestroGateway';
import type { ScrcpySource } from './ScrcpySource';

/**
 * The Gateway against the machine the app is running on. Every device
 * capability in this spec is an `adb` call, so this is delegation and nothing
 * else — the parsing, the wire and the traps live in `AdbBridge` and
 * `ScrcpySource`.
 */
export class LocalGateway implements MaestroGateway {
  private readonly adb: AdbBridge;
  private readonly scrcpy: ScrcpySource;

  constructor(adb: AdbBridge, scrcpy: ScrcpySource) {
    this.adb = adb;
    this.scrcpy = scrcpy;
  }

  listDevices(): Promise<Device[]> {
    return this.adb.listDevices();
  }

  deviceProperties(deviceId: string): Promise<DeviceProperties> {
    return this.adb.properties(deviceId);
  }

  appIdentity(deviceId: string, appId: string): Promise<AppIdentity> {
    return this.adb.appIdentity(deviceId, appId);
  }

  startMirror(deviceId: string, handlers: MirrorHandlers): Promise<MirrorSession> {
    return this.scrcpy.start(deviceId, handlers);
  }
}

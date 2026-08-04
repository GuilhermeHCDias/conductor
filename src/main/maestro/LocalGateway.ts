import type { AppIdentity, Device, DeviceProperties } from '@shared/ipc';
import type { AdbBridge } from './AdbBridge';
import type { MaestroGateway } from './MaestroGateway';

/**
 * The Gateway against the machine the app is running on. Every device
 * capability in this spec is an `adb` call, so this is delegation and nothing
 * else — the parsing, and the traps, live in `AdbBridge`.
 */
export class LocalGateway implements MaestroGateway {
  private readonly adb: AdbBridge;

  constructor(adb: AdbBridge) {
    this.adb = adb;
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
}

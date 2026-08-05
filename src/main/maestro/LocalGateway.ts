import type { AppIdentity, Device, DeviceProperties } from '@shared/ipc';
import type { TreeNode } from '@shared/types';
import type { MaestroMcpService } from '../services/maestro-mcp.service';
import type { AdbBridge } from './AdbBridge';
import { parseHierarchy } from './HierarchyParser';
import type { MaestroGateway, MirrorHandlers, MirrorSession } from './MaestroGateway';
import type { ScrcpySource } from './ScrcpySource';
import type { ScreenCapture } from './ScreenCapture';

/**
 * The Gateway against the machine the app is running on. Delegation and nothing
 * else — the parsing, the wire and the traps live in `AdbBridge`,
 * `ScrcpySource`, `ScreenCapture`, `MaestroMcpService` and `HierarchyParser`.
 */
export class LocalGateway implements MaestroGateway {
  private readonly adb: AdbBridge;
  private readonly scrcpy: ScrcpySource;
  private readonly mcp: MaestroMcpService;
  private readonly capture: ScreenCapture;

  constructor(
    adb: AdbBridge,
    scrcpy: ScrcpySource,
    mcp: MaestroMcpService,
    capture: ScreenCapture,
  ) {
    this.adb = adb;
    this.scrcpy = scrcpy;
    this.mcp = mcp;
    this.capture = capture;
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

  /**
   * The one capability here that composes two collaborators, and §9.2 is why:
   * `HierarchyParser` is drawn beside the gateways rather than under this one,
   * because a `RemoteGateway` will fetch the same tree over a different wire and
   * read it with the same pure parser. The session fetches; the parser reads.
   */
  async hierarchy(deviceId: string): Promise<TreeNode> {
    return parseHierarchy(await this.mcp.inspectScreen(deviceId));
  }

  screenshot(deviceId: string): Promise<Buffer> {
    return this.capture.capture(deviceId);
  }
}

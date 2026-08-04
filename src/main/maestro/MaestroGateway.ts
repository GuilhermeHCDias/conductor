import type { AppIdentity, Device, DeviceProperties } from '@shared/ipc';

/**
 * The one door to everything Conductor knows about a device (.context.md
 * §4.3.7). Services depend on this interface, never on the implementation, so
 * the day execution moves to a remote runner there is one seam to replace
 * (§10.1).
 *
 * Device capabilities only, for now. `hierarchy`, `screenshot`, `runFlow` and
 * `checkSyntax` are named in §4.3.7 and arrive with the specs that need them;
 * declaring them here before anything can implement them would be a contract
 * nobody honours.
 *
 * The lone exception on the other side of this door is `maestro mcp`, which is
 * not a Gateway concern: the AI layer's child belongs to Claude Code, and the
 * Viewer's belongs to `ViewerService`.
 */
export interface MaestroGateway {
  /** Every attached device, in whatever state adb reports it. */
  listDevices(): Promise<Device[]>;
  /** What the device says about itself. Anything unreadable comes back `null`. */
  deviceProperties(deviceId: string): Promise<DeviceProperties>;
  /** The app under test on that device, identified by `appId` alone. */
  appIdentity(deviceId: string, appId: string): Promise<AppIdentity>;
}

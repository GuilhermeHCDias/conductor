import type { AppIdentity, Device, DeviceProperties, ErrorCode } from '@shared/ipc';
import type { TreeNode } from '@shared/types';

/**
 * One encoded frame, as it came off whatever wire the Gateway is speaking. The
 * payload is bytes, never a path (§10.1 rule 2) — the device may not share a
 * filesystem with us, and one day will not share a machine either.
 */
export type MirrorPacket = {
  /** Carries SPS and PPS. It configures the decoder and is never drawn. */
  readonly config: boolean;
  readonly keyFrame: boolean;
  /** Microseconds. */
  readonly pts: number;
  readonly payload: Uint8Array;
};

/** Why a session ended. The stable `code` is what the panel names an action from. */
export type MirrorFailure = {
  readonly code: ErrorCode;
  readonly message: string;
};

export type MirrorHandlers = {
  readonly onPacket: (packet: MirrorPacket) => void;
  /** Fires at most once, and never for a session that was stopped on purpose. */
  readonly onEnded: (failure: MirrorFailure) => void;
};

/** What a started mirror is, from above the Gateway: a size, a codec, and a way
 * to stop. Nothing here says the device is local. */
export type MirrorSession = {
  readonly deviceName: string;
  /** As the stream declared it — `h264`. */
  readonly codec: string;
  readonly width: number;
  readonly height: number;
  /** Idempotent, and leaves nothing behind on either side. */
  stop: () => Promise<void>;
};

/**
 * The one door to everything Conductor knows about a device (.context.md
 * §4.3.7). Services depend on this interface, never on the implementation, so
 * the day execution moves to a remote runner there is one seam to replace
 * (§10.1).
 *
 * Reading the device, for now. `runFlow`, `checkSyntax` and `startDevice` are
 * named in §4.3.7 and arrive with the specs that need them; declaring them here
 * before anything can implement them would be a contract nobody honours.
 *
 * The lone exception on the other side of this door is the AI layer's `maestro
 * mcp`, which is not a Gateway concern: that child belongs to Claude Code
 * (§4.3.7). Ours is `MaestroMcpService`, and it is behind this door — a
 * `RemoteGateway` will answer `hierarchy` from somewhere else entirely.
 */
export interface MaestroGateway {
  /** Every attached device, in whatever state adb reports it. */
  listDevices(): Promise<Device[]>;
  /** What the device says about itself. Anything unreadable comes back `null`. */
  deviceProperties(deviceId: string): Promise<DeviceProperties>;
  /** The app under test on that device, identified by `appId` alone. */
  appIdentity(deviceId: string, appId: string): Promise<AppIdentity>;
  /**
   * What is on the screen: every element Maestro can see, as one tree.
   *
   * ⚠️ It must be *Maestro's* view of the screen and no other, because the
   * selectors written from it are executed by Maestro. Inspecting by any other
   * path produces selectors that look right in Conductor and fail in `maestro
   * test`, which §5.1 names as the worst failure mode this product has.
   */
  hierarchy(deviceId: string): Promise<TreeNode>;
  /**
   * One still frame, as bytes (§10.1 rule 2) — never a path, because the device
   * may share no filesystem with us today and no machine at all tomorrow.
   *
   * ⚠️ It never goes through Maestro (§10.1 rule 13, §4.4b). The picture is on
   * the critical path of the core loop and costs 100–300ms through the OS
   * against seconds through anything that starts a JVM.
   */
  screenshot(deviceId: string): Promise<Buffer>;
  /**
   * Opens a live picture of the device. Resolves as soon as the stream declares
   * its size — the frames themselves arrive on `handlers.onPacket`, because a
   * call that awaited them would block for the length of the session.
   *
   * The mirror is a Gateway capability rather than its own service because
   * `RemoteGateway` will have to serve it too. §9.2 already puts `ScreenCapture`
   * here for the same reason: where the device lives is the Gateway's secret,
   * and a standalone service calling adb would be leak #1 in §10.1's table.
   */
  startMirror(deviceId: string, handlers: MirrorHandlers): Promise<MirrorSession>;
}

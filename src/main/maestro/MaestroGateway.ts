import type { AppIdentity, Device, DeviceProperties, ErrorCode } from '@shared/ipc';

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

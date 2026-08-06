import type { AppIdentity, Device, DeviceProperties, ErrorCode, MirrorInput } from '@shared/ipc';
import type { TreeNode } from '@shared/types';
import type { ExitReason } from '../process/run';

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

/** What a started mirror is, from above the Gateway: a size, a codec, a way to
 * drive it and a way to stop. Nothing here says the device is local. */
export type MirrorSession = {
  readonly deviceName: string;
  /** As the stream declared it — `h264`. */
  readonly codec: string;
  readonly width: number;
  readonly height: number;
  /**
   * Criterion 4. Whether this session can be driven as well as watched. False
   * means the picture is real and `send` will refuse — the mirror is not ended
   * over a capability the person may not need every time.
   */
  readonly control: boolean;
  /**
   * Criterion 5. Sends one input at the device. It takes the typed input rather
   * than bytes so the wire stays the Gateway's secret: a remote runner will
   * encode on the far side, and nothing above here should have to change.
   *
   * Rejects with `mirror/control-failed` when there is no control channel, when
   * the session is over, or when the input cannot be carried — never with a code
   * that would read as the picture dying.
   */
  send: (input: MirrorInput) => Promise<void>;
  /** Idempotent, and leaves nothing behind on either side. */
  stop: () => Promise<void>;
};

/**
 * One piece of run progress, typed — never a raw chunk, so a `RemoteGateway`
 * can serve the same events off a different wire. The step events are
 * best-effort decoration parsed from the CLI's output (criterion 8); the log
 * lines are that output verbatim, batched per chunk; the run's *outcome* is
 * neither — it derives from the exit reason alone (criterion 7).
 */
export type RunProgress =
  | { readonly type: 'step-started'; readonly label: string }
  | { readonly type: 'step-passed'; readonly label: string }
  | { readonly type: 'step-failed'; readonly label: string }
  | { readonly type: 'log'; readonly lines: readonly string[] };

export type RunFlowHandlers = {
  readonly onProgress: (progress: RunProgress) => void;
  /** Fires exactly once, after every piece of progress — the streams are
   * flushed first, so nothing arrives after the run is declared over. */
  readonly onExit: (reason: ExitReason) => void;
};

/** A started run, from above the Gateway: something to kill, and nothing
 * else. What the kill means to the process tree is `spawnStreaming`'s. */
export type FlowRun = {
  readonly kill: () => void;
};

/**
 * The one door to everything Conductor knows about a device (.context.md
 * §4.3.7). Services depend on this interface, never on the implementation, so
 * the day execution moves to a remote runner there is one seam to replace
 * (§10.1).
 *
 * Reading the device — and now running on it. `checkSyntax` and `startDevice`
 * are named in §4.3.7 and arrive with the specs that need them; declaring them
 * here before anything can implement them would be a contract nobody honours.
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
  /**
   * Executes one flow file on the device and streams what happens. Returns the
   * moment the child is spawned — progress arrives on the handlers, because a
   * call that awaited a run would hold its caller for the length of the JVM
   * (§4.3.7, AGENTS.md "long work is streamed").
   *
   * ⚠️ §4.3.2: a run and the `maestro mcp` session contend for the on-device
   * driver, and the failure is silently incomplete data. The Gateway does not
   * police that — it cannot see the snapshot path from here — so the caller
   * holds the exclusion: `RunService` suspends captures before calling this.
   */
  runFlow(deviceId: string, flowPath: string, handlers: RunFlowHandlers): FlowRun;
}

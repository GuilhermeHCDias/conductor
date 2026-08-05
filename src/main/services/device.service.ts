import type { AppIdentity, ErrorCode, MirrorEvent, MirrorInput, MirrorStream } from '@shared/ipc';
import { type Device, type DeviceSnapshot, ERROR_CODES, type Result } from '@shared/ipc';
import type { MaestroGateway, MirrorPacket, MirrorSession } from '../maestro/MaestroGateway';

/**
 * What is plugged in, which one we are talking to, and what the app under test
 * is doing on it. Main owns this truth; the renderer's store is a projection of
 * what this service pushes.
 *
 * It depends on the `MaestroGateway` interface and never on `LocalGateway`, so
 * a test drives the whole loop — selection, change detection, failure codes —
 * with a fake and no adb anywhere.
 */

/** Criterion 5. Fast enough that plugging a phone in feels immediate, slow
 * enough that a `adb devices` every tick costs nothing. */
export const POLL_INTERVAL_MS = 2000;

export type DeviceServiceDeps = {
  readonly gateway: MaestroGateway;
  /** `CONFIG.APP_ID`. The one app this service will ever ask about (§12.6). */
  readonly appId: string;
  /** Pushes a snapshot at the renderer. Called only when something changed. */
  readonly emit: (payload: Result<DeviceSnapshot>) => void;
  /** Pushes one mirror event. Frames come through here ~30 times a second, so
   * it is deliberately the cheapest thing in this file. */
  readonly emitMirror: (payload: Result<MirrorEvent>) => void;
  readonly intervalMs?: number;
};

export class DeviceService {
  private readonly deps: DeviceServiceDeps;
  private readonly intervalMs: number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;
  /** The last payload pushed, serialised — the cheapest honest way to answer
   * "is this different from what the renderer already has?". */
  private lastEmitted: string | null = null;
  /** Live mirror sessions, by the id the renderer holds. */
  private readonly sessions = new Map<string, MirrorSession>();
  /** Monotonic, so a session id is never reused within a run. */
  private nextSession = 1;

  constructor(deps: DeviceServiceDeps) {
    this.deps = deps;
    this.intervalMs = deps.intervalMs ?? POLL_INTERVAL_MS;
  }

  /** Begins the loop with an immediate read: a panel that waits a full interval
   * before its first paint reads as broken. */
  start(): void {
    void this.poll();
  }

  /** The whole device half, as one value. Used by `device:list` and by the loop. */
  async snapshot(): Promise<Result<DeviceSnapshot>> {
    try {
      const devices = await this.deps.gateway.listDevices();
      const selectedId = autoSelect(devices);
      const properties =
        selectedId === null ? null : await this.deps.gateway.deviceProperties(selectedId);

      return { ok: true, data: { devices, selectedId, properties } };
    } catch (error) {
      return failure(error);
    }
  }

  async appInfo(deviceId: string): Promise<Result<AppIdentity>> {
    try {
      return { ok: true, data: await this.deps.gateway.appIdentity(deviceId, this.deps.appId) };
    } catch (error) {
      return failure(error);
    }
  }

  /**
   * Opens a mirror and answers immediately with what the stream declared. The
   * frames arrive as pushes: a handler that awaited them would hold main for the
   * length of the session (AGENTS.md § Architecture).
   *
   * One session at a time, one device, one cable — so a start ends whatever was
   * already running. Skipping that is exactly how the orphaned `app_process` the
   * spike left behind happens.
   */
  async startMirror(deviceId: string): Promise<Result<MirrorStream>> {
    if (this.disposed) {
      return mirrorFailure(ERROR_CODES.mirrorStartFailed, 'Conductor is shutting down.');
    }
    await this.stopMirrors();

    const sessionId = `mirror-${this.nextSession}`;
    this.nextSession += 1;

    // The codec header and the first packets can share one TCP chunk, so the
    // stream may deliver packets while the `await` below is still settling —
    // before the session is in the map. Those are the config packet and the
    // first key frame: dropped, the decoder never configures and the mirror
    // stays black for the whole session. Held here, they go out the moment the
    // session is registered, in order.
    let registered = false;
    const backlog: MirrorPacket[] = [];
    const emitFrame = (packet: MirrorPacket): void => {
      this.deps.emitMirror({
        ok: true,
        data: {
          type: 'frame',
          sessionId,
          config: packet.config,
          keyFrame: packet.keyFrame,
          pts: packet.pts,
          data: packet.payload,
        },
      });
    };

    try {
      const session = await this.deps.gateway.startMirror(deviceId, {
        onPacket: (packet) => {
          if (!registered) {
            backlog.push(packet);
            return;
          }
          // A packet from a session already put away belongs to nobody: the
          // renderer has stopped listening for it and the id would be stale.
          if (this.sessions.get(sessionId) === undefined) {
            return;
          }
          emitFrame(packet);
        },
        onEnded: (ended) => {
          this.sessions.delete(sessionId);
          this.deps.emitMirror({
            ok: true,
            data: { type: 'ended', sessionId, code: ended.code, message: ended.message },
          });
        },
      });

      this.sessions.set(sessionId, session);
      registered = true;
      for (const packet of backlog) {
        emitFrame(packet);
      }
      backlog.length = 0;
      return {
        ok: true,
        data: {
          sessionId,
          codec: session.codec,
          width: session.width,
          height: session.height,
          // Criterion 4: a picture the person cannot drive is still a picture,
          // so this travels as a fact about the session rather than as a failure.
          control: session.control,
        },
      };
    } catch (error) {
      return failure(error, ERROR_CODES.mirrorStartFailed);
    }
  }

  /**
   * Criterion 5. Forwarding, and nothing else: the encoding belongs to the
   * protocol module and the socket to the session, so all this layer decides is
   * *which* session an input is for.
   *
   * Naming it matters. A tap carries coordinates read off one particular
   * picture, and on a device that has since rotated — or under a session that
   * has since been replaced — those coordinates point somewhere else entirely.
   */
  async sendInput(sessionId: string, input: MirrorInput): Promise<Result<{ sessionId: string }>> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return mirrorFailure(
        ERROR_CODES.mirrorSessionNotFound,
        `There is no mirror session ${sessionId}.`,
      );
    }

    try {
      await session.send(input);
      return { ok: true, data: { sessionId } };
    } catch (error) {
      // Criterion 4: the session stays in the map. Control failing says nothing
      // about the picture, and putting the session away over it would take the
      // phone off the screen for a tap that missed.
      return failure(error, ERROR_CODES.mirrorControlFailed);
    }
  }

  /** Criterion 22. Naming a session that is already gone is a condition with its
   * own code, not a bug — a stop can always race a disconnect. */
  async stopMirror(sessionId: string): Promise<Result<{ sessionId: string }>> {
    const session = this.sessions.get(sessionId);
    if (session === undefined) {
      return mirrorFailure(
        ERROR_CODES.mirrorSessionNotFound,
        `There is no mirror session ${sessionId}.`,
      );
    }

    this.sessions.delete(sessionId);
    await session.stop();
    return { ok: true, data: { sessionId } };
  }

  /**
   * Criterion 24. A renderer that reloaded or closed is not coming back for its
   * sessions, and waiting for `before-quit` to notice would leave a server
   * running on the device for the rest of the app's life.
   *
   * Settled rather than awaited in sequence: one session whose stop refuses must
   * not keep the others alive.
   */
  async stopMirrors(): Promise<void> {
    const running = [...this.sessions.values()];
    this.sessions.clear();
    await Promise.allSettled(running.map((session) => session.stop()));
  }

  /** Criterion 23 — nothing survives the quit. */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    await this.stopMirrors();
  }

  /**
   * One enumeration, then the next one scheduled — a chain rather than an
   * interval, so an adb that takes longer than the interval never has a second
   * poll stacked on top of it.
   */
  private async poll(): Promise<void> {
    if (this.disposed) {
      return;
    }

    const result = await this.snapshot();
    if (this.disposed) {
      return;
    }

    const serialised = JSON.stringify(result);
    if (serialised !== this.lastEmitted) {
      this.lastEmitted = serialised;
      this.deps.emit(result);
    }

    this.timer = setTimeout(() => {
      void this.poll();
    }, this.intervalMs);
    this.timer.unref?.();
  }
}

/**
 * Criterion 6. One usable device is an obvious choice and making the person
 * confirm it is noise; two is a question only they can answer. `unauthorized`
 * and `offline` are not usable, so neither counts.
 */
function autoSelect(devices: readonly Device[]): string | null {
  const usable = devices.filter((device) => device.state === 'device');
  return usable.length === 1 ? (usable[0]?.id ?? null) : null;
}

/**
 * Failures carry the code the thrower gave them — `adb` missing and `adb`
 * refusing are different conditions with different fixes, and the doctor tells
 * them apart by this code.
 */
function failure(error: unknown, fallback: ErrorCode = ERROR_CODES.adbFailed): Result<never> {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : fallback;

  return {
    ok: false,
    error: { code, message: error instanceof Error ? error.message : 'adb failed.' },
  };
}

function mirrorFailure(code: ErrorCode, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

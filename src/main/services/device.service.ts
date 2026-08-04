import type { AppIdentity } from '@shared/ipc';
import { type Device, type DeviceSnapshot, ERROR_CODES, type Result } from '@shared/ipc';
import type { MaestroGateway } from '../maestro/MaestroGateway';

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

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
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
function failure(error: unknown): Result<never> {
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : ERROR_CODES.adbFailed;

  return {
    ok: false,
    error: { code, message: error instanceof Error ? error.message : 'adb failed.' },
  };
}

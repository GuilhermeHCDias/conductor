import { ERROR_CODES } from '@shared/ipc';
import type { BinaryRunResult, RunOptions } from '../process/run';
import { AdbNotFoundError } from './AdbBridge';

/**
 * One still frame of the device's screen, as bytes.
 *
 * It is its own module rather than a method on `AdbBridge` for a reason that
 * arrives later: iOS captures through `simctl io screenshot`, a second
 * implementation of exactly this and of nothing else `AdbBridge` does (§9.2
 * draws it accordingly). Today it is Android only.
 *
 * ⚠️ The screenshot never goes through Maestro — not the CLI, not the MCP
 * server (§4.4b, §10.1 rule 13). `screencap` costs 100–300 ms against seconds
 * for anything that starts a JVM, and the snapshot's frozen picture is on the
 * critical path of the product's core loop (§5.5).
 *
 * Like `AdbBridge` and `ScrcpySource` it *names* `adb` but does not start it:
 * the runner arrives by constructor injection, which is what lets every path
 * below be driven with no adb and no phone.
 */

/** The slice of `AdbBridge` a capture needs. One resolution order for `adb` in
 * this app, and it belongs to the bridge. */
export type CaptureAdb = {
  resolve: () => string | null;
};

/** `runBinary`. Typed structurally so this module never reaches for the
 * text-mode `run`, which would decode the PNG and destroy it. Unlike
 * `AdbRunner` it keeps `RunOptions`: `devices` and `getprop` answer in
 * milliseconds or not at all, while a capture can sit open (see the deadline
 * below). */
export type BinaryRunner = (
  command: string,
  args: readonly string[],
  options?: RunOptions,
) => Promise<BinaryRunResult>;

/**
 * Generous against a slow first `screencap` on a cold device — measured at
 * 100–300 ms on this hardware — and still short enough that a capture which is
 * never coming back is reported as a failure the person can act on rather than
 * a spinner that never stops.
 */
export const CAPTURE_TIMEOUT_MS = 10_000;

export type ScreenCaptureDeps = {
  readonly adb: CaptureAdb;
  readonly run: BinaryRunner;
};

/** The capture ran and produced nothing usable. Distinct from "no adb", which
 * is a prerequisite with a different fix, and from the parser's code (§10). */
export class ScreenCaptureFailedError extends Error {
  readonly code = ERROR_CODES.captureFailed;

  constructor(detail: string) {
    super(`The device screenshot failed. ${detail}`.trim());
    this.name = 'ScreenCaptureFailedError';
  }
}

export class ScreenCapture {
  private readonly deps: ScreenCaptureDeps;

  constructor(deps: ScreenCaptureDeps) {
    this.deps = deps;
  }

  /**
   * Criteria 12 and 13. `exec-out` rather than `shell`: `adb shell` runs the
   * stream through a pty that rewrites every `0x0a` into `0x0d 0x0a`, and a PNG
   * mangled that way still arrives, still has the right length prefix, and
   * decodes to nothing. `exec-out` is the raw pipe.
   *
   * The bytes are returned exactly as the device produced them — not decoded,
   * not re-encoded, not copied through a string (§10.1 rule 2).
   */
  async capture(deviceId: string): Promise<Buffer> {
    const binary = this.deps.adb.resolve();
    if (binary === null) {
      throw new AdbNotFoundError();
    }

    const args = ['-s', deviceId, 'exec-out', 'screencap', '-p'];
    let result: BinaryRunResult;
    try {
      result = await this.deps.run(binary, args, { timeout: CAPTURE_TIMEOUT_MS });
    } catch (error) {
      // The binary vanished between resolving and running, the capture ran out
      // of time, or the runner was aborted: there is no exit code to report,
      // and it must not escape as an untyped throw.
      throw new ScreenCaptureFailedError(
        error instanceof Error ? error.message : 'adb could not be started.',
      );
    }

    if (result.code !== 0) {
      throw new ScreenCaptureFailedError(
        `adb ${args.join(' ')} exited ${result.code}. ${result.stderr.trim()}`.trim(),
      );
    }
    // `screencap` can exit 0 having written nothing — a device that locked or
    // rotated mid-capture. An empty Buffer handed back as "the screenshot"
    // fails somewhere with no idea why, so it fails here instead.
    if (result.stdout.length === 0) {
      throw new ScreenCaptureFailedError('The device produced no image.');
    }
    return result.stdout;
  }
}

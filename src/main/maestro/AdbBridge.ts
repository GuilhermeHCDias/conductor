import { delimiter, join } from 'node:path';
import {
  type AppIdentity,
  type Device,
  type DeviceProperties,
  type DeviceState,
  ERROR_CODES,
} from '@shared/ipc';
import type { RunResult, SpawnOptions, StreamingProcess } from '../process/run';

/**
 * Every `adb` invocation the app makes, and the only module that knows the
 * binary's name. Nothing in Maestro's surface answers "is this app installed,
 * which version, is it running, is it in front" — so that half of the Device
 * inspector is ours, and it is all here.
 *
 * The process runner and the filesystem probe arrive by constructor injection,
 * which is why every parsing trap below is drivable from captured bytes with
 * no device attached.
 */

export type AdbRunner = (command: string, args: readonly string[]) => Promise<RunResult>;

/** The streaming counterpart, for the one adb child that has to stay up: the
 * scrcpy server's `app_process`. */
export type AdbSpawner = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => StreamingProcess;

export type AdbBridgeDeps = {
  readonly run: AdbRunner;
  readonly spawn: AdbSpawner;
  /** True when `path` exists and can be executed. */
  readonly isExecutable: (path: string) => boolean;
  readonly env: NodeJS.ProcessEnv;
  /** The user's home directory — where the macOS SDK default lives. */
  readonly home: string;
  /** `CONFIG.ADB_PATH`. Empty means "resolve it yourself". */
  readonly configuredPath: string;
};

/** Nothing resolved. A prerequisite, not a bug — hence a stable code. */
export class AdbNotFoundError extends Error {
  readonly code = ERROR_CODES.adbNotFound;

  constructor() {
    super('No adb found. Install the Android platform-tools, or set CONDUCTOR_ADB_PATH.');
    this.name = 'AdbNotFoundError';
  }
}

/** adb ran and refused. Distinct from "no adb": the fix is a different one. */
export class AdbFailedError extends Error {
  readonly code = ERROR_CODES.adbFailed;

  constructor(args: readonly string[], result: RunResult) {
    super(`adb ${args.join(' ')} exited ${result.code}. ${result.stderr.trim()}`.trim());
    this.name = 'AdbFailedError';
  }
}

/** The states `adb devices` reports. Anything else is not a device row. */
const STATES = new Set<string>(['device', 'unauthorized', 'offline']);

export class AdbBridge {
  private readonly deps: AdbBridgeDeps;
  /** Memoised only on success: an SDK installed mid-session must still be found. */
  private resolved: string | null = null;

  constructor(deps: AdbBridgeDeps) {
    this.deps = deps;
  }

  /**
   * Criterion 1's order, first hit wins: the configured path, `ANDROID_HOME`,
   * `ANDROID_SDK_ROOT`, the macOS SDK default, then `PATH`. `PATH` is walked
   * rather than shelled out to, so the same probe answers every candidate.
   */
  resolve(): string | null {
    if (this.resolved !== null) {
      return this.resolved;
    }

    const { configuredPath, env, home, isExecutable } = this.deps;
    const candidates = [
      ...(configuredPath === '' ? [] : [configuredPath]),
      ...sdkCandidate(env.ANDROID_HOME),
      ...sdkCandidate(env.ANDROID_SDK_ROOT),
      join(home, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
      ...(env.PATH ?? '').split(delimiter).flatMap((dir) => (dir === '' ? [] : [join(dir, 'adb')])),
    ];

    this.resolved = candidates.find((candidate) => isExecutable(candidate)) ?? null;
    return this.resolved;
  }

  /** Criteria 3–4. Throws rather than reporting an empty list: "adb refused"
   * and "nothing is plugged in" are different answers to different questions. */
  async listDevices(): Promise<Device[]> {
    const result = await this.adb(['devices', '-l']);
    if (result.code !== 0) {
      throw new AdbFailedError(['devices', '-l'], result);
    }
    return parseDevices(result.stdout);
  }

  /**
   * Criterion 7. Each property is read on its own and independently absent:
   * a device that answers `getprop` but not `wm size` reports the model it gave
   * and `null` for the size, rather than failing the whole read.
   */
  async properties(deviceId: string): Promise<DeviceProperties> {
    const [model, release, size, density] = await Promise.all([
      this.text(deviceId, ['shell', 'getprop', 'ro.product.model']),
      this.text(deviceId, ['shell', 'getprop', 'ro.build.version.release']),
      this.text(deviceId, ['shell', 'wm', 'size']),
      this.text(deviceId, ['shell', 'wm', 'density']),
    ]);

    return {
      model,
      release,
      size: parseSize(size),
      density: parseDensity(density),
    };
  }

  /** Criteria 9–12. The app id arrives as an argument and is never a literal
   * here (.context.md §12.6). */
  async appIdentity(deviceId: string, appId: string): Promise<AppIdentity> {
    const packages = await this.adb(['-s', deviceId, 'shell', 'pm', 'list', 'packages', appId]);
    const installed = parsePackages(packages.stdout).includes(appId);

    if (!installed) {
      // Deduced, not defaulted: an app that is not on the device is not running
      // and is not in front. Criterion 12's `null` is for a device that told us
      // nothing, which is a different situation from this one.
      return { appId, installed: false, versionName: null, running: false, foreground: false };
    }

    const [dump, pid, activities] = await Promise.all([
      this.text(deviceId, ['shell', 'dumpsys', 'package', appId]),
      this.text(deviceId, ['shell', 'pidof', appId]),
      this.text(deviceId, ['shell', 'dumpsys', 'activity', 'activities']),
    ]);

    return {
      appId,
      installed: true,
      versionName:
        dump === null ? null : (/^\s*versionName=(.+)$/m.exec(dump)?.[1]?.trim() ?? null),
      running: pid !== null && pid !== '',
      foreground: parseForeground(activities, appId),
    };
  }

  /**
   * Puts a host file on the device. The mirror's server is ours and pinned, so
   * this is how it gets there — never the copy a `brew install scrcpy` left on
   * the machine, whose version we do not control.
   */
  async push(deviceId: string, localPath: string, remotePath: string): Promise<void> {
    const args = ['-s', deviceId, 'push', localPath, remotePath];
    const result = await this.deps.run(this.binary(), args);
    if (result.code !== 0) {
      throw new AdbFailedError(args, result);
    }
  }

  /**
   * Criterion 16. `tcp:0` makes adb allocate, and it prints the port it chose —
   * verified on hardware, where it answered `54556`. Hardcoding 27183 the way
   * scrcpy's own client does would collide with a scrcpy the person is running
   * beside us.
   */
  async forward(deviceId: string, remote: string): Promise<number> {
    const args = ['-s', deviceId, 'forward', 'tcp:0', remote];
    const result = await this.deps.run(this.binary(), args);
    if (result.code !== 0) {
      throw new AdbFailedError(args, result);
    }

    const port = Number(result.stdout.trim());
    if (!Number.isInteger(port) || port <= 0) {
      throw new AdbFailedError(args, {
        ...result,
        // Reported as a failure rather than as port 0: a forward whose port we
        // cannot read is a tunnel nothing can reach, and pretending otherwise
        // would surface as a connect timeout three steps later.
        stderr: `adb printed no port. It said: ${result.stdout.trim()}`,
        code: -1,
      });
    }
    return port;
  }

  /** Criterion 22 — the counterpart, so no forward outlives its session. */
  async removeForward(deviceId: string, port: number): Promise<void> {
    const args = ['-s', deviceId, 'forward', '--remove', `tcp:${port}`];
    const result = await this.deps.run(this.binary(), args);
    if (result.code !== 0) {
      throw new AdbFailedError(args, result);
    }
  }

  /**
   * A shell that stays up. `run` buffers to completion, which for the scrcpy
   * server means waiting for the session to end — so this is the one adb call
   * that goes through `spawnStreaming` instead.
   *
   * `args` arrives already split, and stays split all the way down to
   * `execFile`: nothing here ever composes a shell string (.context.md §12.19).
   */
  shell(deviceId: string, args: readonly string[], options: SpawnOptions = {}): StreamingProcess {
    return this.deps.spawn(this.binary(), ['-s', deviceId, 'shell', ...args], options);
  }

  /** One place resolves the binary, so one place can report it missing. */
  private adb(args: readonly string[]): Promise<RunResult> {
    const binary = this.resolve();
    if (binary === null) {
      return Promise.reject(new AdbNotFoundError());
    }
    return this.deps.run(binary, args);
  }

  /**
   * The same resolution, for the callers that need the path itself. It throws
   * rather than returning `null`: inside an `async` method that becomes the
   * same rejection `adb()` produces, and `shell()` — which is not async — has
   * no `Result` to hand back and no child to return.
   */
  private binary(): string {
    const binary = this.resolve();
    if (binary === null) {
      throw new AdbNotFoundError();
    }
    return binary;
  }

  /**
   * Trimmed stdout, or `null` when the command failed or printed nothing. Every
   * property read goes through here, which is what makes "not reported" the
   * default answer rather than an invented one.
   */
  private async text(deviceId: string, args: readonly string[]): Promise<string | null> {
    const result = await this.adb(['-s', deviceId, ...args]);
    if (result.code !== 0) {
      return null;
    }
    const trimmed = result.stdout.trim();
    return trimmed === '' ? null : trimmed;
  }
}

function sdkCandidate(root: string | undefined): string[] {
  return root === undefined || root === '' ? [] : [join(root, 'platform-tools', 'adb')];
}

/**
 * `adb devices -l` prints a header, optional daemon chatter, then one row per
 * device. Only rows whose second column is a state adb actually reports are
 * devices — which is what keeps `* daemon started successfully` out of the
 * picker.
 */
function parseDevices(stdout: string): Device[] {
  return stdout.split('\n').flatMap((raw) => {
    const line = raw.replace('\r', '').trim();
    const [id, state] = line.split(/\s+/);
    if (id === undefined || state === undefined || !STATES.has(state)) {
      return [];
    }
    return [{ id, model: / model:(\S+)/.exec(line)?.[1] ?? null, state: state as DeviceState }];
  });
}

/** `package:com.vtex.pnp` per line. The `package:` prefix goes; nothing else. */
function parsePackages(stdout: string): string[] {
  return stdout.split('\n').flatMap((raw) => {
    const line = raw.replace('\r', '').trim();
    return line.startsWith('package:') ? [line.slice('package:'.length)] : [];
  });
}

/** `Physical size: 1080x2400`, ignoring any `Override size:` beneath it. */
function parseSize(text: string | null): DeviceProperties['size'] {
  const match = text === null ? null : /Physical size:\s*(\d+)x(\d+)/.exec(text);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseDensity(text: string | null): number | null {
  const match = text === null ? null : /Physical density:\s*(\d+)\b/.exec(text);
  return match?.[1] === undefined ? null : Number(match[1]);
}

/**
 * Criterion 12. `dumpsys activity activities` names whatever is resumed on one
 * of two markers, depending on the Android release. A device that prints
 * neither has reported nothing — and `null` is "not reported", never `false`
 * (.context.md §5.2).
 *
 * The marker names a component, so the package is always followed by `/`.
 * Matching on the bare package would read `com.vtex.pnp.debug` as the app.
 */
function parseForeground(activities: string | null, appId: string): boolean | null {
  if (activities === null) {
    return null;
  }
  const markers = activities
    .split('\n')
    .filter((line) => line.includes('ResumedActivity'))
    .map((line) => line.replace('\r', ''));

  if (markers.length === 0) {
    return null;
  }
  return markers.some((line) => line.includes(`${appId}/`));
}

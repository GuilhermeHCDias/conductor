import { randomInt } from 'node:crypto';
import { connect as connectTcp } from 'node:net';
import { join } from 'node:path';
import { ERROR_CODES, type ErrorCode } from '@shared/ipc';
import type { SpawnOptions, StreamingProcess } from '../process/run';
import type { MirrorHandlers, MirrorSession } from './MaestroGateway';
import { ScrcpyParser, ScrcpyProtocolError } from './scrcpy-protocol';

/**
 * The scrcpy server's whole lifecycle on this side: push our own jar, forward a
 * port, start `app_process` on the device, connect to the socket it binds, and
 * tear all of it back down.
 *
 * With `AdbBridge` it is one of the only two modules that name `adb` or a
 * scrcpy path, and the only one that knows the device has a filesystem
 * (.context.md §10.1 rule 6). Everything it touches — the runner, the socket,
 * the jar's location — arrives injected, so a test drives the session with no
 * phone, no adb and no jar on disk.
 */

/**
 * Criterion 15. The first positional argument to the server *must* equal the
 * server's own version — the dex carries the literal "The server version
 * (3.3.4) does not match the client (". So the version and the file name are
 * one constant, and moving the pin is a single deliberate edit with a
 * re-verification attached (.context.md §4.5).
 */
export const SCRCPY_VERSION = '3.3.4';

export const SCRCPY_JAR = `scrcpy-server-${SCRCPY_VERSION}.jar`;

/** The two Electron facts the jar's location depends on, passed rather than
 * imported so this module stays testable and Electron-free. */
export type ScrcpyResourceEnv = {
  readonly packaged: boolean;
  /** `process.resourcesPath` — where `extraResources` lands. */
  readonly resourcesPath: string;
  /** `app.getAppPath()` — the repo root under `electron-vite dev`. */
  readonly appPath: string;
};

/**
 * The one helper that joins the jar's path; nothing else may. It has to be an
 * `extraResources` file rather than an asar entry, because `adb push` opens a
 * real file and asar is a virtual filesystem.
 *
 * The user's own scrcpy is never consulted: the version argument must match the
 * jar exactly, and a `brew upgrade scrcpy` would otherwise break the mirror
 * silently on someone else's machine.
 */
export function scrcpyJarPath(env: ScrcpyResourceEnv): string {
  return env.packaged
    ? join(env.resourcesPath, 'scrcpy', SCRCPY_JAR)
    : join(env.appPath, 'resources', 'scrcpy', SCRCPY_JAR);
}

/**
 * Criterion 14. Short on purpose: `/data/local/tmp/scrcpy-server.jar` would cost
 * 12 more characters of the 255 the device's `app_process` will accept, and
 * criterion 17a's budget is what keeps the server alive on a Samsung.
 */
export const DEVICE_JAR_PATH = '/data/local/tmp/s.jar';

/** The entry point the jar declares. Everything after the version is `key=value`. */
const SERVER_CLASS = 'com.genymobile.scrcpy.Server';

/**
 * ⚠️ Criterion 17a. Samsung devices abort `app_process` past ~255 characters —
 * the device's limit, not scrcpy's, stated by scrcpy's own author in
 * Genymobile/scrcpy#6900 and reproduced here on 2026-08-04.
 *
 * The failure is vicious in shape: the socket connects, the dummy byte, the
 * device name and the codec header all arrive *correctly*, and only then does
 * the server die with `stack corruption detected (-fstack-protector)`. Every
 * check downstream has already passed by then, so nothing but the assertion in
 * `serverCommand` can catch it, and the symptom impersonates a frame-parsing bug.
 */
export const MAX_COMMAND_LENGTH = 255;

/** The inspector column is 250–300 CSS px; 1024 leaves headroom for a wider
 * window without streaming a framebuffer nobody sees. */
export const MIRROR_MAX_SIZE = 1024;

/** 30 was tried first and read as stutter beside scrcpy's own uncapped
 * default. 60 matches the refresh rate most phones drive; keeping a cap at all
 * is what stops a 120 Hz panel from doubling the encode, IPC and decode bill
 * for motion nobody can see at this size. */
export const MIRROR_MAX_FPS = 60;

/**
 * Criterion 17. **Only** the options that differ from the server's own defaults.
 * `video`, `video_codec`, `send_dummy_byte`, `send_device_meta`,
 * `send_codec_meta`, `send_frame_meta`, `cleanup` and `log_level` already hold
 * the value this spec wants — spelling them out buys nothing and costs the
 * headroom that keeps the command line under criterion 17a's budget.
 *
 * Returns an argument array, never a composed string: it travels to `execFile`
 * split, so nothing in it can become shell syntax (.context.md §12.19).
 */
export function serverCommand(scid: string): readonly string[] {
  const args = [
    `CLASSPATH=${DEVICE_JAR_PATH}`,
    'app_process',
    '/',
    SERVER_CLASS,
    // Criterion 15: the first positional argument must equal the jar's version
    // exactly, or the server refuses with "The server version (…) does not match".
    SCRCPY_VERSION,
    `scid=${scid}`,
    'audio=false',
    'control=false',
    'tunnel_forward=true',
    `max_size=${MIRROR_MAX_SIZE}`,
    `max_fps=${MIRROR_MAX_FPS}`,
  ];

  const length = args.join(' ').length;
  if (length >= MAX_COMMAND_LENGTH) {
    throw new Error(
      `The scrcpy command line is ${length} characters. Devices abort app_process past ${MAX_COMMAND_LENGTH}, after the handshake has already succeeded — see criterion 17a.`,
    );
  }
  return args;
}

/** The slice of `AdbBridge` a session needs. Injected, so the whole lifecycle
 * is drivable with no adb and no phone (criterion 45). */
export type ScrcpyAdb = {
  push: (deviceId: string, localPath: string, remotePath: string) => Promise<void>;
  forward: (deviceId: string, remote: string) => Promise<number>;
  removeForward: (deviceId: string, port: number) => Promise<void>;
  shell: (deviceId: string, args: readonly string[], options?: SpawnOptions) => StreamingProcess;
};

/** The video socket, narrowed to what a session does with it. */
export type ScrcpySocket = {
  onData: (listener: (chunk: Uint8Array) => void) => void;
  /** Fires once, on a clean end or an error. */
  onEnd: (listener: (error: Error | null) => void) => void;
  destroy: () => void;
};

export type ScrcpySourceDeps = {
  readonly adb: ScrcpyAdb;
  /** Opens the loopback connection to the forwarded port. */
  readonly connect: (port: number) => Promise<ScrcpySocket>;
  /** Host path of the pinned jar, from `scrcpyJarPath`. */
  readonly jarPath: string;
  /** The per-session id. Injected so a test gets the same socket name twice. */
  readonly scid?: () => number;
  /** How long the device has to produce a codec header before we give up. */
  readonly startTimeoutMs?: number;
};

/**
 * Generous, and it has to be: the measured cost of a start on a Galaxy A07 is
 * ~2.3 s, almost all of it `app_process` coming up. What the deadline buys is
 * that `mirror:start` always settles — a promise that never does would leave
 * the panel saying "starting" with no way out. It is also the only bound on the
 * retry loop below, so there is one deadline rather than two budgets to keep in
 * step. scrcpy's own client allows itself the same 10 s.
 */
const DEFAULT_START_TIMEOUT_MS = 10_000;

/** Between connection attempts. scrcpy uses the same, and the phone that was
 * measured needed roughly twenty of them. */
const CONNECT_RETRY_MS = 100;

/** A session that could not be started. Carries the code the panel reads. */
export class ScrcpyStartError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ScrcpyStartError';
  }
}

export class ScrcpySource {
  private readonly deps: ScrcpySourceDeps;

  constructor(deps: ScrcpySourceDeps) {
    this.deps = deps;
  }

  /**
   * One session, from a bare device id to a stream of packets. Resolves as soon
   * as the codec header lands — the frames themselves arrive on `onPacket`,
   * because a handler that awaited the stream would block main for the length of
   * the session (AGENTS.md § Architecture).
   */
  async start(deviceId: string, handlers: MirrorHandlers): Promise<MirrorSession> {
    const scid = formatScid((this.deps.scid ?? randomScid)());
    const { adb } = this.deps;

    // Before the forward, so a jar that cannot be pushed leaves nothing behind.
    await adb.push(deviceId, this.deps.jarPath, DEVICE_JAR_PATH);

    const port = await adb.forward(deviceId, `localabstract:scrcpy_${scid}`);
    // From here on every exit has to undo the forward, the child and the socket.
    return new Session(this.deps, handlers, deviceId, scid, port).open();
  }
}

/**
 * One session's state, so `start` stays a story and the teardown has exactly one
 * home. Nothing outside this file constructs it.
 */
class Session {
  private readonly parser = new ScrcpyParser();
  private child: StreamingProcess | null = null;
  private socket: ScrcpySocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  /** Set the moment anything terminal happens, so a socket close racing a child
   * exit is one report, not two. */
  private over = false;
  /** Connection attempts made. A forward tunnel makes the first one meaningless,
   * so this is part of the diagnosis when the deadline passes. */
  private attempts = 0;
  /** Bytes the device has actually delivered. The dummy byte is the difference
   * between "not listening yet" and "started and fell over". */
  private bytesSeen = 0;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private lastConnectError = 'the connection was closed with nothing on it';
  /** True once we asked for the stop ourselves: a teardown we ordered is not a
   * failure and must not paint one on the panel. */
  private stopping = false;
  private started = false;
  private stderr = '';
  private settle: {
    resolve: (session: MirrorSession) => void;
    reject: (error: Error) => void;
  } | null = null;

  constructor(
    private readonly deps: ScrcpySourceDeps,
    private readonly handlers: MirrorHandlers,
    private readonly deviceId: string,
    private readonly scid: string,
    private readonly port: number,
  ) {}

  open(): Promise<MirrorSession> {
    return new Promise<MirrorSession>((resolve, reject) => {
      this.settle = { resolve, reject };

      const deadline = this.deps.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
      this.timer = setTimeout(() => {
        this.fail(
          ERROR_CODES.mirrorStartFailed,
          this.detail(
            `The device did not open a scrcpy stream within ${deadline}ms, over ${this.attempts} connection ${this.attempts === 1 ? 'attempt' : 'attempts'}. Last: ${this.lastConnectError}.`,
          ),
        );
      }, deadline);
      // A pending timer would hold the event loop open for the whole session.
      this.timer.unref?.();

      this.spawnServer();
      this.openSocket();
    });
  }

  private spawnServer(): void {
    const child = this.deps.adb.shell(this.deviceId, serverCommand(this.scid));
    this.child = child;

    // The server's own words are the only diagnosis a person gets when it
    // refuses — a missing jar, a version mismatch, the stack-corruption abort.
    child.onStderr((chunk) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-2000);
    });
    child.onExit((reason) => {
      if (this.started) {
        // Criterion 25: it was streaming and now it is not.
        this.end(ERROR_CODES.mirrorDeviceLost, this.detail('The scrcpy server exited.'));
        return;
      }
      this.fail(
        ERROR_CODES.mirrorStartFailed,
        this.detail(
          reason.error === null
            ? `The scrcpy server exited (${reason.code ?? 'signalled'}) before opening a stream.`
            : `The scrcpy server could not be started. ${reason.error.message}`,
        ),
      );
    });
  }

  private openSocket(): void {
    this.attempts += 1;
    this.deps
      .connect(this.port)
      .then((socket) => {
        if (this.over) {
          // Torn down while the connection was in flight.
          socket.destroy();
          return;
        }
        this.socket = socket;
        socket.onData((chunk) => {
          this.bytesSeen += chunk.length;
          this.receive(chunk);
        });
        socket.onEnd((error) => {
          this.closed(error);
        });
      })
      .catch((error: unknown) => {
        // The forward is up but nothing answered. Same race as below, seen from
        // the other side, and answered the same way.
        this.lastConnectError = messageOf(error);
        this.reconnect();
      });
  }

  /**
   * ⚠️ The race a forward tunnel creates, and the whole reason `send_dummy_byte`
   * exists. adb accepts the connection whether or not the server has bound its
   * socket on the device, then closes it again — so **"connected" proves
   * nothing, and the first byte proves everything.**
   *
   * Measured on a Galaxy A07 on 2026-08-04: `app_process` took ~2.3 s to bind,
   * and every connection in that window came back accepted-and-closed with zero
   * bytes on it. Connecting once and calling that close terminal fails every
   * time. scrcpy's own client retries for the same reason.
   */
  private reconnect(): void {
    if (this.over) {
      return;
    }
    this.socket?.destroy();
    this.socket = null;
    this.retry = setTimeout(() => {
      this.retry = null;
      this.openSocket();
    }, CONNECT_RETRY_MS);
    this.retry.unref?.();
  }

  private receive(chunk: Uint8Array): void {
    if (this.over) {
      return;
    }

    let events: ReturnType<ScrcpyParser['push']>;
    try {
      events = this.parser.push(chunk);
    } catch (error) {
      const code =
        error instanceof ScrcpyProtocolError ? error.code : ERROR_CODES.mirrorProtocolFailed;
      if (this.started) {
        this.end(code, messageOf(error));
      } else {
        this.fail(code, messageOf(error));
      }
      return;
    }

    for (const event of events) {
      if (event.type === 'meta') {
        this.ready(event.meta);
      } else {
        this.handlers.onPacket(event.packet);
      }
    }
  }

  /** The codec header landed: this is a session, and `mirror:start` can answer. */
  private ready(meta: { deviceName: string; codec: string; width: number; height: number }): void {
    this.started = true;
    this.clearTimer();
    const settle = this.settle;
    this.settle = null;
    settle?.resolve({
      deviceName: meta.deviceName,
      codec: meta.codec,
      width: meta.width,
      height: meta.height,
      stop: () => this.stop(),
    });
  }

  /**
   * Criterion 18 and criterion 25, told apart by whether the handshake ever
   * finished. Before it: the server never really came up, and the parser knows
   * whereabouts in the prefix it died. After it: the phone went away.
   */
  private closed(error: Error | null): void {
    if (this.started) {
      this.end(
        ERROR_CODES.mirrorDeviceLost,
        error === null
          ? 'The device closed the mirror stream.'
          : `The mirror stream failed. ${error.message}`,
      );
      return;
    }

    // Nothing at all arrived: adb accepted a connection to a socket the server
    // has not bound yet, and closed it again. Try again rather than reporting a
    // handshake that never began — see `reconnect`.
    if (this.bytesSeen === 0) {
      this.lastConnectError =
        error === null ? 'the connection was closed with nothing on it' : error.message;
      this.reconnect();
      return;
    }

    // Something arrived and then it died inside the prefix. That is a server
    // that started and fell over — a real truncation, and retrying it would
    // hide it behind a timeout.
    try {
      this.parser.end();
      this.fail(
        ERROR_CODES.mirrorHandshakeFailed,
        this.detail('The scrcpy stream closed before the codec header arrived.'),
      );
    } catch (handshake) {
      const code =
        handshake instanceof ScrcpyProtocolError
          ? handshake.code
          : ERROR_CODES.mirrorHandshakeFailed;
      this.fail(code, this.detail(messageOf(handshake)));
    }
  }

  /** Terminal before the session ever started: reject, and leave nothing behind. */
  private fail(code: ErrorCode, message: string): void {
    if (this.over) {
      return;
    }
    this.over = true;
    this.clearTimer();
    const settle = this.settle;
    this.settle = null;
    void this.teardown();
    settle?.reject(new ScrcpyStartError(code, message));
  }

  /** Terminal after it started: report it once, and leave nothing behind. */
  private end(code: ErrorCode, message: string): void {
    if (this.over) {
      return;
    }
    this.over = true;
    this.clearTimer();
    void this.teardown();
    if (!this.stopping) {
      this.handlers.onEnded({ code, message });
    }
  }

  private stop(): Promise<void> {
    this.stopping = true;
    if (this.over) {
      // Already torn down — a stop racing a disconnect is not a second teardown.
      return Promise.resolve();
    }
    this.over = true;
    this.clearTimer();
    return this.teardown();
  }

  /**
   * Criterion 22. Each step is independent: a forward adb has already dropped
   * must not stop the kill, because the server left alive on the device is the
   * failure that was actually observed in the spike — it survived `pkill` and
   * needed `kill -9` by pid.
   */
  private async teardown(): Promise<void> {
    this.child?.kill();
    this.child = null;
    this.socket?.destroy();
    this.socket = null;
    try {
      await this.deps.adb.removeForward(this.deviceId, this.port);
    } catch {
      // Best effort: a forward that is already gone is the outcome we wanted.
    }
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    // A retry that fires after the session is over would open a socket nobody
    // owns, on a forward that has already been removed.
    if (this.retry !== null) {
      clearTimeout(this.retry);
      this.retry = null;
    }
  }

  /** Whatever the server printed, appended verbatim — it is the only clue. */
  private detail(message: string): string {
    const said = this.stderr.trim();
    return said === '' ? message : `${message} The device said: ${said}`;
  }
}

/** scrcpy parses `scid` as hex and binds `scrcpy_%08x` of it, so it travels as
 * eight hex digits and the socket name is built from the same eight. */
function formatScid(value: number): string {
  return (value >>> 0).toString(16).padStart(8, '0');
}

/** Positive and inside 31 bits: the server reserves negatives for "no scid". */
function randomScid(): number {
  return randomInt(1, 0x7fffffff);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The default socket: a plain TCP connection to the forwarded port on the
 * loopback. `node:net` is not `node:child_process` — this creates no process,
 * and the Biome rule that guards §10.1 rule 1 is untouched.
 */
export function connectLoopback(port: number): Promise<ScrcpySocket> {
  return new Promise((resolve, reject) => {
    const socket = connectTcp({ host: '127.0.0.1', port });

    const failed = (error: Error): void => {
      socket.destroy();
      reject(error);
    };
    socket.once('error', failed);
    socket.once('connect', () => {
      socket.removeListener('error', failed);
      resolve({
        onData: (listener) => {
          socket.on('data', (chunk: Buffer) => {
            listener(new Uint8Array(chunk));
          });
        },
        onEnd: (listener) => {
          let done = false;
          const once = (error: Error | null): void => {
            if (!done) {
              done = true;
              listener(error);
            }
          };
          socket.on('error', once);
          socket.on('close', () => {
            once(null);
          });
        },
        destroy: () => {
          socket.destroy();
        },
      });
    });
  });
}

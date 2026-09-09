import { ERROR_CODES, type ErrorCode } from '@shared/ipc';
import { McpClient, McpTimeoutError } from '../maestro/McpClient';
import { resolveMaestro } from '../maestro/resolve-maestro';
import type { SpawnOptions, StreamingProcess } from '../process/run';
import { maestroEnv } from './tool-layout';

/**
 * The one persistent `maestro mcp` child this app talks to, and its whole
 * lifecycle: start it, hand shake once, keep it, kill it on quit.
 *
 * It exists for the view hierarchy. Measured on this hardware, `maestro
 * hierarchy --no-reinstall-driver` costs ~3.83s in steady state while
 * `inspect_screen` on an already-initialised session costs ~180–300ms — the
 * session *is* the optimisation, because the server runs inside the JVM and
 * holds the device session open, so a call is a lookup on an object in memory
 * rather than a cold start (§4.3.3, §4.4).
 *
 * That is also why the child must be reused rather than respawned: the first
 * call pays ~5.6s and every one after it pays ~180ms. A service that started a
 * JVM per call would be slower than the CLI it replaced.
 *
 * ⚠️ It is not, and must not become, the AI layer's MCP path: that child belongs
 * to Claude Code, which spawns and owns it (§4.3.7). This one is ours.
 *
 * ⚠️ A live session here and a raw `maestro hierarchy` call *do* contend for the
 * on-device driver, and the failure mode is silent — measured while scoping:
 * three concurrent CLI calls returned 2534, 1502 and 1982 lines against a clean
 * baseline of 2677, none of them reporting an error. Whoever adds `CliRunner`
 * must not assume the two are safe to run at once (§4.3.6).
 */

/** The only tool this service calls. Its `device_id` argument is snake_case —
 * confirmed against the server, which rejected `deviceId`. */
export const INSPECT_TOOL = 'inspect_screen';

/** Generous on purpose: the first call pays a JVM cold start (§4.4), measured
 * at ~5.6s on this hardware. */
const REQUEST_TIMEOUT_MS = 60_000;

/** How long a SIGTERMed JVM is given to actually die before `stop` gives up on
 * it. A child that will not answer a signal is a worse reason to refuse the
 * assistant than the contention stopping it was meant to avoid, so the caller
 * carries on — this bound is what keeps it from waiting forever to find out. */
export const STOP_TIMEOUT_MS = 5_000;

/**
 * The failure text a live child reports once the device session inside it has
 * died: the JVM is fine, the driver behind it is gone, and every call after
 * this one fails identically until something restarts the child. Matched on the
 * message because that is all the server gives us — it is a tool error, not a
 * transport one.
 *
 * Deliberately narrow. A timeout, a missing tool and a Maestro that will not
 * start are all *different* fixes, and restarting the JVM under them would turn
 * one honest failure into two (criterion 23).
 */
const DEAD_SESSION = /device server died|StatusRuntimeException:\s*UNAVAILABLE/i;

/** The slice of `McpClient` this service uses. Injected, so the lifecycle can
 * be tested without a wire. */
export type McpSession = {
  initialize: () => Promise<void>;
  listTools: () => Promise<string[]>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>;
};

export type MaestroMcpServiceDeps = {
  readonly spawn: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => StreamingProcess;
  /** Wraps a started child in an MCP session. Defaults to `McpClient`. */
  readonly connect?: (child: StreamingProcess) => McpSession;
  readonly isExecutable: (path: string) => boolean;
  readonly isFile: (path: string) => boolean;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  /** `CONFIG.MAESTRO_PATH`. Empty means "resolve it yourself". */
  readonly configuredPath: string;
  /** `userData/maestro` — the managed copy's rung in the one ladder. */
  readonly managedDir: string;
};

type Connection = {
  readonly child: StreamingProcess;
  readonly session: McpSession;
  /** Resolves once the handshake is done and the tool is known to exist. */
  readonly ready: Promise<void>;
};

export class MaestroMcpService {
  private readonly deps: MaestroMcpServiceDeps;
  private connection: Connection | null = null;
  /** The death currently being waited out, so overlapping stops wait for the
   * same JVM instead of the second one being told it is already gone. */
  private stopping: Promise<void> | null = null;
  private disposed = false;

  constructor(deps: MaestroMcpServiceDeps) {
    this.deps = deps;
  }

  /** The configured path, `PATH`, then where the Maestro installer puts it —
   * the one ladder `resolve-maestro` holds for this child and `CliRunner`. */
  resolve(): string | null {
    return resolveMaestro(this.deps);
  }

  /**
   * Criterion 17. The tool's raw text, straight back to `HierarchyParser` —
   * this service does not parse, and the parser does no I/O, which is what
   * keeps both testable in isolation (§9.2).
   *
   * Failures throw carrying a stable `code`, the way `AdbBridge` does, rather
   * than coming back as a `Result`: there is no IPC handler on this path yet
   * (criterion 3), and a service that returns failures as values only earns
   * that when something at the boundary consumes them.
   *
   * Nothing is deduplicated across calls. The Viewer's URL was one fact and was
   * shared onto a single in-flight promise; a screen is not — replaying an
   * earlier answer would hand back a tree the person has already navigated away
   * from, which §5.5 names as the way a good-looking selector goes wrong.
   */
  async inspectScreen(deviceId: string): Promise<string> {
    if (this.disposed) {
      throw new McpStartError(ERROR_CODES.mcpStartFailed, 'Conductor is shutting down.');
    }

    const connection = await this.connected();

    try {
      return await connection.session.callTool(INSPECT_TOOL, { device_id: deviceId });
    } catch (error) {
      if (!DEAD_SESSION.test(message(error, ''))) {
        throw callFailed(error);
      }
      return await this.retryOnFreshChild(deviceId, connection, error);
    }
  }

  /**
   * The device session died while the child holding it lived, so the child is
   * worth nothing and the call is worth repeating: discard, start a new JVM,
   * ask once more (criterion 21). The person sees a slow inspection rather than
   * an error they cannot act on.
   *
   * Exactly one retry (criterion 23): a driver that is really gone would
   * otherwise have this service restarting JVMs for as long as anyone keeps
   * asking. And whatever happens, no dead child is left in the slot — the Retry
   * button in the mirror reaches a JVM started after the failure, never the one
   * that failed (criterion 22).
   */
  private async retryOnFreshChild(
    deviceId: string,
    dead: Connection,
    cause: unknown,
  ): Promise<string> {
    console.warn('The maestro mcp device session died; starting a new child:', message(cause, ''));
    this.discard(dead);
    if (this.disposed) {
      // Criterion 24 — `before-quit` landed mid-recovery. Nothing replaces it.
      throw callFailed(cause);
    }

    const fresh = await this.connected();
    try {
      return await fresh.session.callTool(INSPECT_TOOL, { device_id: deviceId });
    } catch (error) {
      if (DEAD_SESSION.test(message(error, ''))) {
        this.discard(fresh);
      }
      throw callFailed(error);
    }
  }

  /**
   * Criteria 16–17 — `dispose`'s non-terminal twin. The AI turn takes the
   * device for itself, and two `maestro mcp` clients on one on-device driver is
   * the silent truncation §4.3.6 measured; ours lets go for the length of the
   * turn and starts again, cold, on the next inspection.
   *
   * Resolves only once the JVM is actually gone, so whoever takes the device
   * knows it has it — and rejects rather than waiting forever on a child that
   * will not answer a signal.
   *
   * Two stops legitimately overlap: a send abandoned inside its own suspend and
   * the successor that took the lease under the same owner. The slot is emptied
   * before the wait, so the second caller would otherwise find nothing to stop
   * and answer *immediately* — spawning `claude` on top of a JVM that is still
   * alive, which is exactly the contention this method exists to remove. It
   * waits on the same death instead.
   */
  async stop(): Promise<void> {
    const connection = this.connection;
    if (connection === null) {
      await (this.stopping ?? Promise.resolve());
      return;
    }
    this.discard(connection);
    const stopping = gone(connection.child).finally(() => {
      if (this.stopping === stopping) {
        this.stopping = null;
      }
    });
    this.stopping = stopping;
    await stopping;
  }

  /** Criterion 20 — no JVM survives `before-quit`. */
  dispose(): void {
    this.disposed = true;
    this.connection?.child.kill();
    this.connection = null;
  }

  /** Drops a child, by identity rather than by slot — the same reasoning
   * `connected()` holds: a newer, healthy child must never be taken down by an
   * older call giving up. */
  private discard(connection: Connection): void {
    if (this.connection === connection) {
      this.connection = null;
    }
    connection.child.kill();
  }

  /**
   * The child, hand shaken and ready to be called.
   *
   * ⚠️ A handshake that failed leaves nothing worth keeping, so the child goes —
   * but *which* child is decided by identity, never by whatever occupies the
   * slot when the rejection lands. A slow handshake can outlive its own child:
   * `onExit` clears the slot, the next call fills it with a healthy JVM, and
   * only then does the first one give up. Killing the slot's current occupant
   * there would take down a child that never failed.
   */
  private async connected(): Promise<Connection> {
    let started: Connection | null = null;
    try {
      started = this.connect();
      await started.ready;
      return started;
    } catch (error) {
      if (started !== null && this.connection === started) {
        started.child.kill();
        this.connection = null;
      }
      throw new McpStartError(startCode(error), message(error, 'The Maestro MCP server failed.'));
    }
  }

  /** Criterion 19: one child per session, started on first use and remembered
   * until it dies. */
  private connect(): Connection {
    if (this.connection !== null) {
      return this.connection;
    }

    const binary = this.resolve();
    if (binary === null) {
      throw new MaestroNotFoundError();
    }

    const child = this.deps.spawn(binary, ['mcp', '--no-viewer'], {
      // Criterion 18. §12 rule 10 in full now: `--no-viewer` was the one part of
      // it this child used to drop, and only because the Viewer was the point.
      env: maestroEnv(this.deps.env, this.deps.home, this.deps.isExecutable),
    });

    const session = (this.deps.connect ?? defaultConnect)(child);
    const connection: Connection = {
      child,
      session,
      ready: handshake(session),
    };
    // A JVM that died must not be reused: the next call starts a new one.
    child.onExit(() => {
      if (this.connection === connection) {
        this.connection = null;
      }
    });
    // Nothing awaits `ready` here, and an unobserved rejection would take the
    // process down; `inspectScreen` is where it is awaited and reported.
    connection.ready.catch(() => {});

    this.connection = connection;
    return connection;
  }
}

/** The handshake, plus the one thing `tools/list` is for: confirming this CLI
 * offers the tool at all, once per session rather than once per call. */
async function handshake(session: McpSession): Promise<void> {
  await session.initialize();
  const tools = await session.listTools();
  if (!tools.includes(INSPECT_TOOL)) {
    throw new InspectToolMissingError();
  }
}

function defaultConnect(child: StreamingProcess): McpSession {
  return new McpClient({ transport: child, timeoutMs: REQUEST_TIMEOUT_MS });
}

/** Every failure this service reports, carrying the code that says which fix
 * it needs. */
class McpStartError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, detail: string) {
    super(detail);
    this.code = code;
    this.name = 'McpStartError';
  }
}

class MaestroNotFoundError extends Error {
  readonly code = ERROR_CODES.maestroNotFound;

  constructor() {
    super(
      'The Maestro CLI is not installed. Reading the device’s view hierarchy needs maestro 2.6.0 or newer.',
    );
    this.name = 'MaestroNotFoundError';
  }
}

class InspectToolMissingError extends Error {
  readonly code = ERROR_CODES.mcpToolMissing;

  constructor() {
    super(`This Maestro CLI does not offer ${INSPECT_TOOL}. It needs maestro 2.6.0 or newer.`);
    this.name = 'InspectToolMissingError';
  }
}

/** Three ways starting can fail are three different fixes — install Maestro,
 * upgrade it, or find out why the JVM will not come up. */
function startCode(error: unknown): ErrorCode {
  if (error instanceof MaestroNotFoundError) {
    return ERROR_CODES.maestroNotFound;
  }
  if (error instanceof InspectToolMissingError) {
    return ERROR_CODES.mcpToolMissing;
  }
  if (error instanceof McpTimeoutError) {
    return ERROR_CODES.mcpHandshakeTimeout;
  }
  return ERROR_CODES.mcpStartFailed;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function callFailed(error: unknown): McpStartError {
  return new McpStartError(
    ERROR_CODES.mcpCallFailed,
    message(error, 'The device screen could not be read.'),
  );
}

/** Signals the child and resolves when it is really gone. The listener goes on
 * before the signal: a child that has already exited replays its exit to a late
 * subscriber, and one that dies synchronously would otherwise resolve nothing. */
function gone(child: StreamingProcess): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        new McpStartError(ERROR_CODES.mcpStartFailed, 'The Maestro MCP server would not stop.'),
      );
    }, STOP_TIMEOUT_MS);
    // A timer that outlives its child would hold the event loop open, and main
    // holds this service for the whole session.
    timer.unref?.();
    child.onExit(() => {
      clearTimeout(timer);
      resolve();
    });
    child.kill();
  });
}

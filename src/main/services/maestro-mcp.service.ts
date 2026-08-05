import { delimiter, join } from 'node:path';
import { ERROR_CODES, type ErrorCode } from '@shared/ipc';
import { McpClient, McpTimeoutError } from '../maestro/McpClient';
import type { SpawnOptions, StreamingProcess } from '../process/run';

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
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  /** `CONFIG.MAESTRO_PATH`. Empty means "resolve it yourself". */
  readonly configuredPath: string;
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
  private disposed = false;

  constructor(deps: MaestroMcpServiceDeps) {
    this.deps = deps;
  }

  /** The configured path, `PATH`, then where the Maestro installer puts it. */
  resolve(): string | null {
    const { configuredPath, env, home, isExecutable } = this.deps;
    const candidates = [
      ...(configuredPath === '' ? [] : [configuredPath]),
      ...(env.PATH ?? '')
        .split(delimiter)
        .flatMap((dir) => (dir === '' ? [] : [join(dir, 'maestro')])),
      join(home, '.maestro', 'bin', 'maestro'),
    ];
    return candidates.find((candidate) => isExecutable(candidate)) ?? null;
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

    let connection: Connection;
    try {
      connection = this.connect();
      await connection.ready;
    } catch (error) {
      // A handshake that failed leaves nothing worth keeping: drop the child so
      // the next call starts clean rather than talking to a corpse.
      this.connection?.child.kill();
      this.connection = null;
      throw new McpStartError(startCode(error), message(error, 'The Maestro MCP server failed.'));
    }

    try {
      return await connection.session.callTool(INSPECT_TOOL, { device_id: deviceId });
    } catch (error) {
      throw new McpStartError(
        ERROR_CODES.mcpCallFailed,
        message(error, 'The device screen could not be read.'),
      );
    }
  }

  /** Criterion 20 — no JVM survives `before-quit`. */
  dispose(): void {
    this.disposed = true;
    this.connection?.child.kill();
    this.connection = null;
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
      env: { ...this.deps.env, MAESTRO_CLI_NO_ANALYTICS: '1' },
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

import { delimiter, join } from 'node:path';
import { ERROR_CODES, type ErrorCode, type Result } from '@shared/ipc';
import { McpClient, McpProtocolError, McpTimeoutError } from '../maestro/McpClient';
import type { SpawnOptions, StreamingProcess } from '../process/run';

/**
 * Conductor does not draw the device's screen. Maestro already solved that, and
 * this service is the whole of our side of the trade: start `maestro mcp`, hand
 * shake, ask one tool for the Viewer URL, check that URL, and hand it to the
 * browser.
 *
 * It is the reason the UI is an MCP client at all (.context.md §12 rule 11):
 * the transport is stdio-only, the port is undocumented, and the URL exists
 * only behind a tool. It owns the child's whole lifecycle — which is what
 * distinguishes it from the AI layer's `maestro mcp`, spawned and owned by
 * Claude Code (§4.3.7).
 */

/** The only tool this service will ever call (criterion 23). */
export const VIEWER_TOOL = 'open_maestro_viewer';

/** Generous on purpose: the first call pays a JVM cold start (§4.4). */
const REQUEST_TIMEOUT_MS = 60_000;

/** The slice of `McpClient` this service uses. Injected, so the lifecycle can
 * be tested without a wire. */
export type McpSession = {
  initialize: () => Promise<void>;
  listTools: () => Promise<string[]>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<string>;
};

export type ViewerServiceDeps = {
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
  /** `shell.openExternal`, injected so this module never imports Electron. */
  readonly openExternal: (url: string) => Promise<void>;
};

type Connection = {
  readonly child: StreamingProcess;
  readonly session: McpSession;
  /** Resolves once the handshake is done and the tool is known to exist. */
  readonly ready: Promise<void>;
};

export class ViewerService {
  private readonly deps: ViewerServiceDeps;
  private connection: Connection | null = null;
  /** Criterion 20: two clicks land on one child, and on one answer. */
  private inFlight: Promise<Result<{ url: string }>> | null = null;
  private disposed = false;

  constructor(deps: ViewerServiceDeps) {
    this.deps = deps;
  }

  /** Criterion 14's order: the configured path, `PATH`, then where the Maestro
   * installer puts it. */
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

  /** Opens the Viewer for whatever device Maestro is talking to. Everything
   * that can go wrong comes back as a code the panel can name. */
  open(): Promise<Result<{ url: string }>> {
    this.inFlight ??= this.openOnce().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  /** Criterion 22 — no JVM survives `before-quit`. */
  dispose(): void {
    this.disposed = true;
    this.connection?.child.kill();
    this.connection = null;
  }

  private async openOnce(): Promise<Result<{ url: string }>> {
    if (this.disposed) {
      return failure(ERROR_CODES.viewerStartFailed, 'Conductor is shutting down.');
    }

    let connection: Connection;
    try {
      connection = this.connect();
      await connection.ready;
    } catch (error) {
      // A handshake that failed leaves nothing worth keeping: drop the child so
      // the next click starts clean rather than talking to a corpse.
      this.connection?.child.kill();
      this.connection = null;
      return failure(startCode(error), message(error));
    }

    let answer: string;
    try {
      answer = await connection.session.callTool(VIEWER_TOOL, {});
    } catch (error) {
      return failure(ERROR_CODES.viewerCallFailed, message(error));
    }

    const url = trustedUrl(answer);
    if (url === null) {
      return failure(
        ERROR_CODES.viewerUntrustedUrl,
        `The Viewer URL was not a local address. Maestro answered: ${answer}`,
      );
    }

    try {
      await this.deps.openExternal(url);
    } catch (error) {
      return failure(ERROR_CODES.viewerCallFailed, message(error));
    }
    return { ok: true, data: { url } };
  }

  /** One child per session, started on first use and remembered until it dies. */
  private connect(): Connection {
    if (this.connection !== null) {
      return this.connection;
    }

    const binary = this.resolve();
    if (binary === null) {
      throw new MaestroNotFoundError();
    }

    const child = this.deps.spawn(binary, ['mcp'], {
      // Rule 10 still binds this child. `--no-viewer`, which rule 10 also
      // names, is the one thing dropped here: it is the flag that removes the
      // Viewer, and the Viewer is what we are opening.
      env: { ...this.deps.env, MAESTRO_CLI_NO_ANALYTICS: '1' },
    });

    const session = (this.deps.connect ?? defaultConnect)(child);
    const connection: Connection = {
      child,
      session,
      ready: handshake(session),
    };
    // A JVM that died must not be reused: the next open starts a new one.
    child.onExit(() => {
      if (this.connection === connection) {
        this.connection = null;
      }
    });
    // Nothing awaits `ready` here, and an unobserved rejection would take the
    // process down; `openOnce` is where it is awaited and reported.
    connection.ready.catch(() => {});

    this.connection = connection;
    return connection;
  }
}

/** The handshake, plus the one thing `tools/list` is for (criterion 23). */
async function handshake(session: McpSession): Promise<void> {
  await session.initialize();
  const tools = await session.listTools();
  if (!tools.includes(VIEWER_TOOL)) {
    throw new ViewerToolMissingError();
  }
}

function defaultConnect(child: StreamingProcess): McpSession {
  return new McpClient({ transport: child, timeoutMs: REQUEST_TIMEOUT_MS });
}

class MaestroNotFoundError extends Error {
  readonly code = ERROR_CODES.maestroNotFound;

  constructor() {
    super(
      'The Maestro CLI is not installed. The device screen opens in Maestro’s own Viewer, which needs maestro 2.6.0 or newer.',
    );
    this.name = 'MaestroNotFoundError';
  }
}

class ViewerToolMissingError extends Error {
  readonly code = ERROR_CODES.viewerToolMissing;

  constructor() {
    super(
      `This Maestro CLI does not offer ${VIEWER_TOOL}. The Viewer needs maestro 2.6.0 or newer.`,
    );
    this.name = 'ViewerToolMissingError';
  }
}

/**
 * Criterion 21: the three ways starting can fail are three different fixes —
 * install Maestro, upgrade it, or find out why the JVM will not come up.
 */
function startCode(error: unknown): ErrorCode {
  if (error instanceof MaestroNotFoundError) {
    return ERROR_CODES.maestroNotFound;
  }
  if (error instanceof ViewerToolMissingError) {
    return ERROR_CODES.viewerToolMissing;
  }
  if (error instanceof McpTimeoutError) {
    return ERROR_CODES.viewerHandshakeTimeout;
  }
  return ERROR_CODES.viewerStartFailed;
}

/**
 * Criterion 18, and §9.3's rule about `shell.openExternal`: parse, then check
 * scheme and host. `new URL` is what makes `http://127.0.0.1@evil.example`
 * fail — its host is `evil.example`, whatever the string looks like.
 */
function trustedUrl(answer: string): string | null {
  const match = /https?:\/\/\S+/.exec(answer)?.[0];
  if (match === undefined) {
    return null;
  }
  // A URL at the end of a sentence carries the sentence's punctuation.
  const candidate = match.replace(/[.,;:)\]}>"']+$/, '');

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return null;
  }
  if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    return null;
  }
  return url.href;
}

function message(error: unknown): string {
  if (error instanceof McpProtocolError || error instanceof Error) {
    return error.message;
  }
  return 'The Maestro Viewer could not be opened.';
}

function failure(code: ErrorCode, detail: string): Result<never> {
  return { ok: false, error: { code, message: detail } };
}

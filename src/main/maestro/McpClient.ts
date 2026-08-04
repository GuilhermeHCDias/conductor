import type { ExitReason } from '../process/run';

/**
 * A JSON-RPC client speaking MCP over a child's stdio.
 *
 * It exists because there is no other supported way to reach the Maestro Viewer
 * URL: the transport is stdio-only, the port is undocumented, and the URL is
 * returned by a tool. That makes the UI an MCP client — a deliberate carve-out
 * in `.context.md` §12 rule 11, and the reason this client is as small as it
 * is. It knows how to hand shake, list tool names and call one tool. It has no
 * notion of what the tools do, and it is not, and must not become, the AI
 * layer's MCP path (.context.md §4.3.7).
 *
 * The transport arrives injected and is a subset of `StreamingProcess`, so the
 * framing below is drivable from captured bytes with nothing installed.
 */

export type McpTransport = {
  write: (chunk: string) => void;
  onStdout: (listener: (chunk: string) => void) => void;
  onExit: (listener: (reason: ExitReason) => void) => void;
};

export type McpClientDeps = {
  readonly transport: McpTransport;
  /** How long any one request may wait. The first call pays a JVM cold start. */
  readonly timeoutMs: number;
};

/** The version of the spec this client speaks. */
const PROTOCOL_VERSION = '2025-06-18';

export class McpTimeoutError extends Error {
  constructor(
    readonly method: string,
    timeoutMs: number,
  ) {
    super(`The Maestro MCP server did not answer ${method} within ${timeoutMs}ms.`);
    this.name = 'McpTimeoutError';
  }
}

/** The child died — either now, or before the request was made. */
export class McpClosedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpClosedError';
  }
}

/** The server answered, and the answer was an error or was not usable. */
export class McpProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'McpProtocolError';
  }
}

type Pending = {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
};

export class McpClient {
  private readonly deps: McpClientDeps;
  private readonly pending = new Map<number, Pending>();
  /** Bytes read but not yet terminated by a newline. */
  private buffer = '';
  private nextId = 1;
  private closed: McpClosedError | null = null;

  constructor(deps: McpClientDeps) {
    this.deps = deps;
    deps.transport.onStdout((chunk) => {
      this.receive(chunk);
    });
    deps.transport.onExit((reason) => {
      this.settleClosed(reason);
    });
  }

  /** The `initialize` exchange, plus the notification the spec requires after
   * it. Nothing else may be sent until this resolves. */
  async initialize(): Promise<void> {
    await this.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'conductor', version: '0.1.0' },
    });
    this.notify('notifications/initialized');
  }

  /** The names only. Criterion 23: this is used to confirm one tool exists,
   * and for nothing else. */
  async listTools(): Promise<string[]> {
    const result = await this.request('tools/list', {});
    const tools = isRecord(result) && Array.isArray(result.tools) ? result.tools : [];
    return tools.flatMap((tool) =>
      isRecord(tool) && typeof tool.name === 'string' ? [tool.name] : [],
    );
  }

  /**
   * Calls one tool and returns its text content, joined. A tool that ran and
   * failed reports it *inside* the result rather than as a JSON-RPC error, so
   * reading only the envelope would call that a success.
   */
  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = await this.request('tools/call', { name, arguments: args });
    if (!isRecord(result)) {
      throw new McpProtocolError(`${name} returned no result.`);
    }

    const content = Array.isArray(result.content) ? result.content : [];
    const text = content
      .flatMap((block) =>
        isRecord(block) && block.type === 'text' && typeof block.text === 'string'
          ? [block.text]
          : [],
      )
      .join('\n');

    if (result.isError === true) {
      throw new McpProtocolError(`${name} failed. ${text}`.trim());
    }
    if (text === '') {
      throw new McpProtocolError(`${name} returned no text content.`);
    }
    return text;
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    if (this.closed !== null) {
      return Promise.reject(this.closed);
    }

    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new McpTimeoutError(method, this.deps.timeoutMs));
      }, this.deps.timeoutMs);
      // A timer that outlives its request would hold the event loop — and main
      // holds this client for the whole session.
      timer.unref?.();

      this.pending.set(id, { resolve, reject, timer });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private notify(method: string): void {
    // No id: nothing waits on a notification, and giving it one would leave a
    // pending entry no response ever clears.
    this.send({ jsonrpc: '2.0', method });
  }

  private send(message: Record<string, unknown>): void {
    this.deps.transport.write(`${JSON.stringify(message)}\n`);
  }

  /**
   * Criterion 16. A read is not a message: MCP's stdio transport delimits with
   * newlines, so bytes accumulate until one arrives, and a single read may
   * carry several messages or none.
   */
  private receive(chunk: string): void {
    this.buffer += chunk;

    let newline = this.buffer.indexOf('\n');
    while (newline !== -1) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      if (line !== '') {
        this.dispatch(line);
      }
      newline = this.buffer.indexOf('\n');
    }
  }

  private dispatch(line: string): void {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      // The child is a JVM, and a JVM writes to stdout. A line that is not a
      // message is not an error — it is somebody else's log.
      return;
    }
    if (!isRecord(message) || typeof message.id !== 'number') {
      // A notification, or a response to a request nobody is waiting on.
      return;
    }

    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);

    const error = message.error;
    if (isRecord(error)) {
      const detail = typeof error.message === 'string' ? error.message : 'unknown error';
      pending.reject(new McpProtocolError(detail));
      return;
    }
    pending.resolve(message.result);
  }

  private settleClosed(reason: ExitReason): void {
    this.closed = new McpClosedError(
      reason.error === null
        ? `The Maestro MCP server exited (${reason.code ?? 'signalled'}).`
        : `The Maestro MCP server could not be started. ${reason.error.message}`,
    );
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(this.closed);
      this.pending.delete(id);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

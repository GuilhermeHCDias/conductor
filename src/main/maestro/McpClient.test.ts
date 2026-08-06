import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExitReason } from '../process/run';
import { McpClient, McpClosedError, McpProtocolError, McpTimeoutError } from './McpClient';

/**
 * Framing is where a stdio JSON-RPC client goes wrong, and none of it needs
 * `maestro` installed: every test drives the client from bytes it would have
 * read off the child's stdout. The traps, in order of how quietly they bite —
 * a message split across two reads, two messages in one read, a JVM log line
 * where a message was expected, and a response arriving for a request that is
 * no longer waiting.
 */

type Fake = {
  readonly written: string[];
  /** Feeds bytes to the client exactly as a stdout chunk would arrive. */
  readonly emit: (chunk: string) => void;
  readonly close: (reason?: ExitReason) => void;
  readonly client: McpClient;
};

function fake(timeoutMs = 5000): Fake {
  const written: string[] = [];
  let onStdout: (chunk: string) => void = () => {};
  let onExit: (reason: ExitReason) => void = () => {};

  const client = new McpClient({
    transport: {
      write: (chunk) => {
        written.push(chunk);
      },
      onStdout: (listener) => {
        onStdout = listener;
      },
      onExit: (listener) => {
        onExit = listener;
      },
    },
    timeoutMs,
  });

  return {
    written,
    emit: (chunk) => {
      onStdout(chunk);
    },
    close: (reason = { code: 0, error: null }) => {
      onExit(reason);
    },
    client,
  };
}

/** The requests the client has sent, parsed. */
function sent(written: readonly string[]): Array<Record<string, unknown>> {
  return written
    .join('')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

/** Answers whatever request is waiting, by its own id. */
function reply(f: Fake, index: number, result: unknown): void {
  const request = sent(f.written)[index];
  f.emit(`${JSON.stringify({ jsonrpc: '2.0', id: request?.id, result })}\n`);
}

const INITIALIZE_RESULT = {
  protocolVersion: '2025-06-18',
  capabilities: { tools: {} },
  serverInfo: { name: 'maestro', version: '2.6.0' },
};

/** Drives a client through the handshake and hands it back ready to use. */
async function handshaken(timeoutMs = 5000): Promise<Fake> {
  const f = fake(timeoutMs);
  const initializing = f.client.initialize();
  reply(f, 0, INITIALIZE_RESULT);
  await initializing;
  return f;
}

describe('the handshake', () => {
  /** Criterion 16. */
  it('sends a JSON-RPC initialize as a single newline-terminated line', async () => {
    const f = fake();
    const initializing = f.client.initialize();

    const [request] = sent(f.written);
    expect(request).toMatchObject({ jsonrpc: '2.0', method: 'initialize', id: expect.anything() });
    expect(f.written.join('')).toMatch(/\n$/);
    expect(f.written.join('').trimEnd()).not.toContain('\n');

    reply(f, 0, INITIALIZE_RESULT);
    await initializing;
  });

  it('declares a protocol version and a client', async () => {
    const f = fake();
    const initializing = f.client.initialize();

    expect(sent(f.written)[0]?.params).toMatchObject({
      protocolVersion: expect.any(String),
      clientInfo: { name: expect.any(String), version: expect.any(String) },
    });

    reply(f, 0, INITIALIZE_RESULT);
    await initializing;
  });

  // The spec's notification: the server may not answer a request until it has
  // arrived, and a notification carries no id, so nothing waits on it.
  it('follows the response with an initialized notification carrying no id', async () => {
    const f = await handshaken();

    const notification = sent(f.written)[1];
    expect(notification).toMatchObject({ jsonrpc: '2.0', method: 'notifications/initialized' });
    expect(notification).not.toHaveProperty('id');
  });

  it('reports a handshake that never answers as a timeout', async () => {
    vi.useFakeTimers();
    const f = fake(1000);

    const initializing = f.client.initialize();
    const settled = expect(initializing).rejects.toBeInstanceOf(McpTimeoutError);
    await vi.advanceTimersByTimeAsync(1001);

    await settled;
  });

  it('names the method it timed out on', async () => {
    vi.useFakeTimers();
    const f = fake(1000);

    const initializing = f.client.initialize();
    const settled = expect(initializing).rejects.toMatchObject({ method: 'initialize' });
    await vi.advanceTimersByTimeAsync(1001);

    await settled;
  });
});

describe('framing', () => {
  /** One message arriving in pieces — the read boundary is not a message boundary. */
  it('reassembles a message split across three reads', async () => {
    const f = fake();
    const initializing = f.client.initialize();
    const id = sent(f.written)[0]?.id;
    const message = JSON.stringify({ jsonrpc: '2.0', id, result: INITIALIZE_RESULT });

    f.emit(message.slice(0, 10));
    f.emit(message.slice(10, 40));
    f.emit(`${message.slice(40)}\n`);

    await expect(initializing).resolves.toBeUndefined();
  });

  it('reads two messages delivered in one chunk', async () => {
    const f = await handshaken();
    const listing = f.client.listTools();
    const calling = f.client.callTool('open_maestro_viewer', {});
    const [, , list, call] = sent(f.written);

    f.emit(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: list?.id,
        result: { tools: [{ name: 'open_maestro_viewer' }] },
      })}\n${JSON.stringify({
        jsonrpc: '2.0',
        id: call?.id,
        result: { content: [{ type: 'text', text: 'http://127.0.0.1:9999' }] },
      })}\n`,
    );

    await expect(listing).resolves.toEqual(['open_maestro_viewer']);
    await expect(calling).resolves.toBe('http://127.0.0.1:9999');
  });

  /** Criterion 17's real hazard: a JVM writes to stdout, and not in JSON. */
  it('ignores a log line where a message was expected', async () => {
    const f = fake();
    const initializing = f.client.initialize();

    f.emit('SLF4J: Defaulting to no-operation (NOP) logger implementation\n');
    reply(f, 0, INITIALIZE_RESULT);

    await expect(initializing).resolves.toBeUndefined();
  });

  it('ignores a blank line between messages', async () => {
    const f = fake();
    const initializing = f.client.initialize();

    f.emit('\n\n');
    reply(f, 0, INITIALIZE_RESULT);

    await expect(initializing).resolves.toBeUndefined();
  });

  // A server-initiated notification has no id. Treating it as a response would
  // resolve whichever request happened to be first in the map.
  it('ignores a notification arriving while a request is in flight', async () => {
    const f = fake();
    const initializing = f.client.initialize();

    f.emit(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/message' })}\n`);
    reply(f, 0, INITIALIZE_RESULT);

    await expect(initializing).resolves.toBeUndefined();
  });

  it('ignores a response for an id nobody is waiting on', async () => {
    const f = fake();
    const initializing = f.client.initialize();

    f.emit(`${JSON.stringify({ jsonrpc: '2.0', id: 9999, result: { tools: [] } })}\n`);
    reply(f, 0, INITIALIZE_RESULT);

    await expect(initializing).resolves.toBeUndefined();
  });

  /** Ids are the only thing that pairs a response to its request. */
  it('matches responses by id when they come back out of order', async () => {
    const f = await handshaken();
    const first = f.client.listTools();
    const second = f.client.callTool('open_maestro_viewer', {});
    const [, , listRequest, callRequest] = sent(f.written);

    f.emit(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: callRequest?.id,
        result: { content: [{ type: 'text', text: 'http://127.0.0.1:7070' }] },
      })}\n`,
    );
    f.emit(`${JSON.stringify({ jsonrpc: '2.0', id: listRequest?.id, result: { tools: [] } })}\n`);

    await expect(second).resolves.toBe('http://127.0.0.1:7070');
    await expect(first).resolves.toEqual([]);
  });

  it('gives every request its own id', async () => {
    const f = await handshaken();
    void f.client.listTools();
    void f.client.listTools();

    const ids = sent(f.written).map((request) => request.id);

    expect(new Set(ids.filter((id) => id !== undefined)).size).toBe(3);
  });
});

describe('errors from the server', () => {
  it('rejects a request the server answered with an error object', async () => {
    const f = await handshaken();
    const calling = f.client.callTool('open_maestro_viewer', {});
    const request = sent(f.written)[2];

    f.emit(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: request?.id,
        error: { code: -32601, message: 'Method not found' },
      })}\n`,
    );

    await expect(calling).rejects.toMatchObject({ message: expect.stringContaining('not found') });
  });

  // MCP reports a tool that ran and failed inside the result, not as a
  // JSON-RPC error. Reading only the envelope would call that a success.
  it('rejects a tool result flagged isError', async () => {
    const f = await handshaken();
    const calling = f.client.callTool('open_maestro_viewer', {});
    const request = sent(f.written)[2];

    f.emit(
      `${JSON.stringify({
        jsonrpc: '2.0',
        id: request?.id,
        result: { content: [{ type: 'text', text: 'no device connected' }], isError: true },
      })}\n`,
    );

    await expect(calling).rejects.toBeInstanceOf(McpProtocolError);
  });

  it('rejects a tool result carrying no text content', async () => {
    const f = await handshaken();
    const calling = f.client.callTool('open_maestro_viewer', {});
    const request = sent(f.written)[2];

    f.emit(`${JSON.stringify({ jsonrpc: '2.0', id: request?.id, result: { content: [] } })}\n`);

    await expect(calling).rejects.toBeInstanceOf(McpProtocolError);
  });

  /** A child that died takes every request waiting on it with it. */
  it('rejects everything in flight when the child exits', async () => {
    const f = await handshaken();
    const listing = f.client.listTools();
    const calling = f.client.callTool('open_maestro_viewer', {});

    f.close({ code: 1, error: null });

    await expect(listing).rejects.toBeInstanceOf(McpClosedError);
    await expect(calling).rejects.toBeInstanceOf(McpClosedError);
  });

  it('refuses a request made after the child exited rather than hanging', async () => {
    const f = await handshaken();
    f.close();

    await expect(f.client.listTools()).rejects.toBeInstanceOf(McpClosedError);
  });
});

describe('tools', () => {
  it('lists the names the server announces', async () => {
    const f = await handshaken();
    const listing = f.client.listTools();

    reply(f, 2, {
      tools: [
        { name: 'list_devices', description: 'x' },
        { name: 'open_maestro_viewer', description: 'Returns the running Viewer URL' },
      ],
    });

    await expect(listing).resolves.toEqual(['list_devices', 'open_maestro_viewer']);
  });

  it('calls a tool by name, with its arguments', async () => {
    const f = await handshaken();
    void f.client.callTool('open_maestro_viewer', { deviceId: 'R9QYC01EMXL' });

    expect(sent(f.written)[2]).toMatchObject({
      method: 'tools/call',
      params: { name: 'open_maestro_viewer', arguments: { deviceId: 'R9QYC01EMXL' } },
    });
  });

  it('joins the text blocks of a result and ignores the rest', async () => {
    const f = await handshaken();
    const calling = f.client.callTool('open_maestro_viewer', {});

    reply(f, 2, {
      content: [
        { type: 'text', text: 'Viewer running at' },
        { type: 'image', data: 'ignored' },
        { type: 'text', text: 'http://127.0.0.1:9999' },
      ],
    });

    await expect(calling).resolves.toBe('Viewer running at\nhttp://127.0.0.1:9999');
  });

  it('reports a call that never answers as a timeout', async () => {
    vi.useFakeTimers();
    const f = await handshaken(1000);

    const calling = f.client.callTool('open_maestro_viewer', {});
    const settled = expect(calling).rejects.toMatchObject({ method: 'tools/call' });
    await vi.advanceTimersByTimeAsync(1001);

    await settled;
  });
});

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

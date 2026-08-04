import { describe, expect, it, vi } from 'vitest';
import { McpClosedError, McpProtocolError, McpTimeoutError } from '../maestro/McpClient';
import type { ExitReason, SpawnOptions, StreamingProcess } from '../process/run';
import { type McpSession, VIEWER_TOOL, ViewerService } from './viewer.service';

/**
 * Everything below runs with no `maestro` installed, which is the state of the
 * machine this was written on. The child, the MCP session and `openExternal`
 * are all fakes; what is under test is the lifecycle around them — one child,
 * reused, disposed, and a URL that is validated before anything opens it.
 */

const VIEWER_URL = 'http://127.0.0.1:9999/';

type Spawned = {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: SpawnOptions;
  readonly killed: () => boolean;
  /** Fires the child's exit listeners, as a dying JVM would. */
  readonly exit: (reason?: ExitReason) => void;
};

type Harness = {
  readonly service: ViewerService;
  readonly spawns: Spawned[];
  readonly opened: string[];
  readonly session: McpSession & { calls: Array<{ name: string; args: unknown }> };
  readonly listCalls: () => number;
};

function makeService(
  overrides: {
    session?: Partial<McpSession>;
    executable?: readonly string[];
    env?: NodeJS.ProcessEnv;
    configuredPath?: string;
    tools?: string[];
    openExternal?: (url: string) => Promise<void>;
  } = {},
): Harness {
  const spawns: Spawned[] = [];
  const opened: string[] = [];
  const calls: Array<{ name: string; args: unknown }> = [];
  let listCalls = 0;

  const session: McpSession & { calls: typeof calls } = {
    calls,
    initialize: overrides.session?.initialize ?? (() => Promise.resolve()),
    listTools:
      overrides.session?.listTools ??
      (() => {
        listCalls += 1;
        return Promise.resolve(overrides.tools ?? ['list_devices', VIEWER_TOOL]);
      }),
    callTool:
      overrides.session?.callTool ??
      ((name, args) => {
        calls.push({ name, args });
        return Promise.resolve(`Viewer running at ${VIEWER_URL}`);
      }),
  };

  const executable = new Set(overrides.executable ?? ['/Users/someone/.maestro/bin/maestro']);

  const service = new ViewerService({
    spawn: (command, args, options) => {
      let killed = false;
      let onExit: (reason: ExitReason) => void = () => {};
      const child: StreamingProcess = {
        write: () => {},
        onStdout: () => {},
        onStderr: () => {},
        onExit: (listener) => {
          onExit = listener;
        },
        kill: () => {
          killed = true;
        },
      };
      spawns.push({
        command,
        args,
        options,
        killed: () => killed,
        exit: (reason = { code: 1, error: null }) => {
          onExit(reason);
        },
      });
      return child;
    },
    connect: () => session,
    isExecutable: (path) => executable.has(path),
    env: overrides.env ?? {},
    home: '/Users/someone',
    configuredPath: overrides.configuredPath ?? '',
    openExternal:
      overrides.openExternal ??
      ((url) => {
        opened.push(url);
        return Promise.resolve();
      }),
  });

  return { service, spawns, opened, session, listCalls: () => listCalls };
}

describe('resolving the maestro binary', () => {
  /** Criterion 14, in order. */
  it('prefers CONFIG.MAESTRO_PATH', async () => {
    const h = makeService({
      configuredPath: '/custom/maestro',
      executable: ['/custom/maestro', '/usr/local/bin/maestro'],
      env: { PATH: '/usr/local/bin' },
    });

    await h.service.open();

    expect(h.spawns[0]?.command).toBe('/custom/maestro');
  });

  it('falls back to maestro on PATH', async () => {
    const h = makeService({
      executable: ['/usr/local/bin/maestro', '/Users/someone/.maestro/bin/maestro'],
      env: { PATH: '/usr/local/bin' },
    });

    await h.service.open();

    expect(h.spawns[0]?.command).toBe('/usr/local/bin/maestro');
  });

  it('falls back to the maestro installer’s own location', async () => {
    const h = makeService({ executable: ['/Users/someone/.maestro/bin/maestro'], env: {} });

    await h.service.open();

    expect(h.spawns[0]?.command).toBe('/Users/someone/.maestro/bin/maestro');
  });

  /** Criteria 14 and 21 — the prerequisite has its own code. */
  it('reports maestro-not-found without spawning anything', async () => {
    const h = makeService({ executable: [] });

    await expect(h.service.open()).resolves.toEqual({
      ok: false,
      error: { code: 'viewer/maestro-not-found', message: expect.any(String) },
    });
    expect(h.spawns).toHaveLength(0);
  });
});

describe('the maestro mcp child', () => {
  /** Criterion 15. */
  it('starts `maestro mcp`', async () => {
    const h = makeService();

    await h.service.open();

    expect(h.spawns[0]?.args).toEqual(['mcp']);
  });

  /** .context.md §12 rule 10 — still binding on this child. */
  it('carries MAESTRO_CLI_NO_ANALYTICS=1', async () => {
    const h = makeService();

    await h.service.open();

    expect(h.spawns[0]?.options.env).toMatchObject({ MAESTRO_CLI_NO_ANALYTICS: '1' });
  });

  /**
   * The one flag rule 10 stops applying to, and the reason the whole spec
   * exists: `--no-viewer` is what deletes the feature being opened.
   */
  it('does not pass --no-viewer', async () => {
    const h = makeService();

    await h.service.open();

    expect(h.spawns[0]?.args).not.toContain('--no-viewer');
  });

  /** Criterion 20 — the JVM cold start is paid once per session, not per click. */
  it('reuses the one child across repeated opens', async () => {
    const h = makeService();

    await h.service.open();
    await h.service.open();
    await h.service.open();

    expect(h.spawns).toHaveLength(1);
  });

  it('serialises concurrent opens onto one child', async () => {
    const h = makeService();

    const [first, second] = await Promise.all([h.service.open(), h.service.open()]);

    expect(h.spawns).toHaveLength(1);
    expect(first).toEqual(second);
  });

  it('hands the handshake exactly one turn, not one per open', async () => {
    const initialize = vi.fn(() => Promise.resolve());
    const h = makeService({ session: { initialize } });

    await h.service.open();
    await h.service.open();

    expect(initialize).toHaveBeenCalledTimes(1);
  });

  // A JVM that died takes the session with it; the next click has to be able to
  // bring one back rather than talking to a corpse forever.
  it('starts a fresh child after the previous one exited', async () => {
    const h = makeService();

    await h.service.open();
    h.spawns[0]?.exit();
    await h.service.open();

    expect(h.spawns).toHaveLength(2);
  });
});

describe('asking for the URL', () => {
  /** Criteria 17 and 23. */
  it('calls open_maestro_viewer and nothing else', async () => {
    const h = makeService();

    await h.service.open();

    expect(h.session.calls.map((call) => call.name)).toEqual([VIEWER_TOOL]);
  });

  /** Criterion 21 — a CLI older than v2.6.0 does not announce the tool. */
  it('reports tool-missing when the server does not announce it', async () => {
    const h = makeService({ tools: ['list_devices', 'run'] });

    await expect(h.service.open()).resolves.toMatchObject({
      ok: false,
      error: { code: 'viewer/tool-missing' },
    });
    expect(h.session.calls).toEqual([]);
  });

  /** Criterion 23 — tools/list exists to confirm one tool, and is not re-asked. */
  it('confirms the tool once and not on every open', async () => {
    const h = makeService();

    await h.service.open();
    await h.service.open();

    expect(h.listCalls()).toBe(1);
  });

  it('takes the URL out of the sentence the tool answers with', async () => {
    const h = makeService();

    await expect(h.service.open()).resolves.toEqual({ ok: true, data: { url: VIEWER_URL } });
  });

  it('accepts a bare URL', async () => {
    const h = makeService({ session: { callTool: () => Promise.resolve(VIEWER_URL) } });

    await expect(h.service.open()).resolves.toEqual({ ok: true, data: { url: VIEWER_URL } });
  });

  // "The Viewer is at http://127.0.0.1:9999." — the sentence's full stop is not
  // part of the URL, and shell.openExternal would take it literally.
  it('does not carry trailing punctuation into the URL', async () => {
    const h = makeService({
      session: { callTool: () => Promise.resolve('Open it at http://127.0.0.1:9999/.') },
    });

    await expect(h.service.open()).resolves.toMatchObject({
      ok: true,
      data: { url: 'http://127.0.0.1:9999/' },
    });
  });
});

describe('validating the URL before anything opens it', () => {
  const rejects = async (text: string): Promise<void> => {
    const h = makeService({ session: { callTool: () => Promise.resolve(text) } });

    await expect(h.service.open()).resolves.toMatchObject({
      ok: false,
      error: { code: 'viewer/untrusted-url' },
    });
    expect(h.opened).toEqual([]);
  };

  /** Criterion 18 — §9.3: never pass unvalidated input to `shell.openExternal`. */
  it('refuses a host that is not the loopback', async () => {
    await rejects('http://evil.example/viewer');
  });

  it('refuses a scheme that is not http or https', async () => {
    await rejects('file:///etc/passwd');
  });

  it('refuses a URL dressed as loopback in its userinfo', async () => {
    await rejects('http://127.0.0.1@evil.example/viewer');
  });

  it('refuses text carrying no URL at all', async () => {
    await rejects('The Viewer could not be started.');
  });

  it('accepts localhost as well as 127.0.0.1', async () => {
    const h = makeService({
      session: { callTool: () => Promise.resolve('http://localhost:9999/') },
    });

    await expect(h.service.open()).resolves.toMatchObject({ ok: true });
  });
});

describe('opening it', () => {
  /** Criterion 19 — main opens it; the renderer never navigates anywhere. */
  it('hands the validated URL to openExternal', async () => {
    const h = makeService();

    await h.service.open();

    expect(h.opened).toEqual([VIEWER_URL]);
  });

  it('reports a browser that refused to open as a failure', async () => {
    const h = makeService({ openExternal: () => Promise.reject(new Error('no handler')) });

    await expect(h.service.open()).resolves.toMatchObject({
      ok: false,
      error: { code: 'viewer/call-failed' },
    });
  });
});

/** Criterion 21 — six conditions, six codes, so the panel can say which. */
describe('the failure codes', () => {
  it('reports a child that never started', async () => {
    const h = makeService({
      session: {
        initialize: () => Promise.reject(new McpClosedError('spawn ENOENT')),
      },
    });

    await expect(h.service.open()).resolves.toMatchObject({
      ok: false,
      error: { code: 'viewer/start-failed' },
    });
  });

  it('reports a handshake that timed out', async () => {
    const h = makeService({
      session: { initialize: () => Promise.reject(new McpTimeoutError('initialize', 30000)) },
    });

    await expect(h.service.open()).resolves.toMatchObject({
      ok: false,
      error: { code: 'viewer/handshake-timeout' },
    });
  });

  it('reports a call that failed', async () => {
    const h = makeService({
      session: { callTool: () => Promise.reject(new McpProtocolError('no device connected')) },
    });

    await expect(h.service.open()).resolves.toMatchObject({
      ok: false,
      error: { code: 'viewer/call-failed', message: expect.stringContaining('no device') },
    });
  });

  it('reports a call that timed out as a call failure, not a handshake one', async () => {
    const h = makeService({
      session: { callTool: () => Promise.reject(new McpTimeoutError('tools/call', 30000)) },
    });

    await expect(h.service.open()).resolves.toMatchObject({
      ok: false,
      error: { code: 'viewer/call-failed' },
    });
  });

  // A failed start must not poison the session: the person plugs the phone in
  // and clicks again, and that has to work.
  it('lets a later open succeed after one failed', async () => {
    let attempt = 0;
    const h = makeService({
      session: {
        callTool: () => {
          attempt += 1;
          return attempt === 1
            ? Promise.reject(new McpProtocolError('no device connected'))
            : Promise.resolve(VIEWER_URL);
        },
      },
    });

    await expect(h.service.open()).resolves.toMatchObject({ ok: false });
    await expect(h.service.open()).resolves.toMatchObject({ ok: true });
  });
});

/** Criterion 22 — `before-quit` leaves no JVM behind. */
describe('dispose', () => {
  it('kills the child it started', async () => {
    const h = makeService();
    await h.service.open();

    h.service.dispose();

    expect(h.spawns[0]?.killed()).toBe(true);
  });

  it('is safe when nothing was ever started', () => {
    const h = makeService();

    expect(() => {
      h.service.dispose();
    }).not.toThrow();
  });

  it('does not resurrect the child after disposal', async () => {
    const h = makeService();
    await h.service.open();
    h.service.dispose();

    await h.service.open();

    expect(h.spawns).toHaveLength(1);
  });
});

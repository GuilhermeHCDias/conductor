import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { McpClosedError, McpProtocolError, McpTimeoutError } from '../maestro/McpClient';
import type { ExitReason, SpawnOptions, StreamingProcess } from '../process/run';
import { INSPECT_TOOL, MaestroMcpService, type McpSession } from './maestro-mcp.service';

/**
 * Everything below runs with no `maestro` installed. The child and the MCP
 * session are fakes; what is under test is the lifecycle around them — one
 * child, handshaken once, reused for every call, and killed on quit.
 *
 * This service used to open the Maestro Viewer. It owns the app's one
 * persistent `maestro mcp` child now, because that is where the hierarchy comes
 * from: ~271ms through `inspect_screen` against ~3.83s for `maestro hierarchy`,
 * measured on this hardware. What survived the change is the lifecycle; what
 * went with it is the Viewer, the URL, and everything that trusted one.
 */

const DEVICE = 'R9QYC01EMXL';
const TREE = '{"ui_schema":{},"elements":[]}';

type Spawned = {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: SpawnOptions;
  readonly killed: () => boolean;
  /** Fires the child's exit listeners, as a dying JVM would. */
  readonly exit: (reason?: ExitReason) => void;
};

type Harness = {
  readonly service: MaestroMcpService;
  readonly spawns: Spawned[];
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
  } = {},
): Harness {
  const spawns: Spawned[] = [];
  const calls: Array<{ name: string; args: unknown }> = [];
  let listCalls = 0;

  const session: McpSession & { calls: typeof calls } = {
    calls,
    initialize: overrides.session?.initialize ?? (() => Promise.resolve()),
    listTools:
      overrides.session?.listTools ??
      (() => {
        listCalls += 1;
        return Promise.resolve(overrides.tools ?? ['list_devices', INSPECT_TOOL]);
      }),
    callTool:
      overrides.session?.callTool ??
      ((name, args) => {
        calls.push({ name, args });
        return Promise.resolve(TREE);
      }),
  };

  const executable = new Set(overrides.executable ?? ['/Users/someone/.maestro/bin/maestro']);

  const service = new MaestroMcpService({
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
  });

  return { service, spawns, session, listCalls: () => listCalls };
}

/** Unchanged by the repurposing: `CONFIG.MAESTRO_PATH` is still the override. */
describe('resolving the maestro binary', () => {
  it('prefers CONFIG.MAESTRO_PATH', async () => {
    const h = makeService({
      configuredPath: '/custom/maestro',
      executable: ['/custom/maestro', '/usr/local/bin/maestro'],
      env: { PATH: '/usr/local/bin' },
    });

    await h.service.inspectScreen(DEVICE);

    expect(h.spawns[0]?.command).toBe('/custom/maestro');
  });

  it('falls back to maestro on PATH', async () => {
    const h = makeService({
      executable: ['/usr/local/bin/maestro', '/Users/someone/.maestro/bin/maestro'],
      env: { PATH: '/usr/local/bin' },
    });

    await h.service.inspectScreen(DEVICE);

    expect(h.spawns[0]?.command).toBe('/usr/local/bin/maestro');
  });

  it('falls back to the maestro installer’s own location', async () => {
    const h = makeService({ executable: ['/Users/someone/.maestro/bin/maestro'], env: {} });

    await h.service.inspectScreen(DEVICE);

    expect(h.spawns[0]?.command).toBe('/Users/someone/.maestro/bin/maestro');
  });

  it('reports maestro-not-found without spawning anything', async () => {
    const h = makeService({ executable: [] });

    await expect(h.service.inspectScreen(DEVICE)).rejects.toMatchObject({
      code: 'mcp/maestro-not-found',
    });
    expect(h.spawns).toHaveLength(0);
  });
});

describe('the maestro mcp child', () => {
  it('starts `maestro mcp`', async () => {
    const h = makeService();

    await h.service.inspectScreen(DEVICE);

    expect(h.spawns[0]?.args[0]).toBe('mcp');
  });

  /**
   * Criterion 18. `--no-viewer` is back: §12 rule 10's normal case, dropped only
   * while this service existed to open the very thing the flag removes. Nothing
   * in this app opens a viewer URL any more, so the flag costs nothing and
   * keeps a browser from being launched behind the person's back.
   */
  it('passes --no-viewer', async () => {
    const h = makeService();

    await h.service.inspectScreen(DEVICE);

    expect(h.spawns[0]?.args).toEqual(['mcp', '--no-viewer']);
  });

  /** §12 rule 10 — still binding on this child. */
  it('carries MAESTRO_CLI_NO_ANALYTICS=1', async () => {
    const h = makeService();

    await h.service.inspectScreen(DEVICE);

    expect(h.spawns[0]?.options.env).toMatchObject({ MAESTRO_CLI_NO_ANALYTICS: '1' });
  });

  /**
   * Criterion 19, and the whole reason hierarchy moved here: the JVM cold start
   * is paid once per session. Measured on this hardware, the first
   * `inspect_screen` costs ~5.6s and every one after it ~180ms — a session that
   * respawned would pay the 5.6s every time and be slower than the CLI it
   * replaced.
   */
  it('reuses the one child across repeated calls', async () => {
    const h = makeService();

    await h.service.inspectScreen(DEVICE);
    await h.service.inspectScreen(DEVICE);
    await h.service.inspectScreen(DEVICE);

    expect(h.spawns).toHaveLength(1);
  });

  it('hands the handshake exactly one turn, not one per call', async () => {
    const initialize = vi.fn(() => Promise.resolve());
    const h = makeService({ session: { initialize } });

    await h.service.inspectScreen(DEVICE);
    await h.service.inspectScreen(DEVICE);

    expect(initialize).toHaveBeenCalledTimes(1);
  });

  it('serialises concurrent calls onto one child', async () => {
    const h = makeService();

    await Promise.all([h.service.inspectScreen(DEVICE), h.service.inspectScreen(DEVICE)]);

    expect(h.spawns).toHaveLength(1);
  });

  /**
   * Two calls are two questions about a screen that moves, so they get two
   * answers — unlike the Viewer's URL, which was one fact and was deduplicated
   * onto one in-flight promise. Replaying here would hand back a tree of a
   * screen the person has already navigated away from.
   */
  it('asks again rather than replaying the first answer', async () => {
    let screen = 0;
    const h = makeService({
      session: {
        callTool: () => {
          screen += 1;
          return Promise.resolve(`screen ${screen}`);
        },
      },
    });

    await expect(h.service.inspectScreen(DEVICE)).resolves.toBe('screen 1');
    await expect(h.service.inspectScreen(DEVICE)).resolves.toBe('screen 2');
  });

  // A JVM that died takes the session with it; the next call has to bring one
  // back rather than talking to a corpse forever.
  it('starts a fresh child after the previous one exited', async () => {
    const h = makeService();

    await h.service.inspectScreen(DEVICE);
    h.spawns[0]?.exit();
    await h.service.inspectScreen(DEVICE);

    expect(h.spawns).toHaveLength(2);
  });

  /**
   * ⚠️ A failed handshake drops "the child", and which child that is has to be
   * decided by identity, not by whatever is in the slot when the rejection
   * lands. The old child can die and be replaced by a healthy one while the
   * first call is still waiting — killing the slot's current occupant then
   * takes down a JVM that never failed, and the caller who started it gets a
   * corpse for no reason.
   */
  it('leaves a healthy newer child alone when an older handshake fails', async () => {
    const gates: Array<{ resolve: () => void; reject: (error: Error) => void }> = [];
    const h = makeService({
      session: {
        initialize: () =>
          new Promise<void>((resolve, reject) => {
            gates.push({ resolve, reject });
          }),
      },
    });

    const stalled = h.service.inspectScreen(DEVICE);
    // The first JVM dies; the service forgets it, exactly as above.
    h.spawns[0]?.exit();

    // A second call brings up a fresh child, and this one hand shakes fine.
    const healthy = h.service.inspectScreen(DEVICE);
    gates[1]?.resolve();
    await expect(healthy).resolves.toBe(TREE);

    // Only now does the first call's handshake give up.
    gates[0]?.reject(new Error('the first JVM never answered'));
    await expect(stalled).rejects.toMatchObject({ code: 'mcp/start-failed' });

    expect(h.spawns).toHaveLength(2);
    expect(h.spawns[1]?.killed()).toBe(false);
  });
});

describe('asking for the screen', () => {
  /** Criterion 17. */
  it('calls inspect_screen and nothing else', async () => {
    const h = makeService();

    await h.service.inspectScreen(DEVICE);

    expect(h.session.calls.map((call) => call.name)).toEqual([INSPECT_TOOL]);
  });

  /**
   * ⚠️ `device_id`, in snake_case. Confirmed against the server while scoping —
   * a call passing `deviceId` was rejected. Nothing about that failure says
   * "wrong case", so this assertion is what stands between a rename and an
   * afternoon.
   */
  it('names the device as device_id, not deviceId', async () => {
    const h = makeService();

    await h.service.inspectScreen(DEVICE);

    expect(h.session.calls[0]?.args).toEqual({ device_id: DEVICE });
  });

  /** §10.1 rule 3 — an opaque token, passed through and never parsed. */
  it('passes an opaque device id straight through', async () => {
    const h = makeService();

    await h.service.inspectScreen('session:7f3a-remote');

    expect(h.session.calls[0]?.args).toEqual({ device_id: 'session:7f3a-remote' });
  });

  /** Criterion 17 — the tool's raw text, for `HierarchyParser` to read. This
   * service does not parse, and must not start. */
  it('returns the tool’s answer untouched', async () => {
    const h = makeService();

    await expect(h.service.inspectScreen(DEVICE)).resolves.toBe(TREE);
  });

  /** A CLI too old to offer the tool is a different fix from a CLI that is
   * missing, so it is a different code. */
  it('reports tool-missing when the server does not announce it', async () => {
    const h = makeService({ tools: ['list_devices', 'run'] });

    await expect(h.service.inspectScreen(DEVICE)).rejects.toMatchObject({
      code: 'mcp/tool-missing',
    });
    expect(h.session.calls).toEqual([]);
  });

  it('confirms the tool once and not on every call', async () => {
    const h = makeService();

    await h.service.inspectScreen(DEVICE);
    await h.service.inspectScreen(DEVICE);

    expect(h.listCalls()).toBe(1);
  });
});

/** Criterion 22 — the codes describe the MCP session now, not a viewer. */
describe('the failure codes', () => {
  it('reports a child that never started', async () => {
    const h = makeService({
      session: { initialize: () => Promise.reject(new McpClosedError('spawn ENOENT')) },
    });

    await expect(h.service.inspectScreen(DEVICE)).rejects.toMatchObject({
      code: 'mcp/start-failed',
    });
  });

  it('reports a handshake that timed out', async () => {
    const h = makeService({
      session: { initialize: () => Promise.reject(new McpTimeoutError('initialize', 30000)) },
    });

    await expect(h.service.inspectScreen(DEVICE)).rejects.toMatchObject({
      code: 'mcp/handshake-timeout',
    });
  });

  it('reports a call that failed', async () => {
    const h = makeService({
      session: { callTool: () => Promise.reject(new McpProtocolError('no device connected')) },
    });

    await expect(h.service.inspectScreen(DEVICE)).rejects.toMatchObject({
      code: 'mcp/call-failed',
      message: expect.stringContaining('no device'),
    });
  });

  it('reports a call that timed out as a call failure, not a handshake one', async () => {
    const h = makeService({
      session: { callTool: () => Promise.reject(new McpTimeoutError('tools/call', 30000)) },
    });

    await expect(h.service.inspectScreen(DEVICE)).rejects.toMatchObject({
      code: 'mcp/call-failed',
    });
  });

  /** Every code this service can produce says `mcp/`. A `viewer/` prefix on a
   * service that no longer serves one is the wart criterion 22 removes. */
  it('names no failure after the viewer', async () => {
    const cases = [
      makeService({ executable: [] }),
      makeService({ tools: [] }),
      makeService({ session: { callTool: () => Promise.reject(new Error('boom')) } }),
    ];

    for (const h of cases) {
      await expect(h.service.inspectScreen(DEVICE)).rejects.toMatchObject({
        code: expect.stringMatching(/^mcp\//),
      });
    }
  });

  // A failed call must not poison the session: the person plugs the phone in
  // and asks again, and that has to work.
  it('lets a later call succeed after one failed', async () => {
    let attempt = 0;
    const h = makeService({
      session: {
        callTool: () => {
          attempt += 1;
          return attempt === 1
            ? Promise.reject(new McpProtocolError('no device connected'))
            : Promise.resolve(TREE);
        },
      },
    });

    await expect(h.service.inspectScreen(DEVICE)).rejects.toThrow();
    await expect(h.service.inspectScreen(DEVICE)).resolves.toBe(TREE);
  });
});

/** Criterion 20 — `before-quit` leaves no JVM behind, unchanged from before. */
describe('dispose', () => {
  it('kills the child it started', async () => {
    const h = makeService();
    await h.service.inspectScreen(DEVICE);

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
    await h.service.inspectScreen(DEVICE);
    h.service.dispose();

    await expect(h.service.inspectScreen(DEVICE)).rejects.toThrow();
    expect(h.spawns).toHaveLength(1);
  });
});

/**
 * Criterion 21. The Viewer is gone from the app, so its whole surface is gone
 * from here: the tool, the URL check, and the `openExternal` this module was
 * given to call. What remains cannot open anything.
 */
describe('what the repurposing removed', () => {
  const source = readFileSync(resolve('src/main/services/maestro-mcp.service.ts'), 'utf8');

  it('no longer calls open_maestro_viewer', () => {
    expect(source).not.toContain('open_maestro_viewer');
  });

  it('no longer opens anything externally', () => {
    expect(source).not.toContain('openExternal');
  });

  /** §9.3's rule about `shell.openExternal` had a URL validator behind it.
   * There is no URL to trust once nothing opens one, so it goes too — an unused
   * validator is a thing that gets reused wrongly later. */
  it('no longer validates a URL', () => {
    expect(source).not.toMatch(/trustedUrl|127\.0\.0\.1|localhost/);
  });

  it('exposes no way to open a viewer', () => {
    const h = makeService();

    expect((h.service as unknown as { open?: unknown }).open).toBeUndefined();
  });
});

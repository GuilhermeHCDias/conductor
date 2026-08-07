import { describe, expect, it } from 'vitest';
import type { ExitReason, StreamingProcess } from '../process/run';
import type { MaestroMcpService } from '../services/maestro-mcp.service';
import type { AdbBridge } from './AdbBridge';
import type { CliRunner } from './CliRunner';
import { HierarchyParseError } from './HierarchyParser';
import { LocalGateway } from './LocalGateway';
import type { MirrorHandlers, MirrorSession, RunProgress } from './MaestroGateway';
import type { ScrcpySource } from './ScrcpySource';
import type { ScreenCapture } from './ScreenCapture';

/**
 * Delegation, and the seam that matters: every device capability arrives through
 * this one class, so the day execution moves to a remote runner there is exactly
 * one implementation to write beside it (.context.md §10.1).
 *
 * Every collaborator is a fake. What is asserted is that the Gateway routes and
 * adds nothing — a Gateway that started parsing would be the leak §10.1 exists
 * to prevent.
 */

const SESSION: MirrorSession = {
  deviceName: 'SM-A075M',
  codec: 'h264',
  width: 464,
  height: 1024,
  control: true,
  send: () => Promise.resolve(),
  stop: () => Promise.resolve(),
};

const HANDLERS: MirrorHandlers = { onPacket: () => {}, onEnded: () => {} };

/** One element, in the shape `inspect_screen` really answers with. */
const TREE = JSON.stringify({
  ui_schema: {
    abbreviations: { b: 'bounds', txt: 'text', cls: 'class', c: 'children' },
    defaults: { enabled: true, clickable: false, txt: '', cls: '' },
  },
  elements: [{ b: '[0,0][1080,2340]', cls: 'android.widget.FrameLayout', clickable: true }],
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** A child whose stdio the test drives by hand, chunk by chunk. */
function scriptedChild(): {
  child: StreamingProcess;
  emitStdout: (chunk: string) => void;
  emitStderr: (chunk: string) => void;
  emitExit: (reason: ExitReason) => void;
  killed: () => boolean;
} {
  let stdout: (chunk: string) => void = () => {};
  let stderr: (chunk: string) => void = () => {};
  let exit: (reason: ExitReason) => void = () => {};
  let killed = false;
  return {
    child: {
      write: () => {},
      onStdout: (listener) => {
        stdout = listener;
      },
      onStderr: (listener) => {
        stderr = listener;
      },
      onExit: (listener) => {
        exit = listener;
      },
      kill: () => {
        killed = true;
      },
    },
    emitStdout: (chunk) => stdout(chunk),
    emitStderr: (chunk) => stderr(chunk),
    emitExit: (reason) => exit(reason),
    killed: () => killed,
  };
}

function gateway(overrides: { tree?: string; capture?: () => Promise<Buffer> } = {}): {
  gateway: LocalGateway;
  calls: Array<{ method: string; args: readonly unknown[] }>;
  emitStdout: (chunk: string) => void;
  emitStderr: (chunk: string) => void;
  emitExit: (reason: ExitReason) => void;
  killed: () => boolean;
} {
  const calls: Array<{ method: string; args: readonly unknown[] }> = [];
  const record =
    (method: string, result: unknown) =>
    (...args: readonly unknown[]): Promise<unknown> => {
      calls.push({ method, args });
      return Promise.resolve(result);
    };

  const adb = {
    listDevices: record('listDevices', []),
    properties: record('properties', { model: null, release: null, size: null, density: null }),
    appIdentity: record('appIdentity', {
      appId: 'com.vtex.pnp',
      installed: false,
      versionName: null,
      running: false,
      foreground: false,
    }),
  } as unknown as AdbBridge;

  const scrcpy = { start: record('start', SESSION) } as unknown as ScrcpySource;

  const mcp = {
    inspectScreen: record('inspectScreen', overrides.tree ?? TREE),
  } as unknown as MaestroMcpService;

  const capture = {
    capture: (...args: readonly unknown[]): Promise<Buffer> => {
      calls.push({ method: 'capture', args });
      return overrides.capture?.() ?? Promise.resolve(PNG);
    },
  } as unknown as ScreenCapture;

  const scripted = scriptedChild();
  const cli = {
    test: (...args: readonly unknown[]): StreamingProcess => {
      calls.push({ method: 'test', args });
      return scripted.child;
    },
    checkSyntax: record('checkSyntax', { ok: true }),
  } as unknown as CliRunner;

  return {
    gateway: new LocalGateway(adb, scrcpy, mcp, capture, cli),
    calls,
    emitStdout: scripted.emitStdout,
    emitStderr: scripted.emitStderr,
    emitExit: scripted.emitExit,
    killed: scripted.killed,
  };
}

describe('the local gateway', () => {
  it('reads the device list through the bridge', async () => {
    const { gateway: local, calls } = gateway();

    await local.listDevices();

    expect(calls).toEqual([{ method: 'listDevices', args: [] }]);
  });

  it('reads a device’s properties through the bridge', async () => {
    const { gateway: local, calls } = gateway();

    await local.deviceProperties('R9QYC01EMXL');

    expect(calls).toEqual([{ method: 'properties', args: ['R9QYC01EMXL'] }]);
  });

  it('reads the app under test through the bridge', async () => {
    const { gateway: local, calls } = gateway();

    await local.appIdentity('R9QYC01EMXL', 'com.vtex.pnp');

    expect(calls).toEqual([{ method: 'appIdentity', args: ['R9QYC01EMXL', 'com.vtex.pnp'] }]);
  });

  /**
   * The mirror is a Gateway capability rather than a service of its own because
   * `RemoteGateway` will have to serve it too: "where the device lives" is the
   * Gateway's secret, and a `MirrorService` calling adb would be leak #1 in
   * §10.1's table on day one.
   */
  it('opens a mirror through the scrcpy source', async () => {
    const { gateway: local, calls } = gateway();

    const session = await local.startMirror('R9QYC01EMXL', HANDLERS);

    expect(calls).toEqual([{ method: 'start', args: ['R9QYC01EMXL', HANDLERS] }]);
    expect(session).toBe(SESSION);
  });
});

/**
 * Criterion 1. Two collaborators rather than one, and that is the composition
 * §9.2 draws: the session fetches, the pure parser reads. `HierarchyParser` sits
 * beside the gateways rather than inside `LocalGateway` because `RemoteGateway`
 * will parse the same tree from a different wire.
 */
describe('reading the view hierarchy', () => {
  it('asks the mcp session for the named device', async () => {
    const { gateway: local, calls } = gateway();

    await local.hierarchy('R9QYC01EMXL');

    expect(calls).toEqual([{ method: 'inspectScreen', args: ['R9QYC01EMXL'] }]);
  });

  /** The Gateway's contract is a `TreeNode`, not the server's text: a caller
   * that had to parse would be a caller that could parse it differently. */
  it('answers with the parsed tree rather than the raw text', async () => {
    const { gateway: local } = gateway();

    await expect(local.hierarchy('R9QYC01EMXL')).resolves.toEqual({
      bounds: { x1: 0, y1: 0, x2: 1080, y2: 2340 },
      className: 'android.widget.FrameLayout',
      text: null,
      resourceId: null,
      contentDescription: null,
      hintText: null,
      scrollable: null,
      clickable: true,
      enabled: true,
      focused: null,
      selected: null,
      checked: null,
      children: [],
    });
  });

  /** Criterion 10 travels: a server that changed shape reaches the caller as
   * that failure, not as an empty tree. */
  it('propagates a response it could not parse', async () => {
    const { gateway: local } = gateway({ tree: '{"elements":[]}' });

    await expect(local.hierarchy('R9QYC01EMXL')).rejects.toBeInstanceOf(HierarchyParseError);
  });
});

/** Publish criterion 19 — the gate goes through the Gateway (§12 rule 9), and
 * the Gateway only routes: the invocation's flags are `CliRunner`'s. */
describe('checking a flow’s syntax', () => {
  it('checks through the cli runner and answers its verdict', async () => {
    const { gateway: local, calls } = gateway();

    const verdict = await local.checkSyntax('/repos/slug/conductor/checkout/pix.yml');

    expect(calls).toEqual([
      { method: 'checkSyntax', args: ['/repos/slug/conductor/checkout/pix.yml'] },
    ]);
    expect(verdict).toEqual({ ok: true });
  });
});

/** Criterion 2. */
describe('taking a screenshot', () => {
  it('captures through the screen capture', async () => {
    const { gateway: local, calls } = gateway();

    await local.screenshot('R9QYC01EMXL');

    expect(calls).toEqual([{ method: 'capture', args: ['R9QYC01EMXL'] }]);
  });

  /** §10.1 rule 2 — bytes, never a path, and the Gateway is not where they get
   * decoded on the way past. */
  it('answers with the bytes it was given', async () => {
    const { gateway: local } = gateway();

    expect(await local.screenshot('R9QYC01EMXL')).toBe(PNG);
  });

  it('propagates a capture that failed', async () => {
    const { gateway: local } = gateway({
      capture: () => Promise.reject(new Error('device offline')),
    });

    await expect(local.screenshot('R9QYC01EMXL')).rejects.toThrow('device offline');
  });
});

/**
 * The run composition, mirroring `hierarchy()`: `CliRunner` spawns, the pure
 * `RunOutputParser` reads, and the Gateway's contract upward is typed progress
 * — never raw chunks, so a `RemoteGateway` can serve the same events off a
 * different wire.
 */
describe('running a flow', () => {
  function startRun(): ReturnType<typeof gateway> & {
    progress: RunProgress[];
    exits: ExitReason[];
    run: { kill: () => void };
  } {
    const bundle = gateway();
    const progress: RunProgress[] = [];
    const exits: ExitReason[] = [];
    const run = bundle.gateway.runFlow('R9QYC01EMXL', '/tmp/runs/run-1.yaml', {
      onProgress: (event) => progress.push(event),
      onExit: (reason) => exits.push(reason),
    });
    return { ...bundle, progress, exits, run };
  }

  it('spawns the flow through the cli runner', () => {
    const { calls } = startRun();

    expect(calls).toEqual([{ method: 'test', args: ['R9QYC01EMXL', '/tmp/runs/run-1.yaml'] }]);
  });

  /** Criterion 6's ordering at the seam: the step is reported the moment its
   * partial line lands, the verdict when Maestro appends it, and the raw line
   * rides along as log. */
  it('reports parsed steps and log lines from stdout', () => {
    const { emitStdout, progress } = startRun();

    emitStdout('Tap on "Login"...');
    emitStdout(' COMPLETED\n');

    expect(progress).toEqual([
      { type: 'step-started', label: 'Tap on "Login"' },
      { type: 'step-passed', label: 'Tap on "Login"' },
      { type: 'log', lines: ['Tap on "Login"... COMPLETED'] },
    ]);
  });

  /** Criterion 6 — stderr is log, in order, and never step decoration: only
   * stdout's parser decides what a step is, or the two would race. */
  it('passes stderr through as log without inventing steps', () => {
    const { emitStderr, progress } = startRun();

    emitStderr('Tap on "y"... COMPLETED\n');

    expect(progress).toEqual([{ type: 'log', lines: ['Tap on "y"... COMPLETED'] }]);
  });

  /** The tail of an interrupted line still reaches the log, and exit is
   * reported after it — the terminal event must be terminal. */
  it('flushes both streams before reporting exit', () => {
    const { emitStdout, emitStderr, emitExit, progress, exits } = startRun();

    emitStdout('Assert that "x" is visible...');
    emitStderr('half a line');
    emitExit({ code: 143, error: null });

    expect(progress).toEqual([
      { type: 'step-started', label: 'Assert that "x" is visible' },
      { type: 'log', lines: ['Assert that "x" is visible...'] },
      { type: 'log', lines: ['half a line'] },
    ]);
    expect(exits).toEqual([{ code: 143, error: null }]);
  });

  it('reports a child that never started as its exit reason', () => {
    const { emitExit, exits } = startRun();
    const error = new Error('spawn maestro ENOENT');

    emitExit({ code: null, error });

    expect(exits).toEqual([{ code: null, error }]);
  });

  /** Criterion 9 — cancellation is explicit on the handle, and the Gateway
   * only forwards it: the tree-kill semantics live in `spawnStreaming`. */
  it('kills the child when the run is killed', () => {
    const { run, killed } = startRun();

    run.kill();

    expect(killed()).toBe(true);
  });
});

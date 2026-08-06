import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExitReason, RunResult, StreamingProcess } from '../process/run';
import { AdbBridge, AdbFailedError, AdbNotFoundError } from './AdbBridge';

/**
 * Every one of these drives the bridge from captured `adb` output. Nothing here
 * needs a device, an SDK or a `platform-tools` on disk — which is the point:
 * the machine this was written on has none of them.
 */

const ok = (stdout: string): RunResult => ({ stdout, stderr: '', code: 0 });
const failed = (code: number, stderr = ''): RunResult => ({ stdout: '', stderr, code });

/** Captured from a Galaxy S21 and a running emulator, verbatim. */
const DEVICES = `List of devices attached
R9QYC01EMXL            device usb:337641472X product:o1sxx model:SM_G991B device:o1s transport_id:1
emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:2
`;

type Call = { command: string; args: readonly string[] };

/** A `StreamingProcess` that records what was done to it. The mirror's server
 * is a child that stays up, so its lifecycle is what the tests assert on. */
class FakeChild implements StreamingProcess {
  killed = 0;
  readonly stderr: string[] = [];
  private exitListeners: Array<(reason: ExitReason) => void> = [];

  write(): void {}
  onStdout(): void {}
  onStderr(listener: (chunk: string) => void): void {
    this.stderr.push('');
    this.onStderrListener = listener;
  }
  onExit(listener: (reason: ExitReason) => void): void {
    this.exitListeners.push(listener);
  }
  kill(): void {
    this.killed += 1;
  }

  /** Drives the child from the test's side. */
  emitStderr(chunk: string): void {
    this.onStderrListener?.(chunk);
  }
  exit(reason: ExitReason): void {
    for (const listener of this.exitListeners) {
      listener(reason);
    }
    this.exitListeners = [];
  }

  private onStderrListener: ((chunk: string) => void) | null = null;
}

/** A bridge whose every dependency is a fake, plus the calls it made. */
function makeBridge(
  responses: (call: Call) => RunResult | Promise<RunResult>,
  options: {
    executable?: readonly string[];
    env?: NodeJS.ProcessEnv;
    home?: string;
    configuredPath?: string;
  } = {},
): { bridge: AdbBridge; calls: Call[]; spawned: Call[]; children: FakeChild[] } {
  const calls: Call[] = [];
  const spawned: Call[] = [];
  const children: FakeChild[] = [];
  const executable = new Set(options.executable ?? ['/opt/sdk/platform-tools/adb']);
  const bridge = new AdbBridge({
    run: (command, args) => {
      calls.push({ command, args });
      return Promise.resolve(responses({ command, args }));
    },
    spawn: (command, args) => {
      spawned.push({ command, args });
      const child = new FakeChild();
      children.push(child);
      return child;
    },
    isExecutable: (path) => executable.has(path),
    env: options.env ?? { ANDROID_HOME: '/opt/sdk' },
    home: options.home ?? '/Users/someone',
    configuredPath: options.configuredPath ?? '',
  });
  return { bridge, calls, spawned, children };
}

/** Routes by the adb subcommand, so a test only states what it cares about. */
function router(routes: Record<string, RunResult>): (call: Call) => RunResult {
  return ({ args }) => {
    const key = Object.keys(routes).find((route) => args.join(' ').includes(route));
    return (key === undefined ? undefined : routes[key]) ?? failed(1, 'unexpected call');
  };
}

describe('resolving the adb binary', () => {
  /** Criterion 1, in order. */
  it('prefers CONFIG.ADB_PATH over everything else', async () => {
    const { bridge, calls } = makeBridge(() => ok(DEVICES), {
      configuredPath: '/custom/adb',
      executable: ['/custom/adb', '/opt/sdk/platform-tools/adb'],
    });

    await bridge.listDevices();

    expect(calls[0]?.command).toBe('/custom/adb');
  });

  it('falls back to ANDROID_HOME', async () => {
    const { bridge, calls } = makeBridge(() => ok(DEVICES), {
      env: { ANDROID_HOME: '/opt/sdk', ANDROID_SDK_ROOT: '/other/sdk' },
      executable: ['/opt/sdk/platform-tools/adb', '/other/sdk/platform-tools/adb'],
    });

    await bridge.listDevices();

    expect(calls[0]?.command).toBe('/opt/sdk/platform-tools/adb');
  });

  it('falls back to ANDROID_SDK_ROOT when ANDROID_HOME has no adb', async () => {
    const { bridge, calls } = makeBridge(() => ok(DEVICES), {
      env: { ANDROID_HOME: '/opt/sdk', ANDROID_SDK_ROOT: '/other/sdk' },
      executable: ['/other/sdk/platform-tools/adb'],
    });

    await bridge.listDevices();

    expect(calls[0]?.command).toBe('/other/sdk/platform-tools/adb');
  });

  it('falls back to the macOS default SDK location', async () => {
    const { bridge, calls } = makeBridge(() => ok(DEVICES), {
      env: {},
      home: '/Users/someone',
      executable: ['/Users/someone/Library/Android/sdk/platform-tools/adb'],
    });

    await bridge.listDevices();

    expect(calls[0]?.command).toBe('/Users/someone/Library/Android/sdk/platform-tools/adb');
  });

  it('falls back to adb on PATH', async () => {
    const { bridge, calls } = makeBridge(() => ok(DEVICES), {
      env: { PATH: '/usr/local/bin:/usr/bin' },
      executable: ['/usr/bin/adb'],
    });

    await bridge.listDevices();

    expect(calls[0]?.command).toBe('/usr/bin/adb');
  });

  /** Criterion 2 — a stable code, not an empty list. */
  it('reports adb-not-found when nothing resolves', async () => {
    const { bridge, calls } = makeBridge(() => ok(DEVICES), { env: {}, executable: [] });

    await expect(bridge.listDevices()).rejects.toBeInstanceOf(AdbNotFoundError);
    expect(calls).toHaveLength(0);
  });

  it('carries the stable code on the error it throws', async () => {
    const { bridge } = makeBridge(() => ok(DEVICES), { env: {}, executable: [] });

    await expect(bridge.listDevices()).rejects.toMatchObject({
      code: 'device/adb-not-found',
    });
  });

  // An SDK installed after Conductor started must not need a restart.
  it('re-resolves after a failed resolution', async () => {
    const executable = new Set<string>();
    const calls: Call[] = [];
    const bridge = new AdbBridge({
      run: (command, args) => {
        calls.push({ command, args });
        return Promise.resolve(ok(DEVICES));
      },
      spawn: () => new FakeChild(),
      isExecutable: (path) => executable.has(path),
      env: { ANDROID_HOME: '/opt/sdk' },
      home: '/Users/someone',
      configuredPath: '',
    });

    await expect(bridge.listDevices()).rejects.toBeInstanceOf(AdbNotFoundError);
    executable.add('/opt/sdk/platform-tools/adb');

    await expect(bridge.listDevices()).resolves.toHaveLength(2);
  });
});

describe('listing devices', () => {
  /** Criterion 3. */
  it('reports the id, the model and the state of each device', async () => {
    const { bridge } = makeBridge(() => ok(DEVICES));

    await expect(bridge.listDevices()).resolves.toEqual([
      { id: 'R9QYC01EMXL', model: 'SM_G991B', state: 'device' },
      { id: 'emulator-5554', model: 'sdk_gphone64_arm64', state: 'device' },
    ]);
  });

  it('asks adb for the long form', async () => {
    const { bridge, calls } = makeBridge(() => ok(DEVICES));

    await bridge.listDevices();

    expect(calls[0]?.args).toEqual(['devices', '-l']);
  });

  /** Criterion 4 — the first screen every first-time user sees. */
  it('reports an unauthorized device as its own state', async () => {
    const { bridge } = makeBridge(() =>
      ok('List of devices attached\n9A271FFAZ005LN         unauthorized usb:1-2\n'),
    );

    await expect(bridge.listDevices()).resolves.toEqual([
      { id: '9A271FFAZ005LN', model: null, state: 'unauthorized' },
    ]);
  });

  it('reports an offline device as its own state', async () => {
    const { bridge } = makeBridge(() =>
      ok('List of devices attached\n0123456789ABCDEF       offline\n'),
    );

    await expect(bridge.listDevices()).resolves.toEqual([
      { id: '0123456789ABCDEF', model: null, state: 'offline' },
    ]);
  });

  it('reports no model rather than an invented one when adb omits it', async () => {
    const { bridge } = makeBridge(() =>
      ok('List of devices attached\nR9QYC01EMXL            device usb:337641472X\n'),
    );

    await expect(bridge.listDevices()).resolves.toEqual([
      { id: 'R9QYC01EMXL', model: null, state: 'device' },
    ]);
  });

  it('reads an empty list as an empty list', async () => {
    const { bridge } = makeBridge(() => ok('List of devices attached\n\n'));

    await expect(bridge.listDevices()).resolves.toEqual([]);
  });

  // adb prints these to stdout on the first call after a reboot, above the
  // header. Parsing them as devices would put `* daemon` in the picker.
  it('ignores the daemon start-up chatter', async () => {
    const { bridge } = makeBridge(() =>
      ok(
        [
          '* daemon not running; starting now at tcp:5037',
          '* daemon started successfully',
          'List of devices attached',
          'R9QYC01EMXL            device model:SM_G991B',
          '',
        ].join('\n'),
      ),
    );

    await expect(bridge.listDevices()).resolves.toEqual([
      { id: 'R9QYC01EMXL', model: 'SM_G991B', state: 'device' },
    ]);
  });

  // Windows adb, and some shells, end every line with CR. A serial carrying an
  // invisible \r matches nothing it is later compared against.
  it('strips carriage returns from the ids it parses', async () => {
    const { bridge } = makeBridge(() =>
      ok('List of devices attached\r\nR9QYC01EMXL\tdevice model:SM_G991B\r\n'),
    );

    await expect(bridge.listDevices()).resolves.toEqual([
      { id: 'R9QYC01EMXL', model: 'SM_G991B', state: 'device' },
    ]);
  });

  it('reports a failing adb as a failure rather than as no devices', async () => {
    const { bridge } = makeBridge(() => failed(1, 'adb: no permissions'));

    await expect(bridge.listDevices()).rejects.toBeInstanceOf(AdbFailedError);
  });
});

describe('reading the selected device’s properties', () => {
  /** Criterion 7. */
  it('reports model, release, physical size and density', async () => {
    const { bridge } = makeBridge(
      router({
        'ro.product.model': ok('SM-G991B\n'),
        'ro.build.version.release': ok('14\n'),
        'wm size': ok('Physical size: 1080x2400\n'),
        'wm density': ok('Physical density: 420\n'),
      }),
    );

    await expect(bridge.properties('R9QYC01EMXL')).resolves.toEqual({
      model: 'SM-G991B',
      release: '14',
      size: { width: 1080, height: 2400 },
      density: 420,
    });
  });

  it('addresses the device it was given', async () => {
    const { bridge, calls } = makeBridge(router({ '': ok('') }));

    await bridge.properties('emulator-5554');

    for (const call of calls) {
      expect(call.args.slice(0, 2)).toEqual(['-s', 'emulator-5554']);
    }
  });

  // A device with a resized display prints both. The physical one is the
  // device's; the override is whatever someone set with `wm size`.
  it('takes the physical size, not an override', async () => {
    const { bridge } = makeBridge(
      router({
        'wm size': ok('Physical size: 1080x2400\nOverride size: 720x1600\n'),
      }),
    );

    await expect(bridge.properties('R9QYC01EMXL')).resolves.toMatchObject({
      size: { width: 1080, height: 2400 },
    });
  });

  it('takes the physical density, not an override', async () => {
    const { bridge } = makeBridge(
      router({
        'wm density': ok('Physical density: 420\nOverride density: 560\n'),
      }),
    );

    await expect(bridge.properties('R9QYC01EMXL')).resolves.toMatchObject({ density: 420 });
  });

  /** Criterion 7 — unparseable is absent, never a substituted default. */
  it('reports null for anything it cannot parse', async () => {
    const { bridge } = makeBridge(
      router({
        'ro.product.model': ok('\n'),
        'ro.build.version.release': ok(''),
        'wm size': ok('Something else entirely\n'),
        'wm density': ok('Physical density: not-a-number\n'),
      }),
    );

    await expect(bridge.properties('R9QYC01EMXL')).resolves.toEqual({
      model: null,
      release: null,
      size: null,
      density: null,
    });
  });

  it('reports null rather than failing when a property command exits non-zero', async () => {
    const { bridge } = makeBridge(() => failed(1, 'device offline'));

    await expect(bridge.properties('R9QYC01EMXL')).resolves.toEqual({
      model: null,
      release: null,
      size: null,
      density: null,
    });
  });
});

describe('identifying the app under test', () => {
  const APP_ID = 'com.vtex.pnp';

  const installed = {
    'pm list packages': ok('package:com.vtex.pnp\n'),
    'dumpsys package': ok('    versionCode=402 minSdk=24\n    versionName=4.0.2\n'),
    pidof: ok('12345\n'),
    'dumpsys activity': ok(
      '  mResumedActivity: ActivityRecord{a1b2c3 u0 com.vtex.pnp/.MainActivity t42}\n',
    ),
  };

  /** Criteria 9–12, all four together. */
  it('reports an installed, foregrounded app', async () => {
    const { bridge } = makeBridge(router(installed));

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toEqual({
      appId: APP_ID,
      installed: true,
      versionName: '4.0.2',
      running: true,
      foreground: true,
    });
  });

  /**
   * Criterion 9's trap. `pm list packages <appId>` filters by substring on the
   * device, so a machine with only `com.vtex.pnp.debug` answers this query with
   * a package that is not the app under test.
   */
  it('does not accept a package that merely contains the app id', async () => {
    const { bridge } = makeBridge(
      router({ ...installed, 'pm list packages': ok('package:com.vtex.pnp.debug\n') }),
    );

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      installed: false,
    });
  });

  it('accepts the app id when it arrives among other matches', async () => {
    const { bridge } = makeBridge(
      router({
        ...installed,
        'pm list packages': ok('package:com.vtex.pnp.debug\npackage:com.vtex.pnp\n'),
      }),
    );

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      installed: true,
    });
  });

  it('strips the carriage returns adb shell leaves on package lines', async () => {
    const { bridge } = makeBridge(
      router({ ...installed, 'pm list packages': ok('package:com.vtex.pnp\r\n') }),
    );

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      installed: true,
    });
  });

  it('reports a missing app without claiming a version or a state it cannot know', async () => {
    const { bridge } = makeBridge(router({ ...installed, 'pm list packages': ok('') }));

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toEqual({
      appId: APP_ID,
      installed: false,
      versionName: null,
      running: false,
      foreground: false,
    });
  });

  /** Criterion 10. */
  it('reports null when dumpsys carries no versionName', async () => {
    const { bridge } = makeBridge(
      router({ ...installed, 'dumpsys package': ok('    versionCode=402 minSdk=24\n') }),
    );

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      versionName: null,
    });
  });

  /** Criterion 11 — pidof answers "not running" by exiting non-zero. */
  it('reads an empty pidof exiting non-zero as not running', async () => {
    const { bridge } = makeBridge(router({ ...installed, pidof: failed(1) }));

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      running: false,
    });
  });

  it('reads a pid as running', async () => {
    const { bridge } = makeBridge(router({ ...installed, pidof: ok('  12345  \n') }));

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      running: true,
    });
  });

  /** Criterion 12 — installed and running, but something else is on screen. */
  it('reports foreground false when another app holds the resumed activity', async () => {
    const { bridge } = makeBridge(
      router({
        ...installed,
        'dumpsys activity': ok(
          '  mResumedActivity: ActivityRecord{a1b2c3 u0 com.android.launcher/.Launcher t1}\n',
        ),
      }),
    );

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      foreground: false,
    });
  });

  it('recognises topResumedActivity as well', async () => {
    const { bridge } = makeBridge(
      router({
        ...installed,
        'dumpsys activity': ok(
          '  topResumedActivity=ActivityRecord{a1b2c3 u0 com.vtex.pnp/.MainActivity t42}\n',
        ),
      }),
    );

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      foreground: true,
    });
  });

  /**
   * Criterion 12's whole point: `false` would be a claim we cannot make. A
   * device whose dumpsys prints none of the markers has told us nothing.
   */
  it('reports null when dumpsys carries no marker it recognises', async () => {
    const { bridge } = makeBridge(
      router({
        ...installed,
        'dumpsys activity': ok('Display #0 (activities from top to bottom):\n'),
      }),
    );

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      foreground: null,
    });
  });

  it('reports null when the dumpsys call itself fails', async () => {
    const { bridge } = makeBridge(router({ ...installed, 'dumpsys activity': failed(1) }));

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      foreground: null,
    });
  });

  // The marker line names the component, so the package is always followed by
  // the activity separator. `com.vtex.pnp` must not match `com.vtex.pnp.debug`.
  it('does not read a foregrounded sibling package as the app under test', async () => {
    const { bridge } = makeBridge(
      router({
        ...installed,
        'dumpsys activity': ok(
          '  mResumedActivity: ActivityRecord{a1 u0 com.vtex.pnp.debug/.MainActivity t9}\n',
        ),
      }),
    );

    await expect(bridge.appIdentity('R9QYC01EMXL', APP_ID)).resolves.toMatchObject({
      foreground: false,
    });
  });

  /** Criterion 8 — nothing here knows what the app id is until it is passed one. */
  it('never names an app id of its own', async () => {
    const { bridge, calls } = makeBridge(router(installed));

    await bridge.appIdentity('R9QYC01EMXL', 'com.example.other');

    expect(calls.some((call) => call.args.includes('com.example.other'))).toBe(true);
    expect(calls.some((call) => call.args.join(' ').includes(APP_ID))).toBe(false);
  });
});

/**
 * What the mirror needs adb for, beyond reading the device: put our own jar on
 * it, open a tunnel to the socket the server binds, and start the server.
 */
describe('pushing a file to the device', () => {
  it('pushes the host path to the device path, on the selected device', async () => {
    const { bridge, calls } = makeBridge(() =>
      ok('1 file pushed. 90.9 MB/s (90980 bytes in 0.001s)'),
    );

    await bridge.push(
      'R9QYC01EMXL',
      '/app/resources/scrcpy/scrcpy-server-3.3.4.jar',
      '/data/local/tmp/s.jar',
    );

    expect(calls[0]).toEqual({
      command: '/opt/sdk/platform-tools/adb',
      args: [
        '-s',
        'R9QYC01EMXL',
        'push',
        '/app/resources/scrcpy/scrcpy-server-3.3.4.jar',
        '/data/local/tmp/s.jar',
      ],
    });
  });

  it('reports a push that failed rather than carrying on to a server that is not there', async () => {
    const { bridge } = makeBridge(() =>
      failed(1, "adb: error: failed to copy: remote couldn't create file: Permission denied"),
    );

    await expect(
      bridge.push('R9QYC01EMXL', '/local.jar', '/data/local/tmp/s.jar'),
    ).rejects.toBeInstanceOf(AdbFailedError);
  });
});

/** Criterion 16 — the port is allocated, never a hardcoded 27183. */
describe('forwarding a port', () => {
  it('asks adb to allocate one and returns the port it printed', async () => {
    // Verified on hardware 2026-08-04: `adb forward tcp:0` prints the port.
    const { bridge, calls } = makeBridge(() => ok('54556\n'));

    const port = await bridge.forward('R9QYC01EMXL', 'localabstract:scrcpy_0000abcd');

    expect(port).toBe(54556);
    expect(calls[0]?.args).toEqual([
      '-s',
      'R9QYC01EMXL',
      'forward',
      'tcp:0',
      'localabstract:scrcpy_0000abcd',
    ]);
  });

  it('never asks for a fixed port', async () => {
    const { bridge, calls } = makeBridge(() => ok('54556'));

    await bridge.forward('R9QYC01EMXL', 'localabstract:scrcpy_0000abcd');

    expect(calls[0]?.args).not.toContain('tcp:27183');
  });

  it('fails when adb printed something that is not a port', async () => {
    const { bridge } = makeBridge(() => ok('error: device offline'));

    await expect(bridge.forward('R9QYC01EMXL', 'localabstract:x')).rejects.toBeInstanceOf(
      AdbFailedError,
    );
  });

  it('fails when adb refused', async () => {
    const { bridge } = makeBridge(() => failed(1, 'error: device not found'));

    await expect(bridge.forward('R9QYC01EMXL', 'localabstract:x')).rejects.toBeInstanceOf(
      AdbFailedError,
    );
  });

  /** Criterion 22 — the host is left as it was found. */
  it('removes the forward by the port it allocated', async () => {
    const { bridge, calls } = makeBridge(() => ok(''));

    await bridge.removeForward('R9QYC01EMXL', 54556);

    expect(calls[0]?.args).toEqual(['-s', 'R9QYC01EMXL', 'forward', '--remove', 'tcp:54556']);
  });

  it('reports a removal adb refused, so teardown can say so', async () => {
    const { bridge } = makeBridge(() => failed(1, "error: listener 'tcp:54556' not found"));

    await expect(bridge.removeForward('R9QYC01EMXL', 54556)).rejects.toBeInstanceOf(AdbFailedError);
  });
});

describe('starting a long-lived shell on the device', () => {
  it('spawns it rather than waiting for it to finish', () => {
    const { bridge, spawned, calls } = makeBridge(() => ok(''));

    bridge.shell('R9QYC01EMXL', ['CLASSPATH=/data/local/tmp/s.jar', 'app_process', '/', 'x']);

    expect(calls).toEqual([]);
    expect(spawned[0]).toEqual({
      command: '/opt/sdk/platform-tools/adb',
      args: [
        '-s',
        'R9QYC01EMXL',
        'shell',
        'CLASSPATH=/data/local/tmp/s.jar',
        'app_process',
        '/',
        'x',
      ],
    });
  });

  /** No shell string anywhere: the command line is an argument array all the
   * way down, so nothing in it can ever become shell syntax (.context.md §12.19). */
  it('passes each argument separately, never a composed string', () => {
    const { bridge, spawned } = makeBridge(() => ok(''));

    bridge.shell('R9QYC01EMXL', ['CLASSPATH=/data/local/tmp/s.jar', 'app_process']);

    expect(spawned[0]?.args.filter((arg) => arg.includes(' '))).toEqual([]);
  });

  it('refuses to spawn when no adb resolved', () => {
    const { bridge, spawned } = makeBridge(() => ok(''), { env: {}, executable: [] });

    expect(() => bridge.shell('R9QYC01EMXL', ['x'])).toThrow(AdbNotFoundError);
    expect(spawned).toEqual([]);
  });
});

describe('when adb itself is gone', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('reports adb-not-found from every entry point', async () => {
    const { bridge } = makeBridge(() => ok(''), { env: {}, executable: [] });

    await expect(bridge.properties('x')).rejects.toBeInstanceOf(AdbNotFoundError);
    await expect(bridge.appIdentity('x', 'com.example')).rejects.toBeInstanceOf(AdbNotFoundError);
    await expect(bridge.push('x', '/a', '/b')).rejects.toBeInstanceOf(AdbNotFoundError);
    await expect(bridge.forward('x', 'localabstract:y')).rejects.toBeInstanceOf(AdbNotFoundError);
    await expect(bridge.removeForward('x', 1)).rejects.toBeInstanceOf(AdbNotFoundError);
  });
});

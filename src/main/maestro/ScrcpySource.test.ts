import { ERROR_CODES } from '@shared/ipc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExitReason, StreamingProcess } from '../process/run';
import type { MirrorFailure, MirrorPacket } from './MaestroGateway';
import {
  DEVICE_JAR_PATH,
  MAX_COMMAND_LENGTH,
  MIRROR_MAX_SIZE,
  SCRCPY_JAR,
  SCRCPY_VERSION,
  type ScrcpyAdb,
  type ScrcpySocket,
  ScrcpySource,
  scrcpyJarPath,
  serverCommand,
} from './ScrcpySource';
import { PREFIX_BYTES } from './scrcpy-protocol';

/**
 * Everything here runs with no device, no adb and no jar on disk. The process
 * runner, the socket and the filesystem all arrive injected, which is what makes
 * the 255-character budget and the teardown drivable from a test.
 */

/** Criterion 15 — the version argument and the jar file name are one constant. */
describe('the pinned server', () => {
  it('names the jar after the version it carries', () => {
    expect(SCRCPY_JAR).toBe(`scrcpy-server-${SCRCPY_VERSION}.jar`);
  });

  it('is pinned at the version whose protocol this parser was written against', () => {
    expect(SCRCPY_VERSION).toBe('3.3.4');
  });
});

/**
 * The jar's path differs between `electron-vite dev` and a packaged app, and
 * this is the one helper that joins it. It takes the two Electron facts as
 * arguments rather than importing Electron, so both branches are testable.
 */
describe('resolving the jar', () => {
  it('reads it from extraResources when packaged', () => {
    const path = scrcpyJarPath({
      packaged: true,
      resourcesPath: '/Applications/Conductor.app/Contents/Resources',
      appPath: '/Applications/Conductor.app/Contents/Resources/app.asar',
    });

    expect(path).toBe(`/Applications/Conductor.app/Contents/Resources/scrcpy/${SCRCPY_JAR}`);
  });

  it('reads it from the repo in development', () => {
    const path = scrcpyJarPath({
      packaged: false,
      resourcesPath: '/opt/electron/Resources',
      appPath: '/Users/someone/conductor',
    });

    expect(path).toBe(`/Users/someone/conductor/resources/scrcpy/${SCRCPY_JAR}`);
  });

  /** The constraint is explicit: never the user's brew copy. */
  it('never reaches for a scrcpy installed on the machine', () => {
    const path = scrcpyJarPath({ packaged: false, resourcesPath: '/r', appPath: '/a' });

    expect(path).not.toContain('homebrew');
    expect(path).not.toContain('/usr/local/share/scrcpy');
  });
});

/**
 * ⚠️ Criterion 17a, and the most expensive thing in this spec to re-learn.
 *
 * Samsung devices abort `app_process` when its command line runs past ~255
 * characters — the device's own limit, not a scrcpy bug. The failure is vicious:
 * the socket connects, the dummy byte, the device name and the codec header all
 * arrive *correctly*, and only then does the server die with `stack corruption
 * detected`. Every check downstream has already passed by the time it breaks, so
 * nothing but this assertion can catch it, and the symptom impersonates a
 * frame-parsing bug.
 *
 * Verified on hardware 2026-08-04: 320 characters aborts, 165 streams.
 */
describe('the app_process command line', () => {
  const SCID = '1a2b3c4d';
  const line = (): string => serverCommand(SCID).join(' ');

  it('stays under the 255 characters the device will accept', () => {
    expect(line().length).toBeLessThan(MAX_COMMAND_LENGTH);
  });

  /**
   * The measured value, pinned. If an edit pushes this up, the number moves in
   * the same commit and somebody has to look at how much headroom is left.
   *
   * Criterion 1: it went 165 → 151 when `control=false` left. That option was
   * the one thing here that differed from scrcpy's own default, so enabling
   * control *shortens* the line rather than spending the budget criterion 17a
   * guards. Re-measured on hardware 2026-08-04 at 151.
   */
  it('is the 151 characters that streamed on hardware', () => {
    expect(line()).toHaveLength(151);
  });

  it('leaves real headroom, not one character of it', () => {
    expect(MAX_COMMAND_LENGTH - line().length).toBeGreaterThan(80);
  });

  /**
   * Criterion 17. The headroom is bought entirely by *not* spelling out what the
   * server already defaults to. Each of these costs characters and buys nothing.
   */
  it.each([
    'video=',
    'video_codec=',
    'send_dummy_byte=',
    'send_device_meta=',
    'send_codec_meta=',
    'send_frame_meta=',
    'cleanup=',
    'log_level=',
  ])('passes no %s — the server already holds the value this spec wants', (option) => {
    expect(line()).not.toContain(option);
  });

  it('passes exactly the five options that differ from the defaults', () => {
    expect(serverCommand(SCID).slice(5)).toEqual([
      `scid=${SCID}`,
      'audio=false',
      'tunnel_forward=true',
      `max_size=${MIRROR_MAX_SIZE}`,
      // Pinned as a literal: 30 was tried and read as stutter beside scrcpy's
      // uncapped default, so 60 is a product decision, not a tuning knob.
      'max_fps=60',
    ]);
  });

  /**
   * Criterion 1. Control is the server's own default, so the way to turn it on
   * is to stop turning it off — and saying `control=true` would cost 12
   * characters to express the value the server already holds.
   */
  it('says nothing at all about control, so the server enables it', () => {
    expect(line()).not.toContain('control=');
  });

  /** The entry point, and the version argument that must match the jar exactly. */
  it('starts app_process on our own jar at the short device path', () => {
    expect(serverCommand(SCID).slice(0, 5)).toEqual([
      `CLASSPATH=${DEVICE_JAR_PATH}`,
      'app_process',
      '/',
      'com.genymobile.scrcpy.Server',
      SCRCPY_VERSION,
    ]);
  });

  /** Criterion 14 — the short path is not cosmetic; it buys 12 characters. */
  it('uses the short device path, not scrcpy-server.jar', () => {
    expect(DEVICE_JAR_PATH).toBe('/data/local/tmp/s.jar');
  });

  it('refuses to build a command line that would abort the server', () => {
    expect(() => serverCommand('f'.repeat(200))).toThrow(/255/);
  });
});

/* ── a session, with no phone anywhere ───────────────────────────────────── */

/** The bytes the wire actually carries, so the source is driven the way a
 * device drives it. Transcribed from the 2026-08-04 capture. */
function prefixBytes(width = 464, height = 1024): Uint8Array {
  const bytes = new Uint8Array(PREFIX_BYTES);
  const view = new DataView(bytes.buffer);
  bytes.set(new TextEncoder().encode('SM-A075M'), 1);
  view.setUint32(65, 0x68323634);
  view.setUint32(69, width);
  view.setUint32(73, height);
  return bytes;
}

function packetBytes(payload: Uint8Array, config = false, keyFrame = false): Uint8Array {
  const out = new Uint8Array(12 + payload.length);
  const view = new DataView(out.buffer);
  let meta = 0n;
  if (config) {
    meta |= 1n << 63n;
  }
  if (keyFrame) {
    meta |= 1n << 62n;
  }
  view.setBigUint64(0, meta);
  view.setUint32(8, payload.length);
  out.set(payload, 12);
  return out;
}

class FakeSocket implements ScrcpySocket {
  destroyed = 0;
  /** Everything the session wrote at this socket, in order. The video socket's
   * stays empty for the whole session — the picture only ever comes back. */
  readonly written: Uint8Array[] = [];
  /** Chunks this socket has delivered. The harness reads it to tell which
   * connect is the video one and which is the control one: control is only ever
   * opened once the video socket has produced its dummy byte. */
  dataSeen = 0;
  /** Resolves once the session has attached its listeners. The push, the
   * forward and the connect are all async, so a test that sent bytes after a
   * fixed number of microtasks would be counting ticks instead of waiting. */
  readonly wired: Promise<void>;
  private markWired: () => void = () => {};
  private data: ((chunk: Uint8Array) => void) | null = null;
  private end: ((error: Error | null) => void) | null = null;

  constructor(private readonly onWrite: () => void = () => {}) {
    this.wired = new Promise((resolve) => {
      this.markWired = resolve;
    });
  }

  onData(listener: (chunk: Uint8Array) => void): void {
    this.data = listener;
    this.markWired();
  }
  onEnd(listener: (error: Error | null) => void): void {
    this.end = listener;
  }
  write(chunk: Uint8Array): void {
    this.written.push(chunk);
    this.onWrite();
  }
  destroy(): void {
    this.destroyed += 1;
  }

  send(chunk: Uint8Array): void {
    this.dataSeen += 1;
    this.data?.(chunk);
  }
  close(error: Error | null = null): void {
    this.end?.(error);
  }
}

class FakeChild implements StreamingProcess {
  killed = 0;
  private exitListeners: Array<(reason: ExitReason) => void> = [];
  private stderrListener: ((chunk: string) => void) | null = null;

  write(): void {}
  onStdout(): void {}
  onStderr(listener: (chunk: string) => void): void {
    this.stderrListener = listener;
  }
  onExit(listener: (reason: ExitReason) => void): void {
    this.exitListeners.push(listener);
  }
  kill(): void {
    this.killed += 1;
  }

  emitStderr(chunk: string): void {
    this.stderrListener?.(chunk);
  }
  exit(reason: ExitReason = { code: 0, error: null }): void {
    for (const listener of this.exitListeners) {
      listener(reason);
    }
    this.exitListeners = [];
  }
}

type Harness = {
  readonly source: ScrcpySource;
  readonly socket: FakeSocket;
  /** The second socket, for control. It is handed out only after the video one
   * has delivered a byte, which is the order the server itself accepts in. */
  readonly control: FakeSocket;
  readonly child: FakeChild;
  readonly pushed: Array<{ deviceId: string; local: string; remote: string }>;
  readonly forwards: string[];
  readonly removed: number[];
  readonly shells: Array<readonly string[]>;
  readonly packets: MirrorPacket[];
  readonly ended: MirrorFailure[];
  start: () => ReturnType<ScrcpySource['start']>;
};

function harness(
  options: {
    forwardPort?: number;
    push?: () => Promise<void>;
    forward?: () => Promise<number>;
    removeForward?: () => Promise<void>;
    connect?: (port: number) => Promise<ScrcpySocket>;
    startTimeoutMs?: number;
  } = {},
): Harness {
  const socket = new FakeSocket();
  const control = new FakeSocket();
  const child = new FakeChild();
  const pushed: Harness['pushed'] = [];
  const forwards: string[] = [];
  const removed: number[] = [];
  const shells: Array<readonly string[]> = [];
  const packets: MirrorPacket[] = [];
  const ended: MirrorFailure[] = [];

  const adb: ScrcpyAdb = {
    push: (deviceId, local, remote) => {
      pushed.push({ deviceId, local, remote });
      return options.push?.() ?? Promise.resolve();
    },
    forward: (_deviceId, remote) => {
      forwards.push(remote);
      return options.forward?.() ?? Promise.resolve(options.forwardPort ?? 54556);
    },
    removeForward: (_deviceId, port) => {
      removed.push(port);
      return options.removeForward?.() ?? Promise.resolve();
    },
    shell: (_deviceId, args) => {
      shells.push(args);
      return child;
    },
  };

  const source = new ScrcpySource({
    adb,
    // The device's own order: every connect before the video socket has spoken
    // is a video attempt, and the one after it is control.
    connect: options.connect ?? (() => Promise.resolve(socket.dataSeen > 0 ? control : socket)),
    jarPath: '/app/resources/scrcpy/scrcpy-server-3.3.4.jar',
    // Fixed, so the socket name and the command line are the same every run.
    scid: () => 0x1a2b3c4d,
    startTimeoutMs: options.startTimeoutMs ?? 10_000,
  });

  return {
    source,
    socket,
    control,
    child,
    pushed,
    forwards,
    removed,
    shells,
    packets,
    ended,
    start: () =>
      source.start('R9QYC01EMXL', {
        onPacket: (packet) => packets.push(packet),
        onEnded: (failure) => ended.push(failure),
      }),
  };
}

/**
 * Starts a session and lets the handshake land, in the order a device actually
 * produces it.
 *
 * ⚠️ That order is the whole trap of this spec. `DesktopConnection.open()`
 * accepts video, then control, and only *then* calls `sendDeviceMeta` — so with
 * control enabled the dummy byte arrives **alone** and the device name and codec
 * header do not follow until the control socket has connected. Measured on a
 * Galaxy A07 on 2026-08-04: the video socket sat at exactly 1 byte for 700 ms,
 * and completed within 900 ms of the control connect.
 *
 * Sending all 77 bytes at once, the way this helper used to, would describe a
 * wire that cannot exist and would hide the ordering entirely.
 */
async function streaming(options: Parameters<typeof harness>[0] = {}): Promise<
  Harness & {
    session: Awaited<ReturnType<ScrcpySource['start']>>;
  }
> {
  const test = harness(options);
  const pending = test.start();
  await test.socket.wired;
  test.socket.send(prefixBytes().subarray(0, 1));
  await test.control.wired;
  test.socket.send(prefixBytes().subarray(1));
  return { ...test, session: await pending };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('starting a session', () => {
  /** Criterion 14 — our own jar, at the short path, on the selected device. */
  it('pushes the pinned jar to the device before anything else', async () => {
    const { pushed } = await streaming();

    expect(pushed).toEqual([
      {
        deviceId: 'R9QYC01EMXL',
        local: '/app/resources/scrcpy/scrcpy-server-3.3.4.jar',
        remote: DEVICE_JAR_PATH,
      },
    ]);
  });

  /** Criterion 16 — the socket name is scoped by the scid, so two sessions
   * cannot collide, and the server binds `scrcpy_%08x` of it. */
  it('scopes the socket name with the session scid', async () => {
    const { forwards, shells } = await streaming();

    expect(forwards).toEqual(['localabstract:scrcpy_1a2b3c4d']);
    expect(shells[0]).toContain('scid=1a2b3c4d');
  });

  it('pads a short scid to the eight hex digits the server formats', () => {
    expect(serverCommand('0000abcd')).toContain('scid=0000abcd');
  });

  it('starts the server with the command line that fits the budget', async () => {
    const { shells } = await streaming();

    expect(shells[0]).toEqual(serverCommand('1a2b3c4d'));
    expect(shells[0]?.join(' ').length).toBeLessThan(MAX_COMMAND_LENGTH);
  });

  /** Criterion 28 — what `mirror:start` answers with, read off the codec header. */
  it('reports the stream the device actually opened', async () => {
    const { session } = await streaming();

    expect(session).toMatchObject({
      deviceName: 'SM-A075M',
      codec: 'h264',
      width: 464,
      height: 1024,
    });
  });

  it('does not resolve until the codec header has arrived', async () => {
    const test = harness();
    let resolved = false;
    void test.start().then(() => {
      resolved = true;
    });
    await test.socket.wired;

    test.socket.send(prefixBytes().subarray(0, PREFIX_BYTES - 1));
    await Promise.resolve();

    expect(resolved).toBe(false);
  });

  /** Criterion 2 — one forward, and both sockets go down it. */
  it('connects both sockets to the one port adb allocated', async () => {
    const ports: number[] = [];
    const { control, socket } = harness({ forwardPort: 41234 });
    const test = harness({
      forwardPort: 41234,
      connect: (port) => {
        ports.push(port);
        return Promise.resolve(socket.dataSeen > 0 ? control : socket);
      },
    });
    const pending = test.start();
    await socket.wired;
    socket.send(prefixBytes().subarray(0, 1));
    await control.wired;
    socket.send(prefixBytes().subarray(1));
    await pending;

    expect(ports).toEqual([41234, 41234]);
  });
});

/**
 * Criteria 2–4. One `mirror:start` is still one scrcpy process and one forward —
 * the control socket joins the same session and the same teardown.
 */
describe('the control socket', () => {
  /**
   * ⚠️ Criterion 2, and the reason nothing here waits for the handshake first.
   * The server accepts video, then control, and does not send the device name
   * until both are in. Waiting for the codec header before opening control would
   * deadlock: the header is what the control connect unblocks.
   */
  it('opens once the video socket has produced its first byte', async () => {
    const test = harness();
    void test.start();
    await test.socket.wired;

    test.socket.send(prefixBytes().subarray(0, 1));
    await test.control.wired;

    expect(test.control.dataSeen).toBe(0);
  });

  /**
   * ⚠️ The other half of the ordering. adb accepts a connection whether or not
   * the server has bound its socket, then closes it — so during that race a
   * second connection would be handed to the server as its *video* socket. The
   * dummy byte is the only proof the video socket is real, which is why it, and
   * not the connect, is what opens control.
   */
  it('is not opened while the video socket is still racing the forward tunnel', async () => {
    vi.useFakeTimers();
    const connects: number[] = [];
    const socket = new FakeSocket();
    const control = new FakeSocket();
    const test = harness({
      connect: (port) => {
        connects.push(port);
        return Promise.resolve(socket.dataSeen > 0 ? control : socket);
      },
    });
    void test.start();
    await socket.wired;

    // adb accepted, the server had not bound yet, and it closed with nothing on
    // it — three times over, the way the phone that was measured behaved.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      socket.close(null);
      await vi.advanceTimersByTimeAsync(100);
    }

    expect(connects.length).toBeGreaterThan(1);
    expect(control.dataSeen).toBe(0);
    // Every one of those was another try at the video socket, never a control
    // socket opened against a server that is not listening.
    expect(socket.destroyed).toBeGreaterThan(0);
    expect(control.destroyed).toBe(0);
  });

  /** Criterion 3 — one session, one lifecycle. */
  it('is torn down with the session when it is stopped', async () => {
    const { session, control, socket } = await streaming();

    await session.stop();

    expect(control.destroyed).toBe(1);
    expect(socket.destroyed).toBe(1);
  });

  it('is torn down when the device goes away mid-session', async () => {
    const { control, ended, socket } = await streaming();

    socket.close(null);

    expect(control.destroyed).toBe(1);
    expect(ended[0]?.code).toBe(ERROR_CODES.mirrorDeviceLost);
  });

  it('never outlives the video socket', async () => {
    const test = await streaming();

    test.child.exit({ code: 1, error: null });

    expect(test.control.destroyed).toBe(1);
    expect(test.socket.destroyed).toBe(1);
  });

  /**
   * Criterion 4. The picture is the expensive thing to get and the thing the
   * person came for; control is a capability on top of it. Confirmed against the
   * server's own shape: because it blocks accepting control before sending the
   * codec header, a session that streams at all is a session whose control
   * socket connected — so this is about control dying *later*, which is the only
   * way the two can come apart.
   */
  it('leaves the picture streaming when it dies mid-session', async () => {
    const { control, session, packets, socket, ended } = await streaming();

    control.close(new Error('broken pipe'));
    socket.send(packetBytes(new Uint8Array([1, 2, 3]), false, true));

    expect(ended).toEqual([]);
    expect(packets).toHaveLength(1);
    await session.stop();
  });

  it('reports control as unavailable once it has died', async () => {
    const { control, session } = await streaming();

    control.close(new Error('broken pipe'));

    await expect(session.send({ type: 'back' })).rejects.toMatchObject({
      code: ERROR_CODES.mirrorControlFailed,
    });
    await session.stop();
  });

  /** Criterion 4 again, from the other side: a session that could not open one
   * says so, rather than pretending a tap will land. */
  it('says whether the session it opened can be driven', async () => {
    const { session } = await streaming();

    expect(session.control).toBe(true);
    await session.stop();
  });
});

/** Criteria 5 and 6 — what actually goes down the socket. */
describe('sending input at an open session', () => {
  it('writes the encoded messages at the control socket', async () => {
    const { session, control } = await streaming();

    await session.send({ type: 'back' });

    expect(control.written.map((message) => [...message])).toEqual([
      [4, 0],
      [4, 1],
    ]);
    await session.stop();
  });

  /** A tap is a pair, and both halves go out together — a round trip between
   * them would let a session change land in the middle of a press. */
  it('expands a tap into a touch-down and a touch-up', async () => {
    const { session, control } = await streaming();

    await session.send({ type: 'tap', x: 10, y: 20, screenWidth: 464, screenHeight: 1024 });

    expect(control.written).toHaveLength(2);
    expect(control.written[0]?.[1]).toBe(0);
    expect(control.written[1]?.[1]).toBe(1);
    await session.stop();
  });

  /** The video socket is read-only for the whole session; writing at it would
   * put control messages into the encoder's own stream. */
  it('never writes at the video socket', async () => {
    const { session, socket } = await streaming();

    await session.send({ type: 'text', text: 'hello' });

    expect(socket.written).toEqual([]);
    await session.stop();
  });

  it('refuses a message the wire cannot carry, without touching the socket', async () => {
    const { session, control } = await streaming();

    await expect(
      session.send({ type: 'tap', x: 999, y: 0, screenWidth: 464, screenHeight: 1024 }),
    ).rejects.toMatchObject({ code: ERROR_CODES.mirrorControlFailed });
    expect(control.written).toEqual([]);
    await session.stop();
  });

  it('refuses to send at a session that has been stopped', async () => {
    const { session } = await streaming();
    await session.stop();

    await expect(session.send({ type: 'back' })).rejects.toMatchObject({
      code: ERROR_CODES.mirrorControlFailed,
    });
  });
});

describe('when starting fails', () => {
  it('reports a push that adb refused', async () => {
    const test = harness({ push: () => Promise.reject(new Error('Permission denied')) });

    await expect(test.start()).rejects.toThrow(/Permission denied/);
  });

  it('leaves no forward behind when the push failed', async () => {
    const test = harness({ push: () => Promise.reject(new Error('nope')) });

    await test.start().catch(() => {});

    expect(test.forwards).toEqual([]);
    expect(test.removed).toEqual([]);
  });

  it('removes the forward when the server was never reachable', async () => {
    vi.useFakeTimers();
    const test = harness({
      connect: () => Promise.reject(new Error('ECONNREFUSED')),
      startTimeoutMs: 500,
    });
    const pending = test.start();
    const settled = expect(pending).rejects.toThrow(/ECONNREFUSED/);

    await vi.advanceTimersByTimeAsync(600);

    await settled;
    expect(test.removed).toEqual([54556]);
    expect(test.child.killed).toBeGreaterThan(0);
  });

  /**
   * Criterion 18, and the shape the 255-character abort actually takes: the
   * prefix arrives correctly and *then* the server dies.
   */
  it('reports a stream that died inside the handshake', async () => {
    const test = harness();
    const pending = test.start();
    await test.socket.wired;

    test.socket.send(prefixBytes().subarray(0, 40));
    test.socket.close();

    await expect(pending).rejects.toMatchObject({ code: ERROR_CODES.mirrorHandshakeFailed });
  });

  it('reports a server that exited before saying anything', async () => {
    const test = harness();
    const pending = test.start();
    await test.socket.wired;

    test.child.emitStderr('stack corruption detected (-fstack-protector)');
    test.child.exit({ code: 134, error: null });

    await expect(pending).rejects.toMatchObject({ code: ERROR_CODES.mirrorStartFailed });
  });

  /** What the device said is the only clue the person gets; it travels verbatim. */
  it('carries the server’s own stderr into the failure', async () => {
    const test = harness();
    const pending = test.start();
    await test.socket.wired;

    test.child.emitStderr('ERROR: Could not find "/data/local/tmp/s.jar"');
    test.child.exit({ code: 1, error: null });

    await expect(pending).rejects.toThrow(/Could not find/);
  });

  it('gives up rather than hanging when the device never speaks', async () => {
    vi.useFakeTimers();
    const test = harness({ startTimeoutMs: 5000 });
    const pending = test.start();
    const settled = expect(pending).rejects.toMatchObject({
      code: ERROR_CODES.mirrorStartFailed,
    });

    await vi.advanceTimersByTimeAsync(5001);
    await settled;
  });

  it('tears the whole session down when it gives up', async () => {
    vi.useFakeTimers();
    const test = harness({ startTimeoutMs: 100 });
    const pending = test.start();
    pending.catch(() => {});

    await vi.advanceTimersByTimeAsync(101);

    expect(test.child.killed).toBeGreaterThan(0);
    expect(test.removed).toEqual([54556]);
    expect(test.socket.destroyed).toBeGreaterThan(0);
  });
});

describe('a running session', () => {
  const IDR = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x65, 0x88]);
  const CONFIG = new Uint8Array([0x00, 0x00, 0x00, 0x01, 0x67, 0x42]);

  it('hands every packet to its handler', async () => {
    const test = await streaming();

    test.socket.send(packetBytes(CONFIG, true, false));
    test.socket.send(packetBytes(IDR, false, true));

    expect(test.packets).toEqual([
      { config: true, keyFrame: false, pts: 0, payload: CONFIG },
      { config: false, keyFrame: true, pts: 0, payload: IDR },
    ]);
  });

  /** Criterion 20, end to end: the socket decides the chunking, not the device. */
  it('is unmoved by where the socket cut the stream', async () => {
    const test = await streaming();
    const whole = packetBytes(IDR, false, true);

    for (const byte of whole) {
      test.socket.send(new Uint8Array([byte]));
    }

    expect(test.packets).toEqual([{ config: false, keyFrame: true, pts: 0, payload: IDR }]);
  });

  /** Criterion 21 — a length the wire made up ends the session, it does not
   * become an allocation. */
  it('ends the session on an impossible packet length', async () => {
    const test = await streaming();
    const header = new Uint8Array(12);
    new DataView(header.buffer).setUint32(8, 0xffffffff);

    test.socket.send(header);

    expect(test.ended).toEqual([
      expect.objectContaining({ code: ERROR_CODES.mirrorProtocolFailed }),
    ]);
  });

  /** Criterion 25 — the phone went away. */
  it('reports the device going away as its own terminal code', async () => {
    const test = await streaming();

    test.socket.close();

    expect(test.ended).toEqual([expect.objectContaining({ code: ERROR_CODES.mirrorDeviceLost })]);
  });

  it('reports a server that died mid-session', async () => {
    const test = await streaming();

    test.child.exit({ code: 137, error: null });

    expect(test.ended).toEqual([expect.objectContaining({ code: ERROR_CODES.mirrorDeviceLost })]);
  });

  it('says the session ended exactly once', async () => {
    const test = await streaming();

    test.socket.close();
    test.child.exit({ code: 137, error: null });
    test.socket.close();

    expect(test.ended).toHaveLength(1);
  });

  it('stops feeding packets once the session has ended', async () => {
    const test = await streaming();

    test.socket.close();
    test.socket.send(packetBytes(IDR, false, true));

    expect(test.packets).toEqual([]);
  });
});

/** Criterion 22 — nothing survives a stop: not the child, not the forward, not
 * the socket. The orphaned `app_process` this guards against was observed in the
 * spike, and needed `kill -9` by pid. */
describe('stopping a session', () => {
  it('kills the server, removes the forward and closes the socket', async () => {
    const test = await streaming();

    await test.session.stop();

    expect(test.child.killed).toBe(1);
    expect(test.removed).toEqual([54556]);
    expect(test.socket.destroyed).toBe(1);
  });

  it('is idempotent, so a stop racing a disconnect is not two teardowns', async () => {
    const test = await streaming();

    await test.session.stop();
    await test.session.stop();

    expect(test.child.killed).toBe(1);
    expect(test.removed).toEqual([54556]);
  });

  /** A stop we asked for is not a failure, and must not paint one on the panel. */
  it('reports no terminal failure for a stop we asked for', async () => {
    const test = await streaming();

    await test.session.stop();
    test.socket.close();
    test.child.exit({ code: 143, error: null });

    expect(test.ended).toEqual([]);
  });

  // A forward adb has already dropped is best effort; the kill is not. A server
  // left alive on the device is the failure that was actually observed.
  it('still kills the child when removing the forward fails', async () => {
    const test = await streaming({
      removeForward: () => Promise.reject(new Error("listener 'tcp:54556' not found")),
    });

    await expect(test.session.stop()).resolves.toBeUndefined();
    expect(test.child.killed).toBe(1);
    expect(test.socket.destroyed).toBe(1);
  });

  it('delivers no packet after a stop', async () => {
    const test = await streaming();

    await test.session.stop();
    test.socket.send(packetBytes(new Uint8Array([1, 2, 3])));

    expect(test.packets).toEqual([]);
  });
});

/** Criterion 30 — the device id is a token that travels through untouched. */
describe('the device id', () => {
  it('is passed along and never parsed', async () => {
    const seen: string[] = [];
    const socket = new FakeSocket();
    const source = new ScrcpySource({
      adb: {
        push: (deviceId) => {
          seen.push(deviceId);
          return Promise.resolve();
        },
        forward: (deviceId) => {
          seen.push(deviceId);
          return Promise.resolve(1);
        },
        removeForward: () => Promise.resolve(),
        shell: (deviceId) => {
          seen.push(deviceId);
          return new FakeChild();
        },
      },
      connect: () => Promise.resolve(socket),
      jarPath: '/jar',
      scid: () => 1,
      startTimeoutMs: 10_000,
    });

    const pending = source.start('session-token-from-a-remote-runner', {
      onPacket: () => {},
      onEnded: () => {},
    });
    await socket.wired;
    socket.send(prefixBytes());
    await pending;

    expect(seen).toEqual([
      'session-token-from-a-remote-runner',
      'session-token-from-a-remote-runner',
      'session-token-from-a-remote-runner',
    ]);
  });
});

/**
 * ⚠️ The race a forward tunnel creates, and the reason the dummy byte exists.
 *
 * With `tunnel_forward=true` adb accepts the TCP connection whether or not the
 * server has bound its socket on the device — and then closes it again. So
 * "connected" proves nothing; the first byte does.
 *
 * Measured on the Galaxy A07 on 2026-08-04, with the app's own sequence:
 *
 *   immediate     closed by peer, 0 bytes, after 6ms
 *   +156ms …      closed by peer, 0 bytes   (eleven times)
 *   +1882ms       77 bytes — the whole prefix, in one read
 *
 * `app_process` took ~2.3 s to come up. A client that connects once and treats
 * the close as terminal fails every single time, which is exactly what shipped.
 */
describe('waiting for the server to bind', () => {
  /**
   * A socket per attempt, created up front so a test can await the *n*th one
   * being wired before it decides what that attempt does. `handed` is how many
   * attempts the session has actually made.
   */
  function pool(count = 40): {
    connect: (port: number) => Promise<ScrcpySocket>;
    sockets: FakeSocket[];
    handed: FakeSocket[];
  } {
    const sockets = Array.from({ length: count }, () => new FakeSocket());
    const handed: FakeSocket[] = [];
    return {
      sockets,
      handed,
      connect: () => {
        const socket = sockets[handed.length] ?? new FakeSocket();
        handed.push(socket);
        return Promise.resolve(socket);
      },
    };
  }

  it('tries again when adb accepted the connection and closed it with nothing on it', async () => {
    vi.useFakeTimers();
    const { connect, sockets, handed } = pool();
    const test = harness({ connect });
    const pending = test.start();
    pending.catch(() => {});

    await sockets[0]?.wired;
    sockets[0]?.close();
    await vi.advanceTimersByTimeAsync(200);

    expect(handed).toHaveLength(2);
  });

  it('keeps trying for as long as the deadline allows', async () => {
    vi.useFakeTimers();
    const { connect, sockets, handed } = pool();
    const test = harness({ connect, startTimeoutMs: 5000 });
    const pending = test.start();
    pending.catch(() => {});

    // Eleven silent attempts is what the phone actually produced.
    for (let attempt = 0; attempt < 11; attempt += 1) {
      await sockets[attempt]?.wired;
      sockets[attempt]?.close();
      await vi.advanceTimersByTimeAsync(150);
    }

    expect(handed.length).toBeGreaterThan(11);
  });

  it('streams as soon as an attempt finds the server listening', async () => {
    vi.useFakeTimers();
    const { connect, sockets } = pool();
    const test = harness({ connect });
    const pending = test.start();

    await sockets[0]?.wired;
    sockets[0]?.close();
    await vi.advanceTimersByTimeAsync(200);
    await sockets[1]?.wired;
    sockets[1]?.send(prefixBytes());

    await expect(pending).resolves.toMatchObject({ codec: 'h264', width: 464, height: 1024 });
  });

  it('leaves no socket behind from the attempts that failed', async () => {
    vi.useFakeTimers();
    const { connect, sockets } = pool();
    const test = harness({ connect });
    const pending = test.start();
    pending.catch(() => {});

    await sockets[0]?.wired;
    sockets[0]?.close();
    await vi.advanceTimersByTimeAsync(200);

    expect(sockets[0]?.destroyed).toBeGreaterThan(0);
  });

  /**
   * The distinction the whole retry rests on. A stream that said *something* and
   * then died inside the prefix is a real truncation — a server that started and
   * fell over — and retrying it would hide that behind a timeout.
   */
  it('does not retry a stream that died after saying something', async () => {
    const { connect, sockets, handed } = pool();
    const test = harness({ connect });
    const pending = test.start();

    await sockets[0]?.wired;
    sockets[0]?.send(prefixBytes().subarray(0, 40));
    sockets[0]?.close();

    await expect(pending).rejects.toMatchObject({ code: ERROR_CODES.mirrorHandshakeFailed });
    // Two connects, and neither is a retry: the video socket was tried once,
    // and the bytes it produced are what opened the control socket beside it
    // (criterion 2). A third would mean the truncated prefix was retried.
    expect(handed).toHaveLength(2);
    expect(handed[0]).toBe(sockets[0]);
  });

  it('stops trying once the session has been stopped', async () => {
    vi.useFakeTimers();
    const { connect, sockets, handed } = pool();
    const test = harness({ connect });
    const pending = test.start();

    await sockets[0]?.wired;
    sockets[0]?.send(prefixBytes());
    const session = await pending;
    await session.stop();
    await vi.advanceTimersByTimeAsync(1000);

    // The video socket and the control socket beside it, and nothing after the
    // stop: a retry that fired late would open a socket nobody owns, on a
    // forward that has already been removed.
    expect(handed).toHaveLength(2);
  });

  it('gives up at the deadline, saying how long it waited and how often it tried', async () => {
    vi.useFakeTimers();
    const { connect, sockets } = pool();
    const test = harness({ connect, startTimeoutMs: 400 });
    const pending = test.start();
    const settled = expect(pending).rejects.toThrow(/attempt/i);

    await sockets[0]?.wired;
    sockets[0]?.close();
    await vi.advanceTimersByTimeAsync(500);

    await settled;
  });

  it('tears the whole session down when it gives up retrying', async () => {
    vi.useFakeTimers();
    const { connect, sockets } = pool();
    const test = harness({ connect, startTimeoutMs: 400 });
    const pending = test.start();
    pending.catch(() => {});

    await sockets[0]?.wired;
    sockets[0]?.close();
    await vi.advanceTimersByTimeAsync(500);

    expect(test.child.killed).toBeGreaterThan(0);
    expect(test.removed).toEqual([54556]);
  });
});

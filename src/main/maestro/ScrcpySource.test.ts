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

  /** The measured value, pinned. If an edit pushes this up, the number moves in
   * the same commit and somebody has to look at how much headroom is left. */
  it('is the 165 characters that streamed on hardware', () => {
    expect(line()).toHaveLength(165);
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

  it('passes exactly the six options that differ from the defaults', () => {
    expect(serverCommand(SCID).slice(5)).toEqual([
      `scid=${SCID}`,
      'audio=false',
      'control=false',
      'tunnel_forward=true',
      `max_size=${MIRROR_MAX_SIZE}`,
      // Pinned as a literal: 30 was tried and read as stutter beside scrcpy's
      // uncapped default, so 60 is a product decision, not a tuning knob.
      'max_fps=60',
    ]);
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
  /** Resolves once the session has attached its listeners. The push, the
   * forward and the connect are all async, so a test that sent bytes after a
   * fixed number of microtasks would be counting ticks instead of waiting. */
  readonly wired: Promise<void>;
  private markWired: () => void = () => {};
  private data: ((chunk: Uint8Array) => void) | null = null;
  private end: ((error: Error | null) => void) | null = null;

  constructor() {
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
  destroy(): void {
    this.destroyed += 1;
  }

  send(chunk: Uint8Array): void {
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
    connect: options.connect ?? (() => Promise.resolve(socket)),
    jarPath: '/app/resources/scrcpy/scrcpy-server-3.3.4.jar',
    // Fixed, so the socket name and the command line are the same every run.
    scid: () => 0x1a2b3c4d,
    startTimeoutMs: options.startTimeoutMs ?? 10_000,
  });

  return {
    source,
    socket,
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

/** Starts a session and lets the handshake land, the way a device would. */
async function streaming(options: Parameters<typeof harness>[0] = {}): Promise<
  Harness & {
    session: Awaited<ReturnType<ScrcpySource['start']>>;
  }
> {
  const test = harness(options);
  const pending = test.start();
  await test.socket.wired;
  test.socket.send(prefixBytes());
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

  it('connects to the port adb allocated', async () => {
    const ports: number[] = [];
    const socket = new FakeSocket();
    const test = harness({
      forwardPort: 41234,
      connect: (port) => {
        ports.push(port);
        return Promise.resolve(socket);
      },
    });
    const pending = test.start();
    await socket.wired;
    socket.send(prefixBytes());
    await pending;

    expect(ports).toEqual([41234]);
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
    expect(handed).toHaveLength(1);
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

    expect(handed).toHaveLength(1);
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

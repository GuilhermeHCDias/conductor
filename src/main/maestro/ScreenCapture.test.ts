import { readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BinaryRunResult, RunOptions } from '../process/run';
import { CAPTURE_TIMEOUT_MS, ScreenCapture, ScreenCaptureFailedError } from './ScreenCapture';

/**
 * The still frame, with no JVM anywhere near it (§4.4b, §10.1 rule 13): a
 * screenshot never goes through Maestro, CLI or MCP. Everything below runs with
 * no `adb` and no phone — the runner and the binary's location are injected,
 * which is the same thing that makes `AdbBridge`'s traps testable.
 */

const ADB = '/Users/someone/Library/Android/sdk/platform-tools/adb';
const DEVICE = 'R9QYC01EMXL';

/** A real PNG's first eight bytes. `0x89` leads deliberately: it is not a legal
 * UTF-8 start byte, so anything that decodes this stream destroys it. */
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0xff, 0xfe, 0x80]);

type Ran = {
  readonly command: string;
  readonly args: readonly string[];
  readonly options?: RunOptions;
};

function capture(
  overrides: { binary?: string | null; result?: Partial<BinaryRunResult>; reject?: Error } = {},
): { capture: ScreenCapture; ran: Ran[] } {
  const ran: Ran[] = [];

  const screen = new ScreenCapture({
    adb: { resolve: () => (overrides.binary === undefined ? ADB : overrides.binary) },
    run: (command, args, options) => {
      ran.push({ command, args, options });
      if (overrides.reject !== undefined) {
        return Promise.reject(overrides.reject);
      }
      return Promise.resolve({ stdout: PNG, stderr: '', code: 0, ...overrides.result });
    },
  });

  return { capture: screen, ran };
}

describe('capturing a frame', () => {
  /** Criterion 12. `exec-out` and not `shell`: the latter runs the bytes through
   * a pty that rewrites every `0x0a` into `0x0d 0x0a`, which corrupts a PNG in
   * a way nothing downstream can detect. */
  it('runs adb exec-out screencap -p against the named device', async () => {
    const { capture: screen, ran } = capture();

    await screen.capture(DEVICE);

    expect(ran).toMatchObject([
      { command: ADB, args: ['-s', DEVICE, 'exec-out', 'screencap', '-p'] },
    ]);
  });

  /**
   * ⚠️ `screencap` is the one adb call in this app that can hang rather than
   * fail: a device that locks or rotates mid-capture leaves the pipe open with
   * nothing coming down it. `run`'s siblings elsewhere buffer to completion, so
   * without a ceiling the promise never settles and the core loop's frozen
   * frame (§5.5) never arrives — no error, no picture, nothing to report.
   */
  it('gives the capture a finite deadline', async () => {
    const { capture: screen, ran } = capture();

    await screen.capture(DEVICE);

    expect(ran[0]?.options?.timeout).toBe(CAPTURE_TIMEOUT_MS);
    expect(CAPTURE_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it('reports a capture that ran out of time as a capture failure', async () => {
    const { capture: screen } = capture({ reject: new Error('spawn ETIMEDOUT') });

    await expect(screen.capture(DEVICE)).rejects.toMatchObject({ code: 'capture/failed' });
  });

  /** Criterion 12 — the bytes the device produced, and only those. */
  it('returns the PNG bytes the device produced', async () => {
    const { capture: screen } = capture();

    const bytes = await screen.capture(DEVICE);

    expect(bytes.equals(PNG)).toBe(true);
  });

  /** Criterion 13. Identity, not merely equality: nothing copied it through a
   * string, an encoding or a re-encode on the way out. */
  it('does not decode, re-encode or otherwise transform them', async () => {
    const { capture: screen } = capture();

    const bytes = await screen.capture(DEVICE);

    expect(bytes).toBe(PNG);
  });

  it('returns a Buffer, so the bytes cross every boundary as bytes', async () => {
    const { capture: screen } = capture();

    expect(Buffer.isBuffer(await screen.capture(DEVICE))).toBe(true);
  });

  /** §10.1 rule 3 — `deviceId` is an opaque token, passed through and never
   * parsed. Today a serial; tomorrow a remote runner's session id. */
  it('passes an opaque device id straight through', async () => {
    const { capture: screen, ran } = capture();

    await screen.capture('session:7f3a-remote');

    expect(ran[0]?.args).toContain('session:7f3a-remote');
  });

  /** One resolution order for `adb` in this app, and it is `AdbBridge`'s. A
   * second candidate list here is how the two drift apart. */
  it('takes the binary from the bridge rather than resolving its own', async () => {
    const { capture: screen, ran } = capture({ binary: '/custom/adb' });

    await screen.capture(DEVICE);

    expect(ran[0]?.command).toBe('/custom/adb');
  });
});

/**
 * Criterion 15. Two conditions, two codes, because they are two different
 * fixes — the same split `AdbBridge` already draws between "no adb" and "adb
 * refused", and the reason the doctor can tell them apart at all (§10).
 */
describe('when it cannot capture', () => {
  it('reports an unresolved adb with the prerequisite’s own code', async () => {
    const { capture: screen, ran } = capture({ binary: null });

    await expect(screen.capture(DEVICE)).rejects.toMatchObject({
      code: 'device/adb-not-found',
    });
    expect(ran).toEqual([]);
  });

  it('reports a capture that ran and failed with its own code', async () => {
    const { capture: screen } = capture({
      result: { code: 1, stderr: 'device offline', stdout: Buffer.alloc(0) },
    });

    await expect(screen.capture(DEVICE)).rejects.toMatchObject({
      code: 'capture/failed',
      message: expect.stringContaining('device offline'),
    });
  });

  it('rejects with a typed error a caller can narrow on', async () => {
    const { capture: screen } = capture({ result: { code: 1 } });

    await expect(screen.capture(DEVICE)).rejects.toBeInstanceOf(ScreenCaptureFailedError);
  });

  /** A binary that vanished between resolving and running — the runner rejects
   * rather than reporting an exit code, and that must not escape untyped. */
  it('reports a runner that never started the process', async () => {
    const { capture: screen } = capture({ reject: new Error('spawn ENOENT') });

    await expect(screen.capture(DEVICE)).rejects.toMatchObject({
      code: 'capture/failed',
      message: expect.stringContaining('ENOENT'),
    });
  });

  /**
   * `screencap` can exit 0 having written nothing — a device that woke up
   * mid-capture. Handing an empty Buffer back as "the screenshot" would fail
   * three layers later, where nothing knows why.
   */
  it('reports an empty capture rather than returning zero bytes', async () => {
    const { capture: screen } = capture({ result: { stdout: Buffer.alloc(0) } });

    await expect(screen.capture(DEVICE)).rejects.toMatchObject({ code: 'capture/failed' });
  });

  /** The code is its own, so the doctor and the panel never confuse a capture
   * failure with a hierarchy one. */
  it('uses a code distinct from the parser’s', async () => {
    const { capture: screen } = capture({ result: { code: 1 } });

    await expect(screen.capture(DEVICE)).rejects.not.toMatchObject({
      code: 'hierarchy/parse-failed',
    });
  });
});

/**
 * Criterion 14. §10.1's amendment: a module that receives its runner by
 * constructor injection does not create processes, and so does not need — or
 * get — the `noRestrictedImports` exception. `AdbBridge` and `ScrcpySource`
 * already work this way; this is the third.
 */
describe('the module itself', () => {
  const source = readFileSync(resolvePath('src/main/maestro/ScreenCapture.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('creates no process of its own', () => {
    expect(code).not.toMatch(/child_process/);
    expect(code).not.toMatch(/\b(execFile|spawn|exec)\s*\(/);
  });

  it('imports nothing from Electron', () => {
    expect(code).not.toMatch(/from\s+['"]electron['"]/);
  });

  /** It must not reach for the text runner: `run` hardcodes `encoding: 'utf8'`,
   * and a PNG does not survive that. */
  it('does not import the text-mode runner', () => {
    expect(code).not.toMatch(/\brun\b\s*[,}].*from\s+['"]\.\.\/process\/run['"]/);
    expect(code).toMatch(/BinaryRunResult|runBinary/);
  });

  /** Criterion 16 — iOS is not implemented here, and nothing about the shape
   * prevents a `simctl` sibling: the capture is one injected runner and one
   * command, neither of which names Android in its type. */
  it('names no iOS capture path yet', () => {
    expect(code).not.toMatch(/simctl|xcrun/);
  });
});

/** Criterion 14 again, enforced where it cannot erode: an exception in
 * `biome.json` that no longer has a reason is a door left open for the next
 * edit. */
describe('the lint rule behind it', () => {
  const biome = JSON.parse(readFileSync(resolvePath('biome.json'), 'utf8')) as {
    overrides?: Array<{ includes?: string[] }>;
  };
  const exempted = (biome.overrides ?? []).flatMap((override) => override.includes ?? []);

  it('no longer exempts ScreenCapture from the process-creation rule', () => {
    expect(exempted).not.toContain('src/main/maestro/ScreenCapture.ts');
  });

  it('still exempts the file that does create processes', () => {
    expect(exempted).toContain('src/main/process/run.ts');
  });
});

import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_BUFFER, run, runBinary, type StreamingProcess, spawnStreaming } from './run';

/** Exercised against real child processes: this module's whole purpose is the
 * boundary with the OS, and a mocked `execFile` would only prove the mock. */
describe('run', () => {
  it('resolves with stdout and exit code 0 for a process that succeeds', async () => {
    const result = await run(process.execPath, ['-e', 'process.stdout.write("hello")']);

    expect(result).toEqual({ stdout: 'hello', stderr: '', code: 0 });
  });

  it('captures stderr separately from stdout', async () => {
    const result = await run(process.execPath, [
      '-e',
      'process.stdout.write("out"); process.stderr.write("err")',
    ]);

    expect(result).toMatchObject({ stdout: 'out', stderr: 'err', code: 0 });
  });

  // A process that ran and failed is a value, not an exception: the caller has
  // to be able to tell "maestro said no" from "maestro is not installed".
  it('resolves with the exit code when the process exits non-zero', async () => {
    const result = await run(process.execPath, ['-e', 'process.exit(3)']);

    expect(result).toMatchObject({ code: 3 });
  });

  it('rejects when the binary does not exist', async () => {
    await expect(run('conductor-no-such-binary', [])).rejects.toThrow();
  });

  // §8.1: arguments are an array precisely so model-generated text can never
  // become shell syntax. This is the test that proves it.
  it('passes arguments literally instead of interpreting them as shell syntax', async () => {
    const result = await run(process.execPath, [
      '-e',
      'process.stdout.write(process.argv[1])',
      '; rm -rf / && echo pwned $(whoami)',
    ]);

    expect(result.stdout).toBe('; rm -rf / && echo pwned $(whoami)');
  });

  it('honours an explicit timeout by rejecting rather than hanging', async () => {
    await expect(
      run(process.execPath, ['-e', 'setTimeout(() => {}, 10000)'], { timeout: 100 }),
    ).rejects.toThrow();
  });

  // `maestro hierarchy` on a dense screen comfortably clears Node's 1 MB
  // execFile default, which fails the call rather than truncating it.
  it('accepts output larger than the 1 MB execFile default', async () => {
    const result = await run(process.execPath, [
      '-e',
      'process.stdout.write("x".repeat(4 * 1024 * 1024))',
    ]);

    expect(result.stdout).toHaveLength(4 * 1024 * 1024);
    expect(result.code).toBe(0);
  });

  // Passing `maxBuffer: undefined` through to execFile does not inherit Node's
  // default — it removes the ceiling altogether, so a runaway child could grow
  // main's heap without bound. The default has to be explicit and finite.
  it('caps output at a finite default instead of buffering without limit', async () => {
    expect(DEFAULT_MAX_BUFFER).toBeLessThan(Number.POSITIVE_INFINITY);

    await expect(
      run(process.execPath, [
        '-e',
        `process.stdout.write("x".repeat(${DEFAULT_MAX_BUFFER} + 1024))`,
      ]),
    ).rejects.toThrow();
  });

  it('still honours a caller-supplied maxBuffer', async () => {
    await expect(
      run(process.execPath, ['-e', 'process.stdout.write("x".repeat(2048))'], { maxBuffer: 256 }),
    ).rejects.toThrow();
  });
});

/**
 * The binary-safe half. `run` hardcodes `encoding: 'utf8'`, which is right for
 * every text caller and destroys a PNG: `adb exec-out screencap -p` answers with
 * bytes, and §10.1 rule 2 requires them to cross every boundary as bytes.
 *
 * The corruption is not hypothetical — the eight bytes a PNG opens with contain
 * `0x89`, which is not a legal UTF-8 start byte, so decoding replaces it with
 * U+FFFD and the file stops being a PNG at byte one. Every test below is
 * written against that failure.
 */
describe('runBinary', () => {
  /** A real PNG signature, followed by bytes chosen to break UTF-8 in the other
   * two ways: a lone continuation byte, and a truncated multi-byte sequence. */
  const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const HOSTILE = Buffer.concat([PNG_SIGNATURE, Buffer.from([0x80, 0xff, 0xfe, 0xc3, 0x00])]);

  /** Writes the given bytes on stdout, from a hex literal so the argument array
   * itself stays text. */
  const emits = (bytes: Buffer): string[] => [
    '-e',
    `process.stdout.write(Buffer.from("${bytes.toString('hex')}", "hex"))`,
  ];

  it('returns stdout as bytes rather than as a string', async () => {
    const result = await runBinary(process.execPath, emits(PNG_SIGNATURE));

    expect(Buffer.isBuffer(result.stdout)).toBe(true);
  });

  /** Criterion 13, at the layer that would break it. */
  it('carries bytes that UTF-8 decoding would corrupt through untouched', async () => {
    const result = await runBinary(process.execPath, emits(HOSTILE));

    expect(result.stdout.equals(HOSTILE)).toBe(true);
  });

  // The proof that this variant is needed at all: the same bytes through `run`
  // come back damaged, which is why `ScreenCapture` may never call it.
  it('differs from run, which mangles those same bytes', async () => {
    const decoded = await run(process.execPath, emits(HOSTILE));

    expect(Buffer.from(decoded.stdout, 'utf8').equals(HOSTILE)).toBe(false);
  });

  // stderr is a message, not a payload: adb says "device not found" there, and a
  // Buffer would only be decoded by every caller anyway.
  it('reports stderr as text', async () => {
    const result = await runBinary(process.execPath, [
      '-e',
      'process.stderr.write("device not found")',
    ]);

    expect(result.stderr).toBe('device not found');
  });

  /** Same contract as `run`: a process that ran and failed is a value. */
  it('resolves with the exit code when the process exits non-zero', async () => {
    const result = await runBinary(process.execPath, ['-e', 'process.exit(3)']);

    expect(result.code).toBe(3);
  });

  it('rejects when the binary does not exist', async () => {
    await expect(runBinary('conductor-no-such-binary', [])).rejects.toThrow();
  });

  /** §8.1 and §12.19, unchanged by the encoding. */
  it('passes arguments literally instead of interpreting them as shell syntax', async () => {
    const result = await runBinary(process.execPath, [
      '-e',
      'process.stdout.write(process.argv[1])',
      '; rm -rf / && echo pwned $(whoami)',
    ]);

    expect(result.stdout.toString('utf8')).toBe('; rm -rf / && echo pwned $(whoami)');
  });

  // A screenshot of a 1080x2400 phone clears Node's 1 MB execFile default, which
  // fails the call rather than truncating it.
  it('accepts output larger than the 1 MB execFile default', async () => {
    const result = await runBinary(process.execPath, [
      '-e',
      'process.stdout.write(Buffer.alloc(4 * 1024 * 1024, 0x89))',
    ]);

    expect(result.stdout).toHaveLength(4 * 1024 * 1024);
  });

  it('caps output at the same finite default instead of buffering without limit', async () => {
    await expect(
      runBinary(process.execPath, [
        '-e',
        `process.stdout.write(Buffer.alloc(${DEFAULT_MAX_BUFFER} + 1024))`,
      ]),
    ).rejects.toThrow();
  });
});

/**
 * The long-lived half. `run` buffers to completion, which is exactly wrong for
 * a child that is meant to stay up and answer over stdio — so the `maestro mcp`
 * child gets this instead. Also exercised against real processes.
 */
describe('spawnStreaming', () => {
  /** Waits for the child to say something, so a test never races the pipe. */
  function collect(child: StreamingProcess): {
    stdout: () => string;
    exit: Promise<{ code: number | null; error: Error | null }>;
  } {
    let stdout = '';
    child.onStdout((chunk) => {
      stdout += chunk;
    });
    const exit = new Promise<{ code: number | null; error: Error | null }>((resolve) => {
      child.onExit(resolve);
    });
    return { stdout: () => stdout, exit };
  }

  it('delivers stdout as it arrives, before the child exits', async () => {
    const child = spawnStreaming(process.execPath, [
      '-e',
      'process.stdout.write("first"); setTimeout(() => process.stdout.write("second"), 50)',
    ]);
    const { stdout, exit } = collect(child);

    await exit;

    expect(stdout()).toBe('firstsecond');
  });

  // The whole point: a request goes down stdin, an answer comes back up stdout,
  // and the child stays alive for the next one.
  it('writes to the child’s stdin and reads what it answers', async () => {
    const child = spawnStreaming(process.execPath, [
      '-e',
      'process.stdin.on("data", (d) => process.stdout.write("echo:" + d))',
    ]);
    const { stdout, exit } = collect(child);

    child.write('ping\n');
    await new Promise((resolve) => setTimeout(resolve, 200));
    child.kill();
    await exit;

    expect(stdout()).toContain('echo:ping');
  });

  it('captures stderr separately', async () => {
    const child = spawnStreaming(process.execPath, ['-e', 'process.stderr.write("warned")']);
    let stderr = '';
    child.onStderr((chunk) => {
      stderr += chunk;
    });
    const { exit } = collect(child);

    await exit;

    expect(stderr).toBe('warned');
  });

  it('reports the exit code of a child that ran and stopped', async () => {
    const child = spawnStreaming(process.execPath, ['-e', 'process.exit(3)']);
    const { exit } = collect(child);

    await expect(exit).resolves.toMatchObject({ code: 3, error: null });
  });

  // A missing binary must not throw past the caller: `maestro` not being
  // installed is criterion 21's own error code, reported as a value.
  it('reports a binary that does not exist as a failure to start', async () => {
    const child = spawnStreaming('conductor-no-such-binary', []);
    const { exit } = collect(child);

    await expect(exit).resolves.toMatchObject({ error: expect.any(Error) });
  });

  it('fires the exit listener exactly once when a child fails to start', async () => {
    const child = spawnStreaming('conductor-no-such-binary', []);
    let fired = 0;
    child.onExit(() => {
      fired += 1;
    });

    await new Promise((resolve) => setTimeout(resolve, 300));

    expect(fired).toBe(1);
  });

  it('kills a child that would otherwise stay up forever', async () => {
    const child = spawnStreaming(process.execPath, ['-e', 'setInterval(() => {}, 1000)']);
    const { exit } = collect(child);

    child.kill();

    await expect(exit).resolves.toBeDefined();
  });

  it('survives a kill on a child that already exited', async () => {
    const child = spawnStreaming(process.execPath, ['-e', '']);
    const { exit } = collect(child);
    await exit;

    expect(() => {
      child.kill();
    }).not.toThrow();
  });

  it('survives a write to a child that already exited', async () => {
    const child = spawnStreaming(process.execPath, ['-e', '']);
    const { exit } = collect(child);
    await exit;

    expect(() => {
      child.write('ping\n');
    }).not.toThrow();
  });

  /** §12.19 again: an argument array, never a shell string. */
  it('passes arguments literally instead of interpreting them as shell syntax', async () => {
    const child = spawnStreaming(process.execPath, [
      '-e',
      'process.stdout.write(process.argv[1])',
      '; rm -rf / && echo pwned',
    ]);
    const { stdout, exit } = collect(child);

    await exit;

    expect(stdout()).toBe('; rm -rf / && echo pwned');
  });

  /** How `MAESTRO_CLI_NO_ANALYTICS=1` reaches the child (.context.md §12 rule 10). */
  it('passes the environment it is given to the child', async () => {
    const child = spawnStreaming(
      process.execPath,
      ['-e', 'process.stdout.write(String(process.env.CONDUCTOR_TEST_VAR))'],
      { env: { ...process.env, CONDUCTOR_TEST_VAR: 'set' } },
    );
    const { stdout, exit } = collect(child);

    await exit;

    expect(stdout()).toBe('set');
  });
});

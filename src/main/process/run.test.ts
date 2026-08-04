import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_BUFFER, run, type StreamingProcess, spawnStreaming } from './run';

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
 * The long-lived half. `run` buffers to completion, which is exactly wrong for
 * a child that is meant to stay up and answer over stdio — so the `maestro mcp`
 * the Viewer needs gets this instead. Also exercised against real processes.
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

import { describe, expect, it } from 'vitest';
import { DEFAULT_MAX_BUFFER, run } from './run';

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

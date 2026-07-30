import { execFile } from 'node:child_process';

export interface RunResult {
  readonly stdout: string;
  readonly stderr: string;
  /** The process' exit code. `0` on success; non-zero is a value, not a throw. */
  readonly code: number;
}

export interface RunOptions {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeout?: number;
  readonly maxBuffer?: number;
  readonly signal?: AbortSignal;
}

/**
 * Node applies its own 1 MB default only when `maxBuffer` is *absent*; passing
 * `undefined` through removes the ceiling entirely, which would let a runaway
 * child grow main's heap without bound. So the default is set here, explicitly:
 * generous enough for a dense `maestro hierarchy` dump, finite by construction.
 */
export const DEFAULT_MAX_BUFFER = 16 * 1024 * 1024;

/**
 * The only `execFile` wrapper, and — with `CliRunner` and `ScreenCapture` —
 * one of the only three files allowed to create an OS process (.context.md
 * §10.1, §12.19). Biome enforces that; if the rule fires elsewhere, the code
 * is in the wrong file.
 *
 * Takes an argument array, never a composed shell string, so model-generated
 * text (PR bodies, AI prompts) can never turn into shell syntax (§8.1).
 *
 * A process that ran and exited resolves — including with a non-zero `code`.
 * A process that never started (missing binary, timeout, abort) rejects: there
 * is no exit code to report, and the caller must be able to tell them apart.
 */
export function run(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...args],
      {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeout,
        maxBuffer: options.maxBuffer ?? DEFAULT_MAX_BUFFER,
        signal: options.signal,
        encoding: 'utf8',
        shell: false,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolve({ stdout, stderr, code: 0 });
          return;
        }
        if (typeof error.code === 'number') {
          resolve({ stdout, stderr, code: error.code });
          return;
        }
        reject(error);
      },
    );
  });
}

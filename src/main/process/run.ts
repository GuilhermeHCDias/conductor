import { execFile, spawn } from 'node:child_process';

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

export interface BinaryRunResult {
  /** Exactly the bytes the child wrote. Never decoded, here or anywhere above. */
  readonly stdout: Buffer;
  /** Text, because it is a message: `adb` reports "device not found" here. */
  readonly stderr: string;
  readonly code: number;
}

/**
 * `run`, for a child whose stdout is a payload rather than a message.
 *
 * It exists because `run` hardcodes `encoding: 'utf8'` — correct for every text
 * caller it has, and fatal for `adb exec-out screencap -p`. A PNG opens with
 * `0x89`, which is not a legal UTF-8 start byte, so decoding substitutes U+FFFD
 * and the file stops being a PNG at byte one. §10.1 rule 2 has the screenshot
 * cross every boundary as bytes; this is where that starts being true.
 *
 * Same contract as `run` in every other respect: an argument array, never a
 * shell; a process that ran and exited resolves, including non-zero; a process
 * that never started rejects.
 */
export function runBinary(
  command: string,
  args: readonly string[],
  options: RunOptions = {},
): Promise<BinaryRunResult> {
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
        // The whole point. `execFile` hands both streams back as Buffers, and
        // only stderr is decoded below.
        encoding: 'buffer',
        shell: false,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        const result = { stdout, stderr: stderr.toString('utf8') };
        if (error === null) {
          resolve({ ...result, code: 0 });
          return;
        }
        if (typeof error.code === 'number') {
          resolve({ ...result, code: error.code });
          return;
        }
        reject(error);
      },
    );
  });
}

/** Why the child stopped. `error` is set only when it never started at all. */
export type ExitReason = {
  readonly code: number | null;
  readonly error: Error | null;
};

/**
 * A child that stays up, talked to over its own stdio. Deliberately narrow:
 * callers get text in, text out and a way to stop it, and never a
 * `ChildProcess` — process creation stays inside this file (.context.md §10.1).
 */
export interface StreamingProcess {
  /** Writes to the child's stdin. A no-op once it has exited. */
  write: (chunk: string) => void;
  onStdout: (listener: (chunk: string) => void) => void;
  onStderr: (listener: (chunk: string) => void) => void;
  /** Fires exactly once — on exit, or on a failure to start. */
  onExit: (listener: (reason: ExitReason) => void) => void;
  /** Idempotent, and safe on a child that already exited. */
  kill: () => void;
}

export type SpawnOptions = {
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
};

/**
 * The streaming counterpart to `run`, for the one child that must outlive a
 * single call: the `maestro mcp` server behind `inspect_screen`. `run` buffers
 * to completion, which for a server on stdio means waiting forever.
 *
 * Same rules as `run`: an argument array, never a shell, and a failure to start
 * is reported as a value rather than thrown at whoever happened to be awaiting.
 */
export function spawnStreaming(
  command: string,
  args: readonly string[],
  options: SpawnOptions = {},
): StreamingProcess {
  const child = spawn(command, [...args], {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');

  // Both `error` and `exit` can fire for one child (`error` alone when it never
  // started), and a caller that has to guard against a second notification will
  // eventually forget to. One shot, whichever arrives first.
  const exitListeners = new Set<(reason: ExitReason) => void>();
  let reason: ExitReason | null = null;

  const settle = (next: ExitReason): void => {
    if (reason !== null) {
      return;
    }
    reason = next;
    for (const listener of exitListeners) {
      listener(next);
    }
    exitListeners.clear();
  };

  child.on('error', (error) => {
    settle({ code: null, error });
  });
  child.on('exit', (code) => {
    settle({ code, error: null });
  });
  // A child that dies with its stdin still open makes the write below emit
  // EPIPE on the process itself, which in Node is an unhandled error event.
  child.stdin.on('error', () => {});

  return {
    write: (chunk) => {
      if (reason === null && child.stdin.writable) {
        child.stdin.write(chunk);
      }
    },
    onStdout: (listener) => {
      child.stdout.on('data', (chunk: string) => {
        listener(chunk);
      });
    },
    onStderr: (listener) => {
      child.stderr.on('data', (chunk: string) => {
        listener(chunk);
      });
    },
    onExit: (listener) => {
      if (reason !== null) {
        listener(reason);
        return;
      }
      exitListeners.add(listener);
    },
    kill: () => {
      if (reason === null) {
        child.kill();
      }
    },
  };
}

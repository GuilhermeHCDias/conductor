import { delimiter, join } from 'node:path';

export type ResolveClaudeDeps = {
  /** `CONFIG.CLAUDE_PATH`. Empty means "resolve it yourself". */
  readonly configuredPath: string;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly isExecutable: (path: string) => boolean;
};

/**
 * Where `claude` is on this machine: the configured path, then `PATH`, then
 * the installer's own `~/.local/bin` and the two Homebrew shelves — a GUI
 * app's `PATH` routinely lacks all three. Same ladder shape as `resolveGh`
 * and `resolveMaestro`. Nothing here is an error: without `claude` the note
 * falls back to mechanical text and publishing proceeds untouched (§8.4).
 */
export function resolveClaude(deps: ResolveClaudeDeps): string | null {
  const { configuredPath, env, home, isExecutable } = deps;
  const candidates = [
    ...(configuredPath === '' ? [] : [configuredPath]),
    ...(env.PATH ?? '')
      .split(delimiter)
      .flatMap((dir) => (dir === '' ? [] : [join(dir, 'claude')])),
    join(home, '.local', 'bin', 'claude'),
    '/opt/homebrew/bin/claude',
    '/usr/local/bin/claude',
  ];
  return candidates.find((candidate) => isExecutable(candidate)) ?? null;
}

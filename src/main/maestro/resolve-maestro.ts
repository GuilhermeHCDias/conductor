import { delimiter, join } from 'node:path';

export type ResolveMaestroDeps = {
  /** `CONFIG.MAESTRO_PATH`. Empty means "resolve it yourself". */
  readonly configuredPath: string;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly isExecutable: (path: string) => boolean;
};

/**
 * Where `maestro` is on this machine: the configured path, then `PATH`, then
 * where the Maestro installer puts it. One ladder for both consumers — the
 * `maestro mcp` child and the raw CLI runner — because two copies of "where is
 * maestro" would eventually disagree about it.
 */
export function resolveMaestro(deps: ResolveMaestroDeps): string | null {
  const { configuredPath, env, home, isExecutable } = deps;
  const candidates = [
    ...(configuredPath === '' ? [] : [configuredPath]),
    ...(env.PATH ?? '')
      .split(delimiter)
      .flatMap((dir) => (dir === '' ? [] : [join(dir, 'maestro')])),
    join(home, '.maestro', 'bin', 'maestro'),
  ];
  return candidates.find((candidate) => isExecutable(candidate)) ?? null;
}

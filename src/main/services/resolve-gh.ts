import { delimiter, join } from 'node:path';

export type ResolveGhDeps = {
  /** `CONFIG.GH_PATH`. Empty means "resolve it yourself". */
  readonly configuredPath: string;
  readonly env: NodeJS.ProcessEnv;
  readonly isExecutable: (path: string) => boolean;
};

/**
 * Where `gh` is on this machine: the configured path, then `PATH`, then the
 * two places Homebrew puts it — a GUI app's `PATH` on macOS routinely lacks
 * `/opt/homebrew/bin`, and "gh missing" when it is right there would send the
 * person installing a second copy. Same ladder shape as `resolveMaestro`.
 */
export function resolveGh(deps: ResolveGhDeps): string | null {
  const { configuredPath, env, isExecutable } = deps;
  const candidates = [
    ...(configuredPath === '' ? [] : [configuredPath]),
    ...(env.PATH ?? '').split(delimiter).flatMap((dir) => (dir === '' ? [] : [join(dir, 'gh')])),
    '/opt/homebrew/bin/gh',
    '/usr/local/bin/gh',
  ];
  return candidates.find((candidate) => isExecutable(candidate)) ?? null;
}

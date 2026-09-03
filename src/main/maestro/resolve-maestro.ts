import { delimiter, join } from 'node:path';

export type ResolveMaestroDeps = {
  /** `CONFIG.MAESTRO_PATH`. Empty means "resolve it yourself". */
  readonly configuredPath: string;
  /** `userData/maestro` — the copy Conductor installs and pins (doctor
   * criterion 8). It resolves only whole: marker present *and* binary
   * executable. */
  readonly managedDir: string;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  readonly isExecutable: (path: string) => boolean;
  /** True when `path` is a regular file — the marker probe. */
  readonly isFile: (path: string) => boolean;
};

/** The marker written beside the managed copy, holding the version it is. */
export const MANAGED_MARKER = 'version';

/** Where the managed copy's launcher lives, as the archive lays it out. */
export function managedMaestroBinary(managedDir: string): string {
  return join(managedDir, 'bin', 'maestro');
}

export function managedMaestroMarker(managedDir: string): string {
  return join(managedDir, MANAGED_MARKER);
}

/**
 * Where `maestro` is on this machine: the configured path, then Conductor's
 * own managed copy, then `PATH`, then where the official installer puts it.
 * One ladder for every consumer — the `maestro mcp` child, the raw CLI
 * runner, the assistant's `--mcp-config` and the doctor — because two copies
 * of "where is maestro" would eventually disagree about it.
 *
 * The managed rung needs both halves (doctor criterion 20): the marker lands
 * before the rename that makes the copy visible, so a binary without one is
 * an install that never finished, and it must not resolve.
 */
export function resolveMaestro(deps: ResolveMaestroDeps): string | null {
  const { configuredPath, managedDir, env, home, isExecutable, isFile } = deps;
  if (configuredPath !== '' && isExecutable(configuredPath)) {
    return configuredPath;
  }
  const managed = managedMaestroBinary(managedDir);
  if (isFile(managedMaestroMarker(managedDir)) && isExecutable(managed)) {
    return managed;
  }
  const candidates = [
    ...(env.PATH ?? '')
      .split(delimiter)
      .flatMap((dir) => (dir === '' ? [] : [join(dir, 'maestro')])),
    join(home, '.maestro', 'bin', 'maestro'),
  ];
  return candidates.find((candidate) => isExecutable(candidate)) ?? null;
}

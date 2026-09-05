import { delimiter, dirname } from 'node:path';

/**
 * Homebrew, decided without running it (criteria 4, 12, 15): where `brew`
 * is, the argv and env for the two tools it installs, and what its output
 * came to. The service spawns it through `spawnStreaming`; this creates
 * nothing. Never `update`, `upgrade` or `uninstall` — install alone.
 */

/** The two tools Homebrew installs for Conductor (criterion 5). */
export type BrewToolId = 'gh' | 'adb';

const BREW_TOOLS: ReadonlySet<string> = new Set<BrewToolId>(['gh', 'adb']);

/** Narrows a tool id to one Homebrew installs — the plan never hands
 * `homebrew` to another, and this is what proves it to the type checker. */
export function isBrewTool(id: string): id is BrewToolId {
  return BREW_TOOLS.has(id);
}

/** Apple silicon's prefix first, then Intel's. */
const HOMEBREW_CANDIDATES = ['/opt/homebrew/bin/brew', '/usr/local/bin/brew'] as const;

export type FindHomebrewDeps = {
  readonly env: NodeJS.ProcessEnv;
  /** `CONDUCTOR_HOMEBREW=0` is a dev knob: packaged builds ignore it. */
  readonly packaged: boolean;
  readonly isExecutable: (path: string) => boolean;
};

export function findHomebrew(deps: FindHomebrewDeps): string | null {
  if (!deps.packaged && deps.env.CONDUCTOR_HOMEBREW === '0') {
    return null;
  }
  return HOMEBREW_CANDIDATES.find((candidate) => deps.isExecutable(candidate)) ?? null;
}

/** A formula for `gh`, the binaries-only cask for platform-tools. */
export function brewInstallArgs(tool: BrewToolId): readonly string[] {
  return tool === 'gh' ? ['install', 'gh'] : ['install', '--cask', 'android-platform-tools'];
}

/** The four non-interactive flags of criterion 12, and the prefix's `bin`
 * on `PATH` — a GUI app's `PATH` routinely lacks it, and brew's own
 * post-install steps call tools from there. */
export function brewEnv(brew: string, env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const bin = dirname(brew);
  const path = (env.PATH ?? '').split(delimiter).filter((dir) => dir !== '');
  return {
    ...env,
    HOMEBREW_NO_AUTO_UPDATE: '1',
    HOMEBREW_NO_INSTALL_CLEANUP: '1',
    HOMEBREW_NO_ENV_HINTS: '1',
    NONINTERACTIVE: '1',
    PATH: (path.includes(bin) ? path : [bin, ...path]).join(delimiter),
  };
}

/** The step line while the child runs (criterion 12). */
export function brewStep(tool: BrewToolId): string {
  return tool === 'gh' ? 'Installing gh with Homebrew' : 'Installing platform-tools with Homebrew';
}

/** Criterion 15's `detail`: the first non-empty stderr line — brew prints
 * `Error: …` first — else the exit. */
export function brewFailureDetail(stderr: string, code: number | null): string {
  const line = stderr.split(/\r?\n/).find((entry) => entry.trim() !== '');
  if (line !== undefined) {
    return line.trim();
  }
  return code === null ? 'brew was killed' : `brew exited ${code}`;
}

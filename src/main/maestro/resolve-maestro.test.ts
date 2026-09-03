import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { managedMaestroBinary, type ResolveMaestroDeps, resolveMaestro } from './resolve-maestro';

/**
 * The one ladder for every maestro consumer (doctor criterion 9): the
 * configured path, then Conductor's own managed copy, then `PATH`, then the
 * official installer's `~/.maestro/bin`. Everything is injected, so a machine
 * is just two sets of paths.
 */

const HOME = '/Users/someone';
const MANAGED = '/Users/someone/Library/Application Support/Conductor/maestro';

function deps(overrides: {
  configuredPath?: string;
  executables?: readonly string[];
  files?: readonly string[];
  path?: string;
}): ResolveMaestroDeps {
  const executables = new Set(overrides.executables ?? []);
  const files = new Set(overrides.files ?? []);
  return {
    configuredPath: overrides.configuredPath ?? '',
    managedDir: MANAGED,
    env: { PATH: overrides.path ?? '/usr/bin:/opt/homebrew/bin' },
    home: HOME,
    isExecutable: (path) => executables.has(path),
    isFile: (path) => files.has(path),
  };
}

const MANAGED_BIN = join(MANAGED, 'bin', 'maestro');
const MARKER = join(MANAGED, 'version');

describe('resolveMaestro', () => {
  it('names the managed binary under bin/ of the managed dir', () => {
    expect(managedMaestroBinary(MANAGED)).toBe(MANAGED_BIN);
  });

  it('prefers the configured path over everything', () => {
    const resolved = resolveMaestro(
      deps({
        configuredPath: '/custom/maestro',
        executables: ['/custom/maestro', MANAGED_BIN, '/opt/homebrew/bin/maestro'],
        files: [MARKER],
      }),
    );

    expect(resolved).toBe('/custom/maestro');
  });

  it('prefers the managed copy over PATH when its marker and binary are both there', () => {
    const resolved = resolveMaestro(
      deps({ executables: [MANAGED_BIN, '/opt/homebrew/bin/maestro'], files: [MARKER] }),
    );

    expect(resolved).toBe(MANAGED_BIN);
  });

  /** Criterion 20 — the marker lands before the rename, and the rename is the
   * only step that makes a copy visible. A binary with no marker beside it is
   * a half-installed copy, and a half-installed copy is not Maestro. */
  it('skips a managed binary whose marker is missing', () => {
    const resolved = resolveMaestro(
      deps({ executables: [MANAGED_BIN, '/opt/homebrew/bin/maestro'], files: [] }),
    );

    expect(resolved).toBe('/opt/homebrew/bin/maestro');
  });

  it('skips a managed marker whose binary is not executable', () => {
    const resolved = resolveMaestro(
      deps({ executables: ['/opt/homebrew/bin/maestro'], files: [MARKER] }),
    );

    expect(resolved).toBe('/opt/homebrew/bin/maestro');
  });

  it('walks PATH, then the official installer location', () => {
    expect(resolveMaestro(deps({ executables: ['/opt/homebrew/bin/maestro'] }))).toBe(
      '/opt/homebrew/bin/maestro',
    );
    expect(resolveMaestro(deps({ executables: [join(HOME, '.maestro', 'bin', 'maestro')] }))).toBe(
      join(HOME, '.maestro', 'bin', 'maestro'),
    );
  });

  it('answers null when nothing resolves', () => {
    expect(resolveMaestro(deps({}))).toBeNull();
  });
});

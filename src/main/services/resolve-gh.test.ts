import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveGh } from './resolve-gh';

/**
 * The ladder is the contract: configured path, then `PATH`, then the two
 * Homebrew shelves — because a GUI app's `PATH` routinely lacks them, and
 * "gh missing" while it sits right there sends the person installing a
 * second copy.
 */

function pathOf(...dirs: string[]): string {
  return dirs.join(delimiter);
}

function executable(...paths: string[]): (candidate: string) => boolean {
  return (candidate) => paths.includes(candidate);
}

describe('resolveGh', () => {
  it('answers the configured path first, before any searching', () => {
    const gh = resolveGh({
      configuredPath: '/custom/gh',
      env: { PATH: pathOf('/somewhere/bin') },
      isExecutable: executable('/custom/gh', join('/somewhere/bin', 'gh')),
    });

    expect(gh).toBe('/custom/gh');
  });

  it('falls through a configured path that is not there', () => {
    const gh = resolveGh({
      configuredPath: '/custom/gh',
      env: { PATH: pathOf('/somewhere/bin') },
      isExecutable: executable(join('/somewhere/bin', 'gh')),
    });

    expect(gh).toBe(join('/somewhere/bin', 'gh'));
  });

  it('walks PATH in order and answers the first hit', () => {
    const gh = resolveGh({
      configuredPath: '',
      env: { PATH: pathOf('/first/bin', '/second/bin') },
      isExecutable: executable(join('/first/bin', 'gh'), join('/second/bin', 'gh')),
    });

    expect(gh).toBe(join('/first/bin', 'gh'));
  });

  /** An empty segment must not become a bare relative `gh` — that would
   * resolve against whatever the working directory happens to be. */
  it('skips empty PATH segments', () => {
    const gh = resolveGh({
      configuredPath: '',
      env: { PATH: pathOf('', '/real/bin', '') },
      isExecutable: executable('gh', join('/real/bin', 'gh')),
    });

    expect(gh).toBe(join('/real/bin', 'gh'));
  });

  /** The GUI-app case: `PATH` has no Homebrew, the machine does. */
  it('reaches the Homebrew shelves when PATH misses', () => {
    const gh = resolveGh({
      configuredPath: '',
      env: { PATH: pathOf('/usr/bin') },
      isExecutable: executable('/opt/homebrew/bin/gh'),
    });

    expect(gh).toBe('/opt/homebrew/bin/gh');
  });

  it('still answers with no PATH in the environment at all', () => {
    const gh = resolveGh({
      configuredPath: '',
      env: {},
      isExecutable: executable('/usr/local/bin/gh'),
    });

    expect(gh).toBe('/usr/local/bin/gh');
  });

  it('answers null when gh is nowhere', () => {
    const gh = resolveGh({
      configuredPath: '/custom/gh',
      env: { PATH: pathOf('/somewhere/bin') },
      isExecutable: () => false,
    });

    expect(gh).toBeNull();
  });
});

import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveClaude } from './resolve-claude';

/**
 * The ladder is the contract, same shape as `resolveGh`: configured path,
 * then `PATH`, then where the installers put it — `~/.local/bin` is the
 * `claude` installer's own shelf, and a GUI app's `PATH` routinely lacks it.
 * Publishing works without `claude` (§8.4); resolving it just decides whether
 * the note is written by the AI or mechanically.
 */

function pathOf(...dirs: string[]): string {
  return dirs.join(delimiter);
}

function executable(...paths: string[]): (candidate: string) => boolean {
  return (candidate) => paths.includes(candidate);
}

const HOME = '/Users/someone';

describe('resolveClaude', () => {
  it('answers the configured path first, before any searching', () => {
    const claude = resolveClaude({
      configuredPath: '/custom/claude',
      env: { PATH: pathOf('/somewhere/bin') },
      home: HOME,
      isExecutable: executable('/custom/claude', join('/somewhere/bin', 'claude')),
    });

    expect(claude).toBe('/custom/claude');
  });

  it('falls through a configured path that is not there', () => {
    const claude = resolveClaude({
      configuredPath: '/custom/claude',
      env: { PATH: pathOf('/somewhere/bin') },
      home: HOME,
      isExecutable: executable(join('/somewhere/bin', 'claude')),
    });

    expect(claude).toBe(join('/somewhere/bin', 'claude'));
  });

  it('walks PATH in order and answers the first hit', () => {
    const claude = resolveClaude({
      configuredPath: '',
      env: { PATH: pathOf('/first/bin', '/second/bin') },
      home: HOME,
      isExecutable: executable(join('/first/bin', 'claude'), join('/second/bin', 'claude')),
    });

    expect(claude).toBe(join('/first/bin', 'claude'));
  });

  /** An empty segment must not become a bare relative `claude` — that would
   * resolve against whatever the working directory happens to be. */
  it('skips empty PATH segments', () => {
    const claude = resolveClaude({
      configuredPath: '',
      env: { PATH: pathOf('', '/real/bin', '') },
      home: HOME,
      isExecutable: executable('claude', join('/real/bin', 'claude')),
    });

    expect(claude).toBe(join('/real/bin', 'claude'));
  });

  /** The GUI-app case: the installer's own shelf, absent from `PATH`. */
  it("reaches the installer's ~/.local/bin when PATH misses", () => {
    const claude = resolveClaude({
      configuredPath: '',
      env: { PATH: pathOf('/usr/bin') },
      home: HOME,
      isExecutable: executable(join(HOME, '.local', 'bin', 'claude')),
    });

    expect(claude).toBe(join(HOME, '.local', 'bin', 'claude'));
  });

  it('reaches the Homebrew shelves when everything else misses', () => {
    const claude = resolveClaude({
      configuredPath: '',
      env: {},
      home: HOME,
      isExecutable: executable('/opt/homebrew/bin/claude'),
    });

    expect(claude).toBe('/opt/homebrew/bin/claude');
  });

  /** §8.4 — not an error anywhere above: the note falls back to mechanical
   * text and publishing proceeds untouched. */
  it('answers null when claude is nowhere', () => {
    const claude = resolveClaude({
      configuredPath: '/custom/claude',
      env: { PATH: pathOf('/somewhere/bin') },
      home: HOME,
      isExecutable: () => false,
    });

    expect(claude).toBeNull();
  });
});

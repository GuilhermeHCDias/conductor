import { describe, expect, it } from 'vitest';
import { ghHostsFile, signedInByFiles } from './gh-hosts';

/**
 * Criterion 2's file probe for the GitHub sign-in: where gh keeps its hosts
 * file and whether it names github.com — decided before first paint, no
 * process. The token is never looked for (§9.0). No I/O.
 */

describe('ghHostsFile', () => {
  it('is ~/.config/gh/hosts.yml by default', () => {
    expect(ghHostsFile({}, '/Users/x')).toBe('/Users/x/.config/gh/hosts.yml');
  });

  it('follows GH_CONFIG_DIR first, then XDG_CONFIG_HOME, as gh does', () => {
    expect(
      ghHostsFile({ GH_CONFIG_DIR: '/tmp/ghc', XDG_CONFIG_HOME: '/tmp/xdg' }, '/Users/x'),
    ).toBe('/tmp/ghc/hosts.yml');
    expect(ghHostsFile({ XDG_CONFIG_HOME: '/tmp/xdg' }, '/Users/x')).toBe('/tmp/xdg/gh/hosts.yml');
    expect(ghHostsFile({ GH_CONFIG_DIR: '' }, '/Users/x')).toBe('/Users/x/.config/gh/hosts.yml');
  });
});

describe('signedInByFiles', () => {
  it('is true when hosts.yml names github.com at the top level', () => {
    expect(signedInByFiles({}, 'github.com:\n    users:\n        me:\n    user: me\n')).toBe(true);
  });

  it('is false with no file, an empty file, or another host only', () => {
    expect(signedInByFiles({}, null)).toBe(false);
    expect(signedInByFiles({}, '')).toBe(false);
    expect(signedInByFiles({}, 'ghe.example.com:\n    user: me\n')).toBe(false);
    // Indented, so a value and not a host.
    expect(signedInByFiles({}, 'ghe.example.com:\n    github.com: x\n')).toBe(false);
  });

  it('is true when a token rides in the environment, whatever the file says', () => {
    expect(signedInByFiles({ GH_TOKEN: 'x' }, null)).toBe(true);
    expect(signedInByFiles({ GITHUB_TOKEN: 'x' }, null)).toBe(true);
    expect(signedInByFiles({ GH_TOKEN: '' }, null)).toBe(false);
  });
});

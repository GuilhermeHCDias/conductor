import { describe, expect, it } from 'vitest';
import { parseRepoUrl } from './repo-url';

/**
 * The renderer's copy of the address grammar — instant feedback with zero
 * IPC (spec: refusals happen without contacting the network). Main re-parses
 * what it receives and stays the authority; the two must agree, so these
 * cases mirror `repo-derive.test.ts`.
 */

describe('parseRepoUrl', () => {
  /** People paste three different strings meaning the same repository. */
  it.each([
    ['the browser URL', 'https://github.com/loja-verde/pnp-fast-mode'],
    ['the browser URL on a branch', 'https://github.com/loja-verde/pnp-fast-mode/tree/main'],
    ['the clone URL', 'https://github.com/loja-verde/pnp-fast-mode.git'],
    ['the SSH remote', 'git@github.com:loja-verde/pnp-fast-mode.git'],
    ['the bare address', 'github.com/loja-verde/pnp-fast-mode'],
  ])('reads %s', (_label, raw) => {
    expect(parseRepoUrl(raw)).toEqual({
      host: 'github.com',
      org: 'loja-verde',
      name: 'pnp-fast-mode',
    });
  });

  it('strips whitespace the clipboard brought along', () => {
    expect(parseRepoUrl(' github.com/loja-verde/pnp-fast-mode \n')?.name).toBe('pnp-fast-mode');
  });

  it('parses the hosts the resolver refuses by name', () => {
    expect(parseRepoUrl('https://gitlab.com/org/app')?.host).toBe('gitlab.com');
    expect(parseRepoUrl('git@bitbucket.org:org/app.git')?.host).toBe('bitbucket.org');
  });

  it.each([
    ['prose', 'not a repository'],
    ['an unknown host', 'https://example.com/org/app'],
    ['a missing name', 'github.com/loja-verde'],
    ['emptiness', ''],
  ])('refuses %s', (_label, raw) => {
    expect(parseRepoUrl(raw)).toBeNull();
  });
});

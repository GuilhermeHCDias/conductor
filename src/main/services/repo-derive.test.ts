import { hashText } from '@shared/hash';
import { describe, expect, it } from 'vitest';
import { deriveAppMeta, headBranch, headerAppId, parseRepoUrl, repoSlug } from './repo-derive';

/**
 * The pure half of the repo domain: §2.1's derivation from `app.json`, §7's
 * slug, and the three spellings of one repository address. Main re-parses the
 * raw URL itself — the renderer's copy exists for instant feedback, this one
 * is the authority (§9.3: nothing derived crosses the bridge inward).
 */

describe('parseRepoUrl', () => {
  /** People paste three different strings meaning the same repository. */
  it.each([
    ['the browser URL', 'https://github.com/loja-verde/pnp-fast-mode'],
    ['the browser URL on a branch', 'https://github.com/loja-verde/pnp-fast-mode/tree/main'],
    ['the clone URL', 'https://github.com/loja-verde/pnp-fast-mode.git'],
    ['the SSH remote', 'git@github.com:loja-verde/pnp-fast-mode.git'],
    ['the bare address', 'github.com/loja-verde/pnp-fast-mode'],
    ['a trailing slash', 'https://github.com/loja-verde/pnp-fast-mode/'],
  ])('reads %s', (_label, raw) => {
    expect(parseRepoUrl(raw)).toEqual({
      host: 'github.com',
      org: 'loja-verde',
      name: 'pnp-fast-mode',
    });
  });

  it('strips whitespace the clipboard brought along', () => {
    expect(parseRepoUrl('  github.com/loja-verde/pnp-fast-mode\n')).toEqual({
      host: 'github.com',
      org: 'loja-verde',
      name: 'pnp-fast-mode',
    });
  });

  it('keeps a dotted name whole and strips only a trailing .git', () => {
    expect(parseRepoUrl('github.com/org/app.js.git')?.name).toBe('app.js');
    expect(parseRepoUrl('github.com/org/app.js')?.name).toBe('app.js');
  });

  /** The other two hosts the address grammar knows — parsed, so the resolver
   * can refuse them by name instead of calling them gibberish. */
  it('parses the hosts it refuses later', () => {
    expect(parseRepoUrl('https://gitlab.com/org/app')?.host).toBe('gitlab.com');
    expect(parseRepoUrl('git@bitbucket.org:org/app.git')?.host).toBe('bitbucket.org');
  });

  it('lowercases the host and only the host', () => {
    expect(parseRepoUrl('HTTPS://GitHub.com/Loja-Verde/App')).toEqual({
      host: 'github.com',
      org: 'Loja-Verde',
      name: 'App',
    });
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

describe('repoSlug', () => {
  /** §7 — readable, sanitized, and derived from owner/name alone. */
  it('is the sanitized owner and name plus a short stable hash', () => {
    const hash = hashText('loja-verde/pnp-fast-mode');

    expect(repoSlug('loja-verde', 'pnp-fast-mode')).toBe(`loja-verde-pnp-fast-mode-${hash}`);
  });

  it('is case-insensitive, like GitHub itself', () => {
    expect(repoSlug('Loja-Verde', 'PnP-Fast-Mode')).toBe(repoSlug('loja-verde', 'pnp-fast-mode'));
  });

  /** The readable prefix can collide across different repos; the hash of the
   * exact pair keeps the directories apart. */
  it('keeps two repos apart even when their sanitized names collide', () => {
    expect(repoSlug('a-b', 'c')).not.toBe(repoSlug('a', 'b-c'));
  });

  it('sanitizes anything the filesystem would mind', () => {
    expect(repoSlug('org', 'app..name')).toMatch(/^org-app-name-[0-9a-f]{8}$/);
  });
});

describe('deriveAppMeta', () => {
  const full = JSON.stringify({
    expo: {
      name: 'PnP Fast Mode',
      android: { package: 'com.lojaverde.pnp' },
      ios: { bundleIdentifier: 'com.lojaverde.pnp.ios' },
    },
  });

  /** §2.1's table: appName from expo.name, appId from the two platform ids. */
  it('derives the name and both ids', () => {
    expect(deriveAppMeta(full, 'pnp-fast-mode')).toEqual({
      ok: true,
      appName: 'PnP Fast Mode',
      appId: { android: 'com.lojaverde.pnp', ios: 'com.lojaverde.pnp.ios' },
    });
  });

  it('lets one side be missing', () => {
    const androidOnly = JSON.stringify({
      expo: { name: 'X', android: { package: 'com.x' } },
    });

    expect(deriveAppMeta(androidOnly, 'x')).toEqual({
      ok: true,
      appName: 'X',
      appId: { android: 'com.x', ios: null },
    });
  });

  /** Resolution fails only on the ids (§2.1 MVP); a missing display name
   * falls back to the repo's own. */
  it('falls back to the repo name when expo.name is absent', () => {
    const nameless = JSON.stringify({ expo: { ios: { bundleIdentifier: 'com.x' } } });

    const meta = deriveAppMeta(nameless, 'pnp-fast-mode');

    expect(meta.ok && meta.appName).toBe('pnp-fast-mode');
  });

  /** Some Expo app.json files carry the config at the top level. */
  it('reads a config that has no expo wrapper', () => {
    const bare = JSON.stringify({ name: 'X', android: { package: 'com.x' } });

    expect(deriveAppMeta(bare, 'x').ok).toBe(true);
  });

  /** §2.1 MVP — the message names exactly what was missing. */
  it('fails naming both missing ids', () => {
    const meta = deriveAppMeta(JSON.stringify({ expo: { name: 'X' } }), 'x');

    expect(meta).toEqual({
      ok: false,
      message: 'app.json declares neither expo.android.package nor expo.ios.bundleIdentifier.',
    });
  });

  it('treats an empty id as missing', () => {
    const empty = JSON.stringify({ expo: { android: { package: '' } } });

    expect(deriveAppMeta(empty, 'x').ok).toBe(false);
  });

  it('fails naming the parse when app.json is not JSON', () => {
    expect(deriveAppMeta('{ not json', 'x')).toEqual({
      ok: false,
      message: 'app.json is not valid JSON.',
    });
  });
});

describe('headBranch', () => {
  it('reads the checked-out branch from HEAD', () => {
    expect(headBranch('ref: refs/heads/main\n')).toBe('main');
  });

  /** Branch names legitimately carry slashes. */
  it('keeps a slashed branch whole', () => {
    expect(headBranch('ref: refs/heads/feature/pix')).toBe('feature/pix');
  });

  it('shortens a detached head to the honest seven characters', () => {
    expect(headBranch('4f2d9c1a8b7e6d5c4b3a29181716151413121110\n')).toBe('4f2d9c1');
  });

  it('answers null for anything else', () => {
    expect(headBranch('')).toBeNull();
    expect(headBranch('gitdir: elsewhere')).toBeNull();
  });
});

describe('headerAppId', () => {
  /** The single value a flow header can carry while the ❓ of §2.1 is open. */
  it('answers the one id when both sides agree or one is missing', () => {
    expect(headerAppId({ android: 'com.x', ios: 'com.x' })).toBe('com.x');
    expect(headerAppId({ android: 'com.x', ios: null })).toBe('com.x');
    expect(headerAppId({ android: null, ios: 'com.y' })).toBe('com.y');
  });

  /** §2.1's open ❓ — divergence has no single header value, and choosing one
   * in silence is exactly what §12.22 forbids. */
  it('answers null when the two sides diverge', () => {
    expect(headerAppId({ android: 'com.x', ios: 'com.y' })).toBeNull();
    expect(headerAppId({ android: null, ios: null })).toBeNull();
  });
});

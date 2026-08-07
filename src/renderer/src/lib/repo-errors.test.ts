import { describe, expect, it } from 'vitest';
import { repoErrorSurface } from './repo-errors';

/**
 * Stable code in, kit surface out (CRepo.jsx verbatim where a string
 * exists): title, body, the actionable command for the well, and whether
 * "Try again" makes sense. Pure, so every refusal reads exactly one way.
 */

const REPO = { host: 'github.com', org: 'loja-verde', name: 'pnp-fast-mode' };

describe('repoErrorSurface', () => {
  it('explains a string that is not an address', () => {
    expect(repoErrorSurface('repo/invalid-url', '', null)).toEqual({
      title: 'That is not a repository address',
      body: 'Paste the address you would clone from — github.com/org/app. The browser URL and the SSH remote both work.',
      command: null,
    });
  });

  it('names the unsupported host', () => {
    expect(repoErrorSurface('repo/unsupported-host', '', { ...REPO, host: 'gitlab.com' })).toEqual({
      title: 'Conductor reads GitHub only, for now',
      body: 'gitlab.com repositories are not supported yet.',
      command: null,
    });
  });

  it('points an already-connected repo at the sidebar', () => {
    expect(repoErrorSurface('repo/already-connected', '', REPO)).toEqual({
      title: 'Already connected',
      body: 'loja-verde/pnp-fast-mode is in your list. Switch to it from the sidebar.',
      command: null,
    });
  });

  /** §8.1 — installed and signed-in are different failures with different
   * fixes, and each command well carries the one that actually helps. */
  it('sends a missing gh to the installer', () => {
    const surface = repoErrorSurface('repo/gh-missing', '', REPO);

    expect(surface.title).toBe('Conductor cannot read this repository');
    expect(surface.body).toContain('not installed');
    expect(surface.command).toBe('brew install gh');
  });

  it('sends a signed-out gh to gh auth login', () => {
    expect(repoErrorSurface('repo/gh-unauthenticated', '', REPO)).toEqual({
      title: 'Conductor cannot read this repository',
      body: 'gh could not reach loja-verde/pnp-fast-mode. Sign in with an account that has access, then try again.',
      command: 'gh auth login',
    });
  });

  it('treats a failed clone as unreachable, with the same fix', () => {
    expect(repoErrorSurface('repo/clone-failed', 'gh could not clone.', REPO).command).toBe(
      'gh auth login',
    );
  });

  /** §2.1 MVP — main's message names exactly what was missing, and it is
   * the one thing worth showing. */
  it('shows the app-config message as the body', () => {
    const surface = repoErrorSurface(
      'repo/app-config-unreadable',
      'app.json declares neither expo.android.package nor expo.ios.bundleIdentifier.',
      REPO,
    );

    expect(surface).toEqual({
      title: 'Conductor cannot read the app config',
      body: 'app.json declares neither expo.android.package nor expo.ios.bundleIdentifier.',
      command: null,
    });
  });

  it('falls back to the message for a code it does not know', () => {
    const surface = repoErrorSurface('ipc/handler-failed', 'Something threw.', null);

    expect(surface.title).toBe('Conductor cannot read this repository');
    expect(surface.body).toBe('Something threw.');
    expect(surface.command).toBeNull();
  });
});

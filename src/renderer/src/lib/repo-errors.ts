import type { ErrorCode } from '@shared/ipc';
import type { ParsedRepoUrl } from './repo-url';

/**
 * Stable code in, kit surface out. The resolver never asks for anything it
 * can read, and when it cannot read the repo it says so in the terms the
 * developer will act on — the gh command, verbatim (CRepo.jsx). Strings come
 * from the kit where a string exists; the app-config body is main's message,
 * because only main knows exactly what was missing (§2.1 MVP).
 */

export type RepoErrorSurface = {
  readonly title: string;
  readonly body: string;
  /** Rendered in the command well with a Copy button; also what makes
   * "Try again" worth offering (the kit gates retry on it). */
  readonly command: string | null;
};

const INVALID_BODY =
  'Paste the address you would clone from — github.com/org/app. The browser URL and the SSH remote both work.';

export function repoErrorSurface(
  code: string,
  message: string,
  repo: ParsedRepoUrl | null,
): RepoErrorSurface {
  const fullName = repo === null ? 'this repository' : `${repo.org}/${repo.name}`;
  // `satisfies` pins each literal to the shared `ERROR_CODES` values — the
  // layer rule keeps this module to type imports, and a renamed code must
  // fail the build here rather than silently fall to the default surface.
  switch (code) {
    case 'repo/invalid-url' satisfies ErrorCode:
      return { title: 'That is not a repository address', body: INVALID_BODY, command: null };
    case 'repo/unsupported-host' satisfies ErrorCode:
      return {
        title: 'Conductor reads GitHub only, for now',
        body: repo === null ? message : `${repo.host} repositories are not supported yet.`,
        command: null,
      };
    case 'repo/already-connected' satisfies ErrorCode:
      return {
        title: 'Already connected',
        body: `${fullName} is in your list. Switch to it from the sidebar.`,
        command: null,
      };
    case 'repo/gh-missing' satisfies ErrorCode:
      return {
        title: 'Conductor cannot read this repository',
        body: 'The GitHub CLI (gh) is not installed. Install it, sign in, and try again.',
        command: 'brew install gh',
      };
    case 'repo/gh-unauthenticated' satisfies ErrorCode:
    case 'repo/clone-failed' satisfies ErrorCode:
      return {
        title: 'Conductor cannot read this repository',
        body: `gh could not reach ${fullName}. Sign in with an account that has access, then try again.`,
        command: 'gh auth login',
      };
    case 'repo/app-config-unreadable' satisfies ErrorCode:
      return { title: 'Conductor cannot read the app config', body: message, command: null };
    default:
      return {
        title: 'Conductor cannot read this repository',
        body: message,
        command: null,
      };
  }
}

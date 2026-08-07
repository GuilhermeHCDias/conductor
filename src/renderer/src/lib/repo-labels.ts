import type { RepoAppId } from '@shared/ipc';

/**
 * The three little words every repo surface repeats — the sidebar bar, the
 * switcher popover and the found card — derived pure so they can never
 * disagree. Android first: it is the platform the mirror drives today; a
 * repo that only declares iOS still shows its one honest id.
 */

export function primaryBundleId(appId: RepoAppId): string | null {
  return appId.android ?? appId.ios;
}

/** The found card's corner label: which sides the app.json declares. */
export function platformLabel(appId: RepoAppId): string {
  if (appId.android !== null && appId.ios !== null) {
    return 'Android · iOS';
  }
  if (appId.android !== null) {
    return 'Android';
  }
  return appId.ios !== null ? 'iOS' : '';
}

/** The kit's count, words included: zero is "empty for now", never an
 * error and never a bare 0. */
export function flowCountLabel(count: number): string {
  if (count === 0) {
    return 'empty for now';
  }
  return count === 1 ? '1 flow' : `${count} flows`;
}

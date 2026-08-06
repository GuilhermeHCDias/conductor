import { hashText } from '@shared/hash';
import type { RepoAppId } from '@shared/ipc';

/**
 * The pure half of the repo domain: parsing the pasted address, deriving the
 * slug (§7), reading §2.1's facts out of a static `app.json`, and the two
 * small readers the found card leans on. No I/O — the `RepoService` owns the
 * disk and the processes; everything here is a function of its arguments.
 */

export type ParsedRepoUrl = {
  readonly host: string;
  readonly org: string;
  readonly name: string;
};

/**
 * People paste three different strings meaning the same repository: the
 * browser URL (often with `/tree/main` on the end), the https clone URL, and
 * the SSH remote. All three are read; unknown hosts are not an address at
 * all, while gitlab and bitbucket parse so the resolver can refuse them by
 * name. Main runs this again over what the renderer sent — the renderer's
 * copy is for instant feedback, this one is the authority (§9.3).
 */
export function parseRepoUrl(raw: string): ParsedRepoUrl | null {
  const text = raw.trim().replace(/\s+/g, '');
  const match = text.match(
    /^(?:https?:\/\/)?(?:git@)?(github\.com|gitlab\.com|bitbucket\.org)[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?(?:\/.*)?$/i,
  );
  if (
    match === null ||
    match[1] === undefined ||
    match[2] === undefined ||
    match[3] === undefined
  ) {
    return null;
  }
  return { host: match[1].toLowerCase(), org: match[2], name: match[3] };
}

/**
 * §7 — `userData/repos/<slug>`, derived from sanitized `owner/name` and never
 * from the raw URL. The readable prefix is for whoever opens the folder; the
 * FNV hash of the exact lowercased pair is what keeps `a-b/c` and `a/b-c`
 * from landing in the same directory.
 */
export function repoSlug(org: string, name: string): string {
  const pair = `${org.toLowerCase()}/${name.toLowerCase()}`;
  return `${sanitize(org)}-${sanitize(name)}-${hashText(pair)}`;
}

function sanitize(part: string): string {
  return part
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export type AppMeta =
  | { readonly ok: true; readonly appName: string; readonly appId: RepoAppId }
  | { readonly ok: false; readonly message: string };

/**
 * §2.1's table, over a static JSON parse only — evaluating `app.config.js`
 * would be executing repository code, and that never happens implicitly.
 * Resolution fails only on the ids; a missing `expo.name` falls back to the
 * repo's own name, because the ids are what launch the app and the name only
 * labels it.
 */
export function deriveAppMeta(appJsonText: string, fallbackName: string): AppMeta {
  let parsed: unknown;
  try {
    parsed = JSON.parse(appJsonText);
  } catch {
    return { ok: false, message: 'app.json is not valid JSON.' };
  }
  const root = asRecord(parsed);
  // Canonical app.json wraps the config in `expo`; some carry it top-level.
  const expo = asRecord(root?.expo) ?? root ?? {};
  const android = nonEmptyString(asRecord(expo.android)?.package);
  const ios = nonEmptyString(asRecord(expo.ios)?.bundleIdentifier);
  if (android === null && ios === null) {
    return {
      ok: false,
      message: 'app.json declares neither expo.android.package nor expo.ios.bundleIdentifier.',
    };
  }
  return {
    ok: true,
    appName: nonEmptyString(expo.name) ?? fallbackName,
    appId: { android, ios },
  };
}

/**
 * The clone's checked-out branch, read straight from `.git/HEAD` — no process
 * for a one-line file. A detached head answers its honest short hash; noise
 * answers `null`, and the card simply shows nothing.
 */
export function headBranch(headText: string): string | null {
  const trimmed = headText.trim();
  const ref = trimmed.match(/^ref: refs\/heads\/(.+)$/);
  if (ref?.[1] !== undefined) {
    return ref[1];
  }
  if (/^[0-9a-f]{40}$/i.test(trimmed)) {
    return trimmed.slice(0, 7);
  }
  return null;
}

/**
 * The single value a flow header can carry. While §2.1's divergence ❓ is
 * open, two sides that disagree have no header value at all — `null`, so the
 * caller refuses with a clear message instead of choosing in silence
 * (§12.22).
 */
export function headerAppId(appId: RepoAppId): string | null {
  if (appId.android !== null && appId.ios !== null) {
    return appId.android === appId.ios ? appId.android : null;
  }
  return appId.android ?? appId.ios;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

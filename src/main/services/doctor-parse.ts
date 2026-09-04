/**
 * Pure parsers over what the doctor's CLIs print (doctor criterion 2). No I/O
 * and no Electron: a captured string in, what the row shows out. The fixtures
 * are the spec's appendix — this Mac, 2026-09-02 — and the logged-out shapes
 * come from the tools' own documentation.
 */

/** The first non-empty line, trimmed. All the report ever keeps of any output
 * (criterion 5): a `gh auth status` transcript carries a masked token line,
 * and it never crosses IPC. */
export function firstLine(text: string): string {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed !== '') {
      return trimmed;
    }
  }
  return '';
}

export type AdbVersion = {
  readonly first: string;
  readonly short: string;
  /** The `Installed as` line, when adb prints one. */
  readonly path: string | null;
};

/**
 * ```
 * Android Debug Bridge version 1.0.41
 * Version 35.0.2-12147458
 * Installed as /Users/gui/Library/Android/sdk/platform-tools/adb
 * ```
 * The platform-tools release is the second line's number before the build
 * id; the bridge protocol version on the first line is the fallback.
 */
export function parseAdbVersion(stdout: string): AdbVersion {
  const first = firstLine(stdout);
  const release = /^Version (\d+(?:\.\d+)*)/m.exec(stdout)?.[1];
  const bridge = /version (\d+(?:\.\d+)*)/.exec(first)?.[1];
  const path = /^Installed as (.+)$/m.exec(stdout)?.[1]?.trim() ?? null;
  return { first, short: `adb ${release ?? bridge ?? '?'}`, path };
}

export type JavaVersion = {
  readonly first: string;
  readonly major: number;
  readonly short: string;
};

/**
 * `java -version` prints to stderr: `openjdk version "21.0.4" 2024-07-16 LTS`.
 * Java 8 called itself `1.8.0_392`, so a leading `1.` yields the minor as the
 * major — Maestro's "17 or newer" is compared against that.
 */
export function parseJavaVersion(stderr: string): JavaVersion | null {
  const first = firstLine(stderr);
  const match = /version "([^"]+)"/.exec(first);
  if (match?.[1] === undefined) {
    return null;
  }
  const version = match[1];
  const [head, second] = version.split('.');
  const major =
    head === '1' && second !== undefined
      ? Number.parseInt(second, 10)
      : Number.parseInt(head ?? '', 10);
  if (!Number.isFinite(major)) {
    return null;
  }
  return { first, major, short: `java ${version}` };
}

/** `pkgutil --pkg-info=com.apple.pkg.CLTools_Executables` → `version: 26.1.0.0.1.…`,
 * of which the first two components are the release people recognise. */
export function parseCltVersion(stdout: string): string | null {
  const match = /^version:\s*(\d+)\.(\d+)/m.exec(stdout);
  if (match === null) {
    return null;
  }
  return `${match[1]}.${match[2]}`;
}

export type CliVersion = { readonly first: string; readonly short: string };

/** `gh version 2.91.0 (2026-04-22)`. */
export function parseGhVersion(stdout: string): CliVersion {
  const first = firstLine(stdout);
  const version = /gh version (\S+)/.exec(first)?.[1] ?? first;
  return { first, short: `gh ${version}` };
}

/** `2.1.258 (Claude Code)`. */
export function parseClaudeVersion(stdout: string): CliVersion {
  const first = firstLine(stdout);
  const version = /^(\S+)/.exec(first)?.[1] ?? first;
  return { first, short: `claude ${version}` };
}

export type GhAuthStatus = {
  /** The `Logged in to …` line without the glyph — all the row shows. */
  readonly line: string;
  readonly account: string;
};

/**
 * ```
 * github.com
 *   ✓ Logged in to github.com account GuilhermeHCDias (keyring)
 *   - Token: gho_****
 * ```
 * Only the one line is kept (criterion 5). `null` means the transcript is
 * the logged-out one, whatever it says.
 */
export function parseGhAuthStatus(output: string): GhAuthStatus | null {
  const match = /^\s*\S*\s*(Logged in to \S+ account (\S+).*)$/m.exec(output);
  if (match?.[1] === undefined || match[2] === undefined) {
    return null;
  }
  return { line: match[1].trim(), account: match[2] };
}

export type ClaudeAuthStatus = {
  readonly loggedIn: boolean;
  readonly authMethod: string | null;
};

/** `claude auth status` prints JSON with `loggedIn` and `authMethod`. Anything
 * else — including a JSON without `loggedIn` — is unparsable, and the row
 * says signed out. */
export function parseClaudeAuthStatus(stdout: string): ClaudeAuthStatus | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || !('loggedIn' in parsed)) {
    return null;
  }
  const loggedIn = parsed.loggedIn === true;
  const authMethod =
    'authMethod' in parsed && typeof parsed.authMethod === 'string' ? parsed.authMethod : null;
  return { loggedIn, authMethod };
}

/** `checksums_sha256.txt`: `<sha256>  <file>` per line. The digest for the
 * named file, or `null` when it is not listed. */
export function parseChecksum(text: string, fileName: string): string | null {
  for (const line of text.split(/\r?\n/)) {
    const match = /^([0-9a-fA-F]{64})\s+\*?(.+)$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2]?.trim() === fileName) {
      return match[1].toLowerCase();
    }
  }
  return null;
}

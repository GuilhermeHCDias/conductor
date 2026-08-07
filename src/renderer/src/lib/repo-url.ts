/**
 * The renderer's copy of the repository address grammar. It exists for
 * instant feedback — a paste that is not an address earns its error with
 * zero IPC — while main re-parses whatever it is sent and remains the
 * authority (§9.3). The two implementations mirror each other on purpose;
 * their tests pin the same cases.
 */

export type ParsedRepoUrl = {
  readonly host: string;
  readonly org: string;
  readonly name: string;
};

/**
 * People paste three different strings meaning the same repository: the
 * browser URL (often with `/tree/main` on the end), the https clone URL, and
 * the SSH remote. All three are read. Unknown hosts are not an address at
 * all; gitlab and bitbucket parse so the resolver can refuse them by name.
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

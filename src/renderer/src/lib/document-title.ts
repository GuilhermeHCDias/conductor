/**
 * What the toolbar writes across the middle of the window (criteria 8–9).
 * Derived pure, so the title and its subtitle can never disagree about which
 * state the window is in: a document names itself and reports its own state,
 * and with nothing open the window falls back to the project it is pointed
 * at — never to a bare "—", which said nothing about anything.
 */

/** The repo fields the title needs — `ConnectedRepo` satisfies it. */
export type TitledRepo = {
  readonly org: string;
  readonly name: string;
  readonly branch: string | null;
};

export type DocumentTitle = {
  readonly title: string;
  readonly subtitle: string;
};

export type DocumentTitleInput = {
  readonly openName: string | null;
  readonly commandCount: number;
  readonly running: boolean;
  readonly repo: TitledRepo | null;
};

export function documentTitle({
  openName,
  commandCount,
  running,
  repo,
}: DocumentTitleInput): DocumentTitle {
  if (openName !== null) {
    const commands = commandCount === 1 ? 'command' : 'commands';
    const state = running ? 'running' : 'saved on this Mac';
    return { title: openName, subtitle: `${commandCount} ${commands} · ${state}` };
  }

  // No repo means the connect window, which draws no toolbar — the empty
  // strings exist only so the function is total.
  if (repo === null) {
    return { title: '', subtitle: '' };
  }

  const address = `${repo.org}/${repo.name}`;
  return {
    title: repo.name,
    subtitle: repo.branch === null ? address : `${address} · ${repo.branch}`,
  };
}

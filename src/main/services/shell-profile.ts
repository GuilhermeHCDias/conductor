/**
 * The one marked block Conductor writes to a shell profile (criteria 19–20,
 * 23): `~/.conductor/bin` on `PATH`, so the tools it downloaded work in a
 * Terminal tab too. Nothing else — never `JAVA_HOME`, never a second block.
 * Pure: the service reads and writes the file; this decides which file and
 * what it should say.
 */

export type ProfileFile = '.zprofile' | '.bash_profile';

const OPEN = '# >>> Conductor >>>';
const CLOSE = '# <<< Conductor <<<';
const LINE = 'export PATH="$HOME/.conductor/bin:$PATH"';

export const PROFILE_BLOCK = `${OPEN}\n${LINE}\n${CLOSE}\n`;

/** `~/.zprofile` for zsh (macOS's default, and Homebrew's precedent) or an
 * unset `$SHELL`; `~/.bash_profile` for bash; nothing for any other shell. */
export function profileFileFor(shell: string | undefined): ProfileFile | null {
  const name = (shell ?? '').split('/').pop() ?? '';
  if (name === '' || name === 'zsh') {
    return '.zprofile';
  }
  if (name === 'bash') {
    return '.bash_profile';
  }
  return null;
}

/**
 * The idempotent insert: `existing` is the file's text, or `null` when there
 * is no file. A block already there means nothing to write; one whose inner
 * line differs is replaced where it stands; an opener with no closer is
 * replaced through the end of the file; otherwise the block is appended
 * after a leading blank line.
 */
export function upsertProfileBlock(existing: string | null): {
  readonly content: string;
  readonly changed: boolean;
} {
  const text = existing ?? '';
  const start = text.indexOf(`${OPEN}\n`);
  if (start !== -1 && !text.includes(CLOSE, start)) {
    // An opener with no closer — an interrupted write or a hand edit. The
    // block owns the rest of the file; a second block would keep the stray
    // opener forever.
    return { content: `${text.slice(0, start)}${PROFILE_BLOCK}`, changed: true };
  }
  const end = start === -1 ? -1 : text.indexOf(CLOSE, start);
  if (start !== -1 && end !== -1) {
    // The closing line may end the file without its newline.
    const after = end + CLOSE.length;
    const rest = text.slice(after).startsWith('\n') ? text.slice(after + 1) : text.slice(after);
    const current = `${text.slice(start, after)}\n`;
    if (current === PROFILE_BLOCK && (rest === '' || text.slice(after).startsWith('\n'))) {
      return { content: text, changed: false };
    }
    return { content: `${text.slice(0, start)}${PROFILE_BLOCK}${rest}`, changed: true };
  }
  const lead = text === '' || text.endsWith('\n') ? '\n' : '\n\n';
  return { content: `${text}${lead}${PROFILE_BLOCK}`, changed: true };
}

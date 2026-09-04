import { describe, expect, it } from 'vitest';
import { PROFILE_BLOCK, profileFileFor, upsertProfileBlock } from './shell-profile';

/**
 * The marked `PATH` block (criteria 19–20, 23): which profile file, and the
 * idempotent insert over its text. No I/O — the service reads and writes the
 * file; this decides what the file should say.
 */

const BLOCK =
  '# >>> Conductor >>>\nexport PATH="$HOME/.conductor/bin:$PATH"\n# <<< Conductor <<<\n';

describe('profileFileFor', () => {
  it('is .zprofile for zsh and for an unset SHELL', () => {
    expect(profileFileFor('/bin/zsh')).toBe('.zprofile');
    expect(profileFileFor('/opt/homebrew/bin/zsh')).toBe('.zprofile');
    expect(profileFileFor(undefined)).toBe('.zprofile');
    expect(profileFileFor('')).toBe('.zprofile');
  });

  it('is .bash_profile for bash', () => {
    expect(profileFileFor('/bin/bash')).toBe('.bash_profile');
    expect(profileFileFor('/opt/homebrew/bin/bash')).toBe('.bash_profile');
  });

  it('is nothing for any other shell — no file is written', () => {
    expect(profileFileFor('/opt/homebrew/bin/fish')).toBeNull();
    expect(profileFileFor('/usr/local/bin/nu')).toBeNull();
  });
});

describe('upsertProfileBlock', () => {
  it('is the exact three-line block of criterion 19', () => {
    expect(PROFILE_BLOCK).toBe(BLOCK);
  });

  it('creates the file with the block when it does not exist', () => {
    expect(upsertProfileBlock(null)).toEqual({ content: `\n${BLOCK}`, changed: true });
  });

  it('appends the block after a leading blank line, keeping everything already there', () => {
    const existing = 'eval "$(/opt/homebrew/bin/brew shellenv)"\n';
    expect(upsertProfileBlock(existing)).toEqual({
      content: `${existing}\n${BLOCK}`,
      changed: true,
    });
  });

  it('adds the missing newline before the blank line when the file does not end with one', () => {
    const existing = 'export FOO=bar';
    expect(upsertProfileBlock(existing)).toEqual({
      content: `${existing}\n\n${BLOCK}`,
      changed: true,
    });
  });

  it('writes nothing when the block is already there', () => {
    const existing = `export FOO=bar\n\n${BLOCK}export BAR=baz\n`;
    expect(upsertProfileBlock(existing)).toEqual({ content: existing, changed: false });
  });

  it('replaces in place a block whose inner line differs', () => {
    const stale =
      'export FOO=bar\n\n# >>> Conductor >>>\nexport PATH="$HOME/.conductor/old:$PATH"\n# <<< Conductor <<<\nexport BAR=baz\n';
    expect(upsertProfileBlock(stale)).toEqual({
      content: `export FOO=bar\n\n${BLOCK}export BAR=baz\n`,
      changed: true,
    });
  });

  it('finds a block that ends the file without a trailing newline, and does not add a second', () => {
    const existing = `export FOO=bar\n\n${BLOCK.trimEnd()}`;
    expect(upsertProfileBlock(existing)).toEqual({ content: existing, changed: false });
  });

  it('treats an empty file as a file, not as absent', () => {
    expect(upsertProfileBlock('')).toEqual({ content: `\n${BLOCK}`, changed: true });
  });
});

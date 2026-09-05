import { describe, expect, it } from 'vitest';
import { GH_DEVICE_URL, parseLoginAccount, parseLoginCode } from './gh-login-parse';

/**
 * Pure parsers over `gh auth login --web`'s stderr, as captured in the spec's
 * appendix and on this Mac (2026-09-04, no TTY): the one-time code, and the
 * account the flow ended on. Nothing here is a token (§9.0).
 */

const LOGIN = `
! First copy your one-time code: 1234-ABCD
Open this URL to continue in your web browser: https://github.com/login/device
✓ Authentication complete.
- gh config set -h github.com git_protocol https
✓ Configured git protocol
✓ Logged in as GuilhermeHCDias
`;

describe('parseLoginCode', () => {
  it('finds the one-time code on the line gh prints for it', () => {
    expect(parseLoginCode(LOGIN)).toBe('1234-ABCD');
  });

  it('reads the older "Press Enter" shape of the transcript too', () => {
    expect(
      parseLoginCode(
        '! First copy your one-time code: AB12-CD34\nPress Enter to open https://github.com/login/device in your browser...\n',
      ),
    ).toBe('AB12-CD34');
  });

  it('needs the whole line — the service buffers stderr, a split chunk yields nothing yet', () => {
    expect(parseLoginCode('! First copy your one-time')).toBeNull();
    expect(parseLoginCode('code: 9Z9Z-Q1Q1\n')).toBeNull();
    expect(parseLoginCode('! First copy your one-time code: 9Z9Z-Q1Q1\n')).toBe('9Z9Z-Q1Q1');
  });

  it('answers null before the code line has arrived, and for anything that is not a code', () => {
    expect(parseLoginCode('')).toBeNull();
    expect(parseLoginCode('! First copy your one-time code: ')).toBeNull();
    expect(parseLoginCode('one-time code: abcd-efgh')).toBeNull();
    expect(parseLoginCode('✓ Logged in as someone')).toBeNull();
  });
});

describe('parseLoginAccount', () => {
  it('reads the account off the closing line', () => {
    expect(parseLoginAccount(LOGIN)).toBe('GuilhermeHCDias');
  });

  it('reads the `gh auth status` shape as well', () => {
    expect(
      parseLoginAccount('github.com\n  ✓ Logged in to github.com account octocat (keyring)\n'),
    ).toBe('octocat');
  });

  it('answers null when no such line exists', () => {
    expect(parseLoginAccount('')).toBeNull();
    expect(parseLoginAccount('error validating token: The device code has expired\n')).toBeNull();
  });
});

describe('GH_DEVICE_URL', () => {
  it('is the one URL the sign-in ever opens (criterion 30)', () => {
    expect(GH_DEVICE_URL).toBe('https://github.com/login/device');
  });
});

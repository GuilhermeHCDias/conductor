import { describe, expect, it } from 'vitest';
import {
  firstLine,
  parseAdbVersion,
  parseChecksum,
  parseClaudeAuthStatus,
  parseClaudeVersion,
  parseCltVersion,
  parseGhAuthStatus,
  parseGhVersion,
  parseJavaVersion,
} from './doctor-parse';

/**
 * Pure parsers over the captured outputs in the spec's appendix (this Mac,
 * 2026-09-02). The logged-out shapes come from the tools' own documentation.
 * No I/O here: what a CLI printed goes in, what the row shows comes out.
 */

const ADB = `Android Debug Bridge version 1.0.41
Version 35.0.2-12147458
Installed as /Users/gui/Library/Android/sdk/platform-tools/adb
Running on Darwin 25.1.0 (arm64)
`;

const JAVA = `openjdk version "21.0.4" 2024-07-16 LTS
OpenJDK Runtime Environment Zulu21.36+17-CA (build 21.0.4+7-LTS)
`;

const GH_AUTH = `github.com
  ✓ Logged in to github.com account GuilhermeHCDias (keyring)
  - Active account: true
  - Git operations protocol: https
  - Token: gho_************************************
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
`;

describe('firstLine', () => {
  it('keeps the first non-empty line, trimmed, and nothing after it', () => {
    expect(firstLine('\n  gh version 2.91.0 (2026-04-22)  \nmore\n')).toBe(
      'gh version 2.91.0 (2026-04-22)',
    );
  });

  it('answers the empty string for empty output', () => {
    expect(firstLine('')).toBe('');
    expect(firstLine('\n\n')).toBe('');
  });
});

describe('parseAdbVersion', () => {
  it('reads the first line, the platform-tools version and the installed path', () => {
    expect(parseAdbVersion(ADB)).toEqual({
      first: 'Android Debug Bridge version 1.0.41',
      short: 'adb 35.0.2',
      path: '/Users/gui/Library/Android/sdk/platform-tools/adb',
    });
  });

  it('falls back to the bridge version when no Version line is printed', () => {
    expect(parseAdbVersion('Android Debug Bridge version 1.0.41\n')).toEqual({
      first: 'Android Debug Bridge version 1.0.41',
      short: 'adb 1.0.41',
      path: null,
    });
  });
});

describe('parseJavaVersion', () => {
  it('reads the major and the version out of the first line', () => {
    expect(parseJavaVersion(JAVA)).toEqual({
      first: 'openjdk version "21.0.4" 2024-07-16 LTS',
      major: 21,
      short: 'java 21.0.4',
    });
  });

  /** Java 8 numbered itself 1.8 — its major is the second component. */
  it('reads a legacy 1.x version as its minor', () => {
    expect(parseJavaVersion('java version "1.8.0_392"\n')).toEqual({
      first: 'java version "1.8.0_392"',
      major: 8,
      short: 'java 1.8.0_392',
    });
  });

  it('answers null when no version is printed', () => {
    expect(parseJavaVersion('')).toBeNull();
    expect(parseJavaVersion('The operation couldn’t be completed.')).toBeNull();
  });
});

describe('parseCltVersion', () => {
  it('keeps the first two components of the receipt version', () => {
    expect(parseCltVersion('version: 26.1.0.0.1.1761104275\n')).toBe('26.1');
  });

  it('answers null without a version line', () => {
    expect(parseCltVersion("No receipt for 'com.apple.pkg.CLTools_Executables' was found")).toBe(
      null,
    );
  });
});

describe('parseGhVersion', () => {
  it('reads the version out of the first line', () => {
    expect(parseGhVersion('gh version 2.91.0 (2026-04-22)\nhttps://github.com/cli/cli\n')).toEqual({
      first: 'gh version 2.91.0 (2026-04-22)',
      short: 'gh 2.91.0',
    });
  });
});

describe('parseGhAuthStatus', () => {
  /** Criterion 5 — the "Logged in" line alone, glyph dropped: the token line
   * two rows down never crosses IPC. */
  it('keeps the logged-in line without its glyph and names the account', () => {
    expect(parseGhAuthStatus(GH_AUTH)).toEqual({
      line: 'Logged in to github.com account GuilhermeHCDias (keyring)',
      account: 'GuilhermeHCDias',
    });
  });

  it('answers null for the logged-out transcript', () => {
    expect(
      parseGhAuthStatus(
        'You are not logged into any GitHub hosts. To log in, run: gh auth login\n',
      ),
    ).toBeNull();
  });
});

describe('parseClaudeVersion', () => {
  it('reads the version out of the first line', () => {
    expect(parseClaudeVersion('2.1.258 (Claude Code)\n')).toEqual({
      first: '2.1.258 (Claude Code)',
      short: 'claude 2.1.258',
    });
  });
});

describe('parseClaudeAuthStatus', () => {
  it('reads loggedIn and the auth method out of the JSON', () => {
    expect(
      parseClaudeAuthStatus(
        '{\n  "loggedIn": true,\n  "authMethod": "claude.ai",\n  "apiProvider": "firstParty"\n}\n',
      ),
    ).toEqual({ loggedIn: true, authMethod: 'claude.ai' });
  });

  it('reads a signed-out answer', () => {
    expect(parseClaudeAuthStatus('{"loggedIn": false}')).toEqual({
      loggedIn: false,
      authMethod: null,
    });
  });

  it('answers null for anything that is not that JSON', () => {
    expect(parseClaudeAuthStatus('')).toBeNull();
    expect(parseClaudeAuthStatus('not json')).toBeNull();
    expect(parseClaudeAuthStatus('{"other": 1}')).toBeNull();
  });
});

describe('parseChecksum', () => {
  const TEXT = `0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef  maestro.zip
fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210  maestro-2.10.0.zip
`;

  it('finds the digest published for the named file', () => {
    expect(parseChecksum(TEXT, 'maestro.zip')).toBe(
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    );
  });

  it('answers null when the file is not listed', () => {
    expect(parseChecksum(TEXT, 'maestro.tar.gz')).toBeNull();
  });
});

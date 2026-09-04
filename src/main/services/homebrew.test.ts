import { describe, expect, it } from 'vitest';
import { brewEnv, brewFailureDetail, brewInstallArgs, brewStep, findHomebrew } from './homebrew';

/**
 * Homebrew, decided without running it (criteria 4, 12, 15): where `brew`
 * is, the argv and env per tool, the step line, and what its output came
 * to. Strings from the spec's appendix. No I/O.
 */

function executable(...paths: string[]): (candidate: string) => boolean {
  return (candidate) => paths.includes(candidate);
}

describe('findHomebrew', () => {
  it('prefers the Apple-silicon prefix, then the Intel one', () => {
    expect(
      findHomebrew({
        env: {},
        packaged: true,
        isExecutable: executable('/opt/homebrew/bin/brew', '/usr/local/bin/brew'),
      }),
    ).toBe('/opt/homebrew/bin/brew');
    expect(
      findHomebrew({ env: {}, packaged: true, isExecutable: executable('/usr/local/bin/brew') }),
    ).toBe('/usr/local/bin/brew');
  });

  it('is null when neither exists', () => {
    expect(findHomebrew({ env: {}, packaged: true, isExecutable: executable() })).toBeNull();
  });

  it('honours CONDUCTOR_HOMEBREW=0 in development and ignores it when packaged', () => {
    const deps = {
      env: { CONDUCTOR_HOMEBREW: '0' },
      isExecutable: executable('/opt/homebrew/bin/brew'),
    };
    expect(findHomebrew({ ...deps, packaged: false })).toBeNull();
    expect(findHomebrew({ ...deps, packaged: true })).toBe('/opt/homebrew/bin/brew');
    expect(
      findHomebrew({
        env: { CONDUCTOR_HOMEBREW: '1' },
        packaged: false,
        isExecutable: deps.isExecutable,
      }),
    ).toBe('/opt/homebrew/bin/brew');
  });
});

describe('brewInstallArgs', () => {
  it('installs gh as a formula and platform-tools as a cask', () => {
    expect(brewInstallArgs('gh')).toEqual(['install', 'gh']);
    expect(brewInstallArgs('adb')).toEqual(['install', '--cask', 'android-platform-tools']);
  });
});

describe('brewEnv', () => {
  it('sets the four non-interactive flags and puts the prefix bin on PATH', () => {
    const env = brewEnv('/opt/homebrew/bin/brew', { PATH: '/usr/bin:/bin', HOME: '/Users/x' });
    expect(env).toMatchObject({
      HOME: '/Users/x',
      HOMEBREW_NO_AUTO_UPDATE: '1',
      HOMEBREW_NO_INSTALL_CLEANUP: '1',
      HOMEBREW_NO_ENV_HINTS: '1',
      NONINTERACTIVE: '1',
      PATH: '/opt/homebrew/bin:/usr/bin:/bin',
    });
  });

  it('does not double the prefix when it is already on PATH', () => {
    const env = brewEnv('/usr/local/bin/brew', { PATH: '/usr/local/bin:/usr/bin' });
    expect(env.PATH).toBe('/usr/local/bin:/usr/bin');
  });

  it('copes with no PATH at all', () => {
    expect(brewEnv('/opt/homebrew/bin/brew', {}).PATH).toBe('/opt/homebrew/bin');
  });
});

describe('brewStep', () => {
  it('names the tool the way criterion 12 does', () => {
    expect(brewStep('gh')).toBe('Installing gh with Homebrew');
    expect(brewStep('adb')).toBe('Installing platform-tools with Homebrew');
  });
});

describe('brewFailureDetail', () => {
  it('is the first non-empty stderr line', () => {
    expect(
      brewFailureDetail(
        '\n\nError: No available formula with the name "ghx".\nDid you mean gh?\n',
        1,
      ),
    ).toBe('Error: No available formula with the name "ghx".');
  });

  it('falls back to the exit code when stderr says nothing', () => {
    expect(brewFailureDetail('', 1)).toBe('brew exited 1');
    expect(brewFailureDetail('  \n', null)).toBe('brew was killed');
  });
});

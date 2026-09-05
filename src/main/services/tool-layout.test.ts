import { describe, expect, it } from 'vitest';
import {
  conductorDir,
  maestroEnv,
  managedBinDir,
  managedJavaBinary,
  managedJavaHome,
  managedLauncher,
  managedToolsDir,
  TOOL_NAMES,
  TOOL_ORDER,
  type ToolPins,
  toolLayout,
} from './tool-layout';

/**
 * Where each archive's launcher sits and where the managed copy lands
 * (criteria 11, 13, 21, 26 and the appendix layouts). Pure: paths and
 * strings in, paths and strings out. The layouts are what the service
 * *checks* against the extracted tree — never what it assumes.
 */

const PINS: ToolPins = {
  ghVersion: '2.100.0',
  ghReleaseUrl: 'https://github.com/cli/cli/releases/download',
  platformToolsVersion: '37.0.1',
  platformToolsSha256: 'ee39ad5967e95c2a07f04dbcbde96b1a0c916ba376096db5d2f498b7727a5d1d',
  platformToolsReleaseUrl: 'https://dl.google.com/android/repository',
  zuluVersion: '21.52.203',
  zuluJavaVersion: '21.0.12.1',
  zuluSha256: '042093e0895c940a02d68e727bc37b59f3958e58aa1463ec9080845d77af0a45',
  zuluReleaseUrl: 'https://cdn.azul.com/zulu/bin',
};

describe('the managed tree', () => {
  it('lives under ~/.conductor, launchers linked from bin, trees under tools', () => {
    expect(conductorDir('/Users/x')).toBe('/Users/x/.conductor');
    expect(managedToolsDir('/Users/x')).toBe('/Users/x/.conductor/tools');
    expect(managedBinDir('/Users/x')).toBe('/Users/x/.conductor/bin');
    expect(managedLauncher('/Users/x', 'gh')).toBe('/Users/x/.conductor/bin/gh');
    expect(managedLauncher('/Users/x', 'adb')).toBe('/Users/x/.conductor/bin/adb');
    expect(managedLauncher('/Users/x', 'java')).toBe('/Users/x/.conductor/bin/java');
  });

  it('keeps a stable JAVA_HOME at ~/.conductor/tools/java (criterion 22)', () => {
    expect(managedJavaHome('/Users/x')).toBe('/Users/x/.conductor/tools/java');
    expect(managedJavaBinary('/Users/x')).toBe('/Users/x/.conductor/tools/java/bin/java');
  });

  it('hands every maestro child the managed JAVA_HOME only when the managed java is executable', () => {
    const managed = maestroEnv(
      { PATH: '/usr/bin', JAVA_HOME: '/jdk' },
      '/Users/x',
      (path) => path === '/Users/x/.conductor/tools/java/bin/java',
    );
    expect(managed).toEqual({
      PATH: '/usr/bin',
      JAVA_HOME: '/Users/x/.conductor/tools/java',
      MAESTRO_CLI_NO_ANALYTICS: '1',
    });

    const own = maestroEnv({ PATH: '/usr/bin', JAVA_HOME: '/jdk' }, '/Users/x', () => false);
    expect(own).toEqual({ PATH: '/usr/bin', JAVA_HOME: '/jdk', MAESTRO_CLI_NO_ANALYTICS: '1' });
    expect(maestroEnv({}, '/Users/x', () => false)).toEqual({ MAESTRO_CLI_NO_ANALYTICS: '1' });
  });
});

describe('the four tools', () => {
  it('are managed in the order of criterion 1, named as the plan screen shows them', () => {
    expect(TOOL_ORDER).toEqual(['java', 'maestro', 'gh', 'adb']);
    expect(TOOL_NAMES.java).toEqual({
      display: 'Zulu JDK 21',
      sentence: 'the Zulu JDK',
      publisher: 'Azul',
    });
    expect(TOOL_NAMES.maestro).toEqual({
      display: 'Maestro',
      sentence: 'Maestro',
      publisher: 'Maestro',
    });
    expect(TOOL_NAMES.gh).toEqual({
      display: 'GitHub CLI',
      sentence: 'the GitHub CLI',
      publisher: 'GitHub',
    });
    expect(TOOL_NAMES.adb).toEqual({
      display: 'Android platform-tools',
      sentence: 'Android platform-tools',
      publisher: 'Google',
    });
  });
});

describe('toolLayout', () => {
  it('lays out the GitHub CLI: zip, checksum file beside it, bin/gh, gh --version', () => {
    const gh = toolLayout('gh', PINS);
    expect(gh.version).toBe('2.100.0');
    expect(gh.treeName).toBe('gh-2.100.0');
    expect(gh.archive).toEqual({
      url: 'https://github.com/cli/cli/releases/download/v2.100.0/gh_2.100.0_macOS_arm64.zip',
      fileName: 'gh_2.100.0_macOS_arm64.zip',
      kind: 'zip',
    });
    expect(gh.checksum).toEqual({
      kind: 'published',
      url: 'https://github.com/cli/cli/releases/download/v2.100.0/gh_2.100.0_checksums.txt',
      fileName: 'gh_2.100.0_checksums.txt',
    });
    expect(gh.launcher).toBe('bin/gh');
    expect(gh.javaHome).toBeNull();
    expect(gh.versionArgs).toEqual(['--version']);
    expect(
      gh.versionMatches('gh version 2.100.0 (2026-09-03)\nhttps://github.com/cli/cli\n', ''),
    ).toBe(true);
    expect(gh.versionMatches('gh version 2.91.0 (2026-04-22)\n', '')).toBe(false);
    expect(gh.downloadStep).toBe('Downloading GitHub CLI');
  });

  it('lays out platform-tools: zip, pinned digest, adb at the root, adb --version', () => {
    const adb = toolLayout('adb', PINS);
    expect(adb.treeName).toBe('adb-37.0.1');
    expect(adb.archive).toEqual({
      url: 'https://dl.google.com/android/repository/platform-tools_r37.0.1-darwin.zip',
      fileName: 'platform-tools_r37.0.1-darwin.zip',
      kind: 'zip',
    });
    expect(adb.checksum).toEqual({ kind: 'pinned', sha256: PINS.platformToolsSha256 });
    expect(adb.launcher).toBe('adb');
    expect(adb.versionArgs).toEqual(['--version']);
    expect(
      adb.versionMatches('Android Debug Bridge version 1.0.41\nVersion 37.0.1-13800542\n', ''),
    ).toBe(true);
    expect(adb.versionMatches('Android Debug Bridge version 1.0.41\nVersion 35.0.2-1\n', '')).toBe(
      false,
    );
    expect(adb.downloadStep).toBe('Downloading Android platform-tools');
  });

  it('lays out the Zulu JDK: tar.gz, pinned digest, the launcher and JAVA_HOME inside the .jdk bundle, java -version on stderr', () => {
    const java = toolLayout('java', PINS);
    expect(java.version).toBe('21.52.203');
    expect(java.treeName).toBe('java-21.52.203');
    expect(java.archive).toEqual({
      url: 'https://cdn.azul.com/zulu/bin/zulu21.52.203-ca-jdk21.0.12.1-macosx_aarch64.tar.gz',
      fileName: 'zulu21.52.203-ca-jdk21.0.12.1-macosx_aarch64.tar.gz',
      kind: 'tar.gz',
    });
    expect(java.checksum).toEqual({ kind: 'pinned', sha256: PINS.zuluSha256 });
    expect(java.launcher).toBe('zulu-21.jdk/Contents/Home/bin/java');
    expect(java.javaHome).toBe('zulu-21.jdk/Contents/Home');
    expect(java.versionArgs).toEqual(['-version']);
    expect(
      java.versionMatches(
        '',
        'openjdk version "21.0.12.1" 2026-07-21 LTS\nOpenJDK Runtime Environment Zulu21.52+203-CA\n',
      ),
    ).toBe(true);
    expect(java.versionMatches('', 'openjdk version "21.0.4" 2024-07-16 LTS\n')).toBe(false);
    expect(java.downloadStep).toBe('Downloading Zulu JDK 21');
  });

  it('names the .jdk bundle after the pinned Java major, so a moved pin still unpacks', () => {
    const java = toolLayout('java', {
      ...PINS,
      zuluVersion: '22.30.13',
      zuluJavaVersion: '22.0.2',
    });
    expect(java.launcher).toBe('zulu-22.jdk/Contents/Home/bin/java');
    expect(java.javaHome).toBe('zulu-22.jdk/Contents/Home');
  });

  it('follows a release URL override, as the Maestro pipeline does (criterion 48)', () => {
    const local = {
      ...PINS,
      ghReleaseUrl: 'http://localhost:8000',
      zuluReleaseUrl: 'http://localhost:8000',
      platformToolsReleaseUrl: 'http://localhost:8000',
    };
    expect(toolLayout('gh', local).archive.url).toBe(
      'http://localhost:8000/v2.100.0/gh_2.100.0_macOS_arm64.zip',
    );
    expect(toolLayout('adb', local).archive.url).toBe(
      'http://localhost:8000/platform-tools_r37.0.1-darwin.zip',
    );
    expect(toolLayout('java', local).archive.url).toBe(
      'http://localhost:8000/zulu21.52.203-ca-jdk21.0.12.1-macosx_aarch64.tar.gz',
    );
  });
});

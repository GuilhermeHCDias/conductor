import { join } from 'node:path';
import type { ToolId } from '@shared/ipc';

/**
 * The managed tree and the three direct-download layouts (criteria 11, 13,
 * 21, 26, appendix): where each archive's launcher sits and where the
 * managed copy lands. Pure — the service checks the extracted tree against
 * these paths, never assumes them; a launcher that is not where the layout
 * says fails the install as `extract-failed`.
 *
 * `~/.conductor/tools/<tool>-<version>/` holds a tree; `~/.conductor/bin/`
 * holds one symlink per launcher, which is what the ladders and the shell
 * profile resolve; `~/.conductor/tools/java` is a stable `JAVA_HOME`.
 */

/** The tools that download directly: everything managed but Maestro, whose
 * copy lives under `userData` as before (criterion 5). */
export type DirectToolId = 'java' | 'gh' | 'adb';

/** The pins, `CONFIG`'s — passed in so a test can pin anything. */
export type ToolPins = {
  readonly ghVersion: string;
  readonly ghReleaseUrl: string;
  readonly platformToolsVersion: string;
  readonly platformToolsSha256: string;
  readonly platformToolsReleaseUrl: string;
  readonly zuluVersion: string;
  /** The Java version inside the Zulu build — what `java -version` prints. */
  readonly zuluJavaVersion: string;
  readonly zuluSha256: string;
  readonly zuluReleaseUrl: string;
};

export type ToolLayout = {
  readonly id: DirectToolId;
  readonly version: string;
  /** `<tool>-<version>` under `~/.conductor/tools`. */
  readonly treeName: string;
  readonly archive: {
    readonly url: string;
    readonly fileName: string;
    readonly kind: 'zip' | 'tar.gz';
  };
  /** Where the digest comes from: GitHub publishes a checksums file beside
   * the archive; Google and Azul do not, so those are pinned in `CONFIG`. */
  readonly checksum:
    | { readonly kind: 'pinned'; readonly sha256: string }
    | { readonly kind: 'published'; readonly url: string; readonly fileName: string };
  /** The launcher, relative to the extracted root. */
  readonly launcher: string;
  /** `JAVA_HOME`, relative to the extracted root — the JDK alone. */
  readonly javaHome: string | null;
  readonly versionArgs: readonly string[];
  /** The verify step (criterion 11): does the launcher answer with the pin? */
  readonly versionMatches: (stdout: string, stderr: string) => boolean;
  readonly downloadStep: string;
};

/** Criterion 1 — the four tools, in install order. */
export const TOOL_ORDER: readonly ToolId[] = ['java', 'maestro', 'gh', 'adb'];

/** The names the plan screen shows (criterion 35), the ones the failure
 * sentences use (criterion 14), and each tool's publisher. */
export const TOOL_NAMES: Record<
  ToolId,
  { readonly display: string; readonly sentence: string; readonly publisher: string }
> = {
  java: { display: 'Zulu JDK 21', sentence: 'the Zulu JDK', publisher: 'Azul' },
  maestro: { display: 'Maestro', sentence: 'Maestro', publisher: 'Maestro' },
  gh: { display: 'GitHub CLI', sentence: 'the GitHub CLI', publisher: 'GitHub' },
  adb: {
    display: 'Android platform-tools',
    sentence: 'Android platform-tools',
    publisher: 'Google',
  },
};

export function conductorDir(home: string): string {
  return join(home, '.conductor');
}

export function managedToolsDir(home: string): string {
  return join(conductorDir(home), 'tools');
}

export function managedBinDir(home: string): string {
  return join(conductorDir(home), 'bin');
}

/** `~/.conductor/bin/<gh|adb|java>` — the rung every ladder walks (criteria 24–26). */
export function managedLauncher(home: string, tool: DirectToolId): string {
  return join(managedBinDir(home), tool);
}

/** `~/.conductor/tools/java` → the JDK's `Contents/Home` (criterion 22). */
export function managedJavaHome(home: string): string {
  return join(managedToolsDir(home), 'java');
}

export function managedJavaBinary(home: string): string {
  return join(managedJavaHome(home), 'bin', 'java');
}

/**
 * The environment of every `maestro` child (§12.10 analytics off, always),
 * plus criterion 22: `JAVA_HOME` at the managed JDK whenever its launcher is
 * there — the doctor's first Java rung, so the two agree — and the process's
 * own value otherwise. One function for `CliRunner`, `MaestroMcpService` and
 * the doctor's verify, because three copies would eventually disagree.
 */
export function maestroEnv(
  env: NodeJS.ProcessEnv,
  home: string,
  isExecutable: (path: string) => boolean,
): NodeJS.ProcessEnv {
  return {
    ...env,
    ...(isExecutable(managedJavaBinary(home)) ? { JAVA_HOME: managedJavaHome(home) } : {}),
    MAESTRO_CLI_NO_ANALYTICS: '1',
  };
}

export function toolLayout(id: DirectToolId, pins: ToolPins): ToolLayout {
  switch (id) {
    case 'gh': {
      const fileName = `gh_${pins.ghVersion}_macOS_arm64.zip`;
      const base = `${pins.ghReleaseUrl}/v${pins.ghVersion}`;
      const checksums = `gh_${pins.ghVersion}_checksums.txt`;
      return {
        id,
        version: pins.ghVersion,
        treeName: `gh-${pins.ghVersion}`,
        archive: { url: `${base}/${fileName}`, fileName, kind: 'zip' },
        checksum: { kind: 'published', url: `${base}/${checksums}`, fileName: checksums },
        launcher: join('bin', 'gh'),
        javaHome: null,
        versionArgs: ['--version'],
        versionMatches: (stdout) => stdout.includes(`gh version ${pins.ghVersion} `),
        downloadStep: `Downloading ${TOOL_NAMES.gh.display}`,
      };
    }
    case 'adb': {
      const fileName = `platform-tools_r${pins.platformToolsVersion}-darwin.zip`;
      return {
        id,
        version: pins.platformToolsVersion,
        treeName: `adb-${pins.platformToolsVersion}`,
        archive: { url: `${pins.platformToolsReleaseUrl}/${fileName}`, fileName, kind: 'zip' },
        checksum: { kind: 'pinned', sha256: pins.platformToolsSha256 },
        launcher: 'adb',
        javaHome: null,
        versionArgs: ['--version'],
        versionMatches: (stdout) =>
          /^Android Debug Bridge version/m.test(stdout) &&
          stdout.includes(`Version ${pins.platformToolsVersion}-`),
        downloadStep: `Downloading ${TOOL_NAMES.adb.display}`,
      };
    }
    case 'java': {
      const fileName = `zulu${pins.zuluVersion}-ca-jdk${pins.zuluJavaVersion}-macosx_aarch64.tar.gz`;
      // The bundle is named after the Java major, so a moved pin still unpacks.
      const major = pins.zuluJavaVersion.split('.')[0] ?? '21';
      const home = join(`zulu-${major}.jdk`, 'Contents', 'Home');
      return {
        id,
        version: pins.zuluVersion,
        treeName: `java-${pins.zuluVersion}`,
        archive: { url: `${pins.zuluReleaseUrl}/${fileName}`, fileName, kind: 'tar.gz' },
        checksum: { kind: 'pinned', sha256: pins.zuluSha256 },
        launcher: join(home, 'bin', 'java'),
        javaHome: home,
        versionArgs: ['-version'],
        // `java -version` prints to stderr; a JVM that prints elsewhere is read too.
        versionMatches: (stdout, stderr) =>
          `${stderr}\n${stdout}`.includes(`version "${pins.zuluJavaVersion}"`),
        downloadStep: `Downloading ${TOOL_NAMES.java.display}`,
      };
    }
  }
}

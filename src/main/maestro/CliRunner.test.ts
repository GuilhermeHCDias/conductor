import { join } from 'node:path';
import { ERROR_CODES } from '@shared/ipc';
import { describe, expect, it } from 'vitest';
import type { SpawnOptions, StreamingProcess } from '../process/run';
import { CliRunner, MaestroNotInstalledError } from './CliRunner';

/**
 * The raw-CLI door §9.2 pins to this exact path. Everything here runs against
 * an injected spawn — the runner's whole job is to compose the one invocation
 * §4.2 and §12.10 dictate, and to refuse with criterion 3's code when there is
 * no binary to invoke.
 */

type Spawned = { command: string; args: readonly string[]; options: SpawnOptions };

const child: StreamingProcess = {
  write: () => {},
  onStdout: () => {},
  onStderr: () => {},
  onExit: () => {},
  kill: () => {},
};

function runner(overrides: {
  configuredPath?: string;
  executables?: readonly string[];
  env?: NodeJS.ProcessEnv;
}): { cli: CliRunner; spawned: Spawned[] } {
  const spawned: Spawned[] = [];
  const executables = overrides.executables ?? ['/opt/maestro/bin/maestro'];
  const cli = new CliRunner({
    spawn: (command, args, options) => {
      spawned.push({ command, args, options });
      return child;
    },
    isExecutable: (path) => executables.includes(path),
    env: overrides.env ?? { PATH: '/usr/bin:/opt/maestro/bin' },
    home: '/Users/someone',
    configuredPath: overrides.configuredPath ?? '',
  });
  return { cli, spawned };
}

describe('CliRunner.test', () => {
  /** Criterion 2, verbatim: `maestro --device <id> test <tempfile>` with
   * `--no-reinstall-driver` (§4.4a) — the device always explicit, never
   * Maestro's single-device default. */
  it('spawns exactly the documented invocation', () => {
    const { cli, spawned } = runner({});

    cli.test('R9QYC01EMXL', '/tmp/runs/run-1.yaml');

    expect(spawned).toEqual([
      {
        command: '/opt/maestro/bin/maestro',
        args: ['--device', 'R9QYC01EMXL', 'test', '--no-reinstall-driver', '/tmp/runs/run-1.yaml'],
        options: expect.anything(),
      },
    ]);
  });

  /** §4.4c / §12 rule 10 — every maestro child, no exception, and without
   * dropping the environment the binary needs to run. */
  it('injects MAESTRO_CLI_NO_ANALYTICS=1 over the given environment', () => {
    const { cli, spawned } = runner({ env: { PATH: '/opt/maestro/bin', JAVA_HOME: '/jdk' } });

    cli.test('R9QYC01EMXL', '/tmp/runs/run-1.yaml');

    expect(spawned[0]?.options.env).toMatchObject({
      MAESTRO_CLI_NO_ANALYTICS: '1',
      JAVA_HOME: '/jdk',
    });
  });

  /** Criterion 9's "process tree": the launcher `exec`s into a JVM, and what
   * the JVM spawns must die with it. */
  it('asks for the whole process tree to die on kill', () => {
    const { cli, spawned } = runner({});

    cli.test('R9QYC01EMXL', '/tmp/runs/run-1.yaml');

    expect(spawned[0]?.options.killTree).toBe(true);
  });

  it('hands back the spawned process untouched', () => {
    const { cli } = runner({});

    expect(cli.test('R9QYC01EMXL', '/tmp/runs/run-1.yaml')).toBe(child);
  });

  /** `CONFIG.MAESTRO_PATH` wins when set — same ladder as the mcp child's,
   * because a person who pointed at a binary meant that binary. */
  it('prefers the configured path over everything', () => {
    const { cli, spawned } = runner({
      configuredPath: '/custom/maestro',
      executables: ['/custom/maestro', '/opt/maestro/bin/maestro'],
    });

    cli.test('R9QYC01EMXL', '/tmp/runs/run-1.yaml');

    expect(spawned[0]?.command).toBe('/custom/maestro');
  });

  it('falls back to the installer’s own location when PATH has nothing', () => {
    const installed = join('/Users/someone', '.maestro', 'bin', 'maestro');
    const { cli, spawned } = runner({ executables: [installed] });

    cli.test('R9QYC01EMXL', '/tmp/runs/run-1.yaml');

    expect(spawned[0]?.command).toBe(installed);
  });

  /** Criterion 3 — no binary is a refusal with its own stable code, distinct
   * by construction from any mid-run failure (those travel as events). */
  it('refuses with run/maestro-not-found when nothing resolves', () => {
    const { cli, spawned } = runner({ executables: [] });

    let thrown: unknown = null;
    try {
      cli.test('R9QYC01EMXL', '/tmp/runs/run-1.yaml');
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(MaestroNotInstalledError);
    expect((thrown as MaestroNotInstalledError).code).toBe(ERROR_CODES.runMaestroNotFound);
    expect(spawned).toEqual([]);
  });
});

import { ERROR_CODES } from '@shared/ipc';
import type { SpawnOptions, StreamingProcess } from '../process/run';
import { resolveMaestro } from './resolve-maestro';

/**
 * The raw-CLI door — §9.2 pins it to this exact path, and with the `maestro
 * mcp` child it is the only module that names the maestro binary. It spawns
 * and nothing else: parsing belongs to `RunOutputParser`, the lifecycle to
 * `RunService`, and the process creation itself to `spawnStreaming`, which
 * arrives by injection the way it does everywhere (§10.1, §12.19).
 *
 * Every invocation carries `--no-reinstall-driver` (§4.4a — the default
 * reinstalls the driver on every call, and that is the number one cause of
 * slowness) and `MAESTRO_CLI_NO_ANALYTICS=1` (§4.4c, §12 rule 10).
 *
 * ⚠️ §4.3.2's amendment is this module's standing warning: a raw CLI call and
 * a live `maestro mcp` session contend for the on-device driver, and the
 * failure is *silently incomplete data reported as success*. Whoever calls
 * this must hold the MCP path idle first — `RunService` owns that exclusion.
 */

export type CliRunnerDeps = {
  readonly spawn: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => StreamingProcess;
  readonly isExecutable: (path: string) => boolean;
  readonly env: NodeJS.ProcessEnv;
  readonly home: string;
  /** `CONFIG.MAESTRO_PATH`. Empty means "resolve it yourself". */
  readonly configuredPath: string;
};

/** Criterion 3: its own code, answered on `run:start` itself — distinct from
 * the mcp child's `mcp/maestro-not-found` and from every mid-run failure. */
export class MaestroNotInstalledError extends Error {
  readonly code = ERROR_CODES.runMaestroNotFound;

  constructor() {
    super('The Maestro CLI is not installed. Running a flow needs maestro 2.6.0 or newer.');
    this.name = 'MaestroNotInstalledError';
  }
}

export class CliRunner {
  private readonly deps: CliRunnerDeps;

  constructor(deps: CliRunnerDeps) {
    this.deps = deps;
  }

  /**
   * Criterion 2, verbatim: `maestro --device <id> test --no-reinstall-driver
   * <flow>`. The device is always explicit — never Maestro's single-device
   * default, which would race whatever else is plugged in. `killTree` because
   * the launcher `exec`s into a JVM and whatever the JVM spawns must die with
   * it (criterion 9).
   */
  test(deviceId: string, flowPath: string): StreamingProcess {
    const binary = resolveMaestro(this.deps);
    if (binary === null) {
      throw new MaestroNotInstalledError();
    }
    return this.deps.spawn(
      binary,
      ['--device', deviceId, 'test', '--no-reinstall-driver', flowPath],
      {
        env: { ...this.deps.env, MAESTRO_CLI_NO_ANALYTICS: '1' },
        killTree: true,
      },
    );
  }
}

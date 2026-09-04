import { basename } from 'node:path';

/**
 * Doctor criterion 40 — a developer affordance: `CONDUCTOR_DOCTOR_HIDE`
 * names tools that must resolve as absent for every consumer, so the app
 * behaves exactly as it would on a machine without them. Ignored when
 * packaged: a shipped build has no business pretending.
 */

/** The names the variable may carry — the doctor's own row ids for tools. */
const TOOLS = new Set(['maestro', 'adb', 'java', 'xcode-clt', 'gh', 'claude']);

export function hiddenTools(env: NodeJS.ProcessEnv, packaged: boolean): Set<string> {
  if (packaged) {
    return new Set();
  }
  return new Set(
    (env.CONDUCTOR_DOCTOR_HIDE ?? '')
      .split(',')
      .map((name) => name.trim())
      .filter((name) => TOOLS.has(name)),
  );
}

/**
 * Wraps the executable probe every resolver ladder walks, so a hidden binary
 * is "not there" wherever it lives — the managed copy, `PATH`, Homebrew.
 * One wrapper at the composition root covers `resolveMaestro`, `resolveGh`,
 * `resolveClaude` and `AdbBridge` alike; `java` and `xcode-clt` resolve
 * through other means and the doctor reads the set directly for those.
 */
export function hideTools(
  isExecutable: (path: string) => boolean,
  hidden: ReadonlySet<string>,
): (path: string) => boolean {
  if (hidden.size === 0) {
    return isExecutable;
  }
  return (path) => (hidden.has(basename(path)) ? false : isExecutable(path));
}

import { join } from 'node:path';

/**
 * The GitHub sign-in's file probe (managed-tools criterion 2): where gh
 * keeps `hosts.yml` and whether it names github.com — read before first
 * paint, no process. The token is never looked for: a top-level host key is
 * all this reads (§9.0). Pure; the service reads the file.
 */

/** gh's own precedence: `GH_CONFIG_DIR`, then `XDG_CONFIG_HOME/gh`, then `~/.config/gh`. */
export function ghHostsFile(env: NodeJS.ProcessEnv, home: string): string {
  const configDir = env.GH_CONFIG_DIR;
  if (configDir !== undefined && configDir !== '') {
    return join(configDir, 'hosts.yml');
  }
  const xdg = env.XDG_CONFIG_HOME;
  if (xdg !== undefined && xdg !== '') {
    return join(xdg, 'gh', 'hosts.yml');
  }
  return join(home, '.config', 'gh', 'hosts.yml');
}

/** True when a token rides in the environment (gh honours `GH_TOKEN` and
 * `GITHUB_TOKEN` over the file) or `hosts.yml` has a top-level `github.com:`
 * entry; `text` is the file's content, or null when there is none. */
export function signedInByFiles(env: NodeJS.ProcessEnv, text: string | null): boolean {
  if (hasValue(env.GH_TOKEN) || hasValue(env.GITHUB_TOKEN)) {
    return true;
  }
  return text !== null && /^github\.com:/m.test(text);
}

function hasValue(value: string | undefined): boolean {
  return value !== undefined && value !== '';
}

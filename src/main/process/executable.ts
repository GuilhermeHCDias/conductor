import { accessSync, constants, statSync } from 'node:fs';

/**
 * True when `path` is a file this process could execute. Both bridges resolve
 * their binary by asking this about one candidate after another, so it has to
 * answer rather than throw: most candidates do not exist, and that is the
 * normal case, not an error.
 *
 * A directory can carry the execute bit — it means "searchable" — so `adb`
 * being a folder would otherwise resolve and then fail at spawn time.
 */
export function isExecutable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) {
      return false;
    }
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

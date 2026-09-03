import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isExecutable } from './executable';

/** Against the real filesystem: what this module is for is the answer the OS
 * gives, and a mocked `fs` would only prove the mock. */
describe('isExecutable', () => {
  const dir = mkdtempSync(join(tmpdir(), 'conductor-exec-'));

  it('accepts a file carrying the execute bit', () => {
    const path = join(dir, 'adb');
    writeFileSync(path, '#!/bin/sh\n');
    chmodSync(path, 0o755);

    expect(isExecutable(path)).toBe(true);
  });

  it('rejects a file without it', () => {
    const path = join(dir, 'notes.txt');
    writeFileSync(path, 'hello');
    chmodSync(path, 0o644);

    expect(isExecutable(path)).toBe(false);
  });

  // Most candidates in a resolution order do not exist. That is the normal
  // case, so it has to be an answer rather than an exception.
  it('answers false for a path that does not exist', () => {
    expect(isExecutable(join(dir, 'nothing-here'))).toBe(false);
  });

  // A directory carries the execute bit to mean "searchable". Taking that for
  // a binary would resolve happily and then fail at spawn time.
  it('rejects a directory', () => {
    expect(isExecutable(dir)).toBe(false);
  });
});

/** The doctor's marker probe: a plain file, executable or not — the managed
 * Maestro's `version` marker carries no execute bit and must still count. */
describe('isFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'conductor-file-'));

  it('accepts a regular file', async () => {
    const { isFile } = await import('./executable');
    const path = join(dir, 'version');
    writeFileSync(path, '2.10.0\n');

    expect(isFile(path)).toBe(true);
  });

  it('answers false for a directory or a missing path', async () => {
    const { isFile } = await import('./executable');

    expect(isFile(dir)).toBe(false);
    expect(isFile(join(dir, 'missing'))).toBe(false);
  });
});

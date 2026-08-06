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

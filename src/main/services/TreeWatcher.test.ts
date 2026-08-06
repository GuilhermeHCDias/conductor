import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { TreeWatcher } from './TreeWatcher';

/**
 * Real directories, both backends. A watcher mocked against a fake
 * filesystem would only prove the fake fires — the whole point of this class
 * is that the OS, or the poller standing in for it, actually notices.
 */

const scratch: string[] = [];
const watchers: TreeWatcher[] = [];

afterEach(async () => {
  for (const watcher of watchers.splice(0)) {
    await watcher.close();
  }
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'conductor-tree-watcher-'));
  scratch.push(dir);
  return dir;
}

async function started(path: string, usePolling: boolean): Promise<{ changes: number[] }> {
  const watcher = new TreeWatcher({ path, usePolling, intervalMs: 10 });
  watchers.push(watcher);
  const changes: number[] = [];
  watcher.on('change', () => {
    changes.push(changes.length);
  });
  await watcher.ready;
  return { changes };
}

/** Polls the condition rather than sleeping a fixed amount: the native
 * backend answers in a millisecond and the poller takes a tick, and neither
 * deserves the other's timeout. */
async function until(condition: () => boolean, describe: () => string): Promise<void> {
  for (let waited = 0; waited < 10_000; waited += 20) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`Timed out waiting. Last state: ${describe()}`);
}

for (const usePolling of [false, true]) {
  describe(`the ${usePolling ? 'polling' : 'native'} backend`, () => {
    it('reports a new file at the root', { timeout: 15_000 }, async () => {
      const path = root();
      const { changes } = await started(path, usePolling);

      writeFileSync(join(path, 'a.yaml'), 'one');

      await until(
        () => changes.length > 0,
        () => `${changes.length} changes`,
      );
    });

    it('reports a write inside a folder created after it started', {
      timeout: 15_000,
    }, async () => {
      const path = root();
      const { changes } = await started(path, usePolling);

      // The recursive watch has to pick up a directory that did not exist
      // when it was installed — the workspace grows folders at runtime (§7.2).
      mkdirSync(join(path, 'checkout'));
      await until(
        () => changes.length > 0,
        () => `${changes.length} changes`,
      );
      const afterFolder = changes.length;

      writeFileSync(join(path, 'checkout', 'pix.yaml'), 'two');

      await until(
        () => changes.length > afterFolder,
        () => `${changes.length} changes, was ${afterFolder}`,
      );
    });

    it('reports a delete', { timeout: 15_000 }, async () => {
      const path = root();
      writeFileSync(join(path, 'gone.yaml'), 'three');
      const { changes } = await started(path, usePolling);

      rmSync(join(path, 'gone.yaml'));

      await until(
        () => changes.length > 0,
        () => `${changes.length} changes`,
      );
    });

    /** What files were already there is not news — only what happens next is
     * (§12.21's one event, not a burst on every launch). */
    it('stays quiet about what was already there', async () => {
      const path = root();
      writeFileSync(join(path, 'existing.yaml'), 'four');
      const { changes } = await started(path, usePolling);

      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(changes).toEqual([]);
    });

    it('goes quiet after close, and closes twice without complaint', async () => {
      const path = root();
      const watcher = new TreeWatcher({ path, usePolling, intervalMs: 10 });
      const changes: number[] = [];
      watcher.on('change', () => {
        changes.push(changes.length);
      });
      await watcher.ready;

      await watcher.close();
      await watcher.close();
      writeFileSync(join(path, 'late.yaml'), 'five');
      await new Promise((resolve) => setTimeout(resolve, 300));

      expect(changes).toEqual([]);
    });
  });
}

/** The service recovers by dropping the watcher and building a new one
 * (criterion 36), so a watcher that cannot watch has to say so as an event —
 * never by throwing past its constructor into main's startup path. */
it('reports an unwatchable path as an error event, not a throw', async () => {
  const missing = join(root(), 'does-not-exist');
  const watcher = new TreeWatcher({ path: missing });
  watchers.push(watcher);
  const errors: Error[] = [];
  watcher.on('error', (error) => {
    errors.push(error);
  });

  await watcher.ready;

  expect(errors.length).toBe(1);
});

/** Polling reads the tree itself, so a missing root is a state it survives
 * rather than an error — and it notices the moment the root appears. */
it('polls a missing root without erroring, and reports it appearing', {
  timeout: 15_000,
}, async () => {
  const dir = root();
  const path = join(dir, 'not-yet');
  const watcher = new TreeWatcher({ path, usePolling: true, intervalMs: 10 });
  watchers.push(watcher);
  const changes: number[] = [];
  const errors: Error[] = [];
  watcher.on('change', () => {
    changes.push(changes.length);
  });
  watcher.on('error', (error) => {
    errors.push(error);
  });
  await watcher.ready;

  mkdirSync(path);
  writeFileSync(join(path, 'arrived.yaml'), 'six');

  await until(
    () => changes.length > 0,
    () => `${changes.length} changes, ${errors.length} errors`,
  );
  expect(errors).toEqual([]);
});

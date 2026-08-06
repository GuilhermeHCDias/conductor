import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { hashText } from '@shared/hash';
import type { Result } from '@shared/ipc';
import type { FlowIndex } from '@shared/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FlowService, type FlowServiceDeps } from './flow.service';

/**
 * The service runs against real temp directories — the filesystem is the
 * domain here, and mocking it would test the mocks. Failure is injected by
 * real filesystem state (a file where a directory should be, a symlink
 * pointing out), never by stubbing `node:fs`.
 */

const scratch: string[] = [];
const services: FlowService[] = [];

afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.dispose();
  }
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** A valid flow: `appId:` before the `---`, one command after it (§7.1). */
const FLOW = 'appId: com.example.app\n---\n- launchApp:\n    clearState: true\n';

/** Criterion 19's template, with the harness's own appId. */
const TEMPLATE = 'appId: com.test.app\n---\n- launchApp:\n    clearState: true\n';

function harness(overrides: Partial<FlowServiceDeps> = {}): {
  service: FlowService;
  root: string;
  dir: string;
  events: Result<FlowIndex>[];
} {
  const dir = mkdtempSync(join(tmpdir(), 'conductor-flow-service-'));
  scratch.push(dir);
  // Nested under `repo/` the way the composition root nests it, so "created
  // recursively" (criterion 1) is what actually runs.
  const root = join(dir, 'repo', 'conductor');
  const events: Result<FlowIndex>[] = [];
  const service = new FlowService({
    root,
    appId: 'com.test.app',
    extensions: ['.yml', '.yaml'],
    emit: (payload) => {
      events.push(payload);
    },
    debounceMs: 100,
    // Deterministic under parallel-suite load: dozens of short-lived sibling
    // watchers starve macOS's native events; polling never misses.
    usePolling: true,
    ...overrides,
  });
  services.push(service);
  return { service, root, dir, events };
}

function seed(root: string, path: string, content: string = FLOW): void {
  mkdirSync(dirname(join(root, path)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function data<T>(result: Result<T>): T {
  if (!result.ok) {
    throw new Error(`Expected ok, got ${result.error.code}: ${result.error.message}`);
  }
  return result.data;
}

function code<T>(result: Result<T>): string {
  if (result.ok) {
    throw new Error(`Expected a failure, got data: ${JSON.stringify(result.data)}`);
  }
  return result.error.code;
}

/**
 * Bounded poll. The budget is deliberately wide: what these tests assert is
 * *delivery*, and a suite running on a saturated machine can stretch a 25ms
 * poll into whole seconds without anything being wrong. The failure message
 * carries what did arrive — a timeout with no evidence is unfixable.
 */
async function until(
  check: () => boolean,
  detail?: () => string,
  timeoutMs = 10_000,
): Promise<void> {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`The condition never held. ${detail?.() ?? ''}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('the workspace root', () => {
  /** Criterion 1 — created recursively on startup when missing. */
  it('is created recursively on start', async () => {
    const { service, root } = harness();

    await service.start();

    expect(existsSync(root)).toBe(true);
  });

  /** Criterion 36's retry is just asking again: the root is re-ensured per
   * list, so a workspace that recovers answers without a restart. */
  it('is recreated by list when it went missing', async () => {
    const { service, root } = harness();
    await service.start();
    rmSync(root, { recursive: true, force: true });

    const result = await service.list();

    expect(data(result)).toEqual({ flows: [], folders: [] });
    expect(existsSync(root)).toBe(true);
  });

  /** Criterion 36 — a root that cannot exist is a stable code, never a silent
   * empty tree. A file sitting where `repo/` should be is ENOTDIR for real —
   * and §8.0 keeps the errno out of the message the sidebar shows: the
   * product sentence crosses, the technical detail stays in main's log. */
  it('refuses with flow/workspace-unavailable when it cannot be created', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { service, dir } = harness();
    writeFileSync(join(dir, 'repo'), 'a file where the repo directory should be');

    const result = await service.list();

    expect(code(result)).toBe('flow/workspace-unavailable');
    expect(result.ok ? '' : result.error.message).toBe('The flows folder could not be opened.');
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });

  it('recovers on retry once the obstacle is gone', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { service, dir } = harness();
    writeFileSync(join(dir, 'repo'), 'in the way');
    await service.list();
    rmSync(join(dir, 'repo'));

    const result = await service.list();

    expect(data(result)).toEqual({ flows: [], folders: [] });
    log.mockRestore();
  });
});

describe('the index', () => {
  /** Criterion 2 — identity, name, folder, command count and hash per flow. */
  it('answers every flow with its identity and metadata', async () => {
    const { service, root } = harness();
    seed(root, 'checkout/pix.yml', 'appId: com.test.app\n---\n- launchApp:\n- tapOn: "Pagar"\n');
    seed(root, 'login.yaml');

    const index = data(await service.list());

    expect(index.flows).toEqual([
      {
        path: 'checkout/pix.yml',
        name: 'pix.yml',
        folder: 'checkout',
        commandCount: 2,
        hash: hashText('appId: com.test.app\n---\n- launchApp:\n- tapOn: "Pagar"\n'),
      },
      {
        path: 'login.yaml',
        name: 'login.yaml',
        folder: '',
        commandCount: 1,
        hash: hashText(FLOW),
      },
    ]);
  });

  /** §7.1 — classification is by header, never by extension: a `config.yaml`
   * with no `appId:` before `---` is not a flow, and neither is a file whose
   * `appId:` only appears after the separator. */
  it('classifies by header, not extension', async () => {
    const { service, root } = harness();
    seed(root, 'flows.yaml', FLOW);
    seed(root, 'config.yaml', 'format: 1\nflows:\n- "*"\n');
    seed(root, 'headerless.yml', '- launchApp:\n');
    seed(root, 'late-header.yml', '---\nappId: com.test.app\n');
    seed(root, 'notes.txt', FLOW);

    const index = data(await service.list());

    expect(index.flows.map((flow) => flow.path)).toEqual(['flows.yaml']);
  });

  /** Criterion 2 — every directory, the empty ones included: a folder just
   * made must be visible (criterion 13), even though Git will never see it. */
  it('lists every directory, empty and nested alike', async () => {
    const { service, root } = harness();
    seed(root, 'checkout/pix.yml');
    mkdirSync(join(root, 'drafts'), { recursive: true });
    mkdirSync(join(root, 'a', 'b'), { recursive: true });

    const index = data(await service.list());

    expect(index.folders).toEqual(['a', 'a/b', 'checkout', 'drafts']);
  });

  /** Criterion 2 — `commandCount` counts the flow's own commands: top-level
   * `- ` lines after the separator, never a header list like `tags:`. */
  it('counts commands only after the separator', async () => {
    const { service, root } = harness();
    seed(
      root,
      'tagged.yaml',
      'appId: com.test.app\ntags:\n- smoke\n- checkout\n---\n- launchApp:\n- tapOn:\n    text: "Pagar"\n',
    );

    const index = data(await service.list());

    expect(index.flows[0]?.commandCount).toBe(2);
  });

  it('sorts flows and folders deterministically', async () => {
    const { service, root } = harness();
    seed(root, 'b.yml');
    seed(root, 'a.yml');
    mkdirSync(join(root, 'z'));
    mkdirSync(join(root, 'c'));

    const index = data(await service.list());

    expect(index.flows.map((flow) => flow.path)).toEqual(['a.yml', 'b.yml']);
    expect(index.folders).toEqual(['c', 'z']);
  });
});

describe('reading a flow', () => {
  it('answers the file text', async () => {
    const { service, root } = harness();
    seed(root, 'checkout/pix.yml');

    expect(data(await service.read('checkout/pix.yml'))).toEqual({ yaml: FLOW });
  });

  it('refuses a missing flow with flow/not-found', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.read('gone.yml'))).toBe('flow/not-found');
  });

  /** §9.3 — containment is checked by resolving, so `..` and absolute paths
   * are refused no matter how they are spelled. */
  it('refuses a path that resolves outside the root', async () => {
    const { service, dir } = harness();
    await service.start();
    writeFileSync(join(dir, 'outside.yml'), FLOW);

    expect(code(await service.read('../../outside.yml'))).toBe('flow/invalid-name');
    expect(code(await service.read(join(dir, 'outside.yml')))).toBe('flow/invalid-name');
  });

  /** §9.3 names symlinks explicitly: a link inside the root that points out
   * of it is an escape, and resolution is what catches it. */
  it('refuses a path that escapes through a symlink', async () => {
    const { service, root, dir } = harness();
    await service.start();
    mkdirSync(join(dir, 'elsewhere'));
    writeFileSync(join(dir, 'elsewhere', 'secret.yml'), FLOW);
    symlinkSync(join(dir, 'elsewhere'), join(root, 'link'));

    expect(code(await service.read('link/secret.yml'))).toBe('flow/invalid-name');
  });
});

describe('saving', () => {
  /** Criteria 6–7 — the write is atomic (temp + rename) and immediate. */
  it('writes the text and answers the path', async () => {
    const { service, root } = harness();
    seed(root, 'pix.yml');

    const result = await service.save('pix.yml', 'appId: com.test.app\n---\n- back\n');

    expect(data(result)).toEqual({ path: 'pix.yml' });
    expect(readFileSync(join(root, 'pix.yml'), 'utf8')).toBe('appId: com.test.app\n---\n- back\n');
  });

  it('leaves no temp file behind', async () => {
    const { service, root } = harness();
    await service.start();

    await service.save('pix.yml', FLOW);

    expect(readdirSync(root)).toEqual(['pix.yml']);
  });

  /** Criterion 6 — no keystroke is ever lost: a save racing an external
   * folder delete recreates the folder rather than dropping the write. */
  it('recreates a parent folder an external edit removed', async () => {
    const { service, root } = harness();
    seed(root, 'checkout/pix.yml');
    rmSync(join(root, 'checkout'), { recursive: true });

    await service.save('checkout/pix.yml', FLOW);

    expect(readFileSync(join(root, 'checkout', 'pix.yml'), 'utf8')).toBe(FLOW);
  });

  /** Criterion 6 — clearing the editor is an edit, and it still lands. */
  it('accepts an empty text', async () => {
    const { service, root } = harness();
    seed(root, 'pix.yml');

    await service.save('pix.yml', '');

    expect(readFileSync(join(root, 'pix.yml'), 'utf8')).toBe('');
  });

  /** Criterion 3 — nothing that is not a flow is ever written. */
  it('refuses a path without a flow extension', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.save('notes.txt', 'x'))).toBe('flow/invalid-name');
  });

  it('refuses a path outside the root', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.save('../escape.yml', 'x'))).toBe('flow/invalid-name');
  });
});

describe('creating a flow', () => {
  /** Criterion 19 — exactly the template, appId from the injected CONFIG. */
  it('creates the file with the appId template and answers its path', async () => {
    const { service, root } = harness();
    await service.start();

    const result = await service.createFlow('', 'checkout');

    expect(data(result)).toEqual({ path: 'checkout.yaml' });
    expect(readFileSync(join(root, 'checkout.yaml'), 'utf8')).toBe(TEMPLATE);
  });

  /** Criterion 18 — type `checkout`, get `checkout.yaml`; a typed extension
   * of either kind is kept, whatever its case. */
  it('appends .yaml only when no flow extension was typed', async () => {
    const { service } = harness();
    await service.start();

    expect(data(await service.createFlow('', 'a'))).toEqual({ path: 'a.yaml' });
    expect(data(await service.createFlow('', 'b.yml'))).toEqual({ path: 'b.yml' });
    expect(data(await service.createFlow('', 'C.YAML'))).toEqual({ path: 'C.YAML' });
  });

  /** Criterion 16 — the draft lands inside the folder it was started in. */
  it('creates inside the target folder', async () => {
    const { service, root } = harness();
    mkdirSync(join(root, 'checkout'), { recursive: true });

    const result = await service.createFlow('checkout', 'pix');

    expect(data(result)).toEqual({ path: 'checkout/pix.yaml' });
    expect(existsSync(join(root, 'checkout', 'pix.yaml'))).toBe(true);
  });

  it('trims the typed name', async () => {
    const { service } = harness();
    await service.start();

    expect(data(await service.createFlow('', '  pix  '))).toEqual({ path: 'pix.yaml' });
  });

  /** Criterion 17 — collisions are case-insensitive within the folder, and
   * the message is the draft row's inline error, verbatim. */
  it('refuses a name already taken in that folder, whatever the case', async () => {
    const { service, root } = harness();
    seed(root, 'Pix.yaml');

    const result = await service.createFlow('', 'pix');

    expect(code(result)).toBe('flow/name-taken');
    expect(result.ok ? '' : result.error.message).toBe('“pix.yaml” already exists in this folder.');
  });

  it('allows the same name in another folder', async () => {
    const { service, root } = harness();
    seed(root, 'pix.yaml');
    mkdirSync(join(root, 'checkout'), { recursive: true });

    expect(data(await service.createFlow('checkout', 'pix'))).toEqual({
      path: 'checkout/pix.yaml',
    });
  });

  /** Criterion 5 — empty once trimmed, separators, dots and escapes. */
  it('refuses an invalid name with flow/invalid-name', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.createFlow('', ''))).toBe('flow/invalid-name');
    expect(code(await service.createFlow('', '   '))).toBe('flow/invalid-name');
    expect(code(await service.createFlow('', 'a/b'))).toBe('flow/invalid-name');
    expect(code(await service.createFlow('', 'a\\b'))).toBe('flow/invalid-name');
    expect(code(await service.createFlow('', '..'))).toBe('flow/invalid-name');
  });

  it('refuses a target folder that escapes the root', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.createFlow('..', 'pix'))).toBe('flow/invalid-name');
  });
});

describe('creating a folder', () => {
  /** Criterion 20 — the directory exists on disk the moment the draft
   * commits, at the root. */
  it('creates the directory and answers it', async () => {
    const { service, root } = harness();
    await service.start();

    const result = await service.createFolder('drafts');

    expect(data(result)).toEqual({ folder: 'drafts' });
    expect(existsSync(join(root, 'drafts'))).toBe(true);
  });

  /** Criterion 17 — the folder flavour of the inline error, verbatim. */
  it('refuses a taken name, case-insensitively', async () => {
    const { service, root } = harness();
    mkdirSync(join(root, 'Drafts'), { recursive: true });

    const result = await service.createFolder('drafts');

    expect(code(result)).toBe('flow/name-taken');
    expect(result.ok ? '' : result.error.message).toBe('A folder called “drafts” already exists.');
  });

  it('refuses an invalid name', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.createFolder(''))).toBe('flow/invalid-name');
    expect(code(await service.createFolder('a/b'))).toBe('flow/invalid-name');
  });
});

describe('renaming a flow', () => {
  /** Criterion 21 — same parent, extension appended for free. */
  it('renames in place and answers the new path', async () => {
    const { service, root } = harness();
    seed(root, 'checkout/pix.yml');

    const result = await service.renameFlow('checkout/pix.yml', 'card');

    expect(data(result)).toEqual({ path: 'checkout/card.yaml' });
    expect(existsSync(join(root, 'checkout', 'card.yaml'))).toBe(true);
    expect(existsSync(join(root, 'checkout', 'pix.yml'))).toBe(false);
  });

  /** Criterion 21 — an unchanged name is a no-op, not an error. */
  it('treats an unchanged name as a no-op', async () => {
    const { service, root } = harness();
    seed(root, 'pix.yml');

    const result = await service.renameFlow('pix.yml', 'pix.yml');

    expect(data(result)).toEqual({ path: 'pix.yml' });
    expect(readFileSync(join(root, 'pix.yml'), 'utf8')).toBe(FLOW);
  });

  it('refuses a name another sibling holds, case-insensitively', async () => {
    const { service, root } = harness();
    seed(root, 'a.yaml');
    seed(root, 'b.yaml');

    expect(code(await service.renameFlow('a.yaml', 'B.yaml'))).toBe('flow/name-taken');
  });

  /** A case-only rename of the file itself is a rename, not a collision —
   * the file is its own sibling on a case-insensitive filesystem. */
  it('allows changing only the case of the name', async () => {
    const { service, root } = harness();
    seed(root, 'pix.yml');

    const result = await service.renameFlow('pix.yml', 'Pix.yml');

    expect(data(result)).toEqual({ path: 'Pix.yml' });
    expect(readdirSync(root)).toEqual(['Pix.yml']);
  });

  it('refuses a missing flow with flow/not-found', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.renameFlow('gone.yml', 'x'))).toBe('flow/not-found');
  });

  it('refuses an invalid new name', async () => {
    const { service, root } = harness();
    seed(root, 'pix.yml');

    expect(code(await service.renameFlow('pix.yml', 'a/b'))).toBe('flow/invalid-name');
    expect(code(await service.renameFlow('pix.yml', '  '))).toBe('flow/invalid-name');
  });
});

describe('renaming a folder', () => {
  /** Criterion 21 — the folder moves, its flows follow. */
  it('renames the directory in place', async () => {
    const { service, root } = harness();
    seed(root, 'drafts/a.yml');

    const result = await service.renameFolder('drafts', 'ideas');

    expect(data(result)).toEqual({ folder: 'ideas' });
    expect(existsSync(join(root, 'ideas', 'a.yml'))).toBe(true);
    expect(existsSync(join(root, 'drafts'))).toBe(false);
  });

  /** Criterion 11 renders deeper directories as `a/b` — renaming one renames
   * its last segment, inside the same parent. */
  it('renames a nested directory within its parent', async () => {
    const { service, root } = harness();
    mkdirSync(join(root, 'a', 'b'), { recursive: true });

    const result = await service.renameFolder('a/b', 'c');

    expect(data(result)).toEqual({ folder: 'a/c' });
    expect(existsSync(join(root, 'a', 'c'))).toBe(true);
  });

  it('treats an unchanged name as a no-op', async () => {
    const { service, root } = harness();
    mkdirSync(join(root, 'drafts'), { recursive: true });

    expect(data(await service.renameFolder('drafts', 'drafts'))).toEqual({ folder: 'drafts' });
  });

  it('refuses a sibling collision, case-insensitively', async () => {
    const { service, root } = harness();
    mkdirSync(join(root, 'drafts'), { recursive: true });
    mkdirSync(join(root, 'Ideas'), { recursive: true });

    expect(code(await service.renameFolder('drafts', 'ideas'))).toBe('flow/name-taken');
  });

  it('refuses a missing folder with flow/not-found', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.renameFolder('gone', 'x'))).toBe('flow/not-found');
  });

  it('never renames the root itself', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.renameFolder('', 'x'))).toBe('flow/invalid-name');
  });

  /** R7 — a flow's path pointed at `renameFolder` must not be renamed past
   * its extension and dropped from the index; only a real directory may. */
  it('refuses a flow file as the source instead of renaming it', async () => {
    const { service, root } = harness();
    seed(root, 'pix.yaml');

    const result = await service.renameFolder('pix.yaml', 'ideas');

    expect(result.ok).toBe(false);
    expect(existsSync(join(root, 'pix.yaml'))).toBe(true);
    expect(existsSync(join(root, 'ideas'))).toBe(false);
  });
});

describe('duplicating', () => {
  /** Criterion 22 — `-copy`, keeping the source's own extension. */
  it('copies in place as <name>-copy', async () => {
    const { service, root } = harness();
    seed(root, 'checkout/pix.yml');

    const result = await service.duplicateFlow('checkout/pix.yml');

    expect(data(result)).toEqual({ path: 'checkout/pix-copy.yml' });
    expect(readFileSync(join(root, 'checkout', 'pix-copy.yml'), 'utf8')).toBe(FLOW);
  });

  /** Criterion 22 — then `-copy-2`, `-copy-3`, while taken. */
  it('numbers the copy while the name is taken', async () => {
    const { service, root } = harness();
    seed(root, 'pix.yml');
    seed(root, 'pix-copy.yml');

    expect(data(await service.duplicateFlow('pix.yml'))).toEqual({ path: 'pix-copy-2.yml' });
    expect(data(await service.duplicateFlow('pix.yml'))).toEqual({ path: 'pix-copy-3.yml' });
  });

  it('refuses a missing source with flow/not-found', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.duplicateFlow('gone.yml'))).toBe('flow/not-found');
  });
});

describe('deleting', () => {
  it('removes the flow and answers its path', async () => {
    const { service, root } = harness();
    seed(root, 'pix.yml');

    const result = await service.deleteFlow('pix.yml');

    expect(data(result)).toEqual({ path: 'pix.yml' });
    expect(existsSync(join(root, 'pix.yml'))).toBe(false);
  });

  /** Criterion 3 — a non-flow is never deleted singly… */
  it('refuses to delete a file without a flow extension', async () => {
    const { service, root } = harness();
    seed(root, 'notes.txt');

    expect(code(await service.deleteFlow('notes.txt'))).toBe('flow/invalid-name');
    expect(existsSync(join(root, 'notes.txt'))).toBe(true);
  });

  /** …except when its whole directory goes (criterion 23's recursive delete). */
  it('removes a folder recursively, non-flows included', async () => {
    const { service, root } = harness();
    seed(root, 'checkout/pix.yml');
    seed(root, 'checkout/data.json', '{}');

    const result = await service.deleteFolder('checkout');

    expect(data(result)).toEqual({ folder: 'checkout' });
    expect(existsSync(join(root, 'checkout'))).toBe(false);
  });

  it('refuses a missing target with flow/not-found', async () => {
    const { service } = harness();
    await service.start();

    expect(code(await service.deleteFlow('gone.yml'))).toBe('flow/not-found');
    expect(code(await service.deleteFolder('gone'))).toBe('flow/not-found');
  });

  it('never deletes the root itself', async () => {
    const { service, root } = harness();
    await service.start();

    expect(code(await service.deleteFolder(''))).toBe('flow/invalid-name');
    expect(code(await service.deleteFolder('.'))).toBe('flow/invalid-name');
    expect(existsSync(root)).toBe(true);
  });
});

describe('the watcher', () => {
  /**
   * Starts the service and steps past the millisecond it started in. The
   * polled watcher compares directory mtimes in whole milliseconds
   * (`fs.watchFile`), so a write landing in the very ms of the root's mkdir
   * is invisible to it forever. Production — fsevents, event-driven — has no
   * such window; only the polling backend these tests choose does.
   */
  async function started(
    overrides: Partial<FlowServiceDeps> = {},
  ): Promise<ReturnType<typeof harness>> {
    const bench = harness(overrides);
    await bench.service.start();
    await new Promise((resolve) => setTimeout(resolve, 5));
    return bench;
  }

  /** Criterion 4 — an external add reaches the UI as a fresh index. */
  it('pushes flow:changed with the fresh index on an external change', {
    timeout: 15_000,
  }, async () => {
    const { root, events } = await started();

    seed(root, 'external.yaml');

    await until(
      () => events.length > 0,
      () => JSON.stringify(events),
    );
    const last = events.at(-1);
    expect(last).toBeDefined();
    expect(data(last as Result<FlowIndex>).flows.map((flow) => flow.path)).toEqual([
      'external.yaml',
    ]);
  });

  /** §12.21 — Conductor's own save arrives on the same one event. */
  it('reports the service’s own writes through the same event', { timeout: 15_000 }, async () => {
    const { service, events } = await started();

    await service.save('own.yaml', FLOW);

    await until(
      () => events.some((event) => event.ok && event.data.flows.length === 1),
      () => JSON.stringify(events),
    );
  });

  /** Criterion 4 — a burst is debounced: back-to-back writes (no yield
   * between them, so they land inside one settle window) reach the UI as one
   * push carrying everything. */
  it('debounces a burst into a complete final index', { timeout: 15_000 }, async () => {
    const { root, events } = await started({ debounceMs: 200 });

    seed(root, 'a.yaml');
    seed(root, 'b.yaml');

    await until(
      () => events.some((event) => event.ok && event.data.flows.length === 2),
      () => JSON.stringify(events),
    );
    expect(events.length).toBe(1);
  });

  /** Criterion 4 — dispose closes the watcher; nothing pushes after it. */
  it('goes quiet after dispose', async () => {
    const { service, root, events } = harness();
    await service.start();
    await service.dispose();

    seed(root, 'late.yaml');
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(events).toEqual([]);
  });

  /**
   * R2 — criterion 36's retry promises that asking `list` again revives a
   * dead watcher. Firing a real 'error' event on the live watcher exercises
   * the service's own handler, which must both drop the reference (so
   * `ensureWatcher` can recreate it) and actually close the broken instance
   * — leaving it genuinely inert, the way a real failure would, so only a
   * freshly-created watcher can observe what's seeded after recovery.
   */
  it('revives the watcher after it errors, once list is asked again', {
    timeout: 15_000,
  }, async () => {
    const { service, root, events } = await started();

    const broken = (
      service as unknown as {
        watcher: { close: () => Promise<void>; emit: (event: string, error: Error) => void };
      }
    ).watcher;
    // Emit while the listener is still attached (closing first strips it,
    // and Node throws on an unheard 'error'), then close it for real — a
    // production failure leaves the instance just as dead, independent of
    // whatever cleanup the service's own handler does.
    broken.emit('error', new Error('simulated watcher failure'));
    await broken.close();

    await until(
      () => events.some((event) => !event.ok),
      () => JSON.stringify(events),
    );

    await service.list();
    // `list` starts the new watcher but does not await its readiness (unlike
    // `start`); with `ignoreInitial: true`, seeding before the poller's own
    // initial scan settles would land in the same blind spot `started()`
    // steps past above — so give the fresh watcher a beat to get there.
    await new Promise((resolve) => setTimeout(resolve, 200));
    seed(root, 'after-recovery.yaml');

    await until(
      () =>
        events.some(
          (event) =>
            event.ok && event.data.flows.some((flow) => flow.path === 'after-recovery.yaml'),
        ),
      () => JSON.stringify(events),
    );
  });
});

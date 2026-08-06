import { hashText } from '@shared/hash';
import type { Result } from '@shared/ipc';
import type { FlowIndex, FlowMeta } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFlowStore, selectUnsaved, useFlowStore } from './flow.store';

/**
 * The flow domain in the renderer: the index projection, the open flow, the
 * 500ms save cadence with its flushes (criterion 6), the reconciliation the
 * watcher pushes drive (criteria 9, 10, 24), and the sidebar's draft
 * machinery (criteria 16–22). `window.conductor` is the only seam mocked.
 */

const FLOW = 'appId: com.test.app\n---\n- launchApp:\n    clearState: true\n';

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

function refusal(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

function meta(path: string, yaml: string = FLOW): FlowMeta {
  const name = path.split('/').at(-1) ?? path;
  const slash = path.lastIndexOf('/');
  return {
    path,
    name,
    folder: slash === -1 ? '' : path.slice(0, slash),
    commandCount: 1,
    hash: hashText(yaml),
  };
}

function index(flows: FlowMeta[] = [], folders: string[] = []): FlowIndex {
  return { flows, folders };
}

function store(): ReturnType<typeof useFlowStore.getState> {
  return useFlowStore.getState();
}

async function openSeeded(path = 'pix.yaml', yaml: string = FLOW): Promise<void> {
  window.conductor.flowRead = vi.fn(() => Promise.resolve(ok({ yaml })));
  await store().openFlow(path);
}

beforeEach(() => {
  resetFlowStore();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('the index', () => {
  it('refresh stores the answer', async () => {
    window.conductor.flowList = vi.fn(() => Promise.resolve(ok(index([meta('a.yaml')]))));

    await store().refresh();

    expect(store().index?.flows.map((flow) => flow.path)).toEqual(['a.yaml']);
    expect(store().indexError).toBeNull();
  });

  /** Criterion 36 — the failure is kept for the sidebar's error state, and a
   * retry that succeeds clears it. */
  it('keeps a workspace failure and clears it on a good retry', async () => {
    window.conductor.flowList = vi.fn(() =>
      Promise.resolve(refusal('flow/workspace-unavailable', 'The flows folder could not open.')),
    );
    await store().refresh();
    expect(store().indexError?.code).toBe('flow/workspace-unavailable');

    window.conductor.flowList = vi.fn(() => Promise.resolve(ok(index())));
    await store().refresh();

    expect(store().indexError).toBeNull();
  });

  /** Criterion 4 — a push lands exactly like an answer. */
  it('applies a pushed index', () => {
    store().applyIndex(ok(index([], ['drafts'])));

    expect(store().index?.folders).toEqual(['drafts']);
  });
});

describe('opening a flow', () => {
  it('reads the file and resets the editor state', async () => {
    await openSeeded('checkout/pix.yml');

    expect(store().openPath).toBe('checkout/pix.yml');
    expect(store().yaml).toBe(FLOW);
    expect(store().dirty).toBe(false);
  });

  /** Criteria 6 and 15 — switching away flushes the pending save first, so
   * no keystroke is lost and no write lands on a stale path. */
  it('flushes the pending save before switching', async () => {
    vi.useFakeTimers();
    await openSeeded('a.yaml');
    const calls: string[] = [];
    window.conductor.flowSave = vi.fn((path: string) => {
      calls.push(`save:${path}`);
      return Promise.resolve(ok({ path }));
    });
    window.conductor.flowRead = vi.fn((path: string) => {
      calls.push(`read:${path}`);
      return Promise.resolve(ok({ yaml: FLOW }));
    });

    store().edit('appId: edited\n---\n');
    await store().openFlow('b.yaml');

    expect(calls).toEqual(['save:a.yaml', 'read:b.yaml']);
  });
});

describe('saving', () => {
  /** Criterion 6 — within 500ms of the *last* keystroke, one write. */
  it('debounces 500ms from the last keystroke', async () => {
    vi.useFakeTimers();
    await openSeeded();
    const save = vi.fn((path: string) => Promise.resolve(ok({ path })));
    window.conductor.flowSave = save;

    store().edit('appId: a\n---\n');
    await vi.advanceTimersByTimeAsync(300);
    expect(save).not.toHaveBeenCalled();

    store().edit('appId: ab\n---\n');
    await vi.advanceTimersByTimeAsync(499);
    expect(save).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledExactlyOnceWith('pix.yaml', 'appId: ab\n---\n');
  });

  /** Criterion 8 — the dot shows while a save is pending or in flight, and
   * leaves once the write lands. */
  it('shows unsaved from the edit until the write lands', async () => {
    vi.useFakeTimers();
    await openSeeded();
    window.conductor.flowSave = vi.fn((path: string) => Promise.resolve(ok({ path })));

    store().edit('appId: x\n---\n');
    expect(selectUnsaved(store())).toBe(true);

    await vi.advanceTimersByTimeAsync(500);
    expect(selectUnsaved(store())).toBe(false);
  });

  it('flushSave writes immediately and cancels the timer', async () => {
    vi.useFakeTimers();
    await openSeeded();
    const save = vi.fn((path: string) => Promise.resolve(ok({ path })));
    window.conductor.flowSave = save;

    store().edit('appId: x\n---\n');
    await store().flushSave();
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).toHaveBeenCalledTimes(1);
  });

  /** A write that failed is still owed — the dot stays truthful. */
  it('keeps unsaved when the write fails', async () => {
    vi.useFakeTimers();
    await openSeeded();
    window.conductor.flowSave = vi.fn(() =>
      Promise.resolve(refusal('flow/workspace-unavailable', 'no disk')),
    );

    store().edit('appId: x\n---\n');
    await vi.advanceTimersByTimeAsync(500);

    expect(selectUnsaved(store())).toBe(true);
  });
});

describe('what the watcher reports', () => {
  /** Criterion 9 — our own save comes back with the hash of exactly what the
   * editor holds: nothing is replaced, nothing is read. */
  it('leaves the editor alone when the disk matches it', async () => {
    await openSeeded('pix.yaml', FLOW);
    const read = vi.fn();
    window.conductor.flowRead = read;

    store().applyIndex(ok(index([meta('pix.yaml', FLOW)])));

    expect(read).not.toHaveBeenCalled();
    expect(store().yaml).toBe(FLOW);
  });

  /** Criterion 10 — an external edit replaces the content with disk truth. */
  it('replaces the content on an external change', async () => {
    await openSeeded('pix.yaml', FLOW);
    const external = 'appId: com.test.app\n---\n- back\n';
    window.conductor.flowRead = vi.fn(() => Promise.resolve(ok({ yaml: external })));

    store().applyIndex(ok(index([meta('pix.yaml', external)])));
    await vi.waitFor(() => {
      expect(store().yaml).toBe(external);
    });
  });

  /** Criterion 10's allowance — within the debounce window the editor wins:
   * its own save is already on the way. */
  it('keeps the editor text while an edit is unsaved', async () => {
    vi.useFakeTimers();
    await openSeeded('pix.yaml', FLOW);
    const read = vi.fn();
    window.conductor.flowRead = read;

    store().edit('appId: mine\n---\n');
    store().applyIndex(ok(index([meta('pix.yaml', 'appId: theirs\n---\n')])));
    await vi.advanceTimersByTimeAsync(0);

    expect(read).not.toHaveBeenCalled();
    expect(store().yaml).toBe('appId: mine\n---\n');
  });

  /** Criterion 24 — the open flow went away: the first remaining one opens. */
  it('opens the first remaining flow when the open one is deleted', async () => {
    await openSeeded('b.yaml');
    window.conductor.flowRead = vi.fn(() => Promise.resolve(ok({ yaml: FLOW })));

    store().applyIndex(ok(index([meta('a.yaml')])));

    await vi.waitFor(() => {
      expect(store().openPath).toBe('a.yaml');
    });
    expect(window.conductor.flowRead).toHaveBeenCalledWith('a.yaml');
  });

  it('shows the empty editor when none remain', async () => {
    await openSeeded('b.yaml');

    store().applyIndex(ok(index([])));

    expect(store().openPath).toBeNull();
    expect(store().yaml).toBe('');
  });

  /** Criterion 6's other face — a pending save for a flow that is gone must
   * never land: the write would resurrect the file. */
  it('cancels the pending save of a deleted flow', async () => {
    vi.useFakeTimers();
    await openSeeded('b.yaml');
    const save = vi.fn((path: string) => Promise.resolve(ok({ path })));
    window.conductor.flowSave = save;

    store().edit('appId: typed\n---\n');
    store().applyIndex(ok(index([])));
    await vi.advanceTimersByTimeAsync(1000);

    expect(save).not.toHaveBeenCalled();
  });
});

describe('a draft', () => {
  /** Criterion 19 — the commit creates the file and the new flow opens. */
  it('creates the flow and opens it', async () => {
    window.conductor.flowCreate = vi.fn(() => Promise.resolve(ok({ path: 'checkout/pix.yaml' })));
    window.conductor.flowList = vi.fn(() =>
      Promise.resolve(ok(index([meta('checkout/pix.yaml')], ['checkout']))),
    );
    window.conductor.flowRead = vi.fn(() => Promise.resolve(ok({ yaml: FLOW })));

    store().startDraft('flow', 'checkout');
    store().setDraftValue('pix');
    await store().commitDraft();

    expect(window.conductor.flowCreate).toHaveBeenCalledExactlyOnceWith('checkout', 'pix');
    expect(store().draft).toBeNull();
    expect(store().openPath).toBe('checkout/pix.yaml');
  });

  /** Criterion 17 — a collision keeps the draft editing, with the service's
   * inline message shown under the field. */
  it('keeps the draft open on a collision', async () => {
    window.conductor.flowCreate = vi.fn(() =>
      Promise.resolve(refusal('flow/name-taken', '“pix.yaml” already exists in this folder.')),
    );

    store().startDraft('flow', '');
    store().setDraftValue('pix');
    await store().commitDraft();

    expect(store().draft?.error).toBe('“pix.yaml” already exists in this folder.');
  });

  /** Criterion 17 — empty commits cancel; nothing reaches the disk. */
  it('cancels on an empty commit', async () => {
    const create = vi.fn();
    window.conductor.flowCreate = create;

    store().startDraft('flow', '');
    store().setDraftValue('   ');
    await store().commitDraft();

    expect(create).not.toHaveBeenCalled();
    expect(store().draft).toBeNull();
  });

  it('typing clears the inline error', async () => {
    window.conductor.flowCreate = vi.fn(() => Promise.resolve(refusal('flow/name-taken', 'taken')));
    store().startDraft('flow', '');
    store().setDraftValue('pix');
    await store().commitDraft();

    store().setDraftValue('pix2');

    expect(store().draft?.error).toBeNull();
  });

  /** Criterion 16 — starting a draft inside a folder forces it open, or the
   * new row would be born invisible. */
  it('expands the folder the draft starts in', () => {
    store().toggleFolder('checkout');
    expect(store().collapsed).toContain('checkout');

    store().startDraft('flow', 'checkout');

    expect(store().collapsed).not.toContain('checkout');
  });

  /** Criterion 20 — a committed folder appears, expanded. */
  it('creates a folder that arrives expanded', async () => {
    window.conductor.flowCreateFolder = vi.fn(() => Promise.resolve(ok({ folder: 'drafts' })));
    window.conductor.flowList = vi.fn(() => Promise.resolve(ok(index([], ['drafts']))));

    store().startDraft('folder', '');
    store().setDraftValue('drafts');
    await store().commitDraft();

    expect(store().draft).toBeNull();
    expect(store().collapsed).not.toContain('drafts');
    expect(store().index?.folders).toEqual(['drafts']);
  });
});

describe('a rename', () => {
  /** Criterion 21 — the row's draft opens prefilled with the current name. */
  it('prefills the current name', () => {
    store().startRename('flow', 'checkout/pix.yml');

    expect(store().draft).toMatchObject({
      kind: 'flow',
      renaming: 'checkout/pix.yml',
      value: 'pix.yml',
    });
  });

  /** Criterion 21 — committing the unchanged name is a no-op. */
  it('treats the unchanged name as a no-op', async () => {
    const rename = vi.fn();
    window.conductor.flowRename = rename;

    store().startRename('flow', 'checkout/pix.yml');
    await store().commitDraft();

    expect(rename).not.toHaveBeenCalled();
    expect(store().draft).toBeNull();
  });

  /** Criterion 21 — the open flow follows its own rename, its pending save
   * flushed to the old path first (criterion 6), content untouched. */
  it('flushes, renames and follows the open flow', async () => {
    vi.useFakeTimers();
    await openSeeded('checkout/pix.yml');
    const calls: string[] = [];
    window.conductor.flowSave = vi.fn((path: string) => {
      calls.push(`save:${path}`);
      return Promise.resolve(ok({ path }));
    });
    window.conductor.flowRename = vi.fn((path: string, name: string) => {
      calls.push(`rename:${path}:${name}`);
      return Promise.resolve(ok({ path: 'checkout/card.yaml' }));
    });
    window.conductor.flowList = vi.fn(() =>
      Promise.resolve(ok(index([meta('checkout/card.yaml', 'appId: typed\n---\n')], ['checkout']))),
    );

    store().edit('appId: typed\n---\n');
    store().startRename('flow', 'checkout/pix.yml');
    store().setDraftValue('card');
    await store().commitDraft();

    expect(calls).toEqual(['save:checkout/pix.yml', 'rename:checkout/pix.yml:card']);
    expect(store().openPath).toBe('checkout/card.yaml');
    expect(store().yaml).toBe('appId: typed\n---\n');
  });

  /** Criterion 21 — the open flow follows a rename of a folder above it. */
  it('follows a folder rename above the open flow', async () => {
    await openSeeded('drafts/a.yml');
    window.conductor.flowRenameFolder = vi.fn(() => Promise.resolve(ok({ folder: 'ideas' })));
    window.conductor.flowList = vi.fn(() =>
      Promise.resolve(ok(index([meta('ideas/a.yml')], ['ideas']))),
    );

    store().startRename('folder', 'drafts');
    store().setDraftValue('ideas');
    await store().commitDraft();

    expect(store().openPath).toBe('ideas/a.yml');
  });

  it('keeps the draft open on a collision', async () => {
    window.conductor.flowRenameFolder = vi.fn(() =>
      Promise.resolve(refusal('flow/name-taken', 'A folder called “ideas” already exists.')),
    );

    store().startRename('folder', 'drafts');
    store().setDraftValue('ideas');
    await store().commitDraft();

    expect(store().draft?.error).toBe('A folder called “ideas” already exists.');
  });
});

describe('deleting', () => {
  it('holds the target for the confirmation dialog', () => {
    store().askDelete('folder', 'checkout');
    expect(store().confirm).toEqual({ kind: 'folder', identity: 'checkout' });

    store().cancelDelete();
    expect(store().confirm).toBeNull();
  });

  /** Criteria 23–24 — confirming deletes; the reconciliation that follows
   * opens the first remaining flow; the doomed flow's pending save dies. */
  it('deletes the open flow without letting its save resurrect it', async () => {
    vi.useFakeTimers();
    await openSeeded('b.yaml');
    const save = vi.fn((path: string) => Promise.resolve(ok({ path })));
    window.conductor.flowSave = save;
    window.conductor.flowDelete = vi.fn(() => Promise.resolve(ok({ path: 'b.yaml' })));
    window.conductor.flowList = vi.fn(() => Promise.resolve(ok(index([meta('a.yaml')]))));
    window.conductor.flowRead = vi.fn(() => Promise.resolve(ok({ yaml: FLOW })));

    store().edit('appId: typed\n---\n');
    store().askDelete('flow', 'b.yaml');
    await store().confirmDelete();
    await vi.advanceTimersByTimeAsync(1000);

    expect(window.conductor.flowDelete).toHaveBeenCalledExactlyOnceWith('b.yaml');
    expect(save).not.toHaveBeenCalled();
    expect(store().openPath).toBe('a.yaml');
  });

  it('deletes a folder recursively through main', async () => {
    window.conductor.flowDeleteFolder = vi.fn(() => Promise.resolve(ok({ folder: 'checkout' })));
    window.conductor.flowList = vi.fn(() => Promise.resolve(ok(index())));

    store().askDelete('folder', 'checkout');
    await store().confirmDelete();

    expect(window.conductor.flowDeleteFolder).toHaveBeenCalledExactlyOnceWith('checkout');
    expect(store().confirm).toBeNull();
  });
});

describe('reading a flow for a caller that is not the editor', () => {
  /** Criterion 25 — "Run now" runs the saved file, so it reads it. */
  it('answers the text, or null when the flow is gone', async () => {
    window.conductor.flowRead = vi.fn(() => Promise.resolve(ok({ yaml: FLOW })));
    expect(await store().readFlow('pix.yaml')).toBe(FLOW);

    window.conductor.flowRead = vi.fn(() => Promise.resolve(refusal('flow/not-found', 'gone')));
    expect(await store().readFlow('pix.yaml')).toBeNull();
  });
});

describe('duplicating', () => {
  it('copies through main and refreshes', async () => {
    window.conductor.flowDuplicate = vi.fn(() => Promise.resolve(ok({ path: 'pix-copy.yaml' })));
    window.conductor.flowList = vi.fn(() =>
      Promise.resolve(ok(index([meta('pix-copy.yaml'), meta('pix.yaml')]))),
    );

    await store().duplicateFlow('pix.yaml');

    expect(window.conductor.flowDuplicate).toHaveBeenCalledExactlyOnceWith('pix.yaml');
    expect(store().index?.flows).toHaveLength(2);
  });
});

describe('the tree state', () => {
  /** Criterion 12 — collapse is per-session state, nothing more. */
  it('toggles a folder closed and open', () => {
    store().toggleFolder('checkout');
    expect(store().collapsed).toEqual(['checkout']);

    store().toggleFolder('checkout');
    expect(store().collapsed).toEqual([]);
  });

  it('holds the context menu for the views', () => {
    store().openMenu({ kind: 'flow', identity: 'pix.yaml', x: 10, y: 20 });
    expect(store().menu).toEqual({ kind: 'flow', identity: 'pix.yaml', x: 10, y: 20 });

    store().closeMenu();
    expect(store().menu).toBeNull();
  });
});

describe('appendStep', () => {
  /** The command-menu path (§5.5) is an edit like any other: additive bytes,
   * a revision tick for the reveal, and the same save cadence. */
  it('appends, advances the revision and schedules the save', async () => {
    vi.useFakeTimers();
    await openSeeded('pix.yaml', 'appId: x\n---\n- launchApp:\n');
    const save = vi.fn((path: string) => Promise.resolve(ok({ path })));
    window.conductor.flowSave = save;

    store().appendStep('- tapOn:\n    text: "Pagar"');

    expect(store().yaml).toBe('appId: x\n---\n- launchApp:\n- tapOn:\n    text: "Pagar"\n');
    expect(store().revision).toBe(1);
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

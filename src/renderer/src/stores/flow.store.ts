import { hashText } from '@shared/hash';
import type { PushPayload } from '@shared/ipc';
import type { FlowIndex } from '@shared/types';
import { create } from 'zustand';

/**
 * The flow domain, renderer side: a projection of the index main owns, the
 * open flow, the 500ms save cadence (criterion 6 — editing is saving, there
 * is no Save button), and the sidebar's draft machinery. Its actions are the
 * only renderer code that calls the `window.conductor` flow functions.
 *
 * Main owns the truth: every mutation goes to disk and comes back as an
 * index — pushed by the watcher or pulled by `refresh` — and the store
 * reconciles what it holds against that truth (criteria 9, 10, 24). There is
 * no renderer-only copy of a flow.
 */

export type FlowFailure = { readonly code: string; readonly message: string };

export type FlowItemKind = 'flow' | 'folder';

/**
 * One editable row in the tree — creating and renaming are the same
 * interaction (criterion 16, Finder-style): `renaming` is `null` for a
 * create, and the identity being renamed otherwise.
 */
export type FlowDraft = {
  readonly kind: FlowItemKind;
  /** Where a new flow lands — `''` at the root. Renames keep their parent. */
  readonly folder: string;
  readonly renaming: string | null;
  readonly value: string;
  /** Criterion 17 — the inline collision error, straight from main's copy. */
  readonly error: string | null;
};

export type FlowMenu = {
  readonly kind: FlowItemKind;
  readonly identity: string;
  readonly x: number;
  readonly y: number;
};

export type FlowConfirm = {
  readonly kind: FlowItemKind;
  readonly identity: string;
};

export type FlowData = {
  /** `null` until the first answer lands. */
  readonly index: FlowIndex | null;
  /** Criterion 36 — the sidebar's error state, never a silent empty tree. */
  readonly indexError: FlowFailure | null;
  /** §7.2 — the open flow's identity: its root-relative path. */
  readonly openPath: string | null;
  readonly yaml: string;
  /** An edit not yet handed to `flow:save`. */
  readonly dirty: boolean;
  /** A `flow:save` in flight. The DocumentBar dot is `dirty || saving`. */
  readonly saving: boolean;
  /** Advances when text arrives from outside the editor's own caret — the
   * command menu's append — so the editor can reveal it. */
  readonly revision: number;
  readonly draft: FlowDraft | null;
  readonly menu: FlowMenu | null;
  readonly confirm: FlowConfirm | null;
  /** Criterion 12 — collapse is per-session, so it lives here and nowhere
   * deeper. */
  readonly collapsed: readonly string[];
};

export type FlowActions = {
  /** `flow:list` — the initial load, and criterion 36's retry. */
  refresh: () => Promise<void>;
  /** Criterion 4 — one entry point for the index, pushed or pulled. */
  applyIndex: (payload: PushPayload<'flow:changed'>) => void;
  /** Criterion 15 — flushes the pending save, then loads via `flow:read`. */
  openFlow: (path: string) => Promise<void>;
  /** One file's text for a caller that is not the editor — "Run now" runs
   * the saved flow (criterion 25). `null` when it is gone. */
  readFlow: (path: string) => Promise<string | null>;
  /** The editor's keystrokes. Schedules the save (criterion 6). */
  edit: (yaml: string) => void;
  /** The command-menu append (§5.5) — additive bytes, same save cadence. */
  appendStep: (step: string) => void;
  /** Writes now: open-switch, rename, window close (criterion 6). */
  flushSave: () => Promise<void>;
  toggleFolder: (folder: string) => void;
  startDraft: (kind: FlowItemKind, folder: string) => void;
  startRename: (kind: FlowItemKind, identity: string) => void;
  setDraftValue: (value: string) => void;
  cancelDraft: () => void;
  commitDraft: () => Promise<void>;
  duplicateFlow: (path: string) => Promise<void>;
  openMenu: (menu: FlowMenu) => void;
  closeMenu: () => void;
  askDelete: (kind: FlowItemKind, identity: string) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
};

export type FlowState = FlowData & FlowActions;

/** Criterion 6 — the write follows the last keystroke by at most this. */
const SAVE_DEBOUNCE_MS = 500;

// Non-rendered machinery lives outside the store, the way the device store
// keeps its timers: nothing re-renders because a timer was armed.
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let commitInFlight = false;
let saveInFlight: Promise<void> | null = null;

function createFlowData(): FlowData {
  return {
    index: null,
    indexError: null,
    openPath: null,
    yaml: '',
    dirty: false,
    saving: false,
    revision: 0,
    draft: null,
    menu: null,
    confirm: null,
    collapsed: [],
  };
}

function scheduleSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveNow();
  }, SAVE_DEBOUNCE_MS);
}

function cancelPendingSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}

/**
 * The one writer, coalesced. A timer-fired save and a `flushSave` racing the
 * same write can otherwise both call `flowSave` concurrently — two writers
 * of the same temp file corrupt or ENOENT each other (§8.2's atomic write
 * assumes a single writer). A save already in flight is awaited instead of
 * raced; if a newer edit landed while it was in flight, that edit gets its
 * own follow-up save once the first settles, so a flush never returns before
 * the latest text is actually on its way to disk.
 */
async function saveNow(): Promise<void> {
  if (saveInFlight !== null) {
    await saveInFlight;
    if (useFlowStore.getState().dirty) {
      await saveNow();
    }
    return;
  }
  saveInFlight = performSave();
  try {
    await saveInFlight;
  } finally {
    saveInFlight = null;
  }
}

/** What it captures is what it writes; if the text moved on while the write
 * was in flight, `dirty` stays and `saveNow`'s drain gives it its own save. */
async function performSave(): Promise<void> {
  const { openPath, yaml, dirty } = useFlowStore.getState();
  if (openPath === null || !dirty) {
    return;
  }
  useFlowStore.setState({ saving: true });
  const result = await window.conductor.flowSave(openPath, yaml);
  const now = useFlowStore.getState();
  const landed = result.ok && now.openPath === openPath && now.yaml === yaml;
  useFlowStore.setState(landed ? { saving: false, dirty: false } : { saving: false });
}

/** Criterion 10 — the disk is the truth; unless the editor holds an unsaved
 * edit, its content follows an external change. */
async function reloadOpen(path: string): Promise<void> {
  const result = await window.conductor.flowRead(path);
  if (!result.ok) {
    return;
  }
  const now = useFlowStore.getState();
  if (now.openPath !== path || now.dirty || now.saving) {
    return;
  }
  useFlowStore.setState({ yaml: result.data.yaml });
}

/** Criterion 24 fires on an actual delete only. A flow also drops out of the
 * index when its header stops classifying (criterion 3) while the user is
 * mid-edit — reading the disk before discarding anything is what tells the
 * two apart, so a live edit is never thrown away by criterion 6's mistake. */
async function reconcileMissing(path: string): Promise<void> {
  const stillOnDisk = await window.conductor.flowRead(path);
  if (stillOnDisk.ok) {
    return;
  }
  if (useFlowStore.getState().openPath !== path) {
    return;
  }
  cancelPendingSave();
  const next = useFlowStore.getState().index?.flows[0];
  if (next === undefined) {
    useFlowStore.setState({ openPath: null, yaml: '', dirty: false, revision: 0 });
  } else {
    useFlowStore.setState({ dirty: false });
    void useFlowStore.getState().openFlow(next.path);
  }
}

function nameOf(identity: string): string {
  return identity.split('/').at(-1) ?? identity;
}

function parentOf(identity: string): string {
  const slash = identity.lastIndexOf('/');
  return slash === -1 ? '' : identity.slice(0, slash);
}

function failDraft(message: string): void {
  useFlowStore.setState((state) => ({
    draft: state.draft === null ? null : { ...state.draft, error: message },
  }));
}

export const useFlowStore = create<FlowState>((set, get) => ({
  ...createFlowData(),

  refresh: async () => {
    get().applyIndex(await window.conductor.flowList());
  },

  applyIndex: (payload) => {
    if (!payload.ok) {
      set({ indexError: payload.error });
      return;
    }
    const index = payload.data;
    set({ index, indexError: null });

    const { openPath, yaml, dirty, saving } = get();
    if (openPath === null) {
      return;
    }
    const open = index.flows.find((flow) => flow.path === openPath);
    if (open === undefined) {
      void reconcileMissing(openPath);
      return;
    }
    if (open.hash === hashText(yaml)) {
      // Criterion 9 — the watcher is reporting our own save. Nothing moves.
      return;
    }
    if (dirty || saving) {
      // Criterion 10's allowance — inside the debounce window the editor's
      // text wins; its save is already on the way.
      return;
    }
    void reloadOpen(openPath);
  },

  openFlow: async (path) => {
    if (get().openPath === path) {
      return;
    }
    await get().flushSave();
    const result = await window.conductor.flowRead(path);
    if (!result.ok) {
      // A stale row — the index that made it stale is about to arrive.
      return;
    }
    set({ openPath: path, yaml: result.data.yaml, dirty: false, revision: 0 });
  },

  readFlow: async (path) => {
    const result = await window.conductor.flowRead(path);
    return result.ok ? result.data.yaml : null;
  },

  edit: (yaml) => {
    if (get().openPath === null) {
      return;
    }
    set({ yaml, dirty: true });
    scheduleSave();
  },

  appendStep: (step) => {
    const { openPath, yaml, revision } = get();
    if (openPath === null) {
      return;
    }
    set({
      // Trimming exactly one trailing newline and putting it back keeps the
      // existing bytes identical whether or not the text ended with one.
      yaml: `${yaml.replace(/\n$/, '')}\n${step}\n`,
      dirty: true,
      revision: revision + 1,
    });
    scheduleSave();
  },

  flushSave: async () => {
    cancelPendingSave();
    await saveNow();
  },

  toggleFolder: (folder) => {
    const { collapsed } = get();
    set({
      collapsed: collapsed.includes(folder)
        ? collapsed.filter((entry) => entry !== folder)
        : [...collapsed, folder],
    });
  },

  startDraft: (kind, folder) => {
    set({
      draft: { kind, folder, renaming: null, value: '', error: null },
      menu: null,
      // Criterion 16 — the target folder opens, or the draft is born hidden.
      collapsed: get().collapsed.filter((entry) => entry !== folder),
    });
  },

  startRename: (kind, identity) => {
    set({
      draft: {
        kind,
        folder: parentOf(identity),
        renaming: identity,
        value: nameOf(identity),
        error: null,
      },
      menu: null,
    });
  },

  setDraftValue: (value) => {
    set((state) => ({
      draft: state.draft === null ? null : { ...state.draft, value, error: null },
    }));
  },

  cancelDraft: () => {
    set({ draft: null });
  },

  commitDraft: async () => {
    // Enter commits and the blur it causes commits again — one wins.
    if (commitInFlight) {
      return;
    }
    commitInFlight = true;
    try {
      const draft = get().draft;
      if (draft === null) {
        return;
      }
      const raw = draft.value.trim();
      if (raw === '') {
        // Criterion 17 — empty is a cancel, never an error.
        set({ draft: null });
        return;
      }

      if (draft.renaming === null) {
        if (draft.kind === 'flow') {
          const result = await window.conductor.flowCreate(draft.folder, raw);
          if (!result.ok) {
            failDraft(result.error.message);
            return;
          }
          set({ draft: null });
          await get().refresh();
          // Criterion 19 — the new flow opens in the editor.
          await get().openFlow(result.data.path);
        } else {
          const result = await window.conductor.flowCreateFolder(raw);
          if (!result.ok) {
            failDraft(result.error.message);
            return;
          }
          // Criterion 20 — the new folder appears expanded.
          set({
            draft: null,
            collapsed: get().collapsed.filter((entry) => entry !== result.data.folder),
          });
          await get().refresh();
        }
        return;
      }

      // Criterion 21 — the mock's exact no-op rule: the unchanged name, by
      // strict equality, commits as nothing.
      if (raw === nameOf(draft.renaming)) {
        set({ draft: null });
        return;
      }

      if (draft.kind === 'flow') {
        if (get().openPath === draft.renaming) {
          // Criterion 6 — flush to the old path before it moves.
          await get().flushSave();
        }
        const result = await window.conductor.flowRename(draft.renaming, raw);
        if (!result.ok) {
          failDraft(result.error.message);
          return;
        }
        if (get().openPath === draft.renaming) {
          // Criterion 21 — the identity follows; content and caret stay.
          set({ openPath: result.data.path });
        }
        set({ draft: null });
        await get().refresh();
      } else {
        const folder = draft.renaming;
        const inside = (path: string | null): boolean => path?.startsWith(`${folder}/`) ?? false;
        if (inside(get().openPath)) {
          await get().flushSave();
        }
        const result = await window.conductor.flowRenameFolder(folder, raw);
        if (!result.ok) {
          failDraft(result.error.message);
          return;
        }
        const renamed = result.data.folder;
        const now = get();
        set({
          draft: null,
          openPath: inside(now.openPath)
            ? `${renamed}${(now.openPath ?? '').slice(folder.length)}`
            : now.openPath,
          collapsed: now.collapsed.map((entry) =>
            entry === folder
              ? renamed
              : entry.startsWith(`${folder}/`)
                ? `${renamed}${entry.slice(folder.length)}`
                : entry,
          ),
        });
        await get().refresh();
      }
    } finally {
      commitInFlight = false;
    }
  },

  duplicateFlow: async (path) => {
    set({ menu: null });
    const result = await window.conductor.flowDuplicate(path);
    if (!result.ok) {
      console.error('The flow could not be duplicated:', result.error);
      return;
    }
    await get().refresh();
  },

  openMenu: (menu) => {
    set({ menu });
  },

  closeMenu: () => {
    set({ menu: null });
  },

  askDelete: (kind, identity) => {
    set({ confirm: { kind, identity }, menu: null });
  },

  cancelDelete: () => {
    set({ confirm: null });
  },

  confirmDelete: async () => {
    const confirm = get().confirm;
    if (confirm === null) {
      return;
    }
    set({ confirm: null });
    const open = get().openPath;
    const doomed =
      confirm.kind === 'flow'
        ? open === confirm.identity
        : (open?.startsWith(`${confirm.identity}/`) ?? false);
    if (doomed) {
      // Criterion 6 — nothing lands on a path that is about to be gone. The
      // dirty flag itself stays until the delete actually lands, so a failed
      // delete does not read as a saved document.
      cancelPendingSave();
    }
    const result =
      confirm.kind === 'flow'
        ? await window.conductor.flowDelete(confirm.identity)
        : await window.conductor.flowDeleteFolder(confirm.identity);
    if (!result.ok) {
      console.error('The delete could not complete:', result.error);
      return;
    }
    if (doomed) {
      set({ dirty: false });
    }
    // Criterion 24 rides on the reconciliation this triggers.
    await get().refresh();
  },
}));

/** Restores the blank state and disarms the timer. Tests share one module. */
export function resetFlowStore(): void {
  cancelPendingSave();
  commitInFlight = false;
  saveInFlight = null;
  useFlowStore.setState(createFlowData());
}

export function selectYaml(state: FlowState): string {
  return state.yaml;
}

/** Criterion 8 — the DocumentBar dot: a save pending or in flight. */
export function selectUnsaved(state: FlowState): boolean {
  return state.dirty || state.saving;
}

export function selectRevision(state: FlowState): number {
  return state.revision;
}

export function selectOpenPath(state: FlowState): string | null {
  return state.openPath;
}

/** The open flow's file name — what the DocumentBar and Toolbar show. */
export function selectOpenName(state: FlowState): string | null {
  return state.openPath === null ? null : nameOf(state.openPath);
}

export function selectIndex(state: FlowState): FlowIndex | null {
  return state.index;
}

export function selectIndexError(state: FlowState): FlowFailure | null {
  return state.indexError;
}

export function selectDraft(state: FlowState): FlowDraft | null {
  return state.draft;
}

export function selectMenu(state: FlowState): FlowMenu | null {
  return state.menu;
}

export function selectConfirm(state: FlowState): FlowConfirm | null {
  return state.confirm;
}

export function selectCollapsed(state: FlowState): readonly string[] {
  return state.collapsed;
}

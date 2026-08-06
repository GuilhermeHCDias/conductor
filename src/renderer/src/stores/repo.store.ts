import type {
  ConnectedRepo,
  PushPayload,
  RepoResolveEvent,
  RepoState,
  ResolvedRepo,
} from '@shared/ipc';
import { create } from 'zustand';
import { type RepoErrorSurface, repoErrorSurface } from '../lib/repo-errors';
import { type ParsedRepoUrl, parseRepoUrl } from '../lib/repo-url';

/**
 * The repo domain, renderer-side: a projection of main's truth — the
 * connected list and the active slug (§2.1) — plus the resolver's own UI
 * state, shared by the connect window and the add sheet because the two are
 * never mounted at once. The parse refusals answer instantly with zero IPC;
 * everything real crosses as `repo:resolve` and comes back as events.
 */

export type ResolvePhase = 'idle' | 'resolving' | 'found' | 'error';

export type RepoData = {
  /** Main's truth, projected. */
  readonly repos: readonly ConnectedRepo[];
  readonly active: string | null;
  /** True once `repo:list` answered. The connect-or-workspace decision waits
   * for it, so a persisted repo never flashes the connect screen. */
  readonly loaded: boolean;
  /** The resolver. */
  readonly url: string;
  readonly phase: ResolvePhase;
  /** How many of the three real stages completed (0–3). */
  readonly step: number;
  readonly found: ResolvedRepo | null;
  readonly resolveError: RepoErrorSurface | null;
  /** The add sheet, opened from the switcher popover. */
  readonly addOpen: boolean;
};

export type RepoActions = {
  /** The boot query; the steady state arrives on `repo:changed`. */
  init: () => Promise<void>;
  applyState: (payload: PushPayload<'repo:changed'>) => void;
  applyResolveEvent: (payload: PushPayload<'repo:resolve-event'>) => void;
  setUrl: (url: string) => void;
  submit: () => Promise<void>;
  confirm: () => Promise<void>;
  switchRepo: (slug: string) => Promise<void>;
  openAdd: () => void;
  closeAdd: () => void;
  pasteFromClipboard: () => Promise<void>;
  copyCommand: (command: string) => Promise<void>;
  resetResolver: () => void;
};

export type RepoStoreState = RepoData & RepoActions;

/** The resolution the events are about — non-rendered machinery, so it lives
 * beside the store rather than in it. `null` means nothing is expected. */
let currentResolveId: number | null = null;
/** What the pasted URL parsed to — the error surfaces name the repo. */
let lastParsed: ParsedRepoUrl | null = null;
/**
 * Events that arrived before the `repo:resolve` reply told us our id. A
 * resolution that fails before main's handler returns — gh missing does —
 * has its events delivered *ahead* of the invoke reply, and dropping them
 * would leave the spinner running forever. They wait here and drain, id
 * checked, the moment the reply lands.
 */
let pendingEvents: RepoResolveEvent[] = [];
/** One confirm at a time — a double-click must not earn a spurious
 * resolve-not-found surface. */
let confirming = false;

function createRepoData(): RepoData {
  return {
    repos: [],
    active: null,
    loaded: false,
    url: '',
    phase: 'idle',
    step: 0,
    found: null,
    resolveError: null,
    addOpen: false,
  };
}

export const useRepoStore = create<RepoStoreState>((set, get) => ({
  ...createRepoData(),

  init: async () => {
    const result = await window.conductor.repoList();
    if (!result.ok) {
      // The truth could not be read; loaded still flips so the window shows
      // the connect screen instead of staying blank forever.
      console.error('The repo list could not be read:', result.error);
      set({ loaded: true });
      return;
    }
    set({ repos: result.data.repos, active: result.data.active, loaded: true });
  },

  applyState: (payload) => {
    if (!payload.ok) {
      console.error('The repo state push failed:', payload.error);
      return;
    }
    set({ repos: payload.data.repos, active: payload.data.active, loaded: true });
  },

  applyResolveEvent: (payload) => {
    if (!payload.ok) {
      if (get().phase !== 'resolving') {
        return;
      }
      set({
        phase: 'error',
        resolveError: repoErrorSurface(payload.error.code, payload.error.message, lastParsed),
      });
      return;
    }
    const event = payload.data;
    if (currentResolveId === null && get().phase === 'resolving') {
      // The reply has not named our resolution yet; hold the event rather
      // than guess. `submit` drains this the moment the id arrives.
      pendingEvents.push(event);
      return;
    }
    if (currentResolveId === null || event.resolveId !== currentResolveId) {
      // A superseded or abandoned resolution — someone else's story.
      return;
    }
    if (event.kind === 'step') {
      if (get().phase === 'resolving') {
        set({ step: event.step });
      }
      return;
    }
    if (event.kind === 'found') {
      set({ phase: 'found', found: event.repo, step: 3 });
      return;
    }
    set({
      phase: 'error',
      found: null,
      resolveError: repoErrorSurface(event.code, event.message, lastParsed),
    });
  },

  /** Typing again after any outcome returns the field to idle (the kit's
   * `onChange` reset) — the text stays, the verdict goes. */
  setUrl: (url) => {
    const dirty = get().phase !== 'idle';
    set({ url });
    if (dirty) {
      get().resetResolver();
    }
  },

  /**
   * The instant refusals never leave the renderer (criterion: no network);
   * a URL that survives them goes to main raw, and main re-checks everything
   * as the authority.
   */
  submit: async () => {
    const url = get().url;
    const parsed = parseRepoUrl(url);
    lastParsed = parsed;
    if (parsed === null) {
      set({
        phase: 'error',
        found: null,
        resolveError: repoErrorSurface('repo/invalid-url', '', null),
      });
      return;
    }
    if (parsed.host !== 'github.com') {
      set({
        phase: 'error',
        found: null,
        resolveError: repoErrorSurface('repo/unsupported-host', '', parsed),
      });
      return;
    }
    if (isConnected(get().repos, parsed)) {
      set({
        phase: 'error',
        found: null,
        resolveError: repoErrorSurface('repo/already-connected', '', parsed),
      });
      return;
    }
    currentResolveId = null;
    pendingEvents = [];
    set({ phase: 'resolving', step: 0, found: null, resolveError: null });
    const result = await window.conductor.repoResolve(url);
    if (!result.ok) {
      pendingEvents = [];
      set({
        phase: 'error',
        resolveError: repoErrorSurface(result.error.code, result.error.message, parsed),
      });
      return;
    }
    currentResolveId = result.data.resolveId;
    // Whatever outran the reply replays now, through the same guard — an
    // early event of another resolution still dies on the id check.
    const queued = pendingEvents;
    pendingEvents = [];
    for (const event of queued) {
      get().applyResolveEvent({ ok: true, data: event });
    }
  },

  /** "Open <app>" — names the resolution and nothing else; main persists
   * what it already derived (§9.3). */
  confirm: async () => {
    const resolveId = currentResolveId;
    if (resolveId === null || get().phase !== 'found' || confirming) {
      return;
    }
    confirming = true;
    try {
      const result = await window.conductor.repoConnect(resolveId);
      if (!result.ok) {
        set({
          phase: 'error',
          resolveError: repoErrorSurface(result.error.code, result.error.message, lastParsed),
        });
        return;
      }
      get().applyState({ ok: true, data: result.data });
      get().resetResolver();
      set({ addOpen: false });
    } finally {
      confirming = false;
    }
  },

  switchRepo: async (slug) => {
    const result = await window.conductor.repoSwitch(slug);
    if (!result.ok) {
      // The list push will straighten the UI out; nothing to act on here.
      console.error('The repo could not be switched:', result.error);
      return;
    }
    get().applyState({ ok: true, data: result.data });
  },

  /** The add sheet reopens clean every time (criterion: reset on open). */
  openAdd: () => {
    set({ addOpen: true, url: '' });
    get().resetResolver();
  },

  closeAdd: () => {
    set({ addOpen: false });
    get().resetResolver();
  },

  /** The empty field's Paste affordance — the clipboard is read through
   * main, on the click and never behind the person's back (§9.3). */
  pasteFromClipboard: async () => {
    const result = await window.conductor.appReadClipboard();
    if (!result.ok || result.data.text === '') {
      return;
    }
    set({ url: result.data.text });
  },

  /** The error surface's Copy button — the write crosses through main for
   * the same reason the read does. */
  copyCommand: async (command) => {
    const result = await window.conductor.appWriteClipboard(command);
    if (!result.ok) {
      console.error('The command could not be copied:', result.error);
    }
  },

  resetResolver: () => {
    currentResolveId = null;
    lastParsed = null;
    pendingEvents = [];
    set({ phase: 'idle', step: 0, found: null, resolveError: null });
  },
}));

function isConnected(repos: readonly ConnectedRepo[], parsed: ParsedRepoUrl): boolean {
  const org = parsed.org.toLowerCase();
  const name = parsed.name.toLowerCase();
  return repos.some((repo) => repo.org.toLowerCase() === org && repo.name.toLowerCase() === name);
}

/** Restores the blank state and forgets the pending resolution. Tests share
 * one module. */
export function resetRepoStore(): void {
  currentResolveId = null;
  lastParsed = null;
  pendingEvents = [];
  confirming = false;
  useRepoStore.setState(createRepoData());
}

export function selectActiveRepo(state: RepoStoreState): ConnectedRepo | null {
  return state.repos.find((repo) => repo.slug === state.active) ?? null;
}

export function selectRepoState(state: RepoStoreState): RepoState {
  return { repos: state.repos, active: state.active };
}

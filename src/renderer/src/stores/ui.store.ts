import { create } from 'zustand';
import { ERROR_LINES } from '../fixtures/flows';
import { layoutForWidth } from '../lib/breakpoints';
import { DEFAULT_SPLIT } from '../lib/editor-split';

/**
 * The shell's own state: appearance, which panes are showing, and what the
 * sidebar is filtered to. Which flow is open is not here — that is flow
 * identity, and it lives in `flow.store` with the rest of the domain.
 */

/** Light/dark is a property of the window, so nobody re-picks it every launch. */
export const APPEARANCE_KEY = 'conductor.aurora.dark';

/** How the editor column was last divided. A size the person chose is a size
 * they chose for good, so it outlives the window like the appearance does. */
export const EDITOR_SPLIT_KEY = 'conductor.editor.split';

/**
 * The packaged renderer loads from `file://`, whose origin some Chromium builds
 * treat as opaque — touching storage there throws instead of returning null.
 * Losing the persisted appearance is survivable; failing to boot is not.
 */
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Nothing to do: the appearance still applies for this session.
  }
}

/** Criterion 6 — resolved once, at import, so it applies before the first paint. */
export function initialAppearance(): boolean {
  const stored = readStored(APPEARANCE_KEY);
  if (stored !== null) {
    return stored === '1';
  }
  return matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * The stored split, or the column's own proportions. Anything unreadable,
 * unparseable, or far enough out to collapse a pane is refused here; the
 * honest minimum is in px and needs a measured band, so the view clamps that.
 */
export function initialEditorSplit(): number {
  const stored = Number(readStored(EDITOR_SPLIT_KEY));
  if (!Number.isFinite(stored) || stored < 0.05 || stored > 0.95) {
    return DEFAULT_SPLIT;
  }
  return stored;
}

export type SidebarPreference = 'auto' | 'shown' | 'hidden';
export type LowerPanel = 'run' | 'assistant';

/** What the window is showing. Everything here is seeded by `createUiData`. */
export type UiData = {
  /** True while the Aurora dark theme is selected. */
  readonly dark: boolean;
  /** Measured width of the window frame, in px. Written by the shell. */
  readonly windowWidth: number;
  /** `auto` follows the breakpoint; anything else is the user overriding it. */
  readonly sidebarPreference: SidebarPreference;
  readonly lowerPanel: LowerPanel;
  /** The share of the editor column's flexible band the YAML takes, 0–1. The
   * lower panel takes the rest. */
  readonly editorSplit: number;
  readonly query: string;
  /** 1-based line numbers Maestro reported as failing — still a fixture; the
   * assistant's wash is real state and lives in `ai.store`. */
  readonly errorLines: readonly number[];
};

/** What can change it. None of these crosses IPC. */
export type UiActions = {
  toggleAppearance: () => void;
  setWindowWidth: (width: number) => void;
  toggleSidebar: () => void;
  setLowerPanel: (panel: LowerPanel) => void;
  toggleLowerPanel: () => void;
  /** Already clamped against the measured band by the caller — the store has
   * no pixels to clamp with. */
  setEditorSplit: (split: number) => void;
  /** The split mid-gesture: moves the boundary and writes nothing, because
   * the pointer moves at mouse rate and storage is synchronous. */
  previewEditorSplit: (split: number) => void;
  setQuery: (query: string) => void;
  clearQuery: () => void;
};

export type UiState = UiData & UiActions;

/** The fresh state. `resetUiStore` puts the store back to exactly this. */
function createUiData(): UiData {
  return {
    dark: initialAppearance(),
    // The BrowserWindow opens at 1280; the shell corrects this on first measure.
    windowWidth: 1280,
    sidebarPreference: 'auto',
    lowerPanel: 'assistant',
    editorSplit: initialEditorSplit(),
    query: '',
    errorLines: ERROR_LINES,
  };
}

export const useUiStore = create<UiState>((set, get) => ({
  ...createUiData(),

  toggleAppearance: () => {
    const dark = !get().dark;
    writeStored(APPEARANCE_KEY, dark ? '1' : '0');
    set({ dark });
  },

  setWindowWidth: (windowWidth) => {
    set({ windowWidth });
  },

  // The toggle wins at any width, so it records a preference rather than a
  // state — otherwise the next resize would silently undo the user's choice.
  toggleSidebar: () => {
    set({ sidebarPreference: selectSidebarVisible(get()) ? 'hidden' : 'shown' });
  },

  setLowerPanel: (lowerPanel) => {
    set({ lowerPanel });
  },

  toggleLowerPanel: () => {
    set({ lowerPanel: get().lowerPanel === 'assistant' ? 'run' : 'assistant' });
  },

  setEditorSplit: (editorSplit) => {
    writeStored(EDITOR_SPLIT_KEY, String(editorSplit));
    set({ editorSplit });
  },

  previewEditorSplit: (editorSplit) => {
    set({ editorSplit });
  },

  setQuery: (query) => {
    set({ query });
  },

  clearQuery: () => {
    set({ query: '' });
  },
}));

/** Restores the fixture state. Used by tests, which share one module instance. */
export function resetUiStore(): void {
  useUiStore.setState(createUiData());
}

/** Criteria 44–45: the breakpoint decides until the user disagrees. */
export function selectSidebarVisible(state: UiState): boolean {
  if (state.sidebarPreference === 'auto') {
    return layoutForWidth(state.windowWidth).flows;
  }
  return state.sidebarPreference === 'shown';
}

/** Criterion 44: the mirror is sized by the window, never by the override. */
export function selectMirrorWidth(state: UiState): number {
  return layoutForWidth(state.windowWidth).mirror;
}

import { create } from 'zustand';
import { ERROR_LINES } from '../fixtures/flows';
import { layoutForWidth } from '../lib/breakpoints';

/**
 * The shell's own state: appearance, which panes are showing, and what the
 * sidebar is filtered to. Which flow is open is not here — that is flow
 * identity, and it lives in `flow.store` with the rest of the domain.
 */

/** Light/dark is a property of the window, so nobody re-picks it every launch. */
export const APPEARANCE_KEY = 'conductor.aurora.dark';

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

import { create } from 'zustand';
import {
  ACTIVE_TAB_ID,
  AI_LINES,
  type ChatTurn,
  ERROR_LINES,
  FLOWS,
  OPEN_TABS,
  RUN_STEPS,
  RUNNING,
  type RunStep,
  type Tab,
  THREAD,
} from '../fixtures/flows';
import { layoutForWidth } from '../lib/breakpoints';

/**
 * The shell's own state: appearance, which panes are showing, which document is
 * open, and what the sidebar is filtered to. Seeded from `fixtures/flows.ts`;
 * no action here crosses IPC, because this spec has no IPC to cross.
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
  readonly tabs: readonly Tab[];
  readonly activeTabId: string;
  readonly lowerPanel: LowerPanel;
  readonly query: string;
  /** Fixture-seeded: this spec renders run state but never produces it. */
  readonly running: boolean;
  readonly steps: readonly RunStep[];
  /** 1-based line numbers the assistant wrote, and ones Maestro reported failing. */
  readonly aiLines: readonly number[];
  readonly errorLines: readonly number[];
  readonly thread: readonly ChatTurn[];
  /** Monotonic, so a closed-then-reopened document never reuses an id. */
  readonly nextTabNumber: number;
};

/** What can change it. None of these crosses IPC; this spec has none to cross. */
export type UiActions = {
  toggleAppearance: () => void;
  setWindowWidth: (width: number) => void;
  toggleSidebar: () => void;
  selectTab: (id: string) => void;
  closeTab: (id: string) => void;
  openFlow: (id: string) => void;
  newTab: () => void;
  setLowerPanel: (panel: LowerPanel) => void;
  toggleLowerPanel: () => void;
  setQuery: (query: string) => void;
  clearQuery: () => void;
};

export type UiState = UiData & UiActions;

/** The fixture state, fresh. `resetUiStore` puts the store back to exactly this. */
function createUiData(): UiData {
  return {
    dark: initialAppearance(),
    // The BrowserWindow opens at 1280; the shell corrects this on first measure.
    windowWidth: 1280,
    sidebarPreference: 'auto',
    tabs: OPEN_TABS,
    activeTabId: ACTIVE_TAB_ID,
    lowerPanel: 'assistant',
    query: '',
    running: RUNNING,
    steps: RUN_STEPS,
    aiLines: AI_LINES,
    errorLines: ERROR_LINES,
    thread: THREAD,
    nextTabNumber: 1,
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

  selectTab: (activeTabId) => {
    set({ activeTabId });
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    // There is always a document: an empty working area has nothing to show.
    if (tabs.length <= 1) {
      return;
    }
    const remaining = tabs.filter((tab) => tab.id !== id);
    const survivor = remaining[0];
    if (remaining.length === tabs.length || survivor === undefined) {
      return;
    }
    set({ tabs: remaining, activeTabId: id === activeTabId ? survivor.id : activeTabId });
  },

  openFlow: (id) => {
    const flow = FLOWS.find((candidate) => candidate.id === id);
    if (flow === undefined) {
      return;
    }
    const { tabs } = get();
    const open = tabs.some((tab) => tab.id === id);
    set({
      tabs: open ? tabs : [...tabs, { id, label: flow.name }],
      activeTabId: id,
    });
  },

  newTab: () => {
    const { tabs, nextTabNumber } = get();
    const id = `f-new-${nextTabNumber}`;
    set({
      tabs: [...tabs, { id, label: `novo-${nextTabNumber}.yaml` }],
      activeTabId: id,
      nextTabNumber: nextTabNumber + 1,
    });
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

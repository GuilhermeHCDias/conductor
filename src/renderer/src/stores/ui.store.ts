import { create } from 'zustand';
import {
  AI_LINES,
  type ChatTurn,
  ERROR_LINES,
  FLOWS,
  type FlowChange,
  type FlowDocument,
  OPEN_DOCUMENT,
  RUN_STEPS,
  RUNNING,
  type RunStep,
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

/** Where §8.5's one deliberate act stands: nothing sent, in flight, or under review. */
export type SendPhase = 'idle' | 'sending' | 'review';

/** One row of the Send sheet — a flow that changed locally since the last send. */
export type ChangedFlow = {
  readonly id: string;
  readonly name: string;
  readonly folder?: string;
  readonly change: FlowChange;
};

/** What the window is showing. Everything here is seeded by `createUiData`. */
export type UiData = {
  /** True while the Aurora dark theme is selected. */
  readonly dark: boolean;
  /** Measured width of the window frame, in px. Written by the shell. */
  readonly windowWidth: number;
  /** `auto` follows the breakpoint; anything else is the user overriding it. */
  readonly sidebarPreference: SidebarPreference;
  /** The working area shows one document; the sidebar is the list of the rest. */
  readonly document: FlowDocument;
  readonly lowerPanel: LowerPanel;
  readonly query: string;
  /** Fixture-seeded: this spec renders run state but never produces it. */
  readonly running: boolean;
  readonly steps: readonly RunStep[];
  /** 1-based line numbers the assistant wrote, and ones Maestro reported failing. */
  readonly aiLines: readonly number[];
  readonly errorLines: readonly number[];
  readonly thread: readonly ChatTurn[];
  /** Monotonic, so a second new document never lands on the first one's id. */
  readonly nextDocumentNumber: number;
  readonly sendPhase: SendPhase;
  /** Whether the Send sheet is showing. Opening never touches the phase. */
  readonly sendOpen: boolean;
  /**
   * A mutable copy of the fixture's changed flows, so sending can clear the
   * markers without touching the `FLOWS` constant itself.
   */
  readonly changes: readonly ChangedFlow[];
  /** The batch the open review carries — frozen at send, never the live list. */
  readonly sentChanges: readonly ChangedFlow[];
};

/** What can change it. None of these crosses IPC; this spec has none to cross. */
export type UiActions = {
  toggleAppearance: () => void;
  setWindowWidth: (width: number) => void;
  toggleSidebar: () => void;
  openFlow: (id: string) => void;
  newFlow: () => void;
  setLowerPanel: (panel: LowerPanel) => void;
  toggleLowerPanel: () => void;
  setQuery: (query: string) => void;
  clearQuery: () => void;
  openSend: () => void;
  closeSend: () => void;
  send: () => void;
};

export type UiState = UiData & UiActions;

/**
 * The reference's own 1500ms — a fixture stand-in for the `gh pr create` that
 * `PublishService` will run one day. Nothing awaits a network call because
 * there isn't one.
 */
const SEND_DELAY = 1500;

/** The one in-flight send. Module-level so `resetUiStore` can cancel it. */
let sendTimer: ReturnType<typeof setTimeout> | undefined;

function seededChanges(): readonly ChangedFlow[] {
  return FLOWS.flatMap((flow) =>
    flow.change === undefined
      ? []
      : [{ id: flow.id, name: flow.name, folder: flow.folder, change: flow.change }],
  );
}

/** The fixture state, fresh. `resetUiStore` puts the store back to exactly this. */
function createUiData(): UiData {
  return {
    dark: initialAppearance(),
    // The BrowserWindow opens at 1280; the shell corrects this on first measure.
    windowWidth: 1280,
    sidebarPreference: 'auto',
    document: OPEN_DOCUMENT,
    lowerPanel: 'assistant',
    query: '',
    running: RUNNING,
    steps: RUN_STEPS,
    aiLines: AI_LINES,
    errorLines: ERROR_LINES,
    thread: THREAD,
    nextDocumentNumber: 1,
    sendPhase: 'idle',
    sendOpen: false,
    changes: seededChanges(),
    sentChanges: [],
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

  // The whole document, replaced: carrying a field over from what was open is
  // how the last file's unsaved mark ends up on this one.
  openFlow: (id) => {
    const flow = FLOWS.find((candidate) => candidate.id === id);
    if (flow === undefined) {
      return;
    }
    set({ document: { id, label: flow.name } });
  },

  newFlow: () => {
    const { nextDocumentNumber } = get();
    set({
      document: { id: `f-new-${nextDocumentNumber}`, label: `novo-${nextDocumentNumber}.yaml` },
      nextDocumentNumber: nextDocumentNumber + 1,
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

  openSend: () => {
    set({ sendOpen: true });
  },

  closeSend: () => {
    set({ sendOpen: false });
  },

  // Criterion 15 of aurora-rehue-toolbar-publish. The batch is captured at the
  // click: a change that lands mid-flight stays unsent — it joins the *next*
  // send, and until then it is the review pill's `+n`.
  send: () => {
    if (get().sendPhase === 'sending') {
      return;
    }
    const batch = get().changes;
    set({ sendPhase: 'sending' });
    sendTimer = setTimeout(() => {
      sendTimer = undefined;
      const sent = new Set(batch.map((change) => change.id));
      set({
        sendPhase: 'review',
        sentChanges: batch,
        changes: get().changes.filter((change) => !sent.has(change.id)),
      });
    }, SEND_DELAY);
  },
}));

/** Restores the fixture state. Used by tests, which share one module instance. */
export function resetUiStore(): void {
  clearTimeout(sendTimer);
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

/** What the team has not seen yet — the Send control's count and the sheet's list. */
export function selectUnsentChanges(state: UiState): readonly ChangedFlow[] {
  return state.changes;
}

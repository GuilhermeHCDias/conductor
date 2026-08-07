import type { PublishChange, PushPayload } from '@shared/ipc';
import { create } from 'zustand';

/**
 * The publish domain's projection (spec criteria 1–6, 13, 24–26): main owns
 * the truth — the unsent set and whether a review is open — and this store
 * holds it beside the sheet's own UI state. Actions are the only renderer
 * code that calls `window.conductor` publish commands; pushes arrive through
 * `usePublishEvents`. Nothing Git-shaped exists here: no URL, no title, no
 * branch — the renderer never learns them (§8.0, criterion 27).
 */

export type PublishData = {
  /** `publish:status` answered at least once — before it, the control shows
   * nothing rather than asserting a truth it does not have. */
  readonly loaded: boolean;
  readonly changes: readonly PublishChange[];
  readonly reviewOpen: boolean;
  readonly sheetOpen: boolean;
  /** The field's text — the AI's prefill until the person types, theirs
   * afterwards (criterion 13). What is here is what publishes. */
  readonly note: string;
  readonly noteEdited: boolean;
  /** The describe job is writing the note (criterion 13's writing state). */
  readonly writing: boolean;
  readonly sending: boolean;
  readonly sendStep: 'checking' | 'sending' | 'opening-review' | null;
  readonly failure: { readonly code: string; readonly message: string } | null;
};

export type PublishActions = {
  init: () => Promise<void>;
  applyState: (payload: PushPayload<'publish:changed'>) => void;
  applyEvent: (payload: PushPayload<'publish:event'>) => void;
  openSheet: () => void;
  closeSheet: () => void;
  editNote: (text: string) => void;
  sendForReview: (openFlowPath: string | null) => Promise<void>;
  openOnGitHub: () => Promise<void>;
};

export type PublishState = PublishData & PublishActions;

function createPublishData(): PublishData {
  return {
    loaded: false,
    changes: [],
    reviewOpen: false,
    sheetOpen: false,
    note: '',
    noteEdited: false,
    writing: false,
    sending: false,
    sendStep: null,
    failure: null,
  };
}

/** The describe job to cancel when the sheet closes (criterion 14) — held
 * out of state because nothing renders it. */
let describeId: number | null = null;
/** The sheet closed while the describe invoke was still answering; the
 * cancel fires the moment the id lands. */
let cancelPending = false;

export const usePublishStore = create<PublishState>((set, get) => ({
  ...createPublishData(),

  init: async () => {
    get().applyState(await window.conductor.publishStatus());
  },

  applyState: (payload) => {
    if (!payload.ok) {
      // Before the first connect there is no publish domain — the quiet
      // empty truth, never console noise (stable code `publish/no-repo`).
      if (payload.error.code !== 'publish/no-repo') {
        console.error('The publish state could not be read:', payload.error);
      }
      set({ loaded: true, changes: [], reviewOpen: false });
      return;
    }
    set({ loaded: true, changes: payload.data.changes, reviewOpen: payload.data.reviewOpen });
  },

  applyEvent: (payload) => {
    if (!payload.ok) {
      console.error('A publish event could not be read:', payload.error);
      return;
    }
    const event = payload.data;
    // Gated by the store's own in-flight flags rather than ids: main emits
    // only for the latest job of each kind (a superseded or canceled one
    // says nothing), and the push can outrun the invoke's own answer.
    if (event.kind === 'described') {
      if (!get().writing) {
        return;
      }
      describeId = null;
      set(get().noteEdited ? { writing: false } : { writing: false, note: event.note });
      return;
    }
    if (!get().sending) {
      return;
    }
    if (event.kind === 'send-step') {
      set({ sendStep: event.step });
      return;
    }
    if (event.kind === 'sent') {
      // Criterion 25 — the sheet flips at once; the `publish:changed` push
      // arrives right behind with the same truth. The field starts clean for
      // the next publication.
      set({
        sending: false,
        sendStep: null,
        reviewOpen: true,
        changes: [],
        failure: null,
        note: '',
        noteEdited: false,
      });
      return;
    }
    set({ sending: false, sendStep: null, failure: { code: event.code, message: event.message } });
  },

  /** Criteria 4 and 10 — any interactive control state opens the sheet, and
   * the sheet opening starts the note when there is anything to describe.
   * The status ask doubles as criterion 28's trigger: main's handler
   * refreshes the PR state behind it, which is how a Waiting for review
   * sheet learns the review merged. */
  openSheet: () => {
    set({ sheetOpen: true, failure: null });
    void get().init();
    if (get().changes.length === 0) {
      return;
    }
    cancelPending = false;
    set({ writing: true });
    void window.conductor.publishDescribe().then((result) => {
      if (!result.ok) {
        if (result.error.code !== 'publish/nothing-to-send') {
          console.error('The note could not be started:', result.error);
        }
        set({ writing: false });
        return;
      }
      describeId = result.data.describeId;
      if (cancelPending) {
        cancelPending = false;
        const jobId = describeId;
        describeId = null;
        void window.conductor.publishCancel(jobId);
      }
    });
  },

  /** Criterion 14 — the sheet closing kills the describe job's child. */
  closeSheet: () => {
    if (get().writing) {
      if (describeId !== null) {
        void window.conductor.publishCancel(describeId);
        describeId = null;
      } else {
        cancelPending = true;
      }
    }
    set({ sheetOpen: false, writing: false });
  },

  /** Criterion 17 — the person edits freely; the edited text is what
   * publishes, and the AI never writes over it again (criterion 13). */
  editNote: (text) => {
    set({ note: text, noteEdited: true });
  },

  sendForReview: async (openFlowPath) => {
    if (get().sending) {
      return;
    }
    set({ sending: true, sendStep: 'checking', failure: null });
    const result = await window.conductor.publishSend(get().note, openFlowPath);
    if (!result.ok) {
      set({ sending: false, sendStep: null });
      if (result.error.code === 'publish/nothing-to-send') {
        // Criterion 24 — back to the idle truth, quietly.
        await get().init();
        return;
      }
      set({ failure: { code: result.error.code, message: result.error.message } });
    }
  },

  /** Criterion 27 — main validates and opens its stored URL; nothing crosses
   * from here but the ask. */
  openOnGitHub: async () => {
    const result = await window.conductor.publishOpenPr();
    if (!result.ok) {
      console.error('The review could not be opened:', result.error);
    }
  },
}));

export function resetPublishStore(): void {
  describeId = null;
  cancelPending = false;
  usePublishStore.setState(createPublishData());
}

/** Criteria 1–3 — the control's three states, from the two pushed facts. */
export function selectControlPhase(state: PublishState): 'sent-all' | 'unsent' | 'review' {
  if (state.reviewOpen) {
    return 'review';
  }
  return state.changes.length > 0 ? 'unsent' : 'sent-all';
}

/** Criteria 5–6 and 25 — what the open sheet shows. */
export function selectSheetPhase(state: PublishState): 'compose' | 'sending' | 'sent' {
  if (state.sending) {
    return 'sending';
  }
  return state.reviewOpen && state.changes.length === 0 ? 'sent' : 'compose';
}

export function selectUnsentCount(state: PublishState): number {
  return state.changes.length;
}

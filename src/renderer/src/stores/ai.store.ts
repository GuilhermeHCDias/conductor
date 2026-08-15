import type { PushPayload } from '@shared/ipc';
import { create } from 'zustand';

/**
 * The AI domain, renderer side: the conversation as a projection of the
 * `ai:event` stream plus the turn id the send answered with, the assistant's
 * availability, and the editor's `ai` wash. Main owns the truth — the child,
 * the session, the budget (which this store never sees, criterion 25) — and
 * its actions are the only renderer code invoking the `ai:*` channels.
 *
 * Every turn-scoped event is checked against the turn this store holds: a
 * late event from a killed turn must never decorate the turn that replaced
 * it (the run store's rule).
 */

export type AiTurnStatus = 'streaming' | 'done' | 'stopped' | 'failed';

export type AiThreadEntry =
  | { readonly id: string; readonly role: 'person'; readonly text: string }
  | {
      readonly id: string;
      readonly role: 'assistant';
      readonly text: string;
      readonly status: AiTurnStatus;
    }
  /** Criterion 21 — error states are quiet in-thread notices. */
  | { readonly id: string; readonly role: 'notice'; readonly text: string };

/** Criteria 23, 25 — ready, or the blocking reason for the composer and the
 * status line. `null` until the first `ai:status` answer lands. */
export type AiAvailability =
  | { readonly ready: true }
  | { readonly ready: false; readonly code: string; readonly message: string };

export type AiData = {
  readonly thread: readonly AiThreadEntry[];
  /** The turn streaming right now — `null` between turns. */
  readonly activeTurnId: string | null;
  /** The product-language activity line while tools run (criterion 9). */
  readonly activity: string | null;
  readonly availability: AiAvailability | null;
  /** The flow the editor's `ai` wash belongs to, and its 1-based lines
   * (criterion 27). Computed by the wash watcher in `useAiEvents`. */
  readonly washPath: string | null;
  readonly washLines: readonly number[];
  /** The flow the assistant last edited — armed by `file-edited`, consumed
   * when the wash watcher claims the reloaded text. */
  readonly pendingEditPath: string | null;
};

export type AiActions = {
  /** The one sender. The open flow travels with the message (criterion 19);
   * the caller — the composer — reads it from the flow store. Answers whether
   * a turn actually started, which is what lets the composer clear its draft
   * only on a successful send (criterion 23). */
  send: (message: string, openFlowPath: string | null) => Promise<boolean>;
  /** Criterion 11 — asks; only the terminal event flips the turn. */
  cancel: () => Promise<void>;
  /** Criterion 25 — asks; the pushed reset is what empties the thread. */
  reset: () => Promise<void>;
  refreshStatus: () => Promise<void>;
  /** Applies one pushed event, however it arrived. */
  applyEvent: (payload: PushPayload<'ai:event'>) => void;
  setWash: (path: string, lines: readonly number[]) => void;
  clearWash: () => void;
};

export type AiState = AiData & AiActions;

function createAiData(): AiData {
  return {
    thread: [],
    activeTurnId: null,
    activity: null,
    availability: null,
    washPath: null,
    washLines: [],
    pendingEditPath: null,
  };
}

/** The in-flight send guard — beside the store, because nothing renders it. */
let sendInFlight = false;

/** Bumped by every pushed reset: a send whose answer lands after the reset
 * emptied the thread belongs to the ended conversation and must not
 * repopulate it — main already killed that turn (the spec's reset race,
 * renderer half). */
let resetEra = 0;

export const useAiStore = create<AiState>((set, get) => ({
  ...createAiData(),

  send: async (message, openFlowPath) => {
    // Two clicks racing the invoke would start two turns; main would refuse
    // the second, and its refusal would paint a notice over the first.
    if (sendInFlight || get().activeTurnId !== null) {
      return false;
    }
    sendInFlight = true;
    const era = resetEra;
    try {
      const result = await window.conductor.aiSend(message, openFlowPath);
      if (era !== resetEra) {
        return false;
      }
      if (!result.ok) {
        // Criterion 21 — a quiet in-thread notice; the person's words stay in
        // the composer, which only clears its draft on a successful send.
        set((state) => ({
          thread: [
            ...state.thread,
            { id: `notice-${state.thread.length + 1}`, role: 'notice', text: result.error.message },
          ],
        }));
        return false;
      }
      const turnId = result.data.turnId;
      set((state) => ({
        activeTurnId: turnId,
        activity: null,
        thread: [
          ...state.thread,
          { id: `person-${turnId}`, role: 'person', text: message },
          { id: turnId, role: 'assistant', text: '', status: 'streaming' },
        ],
      }));
      return true;
    } finally {
      sendInFlight = false;
    }
  },

  cancel: async () => {
    if (get().activeTurnId === null) {
      return;
    }
    // The store changes nothing here: the turn is over when main says it is —
    // the terminal event — not when the request leaves.
    await window.conductor.aiCancel();
  },

  reset: async () => {
    await window.conductor.aiReset();
  },

  refreshStatus: async () => {
    const result = await window.conductor.aiStatus();
    set({
      availability: result.ok
        ? { ready: true }
        : { ready: false, code: result.error.code, message: result.error.message },
    });
  },

  applyEvent: (payload) => {
    if (!payload.ok) {
      return;
    }
    const event = payload.data;

    if (event.kind === 'reset') {
      // Criterion 12 — one path whether the person asked or a repo switch
      // implied it. Availability is re-read by the hook, not assumed here.
      resetEra += 1;
      set((state) => ({ ...createAiData(), availability: state.availability }));
      return;
    }

    const state = get();
    if (event.turnId !== state.activeTurnId) {
      return;
    }

    switch (event.kind) {
      case 'turn-started':
        // Informational: the invoke's answer already opened the turn, and
        // arriving-order between a push and an invoke's resolution is not
        // worth depending on. A delta racing that resolution is dropped by
        // the turn guard above — a one-IPC-hop window, before the child has
        // said anything real. Accepted.
        return;
      case 'text-delta':
        set({
          activity: null,
          thread: state.thread.map((entry) =>
            entry.id === event.turnId && entry.role === 'assistant'
              ? { ...entry, text: entry.text + event.text }
              : entry,
          ),
        });
        return;
      case 'activity':
        set({ activity: event.label });
        return;
      case 'file-edited':
        set({ pendingEditPath: event.path });
        return;
      case 'turn-ended': {
        const status: AiTurnStatus =
          event.outcome === 'done' ? 'done' : event.outcome === 'canceled' ? 'stopped' : 'failed';
        const settled = state.thread.map((entry) =>
          entry.id === event.turnId && entry.role === 'assistant' ? { ...entry, status } : entry,
        );
        set({
          activeTurnId: null,
          activity: null,
          thread:
            event.outcome === 'failed' && event.message !== null
              ? [...settled, { id: `notice-${event.turnId}`, role: 'notice', text: event.message }]
              : settled,
        });
        return;
      }
    }
  },

  setWash: (path, lines) => {
    set({ washPath: path, washLines: lines, pendingEditPath: null });
  },

  clearWash: () => {
    set({ washPath: null, washLines: [] });
  },
}));

/** Restores the blank state and disarms the guards. Tests share one module. */
export function resetAiStore(): void {
  sendInFlight = false;
  resetEra = 0;
  useAiStore.setState(createAiData());
}

export function selectThread(state: AiState): readonly AiThreadEntry[] {
  return state.thread;
}

/** One primitive out — deltas arrive continuously, and a selector that
 * allocated would re-render its subscriber per token (the mirror rule). */
export function selectStreaming(state: AiState): boolean {
  return state.activeTurnId !== null;
}

export function selectActivity(state: AiState): string | null {
  return state.activity;
}

export function selectAvailability(state: AiState): AiAvailability | null {
  return state.availability;
}

export function selectWashLines(state: AiState): readonly number[] {
  return state.washLines;
}

export function selectWashPath(state: AiState): string | null {
  return state.washPath;
}

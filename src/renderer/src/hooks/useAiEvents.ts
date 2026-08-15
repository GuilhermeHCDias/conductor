import { useEffect } from 'react';
import { diffLines } from '../lib/diff-lines';
import { useAiStore } from '../stores/ai.store';
import { useFlowStore } from '../stores/flow.store';

/**
 * The app-wide assistant subscription, mounted once by the shell (criterion
 * 24): `ai:event` lands in the store whichever lower tab is showing, and the
 * unsubscribe is consumed in effect cleanup — a token stream's listener left
 * behind is a memory leak with a wordrate.
 *
 * It also owns the two couplings that read two stores at once, which is what
 * hooks are for in this architecture:
 *
 * - **Criterion 26** — a `file-edited` naming a flow that is not open opens
 *   it in the editor and the sidebar selection, so the person watches the
 *   test being written. The edit itself still arrives through the watcher →
 *   `flow:changed` → reload path; this adds no second edit path (§12.21).
 * - **Criterion 27** — the editor's `ai` wash: when the assistant's edit
 *   lands through the flow store's external reload (`yaml` moved while
 *   `dirty` stayed false), the changed lines — `diffLines` against the text
 *   the editor held — wash as the assistant's. The person's own keystroke
 *   (`dirty` set), a switch to another flow, or a reload nobody's pending
 *   edit claims all take the wash off.
 */
export function useAiEvents(): void {
  const applyEvent = useAiStore((state) => state.applyEvent);
  const refreshStatus = useAiStore((state) => state.refreshStatus);

  useEffect(() => {
    const unsubscribe = window.conductor.onAiEvent((payload) => {
      applyEvent(payload);
      if (!payload.ok) {
        return;
      }
      if (payload.data.kind === 'file-edited') {
        // The store's stale-turn rule reaches the editor too (`ipc.ts`: a
        // late event from a killed turn never decorates a live one) — only
        // the turn the store holds may steer what is open.
        if (payload.data.turnId !== useAiStore.getState().activeTurnId) {
          return;
        }
        const { path } = payload.data;
        if (useFlowStore.getState().openPath !== path) {
          void useFlowStore.getState().openFlow(path);
        }
        return;
      }
      if (payload.data.kind === 'reset') {
        // A reset often means the world changed — a repo switch, a
        // disconnect — so the availability is re-asked, never assumed.
        void refreshStatus();
      }
    });

    const unsubscribeWash = useFlowStore.subscribe((state, previous) => {
      const ai = useAiStore.getState();
      if (state.openPath !== previous.openPath) {
        if (state.openPath !== null && state.openPath === ai.pendingEditPath) {
          // The assistant's edit pulled this flow open — the editor never
          // held an earlier text, so the whole file is its work (30a).
          ai.setWash(state.openPath, diffLines('', state.yaml));
        } else if (ai.washPath !== null) {
          ai.clearWash();
        }
        return;
      }
      if (state.yaml === previous.yaml || state.openPath === null) {
        return;
      }
      if (state.dirty) {
        // The person's own keystroke — their editing takes the wash off.
        if (ai.washPath !== null) {
          ai.clearWash();
        }
        return;
      }
      if (ai.pendingEditPath === state.openPath) {
        ai.setWash(state.openPath, diffLines(previous.yaml, state.yaml));
      } else if (ai.washPath === state.openPath) {
        // An external reload nobody's edit claims moves lines under the held
        // wash; a wash on the wrong rows is worse than none.
        ai.clearWash();
      }
    });

    void refreshStatus();
    return () => {
      unsubscribe();
      unsubscribeWash();
    };
  }, [applyEvent, refreshStatus]);
}

import { useEffect, useRef } from 'react';
import {
  selectInputsSettled,
  selectMirrorHeight,
  selectMirrorStatus,
  selectMirrorWidth,
  selectSelectedId,
  useDeviceStore,
} from '../stores/device.store';
import { useInspectStore } from '../stores/inspect.store';
import { selectCompletedRuns, selectRunning, useRunStore } from '../stores/run.store';

/**
 * The snapshot's cadence, wired to the mirror's life (criteria 18–20, 22):
 * capture when the stream starts, note an interaction when an input settles —
 * the store debounces and collapses them — recapture on rotation, and clear
 * everything the moment the mirror is gone.
 *
 * And to the run's life (run criteria 11, 13): while a flow runs, nothing is
 * scheduled — main refuses mid-run captures, and the polite client does not
 * collect refusals per tap — and the moment the run settles, the §5.5
 * end-of-flow recapture fires on its own, so the overlay recovers without the
 * person touching anything.
 *
 * Mounted by `DeviceMirror`, not by `App` — the snapshot is view-scoped the
 * way the frame stream is, and dies when the panel does.
 */
export function useInspectSnapshot(): void {
  const deviceId = useDeviceStore(selectSelectedId);
  const status = useDeviceStore(selectMirrorStatus);
  const sessionId = useDeviceStore((state) => state.mirrorSessionId);
  const width = useDeviceStore(selectMirrorWidth);
  const height = useDeviceStore(selectMirrorHeight);
  const inputsSettled = useDeviceStore(selectInputsSettled);
  const running = useRunStore(selectRunning);
  const completedRuns = useRunStore(selectCompletedRuns);
  const capture = useInspectStore((state) => state.capture);
  const noteInteraction = useInspectStore((state) => state.noteInteraction);
  const clear = useInspectStore((state) => state.clear);

  const streaming = status === 'streaming' && sessionId !== null && deviceId !== null;

  // Criteria 18 and 22 — one snapshot per stream, gone with it. The cleanup
  // covers the stream ending, the device changing and the panel unmounting.
  useEffect(() => {
    if (!streaming || deviceId === null) {
      return;
    }
    void capture(deviceId);
    return () => {
      clear();
    };
  }, [streaming, deviceId, capture, clear]);

  // Criterion 19 — the count moves only when the device actually took an
  // input; the store's debounce coalesces a burst into one capture. Run
  // criterion 11 gates it: a tap forwarded mid-run perturbs the test, but it
  // must not also queue captures the run's exclusion would refuse.
  useEffect(() => {
    if (inputsSettled === 0 || !streaming || deviceId === null || running) {
      return;
    }
    noteInteraction(deviceId);
  }, [inputsSettled, streaming, deviceId, noteInteraction, running]);

  // Run criterion 13 — the end-of-flow recapture, keyed the way the rotation
  // is: only a count that *moved* while the mirror is up recaptures. A run
  // that finished before this mount is history, not a trigger.
  const seenRuns = useRef(completedRuns);
  useEffect(() => {
    if (!streaming || deviceId === null) {
      seenRuns.current = completedRuns;
      return;
    }
    if (seenRuns.current !== completedRuns) {
      seenRuns.current = completedRuns;
      void capture(deviceId);
    }
  }, [streaming, deviceId, completedRuns, capture]);

  // Criterion 20 — recapture on a size the stream *changed to*. The initial
  // size arrives with the session and is already covered by the start capture,
  // so only a change from a previously-seen size counts.
  const seenSize = useRef<string | null>(null);
  useEffect(() => {
    if (!streaming || deviceId === null || width === null || height === null) {
      seenSize.current = null;
      return;
    }
    const size = `${width}x${height}`;
    // Run criterion 11 again: a rotation the flow itself makes must not
    // collect a refusal per turn. The size still counts as seen, so the gate
    // reopening captures once — through the run's end, not a second time here.
    if (!running && seenSize.current !== null && seenSize.current !== size) {
      void capture(deviceId);
    }
    seenSize.current = size;
  }, [streaming, deviceId, width, height, running, capture]);
}

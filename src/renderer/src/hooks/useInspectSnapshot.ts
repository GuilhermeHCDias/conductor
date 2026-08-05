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

/**
 * The snapshot's cadence, wired to the mirror's life (criteria 18–20, 22):
 * capture when the stream starts, note an interaction when an input settles —
 * the store debounces and collapses them — recapture on rotation, and clear
 * everything the moment the mirror is gone.
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
  // input; the store's debounce coalesces a burst into one capture.
  useEffect(() => {
    if (inputsSettled === 0 || !streaming || deviceId === null) {
      return;
    }
    noteInteraction(deviceId);
  }, [inputsSettled, streaming, deviceId, noteInteraction]);

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
    if (seenSize.current !== null && seenSize.current !== size) {
      void capture(deviceId);
    }
    seenSize.current = size;
  }, [streaming, deviceId, width, height, capture]);
}

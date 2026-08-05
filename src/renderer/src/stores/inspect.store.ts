import { ERROR_CODES, type SynthesizedSelector } from '@shared/ipc';
import type { SnapshotView } from '@shared/types';
import { create } from 'zustand';
import { hitTest, pointToHierarchy, retargetToParent } from '../lib/hit-test';

/**
 * The frozen snapshot as the renderer holds it, and everything §5.5 hangs off
 * it: the hovered element, the recapture cadence, the command menu and the
 * inputText prompt. Its actions are the only renderer code that calls the two
 * `maestro:` functions.
 *
 * The cadence rules (criterion 19): recapture is debounced behind settled
 * inputs, at most one capture is in flight, and inputs that arrive mid-flight
 * collapse into a single trailing capture. While one runs, the previous
 * snapshot keeps answering — visibly stale, never silently wrong (16).
 */

export type Failure = { readonly code: string; readonly message: string };

export type MenuState = {
  /** Client px — the menu is positioned fixed, at the cursor. */
  readonly x: number;
  readonly y: number;
  /** The element the menu is about, as its path in the snapshot's tree. */
  readonly path: readonly number[];
  readonly selector: SynthesizedSelector;
};

export type DialogState = {
  readonly path: readonly number[];
  readonly selector: SynthesizedSelector;
};

/** Everything `openMenu` needs to re-run the hit once captures settle
 * (criterion 29): the pointer in canvas CSS px plus the view-side geometry;
 * the snapshot half of the chain is read from state at synthesis time. */
export type MenuRequest = {
  readonly deviceId: string;
  readonly clientX: number;
  readonly clientY: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly fitScale: number;
  readonly streamWidth: number;
  readonly streamHeight: number;
  /** Alt held — the hit retargets to the parent (criterion 11). */
  readonly altParent: boolean;
};

export type InspectData = {
  /** The current snapshot — kept through a recapture and through a failed one:
   * hover answers from it until the new one lands (criteria 16–17). */
  readonly snapshot: SnapshotView | null;
  /** True while a capture is in flight — the stale chip's fact. */
  readonly capturing: boolean;
  readonly captureError: Failure | null;
  readonly hoveredPath: readonly number[] | null;
  readonly menu: MenuState | null;
  /** Criterion 28 — a synthesis main refused, surfaced instead of a menu. */
  readonly synthError: Failure | null;
  readonly dialog: DialogState | null;
};

export type InspectActions = {
  /** One capture, now. `refresh` is the manual affordance (criterion 21);
   * `noteInteraction` is the debounced path (criterion 19). */
  capture: (deviceId: string) => Promise<void>;
  refresh: (deviceId: string) => void;
  noteInteraction: (deviceId: string) => void;
  hover: (path: readonly number[] | null) => void;
  openMenu: (request: MenuRequest) => Promise<void>;
  closeMenu: () => void;
  /** Criterion 41 — picking `inputText` moves the menu's element into the
   * prompt; everything else about the dialog is the view's. */
  openDialog: () => void;
  closeDialog: () => void;
  /** Criterion 22 — the stream stopped or the device is gone. */
  clear: () => void;
};

export type InspectState = InspectData & InspectActions;

/** Criterion 19's "short debounce": long enough to coalesce a tap-and-type
 * burst, short enough that the tree is fresh by the time a person can aim a
 * right-click. */
export const INTERACTION_DEBOUNCE_MS = 350;

/**
 * The cadence machinery lives beside the store rather than in it because
 * nothing renders a timer: a promise in state would re-render the window for
 * bookkeeping. Same pattern as `device.store`'s text batching.
 */
let running: Promise<void> | null = null;
let queuedDevice: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let timerDevice: string | null = null;
/** Bumped by `clear`, so a capture landing after the mirror stopped is
 * discarded instead of resurrecting a snapshot of a screen nobody sees. */
let epoch = 0;

export const useInspectStore = create<InspectState>((set, get) => {
  async function doCapture(deviceId: string): Promise<void> {
    const startedIn = epoch;
    set({ capturing: true });
    const result = await window.conductor.maestroSnapshot(deviceId);
    if (epoch !== startedIn) {
      return;
    }
    if (result.ok) {
      // The hovered path belonged to the old tree; a wrong highlight for even
      // a frame is worse than none — the next mousemove re-aims it.
      set({ snapshot: result.data, capturing: false, captureError: null, hoveredPath: null });
    } else {
      // Criteria 16–17: the failure surfaces, the previous snapshot stays.
      set({ capturing: false, captureError: result.error });
    }
  }

  /** At most one in flight; a start during one collapses into one trailing
   * capture (criterion 19). */
  function startCapture(deviceId: string): Promise<void> {
    if (running !== null) {
      queuedDevice = deviceId;
      return running;
    }
    running = doCapture(deviceId).finally(() => {
      running = null;
      if (queuedDevice !== null) {
        const trailing = queuedDevice;
        queuedDevice = null;
        startCapture(trailing);
      }
    });
    return running;
  }

  /**
   * Criterion 29's wait: flush a debounce that is still pending — the capture
   * it was going to make is the one the click needs — then wait out whatever
   * is in flight, trailing capture included.
   */
  async function settleCaptures(deviceId: string): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      const flushDevice = timerDevice ?? deviceId;
      timer = null;
      timerDevice = null;
      startCapture(flushDevice);
    }
    while (running !== null) {
      await running;
    }
  }

  return {
    snapshot: null,
    capturing: false,
    captureError: null,
    hoveredPath: null,
    menu: null,
    synthError: null,
    dialog: null,

    capture: (deviceId) => startCapture(deviceId),

    refresh: (deviceId) => {
      void startCapture(deviceId);
    },

    noteInteraction: (deviceId) => {
      if (timer !== null) {
        clearTimeout(timer);
      }
      timerDevice = deviceId;
      timer = setTimeout(() => {
        timer = null;
        timerDevice = null;
        void startCapture(deviceId);
      }, INTERACTION_DEBOUNCE_MS);
    },

    hover: (path) => {
      const held = get().hoveredPath;
      if (samePath(held, path)) {
        return;
      }
      set({ hoveredPath: path });
    },

    openMenu: async (request) => {
      set({ synthError: null });
      await settleCaptures(request.deviceId);

      let attempt = resolveHit(get().snapshot, request);
      if (attempt === null) {
        // Criterion 25: right-clicking where no element is hit opens nothing.
        return;
      }

      let result = await window.conductor.maestroSynthesizeSelector(
        attempt.snapshotId,
        attempt.path,
      );
      if (!result.ok && result.error.code === ERROR_CODES.snapshotStale) {
        // Criterion 5: main replaced the snapshot under us. Re-capture, re-hit
        // the same point against the fresh tree, and retry once.
        startCapture(request.deviceId);
        await settleCaptures(request.deviceId);
        attempt = resolveHit(get().snapshot, request);
        if (attempt === null) {
          return;
        }
        result = await window.conductor.maestroSynthesizeSelector(attempt.snapshotId, attempt.path);
      }

      if (!result.ok) {
        // Criterion 28: no menu, nothing written, the failure surfaced.
        set({ synthError: result.error });
        return;
      }
      set({
        menu: { x: request.clientX, y: request.clientY, path: attempt.path, selector: result.data },
      });
    },

    closeMenu: () => {
      set({ menu: null });
    },

    openDialog: () => {
      const menu = get().menu;
      if (menu === null) {
        return;
      }
      set({ menu: null, dialog: { path: menu.path, selector: menu.selector } });
    },

    closeDialog: () => {
      set({ dialog: null });
    },

    clear: () => {
      epoch += 1;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
        timerDevice = null;
      }
      queuedDevice = null;
      set({
        snapshot: null,
        capturing: false,
        captureError: null,
        hoveredPath: null,
        menu: null,
        synthError: null,
        dialog: null,
      });
    },
  };
});

/** The hit for a menu request, against whatever snapshot is current. */
function resolveHit(
  snapshot: SnapshotView | null,
  request: MenuRequest,
): { snapshotId: string; path: readonly number[] } | null {
  if (snapshot === null) {
    return null;
  }
  const point = pointToHierarchy(request.offsetX, request.offsetY, {
    fitScale: request.fitScale,
    streamWidth: request.streamWidth,
    streamHeight: request.streamHeight,
    screenshotWidth: snapshot.screenshotWidth,
    screenshotHeight: snapshot.screenshotHeight,
    scale: snapshot.scale,
  });
  if (point === null) {
    return null;
  }
  const hit = hitTest(snapshot.tree, point);
  if (hit === null) {
    return null;
  }
  const path = request.altParent ? retargetToParent(snapshot.tree, hit) : hit;
  return { snapshotId: snapshot.snapshotId, path };
}

function samePath(a: readonly number[] | null, b: readonly number[] | null): boolean {
  if (a === null || b === null) {
    return a === b;
  }
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** Restores the initial state — including the timers and the in-flight
 * bookkeeping, which live outside the store and no `setState` would reach. */
export function resetInspectStore(): void {
  epoch += 1;
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  timerDevice = null;
  running = null;
  queuedDevice = null;
  useInspectStore.setState({
    snapshot: null,
    capturing: false,
    captureError: null,
    hoveredPath: null,
    menu: null,
    synthError: null,
    dialog: null,
  });
}

export function selectSnapshot(state: InspectState): SnapshotView | null {
  return state.snapshot;
}

export function selectCapturing(state: InspectState): boolean {
  return state.capturing;
}

export function selectCaptureError(state: InspectState): Failure | null {
  return state.captureError;
}

export function selectHoveredPath(state: InspectState): readonly number[] | null {
  return state.hoveredPath;
}

export function selectMenu(state: InspectState): MenuState | null {
  return state.menu;
}

export function selectSynthError(state: InspectState): Failure | null {
  return state.synthError;
}

export function selectDialog(state: InspectState): DialogState | null {
  return state.dialog;
}

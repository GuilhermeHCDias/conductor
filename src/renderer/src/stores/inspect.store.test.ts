import type { ConductorApi, Result, SynthesizedSelector } from '@shared/ipc';
import type { SnapshotView, TreeNode } from '@shared/types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INTERACTION_DEBOUNCE_MS,
  type MenuRequest,
  resetInspectStore,
  useInspectStore,
} from './inspect.store';

/**
 * The snapshot projection and everything that keeps it honest: recapture is
 * debounced with one capture in flight and a trailing one (criterion 19), the
 * previous snapshot keeps answering until the new one lands (16), and the menu
 * never opens against a tree older than the last interaction (29) or a
 * selector main refused (28).
 */

const store = () => useInspectStore.getState();

const node = (over: Partial<TreeNode> = {}): TreeNode => ({
  bounds: null,
  className: null,
  text: null,
  resourceId: null,
  contentDescription: null,
  hintText: null,
  scrollable: null,
  clickable: null,
  enabled: null,
  focused: null,
  selected: null,
  checked: null,
  children: [],
  ...over,
});

/** A frame that stops short of the screen's bottom — the strip below y=1400
 * belongs to no element, which is what the no-hit cases stand on — with one
 * tappable child in its top-left quadrant. */
const TREE = node({
  children: [
    node({
      bounds: { x1: 0, y1: 0, x2: 720, y2: 1400 },
      className: 'android.widget.FrameLayout',
      children: [
        node({
          bounds: { x1: 0, y1: 0, x2: 360, y2: 800 },
          className: 'android.widget.Button',
          text: 'Entrar',
          clickable: true,
        }),
      ],
    }),
  ],
});

const view = (snapshotId = 'snapshot-1'): SnapshotView => ({
  snapshotId,
  tree: TREE,
  screenshotWidth: 720,
  screenshotHeight: 1600,
  scale: 1,
});

const SELECTOR: SynthesizedSelector = { level: 'text', selector: 'text: "Entrar"', fragile: false };

/** Identity geometry: fit 1 and stream at screenshot size, so canvas offsets
 * are hierarchy units and the arithmetic stays checkable by eye. */
const menuRequest = (over: Partial<MenuRequest> = {}): MenuRequest => ({
  deviceId: 'R9QYC01EMXL',
  clientX: 300,
  clientY: 200,
  offsetX: 100,
  offsetY: 100,
  fitScale: 1,
  streamWidth: 720,
  streamHeight: 1600,
  altParent: false,
  ...over,
});

let conductor: {
  maestroSnapshot: ReturnType<typeof vi.fn>;
  maestroSynthesizeSelector: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  resetInspectStore();
  conductor = {
    maestroSnapshot: vi.fn(() => Promise.resolve({ ok: true, data: view() })),
    maestroSynthesizeSelector: vi.fn(() => Promise.resolve({ ok: true, data: SELECTOR })),
  };
  window.conductor = conductor as unknown as ConductorApi;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/** A capture the test releases by hand. */
function deferred(): {
  promise: Promise<Result<SnapshotView>>;
  release: (result: Result<SnapshotView>) => void;
} {
  let release: (result: Result<SnapshotView>) => void = () => {};
  const promise = new Promise<Result<SnapshotView>>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

/* ── capturing ──────────────────────────────────────────────────────────── */

describe('capturing', () => {
  it('holds the snapshot a capture answered', async () => {
    await store().capture('R9QYC01EMXL');

    expect(store().snapshot?.snapshotId).toBe('snapshot-1');
    expect(store().capturing).toBe(false);
    expect(store().captureError).toBeNull();
  });

  /** Criterion 16 — the stale chip's fact: a recapture is visible, and hover
   * keeps answering from the previous snapshot until the new one lands. */
  it('keeps the previous snapshot while a recapture is in flight', async () => {
    await store().capture('R9QYC01EMXL');
    const slow = deferred();
    conductor.maestroSnapshot.mockReturnValueOnce(slow.promise);

    const second = store().capture('R9QYC01EMXL');
    await settle();
    expect(store().capturing).toBe(true);
    expect(store().snapshot?.snapshotId).toBe('snapshot-1');

    slow.release({ ok: true, data: view('snapshot-2') });
    await second;
    expect(store().capturing).toBe(false);
    expect(store().snapshot?.snapshotId).toBe('snapshot-2');
  });

  /** Criterion 17 — the failure surfaces beside the picture, which is
   * untouched; the previous snapshot stays usable. */
  it('keeps the previous snapshot and surfaces the failure when a recapture fails', async () => {
    await store().capture('R9QYC01EMXL');
    conductor.maestroSnapshot.mockResolvedValueOnce({
      ok: false,
      error: { code: 'mcp/call-failed', message: 'inspect_screen refused.' },
    });

    await store().capture('R9QYC01EMXL');

    expect(store().snapshot?.snapshotId).toBe('snapshot-1');
    expect(store().captureError?.code).toBe('mcp/call-failed');
    expect(store().capturing).toBe(false);
  });

  /** A hovered path from the old tree may not exist in the new one; a wrong
   * highlight for even a frame is worse than none. */
  it('clears the hover when a new snapshot lands', async () => {
    await store().capture('R9QYC01EMXL');
    store().hover([0, 0]);

    await store().capture('R9QYC01EMXL');

    expect(store().hoveredPath).toBeNull();
  });
});

/* ── the cadence ────────────────────────────────────────────────────────── */

describe('the recapture cadence', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  /** Criterion 19 — a burst of inputs is one recapture, after the debounce. */
  it('debounces a burst of interactions into one capture', async () => {
    store().noteInteraction('R9QYC01EMXL');
    store().noteInteraction('R9QYC01EMXL');
    store().noteInteraction('R9QYC01EMXL');
    expect(conductor.maestroSnapshot).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(INTERACTION_DEBOUNCE_MS);

    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
  });

  it('restarts the window on each interaction', async () => {
    store().noteInteraction('R9QYC01EMXL');
    await vi.advanceTimersByTimeAsync(INTERACTION_DEBOUNCE_MS - 50);
    store().noteInteraction('R9QYC01EMXL');
    await vi.advanceTimersByTimeAsync(INTERACTION_DEBOUNCE_MS - 50);
    expect(conductor.maestroSnapshot).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(50);
    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
  });

  /** Criterion 19 — at most one in flight; inputs that arrive mid-flight
   * collapse into a single trailing capture. */
  it('runs one capture at a time with a single trailing one', async () => {
    const slow = deferred();
    conductor.maestroSnapshot.mockReturnValueOnce(slow.promise);
    store().noteInteraction('R9QYC01EMXL');
    await vi.advanceTimersByTimeAsync(INTERACTION_DEBOUNCE_MS);
    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);

    store().noteInteraction('R9QYC01EMXL');
    await vi.advanceTimersByTimeAsync(INTERACTION_DEBOUNCE_MS);
    store().noteInteraction('R9QYC01EMXL');
    await vi.advanceTimersByTimeAsync(INTERACTION_DEBOUNCE_MS);
    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);

    slow.release({ ok: true, data: view('snapshot-2') });
    await vi.advanceTimersByTimeAsync(0);

    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(2);
  });

  /** Criterion 21 — the manual affordance skips the debounce. */
  it('captures immediately on refresh', async () => {
    store().refresh('R9QYC01EMXL');
    await vi.advanceTimersByTimeAsync(0);

    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
  });
});

/* ── clearing ───────────────────────────────────────────────────────────── */

describe('clearing', () => {
  /** Criterion 22 — the stream stopped or the device is gone: the snapshot
   * and every overlay derived from it go with it. */
  it('clears the snapshot, the hover and the menu', async () => {
    await store().capture('R9QYC01EMXL');
    store().hover([0]);

    store().clear();

    expect(store().snapshot).toBeNull();
    expect(store().hoveredPath).toBeNull();
    expect(store().menu).toBeNull();
    expect(store().dialog).toBeNull();
    expect(store().capturing).toBe(false);
  });

  it('discards a capture that lands after clearing', async () => {
    const slow = deferred();
    conductor.maestroSnapshot.mockReturnValueOnce(slow.promise);
    const capture = store().capture('R9QYC01EMXL');

    store().clear();
    slow.release({ ok: true, data: view('snapshot-9') });
    await capture;

    expect(store().snapshot).toBeNull();
  });

  it('cancels a pending debounce', async () => {
    vi.useFakeTimers();
    store().noteInteraction('R9QYC01EMXL');

    store().clear();
    await vi.advanceTimersByTimeAsync(INTERACTION_DEBOUNCE_MS * 2);

    expect(conductor.maestroSnapshot).not.toHaveBeenCalled();
  });
});

/* ── hovering ───────────────────────────────────────────────────────────── */

describe('hovering', () => {
  it('holds the hovered path and clears it', () => {
    store().hover([0, 0]);
    expect(store().hoveredPath).toEqual([0, 0]);

    store().hover(null);
    expect(store().hoveredPath).toBeNull();
  });

  /** Mousemove fires continuously; an equal path must not become a fresh
   * array, or every subscriber re-renders per pixel. */
  it('keeps the same reference for an equal path', () => {
    store().hover([1, 2, 3]);
    const held = store().hoveredPath;

    store().hover([1, 2, 3]);

    expect(store().hoveredPath).toBe(held);
  });
});

/** The crosshair as a switch: inspection on by default, and turning it off
 * takes the standing highlight with it — a box for an element nobody is
 * inspecting is exactly the wrong highlight the null-hover rule exists for. */
describe('the inspect switch', () => {
  it('starts enabled', () => {
    expect(store().enabled).toBe(true);
  });

  it('toggles off clearing the hover, and back on', () => {
    store().hover([0, 0]);

    store().toggleEnabled();
    expect(store().enabled).toBe(false);
    expect(store().hoveredPath).toBeNull();

    store().toggleEnabled();
    expect(store().enabled).toBe(true);
  });

  /** `clear` is the mirror's lifecycle, not the user's choice: switching
   * devices must not silently re-arm a mode the user turned off. */
  it('survives a clear', () => {
    store().toggleEnabled();

    store().clear();

    expect(store().enabled).toBe(false);
  });
});

/* ── the menu ───────────────────────────────────────────────────────────── */

describe('opening the menu', () => {
  it('synthesises against the current snapshot and opens at the cursor', async () => {
    await store().capture('R9QYC01EMXL');

    await store().openMenu(menuRequest());

    expect(conductor.maestroSynthesizeSelector).toHaveBeenCalledWith('snapshot-1', [0, 0]);
    expect(store().menu).toEqual({ x: 300, y: 200, path: [0, 0], selector: SELECTOR });
  });

  /** Criterion 25 — no element, no menu. */
  it('opens nothing where no element is hit', async () => {
    await store().capture('R9QYC01EMXL');

    await store().openMenu(menuRequest({ offsetX: 500, offsetY: 1500 }));

    expect(conductor.maestroSynthesizeSelector).not.toHaveBeenCalled();
    expect(store().menu).toBeNull();
  });

  it('opens nothing while there is no snapshot at all', async () => {
    await store().openMenu(menuRequest());

    expect(conductor.maestroSynthesizeSelector).not.toHaveBeenCalled();
    expect(store().menu).toBeNull();
  });

  /** Criterion 11 — with Alt held, the menu is about the container. */
  it('retargets to the parent while Alt is held', async () => {
    await store().capture('R9QYC01EMXL');

    await store().openMenu(menuRequest({ altParent: true }));

    expect(conductor.maestroSynthesizeSelector).toHaveBeenCalledWith('snapshot-1', [0]);
  });

  /**
   * Criterion 29 — a right-click during a recapture waits for the fresh
   * snapshot and synthesises against it, never against the tree the last
   * interaction already invalidated.
   */
  it('waits for an in-flight capture and synthesises against the fresh snapshot', async () => {
    await store().capture('R9QYC01EMXL');
    const slow = deferred();
    conductor.maestroSnapshot.mockReturnValueOnce(slow.promise);
    void store().capture('R9QYC01EMXL');
    await settle();

    const opening = store().openMenu(menuRequest());
    await settle();
    expect(conductor.maestroSynthesizeSelector).not.toHaveBeenCalled();

    slow.release({ ok: true, data: view('snapshot-2') });
    await opening;

    expect(conductor.maestroSynthesizeSelector).toHaveBeenCalledWith('snapshot-2', [0, 0]);
    expect(store().menu).not.toBeNull();
  });

  /** The same rule against the debounce: a scheduled capture is flushed now
   * rather than raced past. */
  it('flushes a pending debounced capture before synthesising', async () => {
    vi.useFakeTimers();
    await store().capture('R9QYC01EMXL');
    conductor.maestroSnapshot.mockResolvedValueOnce({ ok: true, data: view('snapshot-2') });
    store().noteInteraction('R9QYC01EMXL');

    await store().openMenu(menuRequest());

    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(2);
    expect(conductor.maestroSynthesizeSelector).toHaveBeenCalledWith('snapshot-2', [0, 0]);
  });

  /** Criterion 5 — main refused a stale snapshot: re-capture, retry once. */
  it('recaptures and retries once when main reports the snapshot stale', async () => {
    await store().capture('R9QYC01EMXL');
    conductor.maestroSnapshot.mockResolvedValueOnce({ ok: true, data: view('snapshot-2') });
    conductor.maestroSynthesizeSelector
      .mockResolvedValueOnce({
        ok: false,
        error: { code: 'snapshot/stale', message: 'replaced' },
      })
      .mockResolvedValueOnce({ ok: true, data: SELECTOR });

    await store().openMenu(menuRequest());

    expect(conductor.maestroSynthesizeSelector).toHaveBeenNthCalledWith(1, 'snapshot-1', [0, 0]);
    expect(conductor.maestroSynthesizeSelector).toHaveBeenNthCalledWith(2, 'snapshot-2', [0, 0]);
    expect(store().menu?.selector).toEqual(SELECTOR);
  });

  /** Criterion 28 — synthesis failed: no menu, nothing written, and the
   * failure surfaced. */
  it('opens no menu and surfaces the failure when synthesis fails', async () => {
    await store().capture('R9QYC01EMXL');
    conductor.maestroSynthesizeSelector.mockResolvedValue({
      ok: false,
      error: { code: 'selector/no-match', message: 'a bug by definition' },
    });

    await store().openMenu(menuRequest());

    expect(store().menu).toBeNull();
    expect(store().synthError?.code).toBe('selector/no-match');
  });

  it('clears the previous failure when a new attempt begins', async () => {
    await store().capture('R9QYC01EMXL');
    conductor.maestroSynthesizeSelector.mockResolvedValueOnce({
      ok: false,
      error: { code: 'selector/no-match', message: 'a bug' },
    });
    await store().openMenu(menuRequest());
    expect(store().synthError).not.toBeNull();

    await store().openMenu(menuRequest());

    expect(store().synthError).toBeNull();
    expect(store().menu).not.toBeNull();
  });
});

describe('the menu and the dialog', () => {
  it('closes the menu writing nothing', async () => {
    await store().capture('R9QYC01EMXL');
    await store().openMenu(menuRequest());

    store().closeMenu();

    expect(store().menu).toBeNull();
  });

  /** Criterion 41 — picking inputText moves the menu's element to the prompt. */
  it('moves the menu selection into the dialog', async () => {
    await store().capture('R9QYC01EMXL');
    await store().openMenu(menuRequest());

    store().openDialog();

    expect(store().menu).toBeNull();
    expect(store().dialog).toEqual({ path: [0, 0], selector: SELECTOR });
  });

  it('opens no dialog without a menu selection', () => {
    store().openDialog();

    expect(store().dialog).toBeNull();
  });

  it('closes the dialog writing nothing', async () => {
    await store().capture('R9QYC01EMXL');
    await store().openMenu(menuRequest());
    store().openDialog();

    store().closeDialog();

    expect(store().dialog).toBeNull();
  });
});

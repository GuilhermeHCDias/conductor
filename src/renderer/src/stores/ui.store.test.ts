import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OPEN_DOCUMENT } from '../fixtures/flows';
import { setPrefersDark } from '../test-setup';
import {
  APPEARANCE_KEY,
  initialAppearance,
  resetUiStore,
  selectMirrorWidth,
  selectSidebarVisible,
  selectUnsentChanges,
  useUiStore,
} from './ui.store';

const ui = () => useUiStore.getState();

beforeEach(() => {
  localStorage.clear();
  resetUiStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Criterion 6 — the appearance that applies before the first paint. */
describe('initialAppearance', () => {
  it('follows a persisted dark choice', () => {
    localStorage.setItem(APPEARANCE_KEY, '1');

    expect(initialAppearance()).toBe(true);
  });

  it('follows a persisted light choice even when the OS prefers dark', () => {
    localStorage.setItem(APPEARANCE_KEY, '0');
    setPrefersDark(true);

    expect(initialAppearance()).toBe(false);
  });

  it('follows prefers-color-scheme when nothing is stored', () => {
    setPrefersDark(true);

    expect(initialAppearance()).toBe(true);
  });

  it('stays light when nothing is stored and the OS has no dark preference', () => {
    expect(initialAppearance()).toBe(false);
  });

  // The packaged renderer loads from a file:// URL, whose origin some Chromium
  // builds treat as opaque — reading storage there throws rather than
  // returning null. A white window is a far worse outcome than a light theme.
  it('falls back to the OS preference when storage is unreadable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    setPrefersDark(true);

    expect(initialAppearance()).toBe(true);
  });
});

/** Criterion 5 — the appearance control flips the theme and persists it. */
describe('appearance', () => {
  it('flips dark on and off', () => {
    expect(ui().dark).toBe(false);

    ui().toggleAppearance();
    expect(ui().dark).toBe(true);

    ui().toggleAppearance();
    expect(ui().dark).toBe(false);
  });

  it('persists the choice under conductor.aurora.dark', () => {
    ui().toggleAppearance();
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe('1');

    ui().toggleAppearance();
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe('0');
  });

  it('still flips the theme when storage refuses the write', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    ui().toggleAppearance();

    expect(ui().dark).toBe(true);
  });
});

/**
 * Criteria 44 and 45 — the breakpoint decides until the user disagrees, and
 * then the toggle wins at any width.
 */
describe('sidebar', () => {
  it('follows the breakpoint while nothing is overridden', () => {
    ui().setWindowWidth(1440);
    expect(selectSidebarVisible(ui())).toBe(true);

    ui().setWindowWidth(900);
    expect(selectSidebarVisible(ui())).toBe(false);
  });

  it('shows the sidebar below the breakpoint once toggled', () => {
    ui().setWindowWidth(900);

    ui().toggleSidebar();

    expect(selectSidebarVisible(ui())).toBe(true);
  });

  it('hides the sidebar above the breakpoint once toggled', () => {
    ui().setWindowWidth(1440);

    ui().toggleSidebar();

    expect(selectSidebarVisible(ui())).toBe(false);
  });

  it('holds the override across resizes until it is toggled again', () => {
    ui().setWindowWidth(900);
    ui().toggleSidebar();

    ui().setWindowWidth(1440);
    expect(selectSidebarVisible(ui())).toBe(true);
    ui().setWindowWidth(900);
    expect(selectSidebarVisible(ui())).toBe(true);

    ui().toggleSidebar();
    expect(selectSidebarVisible(ui())).toBe(false);
  });

  it('sizes the mirror from the breakpoint, not from the override', () => {
    ui().setWindowWidth(1440);
    expect(selectMirrorWidth(ui())).toBe(300);

    ui().toggleSidebar();
    expect(selectMirrorWidth(ui())).toBe(300);

    ui().setWindowWidth(1200);
    expect(selectMirrorWidth(ui())).toBe(268);
    ui().setWindowWidth(900);
    expect(selectMirrorWidth(ui())).toBe(250);
  });
});

/** Criteria 24 and 25 — the one open document. */
describe('the open document', () => {
  it('starts on the fixture document', () => {
    expect(ui().document).toEqual(OPEN_DOCUMENT);
  });

  it('replaces the open document when a flow is opened from the sidebar', () => {
    ui().openFlow('f-checkout');

    expect(ui().document).toEqual({ id: 'f-checkout', label: 'checkout.yaml' });
  });

  // teste.yaml is the dirty one; nothing opened after it inherits that mark.
  it('leaves none of the previous document behind', () => {
    ui().openFlow('f-checkout');

    expect(ui().document.dirty).toBeUndefined();
  });

  it('ignores a flow id that is not in the suite', () => {
    ui().openFlow('f-nope');

    expect(ui().document).toEqual(OPEN_DOCUMENT);
  });

  it('opens a new empty document', () => {
    ui().newFlow();

    expect(ui().document).toEqual({ id: 'f-new-1', label: 'novo-1.yaml' });
  });

  // Monotonic, so a new document never lands on the id of an earlier one.
  it('never reuses a number', () => {
    ui().newFlow();
    ui().openFlow('f-login');

    ui().newFlow();

    expect(ui().document).toEqual({ id: 'f-new-2', label: 'novo-2.yaml' });
  });
});

/** Criteria 30 and 48 — the lower panel. */
describe('lower panel', () => {
  it('starts on the assistant, as the screenshots do', () => {
    expect(ui().lowerPanel).toBe('assistant');
  });

  it('flips between the run report and the assistant thread', () => {
    ui().toggleLowerPanel();
    expect(ui().lowerPanel).toBe('run');

    ui().toggleLowerPanel();
    expect(ui().lowerPanel).toBe('assistant');
  });

  it('is set directly by the segmented control', () => {
    ui().setLowerPanel('run');
    expect(ui().lowerPanel).toBe('run');

    ui().setLowerPanel('run');
    expect(ui().lowerPanel).toBe('run');
  });
});

/**
 * Sending — §8.5's deliberate act, on fixture state
 * (aurora-rehue-toolbar-publish criteria 15 and 20).
 */
describe('sending', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('seeds the unsent list from the fixture’s changed flows', () => {
    expect(selectUnsentChanges(ui()).map((change) => change.id)).toEqual(['f-teste', 'f-busca']);
    expect(ui().sendPhase).toBe('idle');
    expect(ui().sendOpen).toBe(false);
    expect(ui().sentChanges).toEqual([]);
  });

  it('opens and closes the sheet without touching the phase', () => {
    ui().openSend();
    expect(ui().sendOpen).toBe(true);

    ui().closeSend();
    expect(ui().sendOpen).toBe(false);
    expect(ui().sendPhase).toBe('idle');
  });

  /** Criterion 15 — the transition, on the reference's own 1500ms clock. */
  it('freezes the batch, clears its markers and lands in review', () => {
    vi.useFakeTimers();
    const batch = selectUnsentChanges(ui());

    ui().send();
    expect(ui().sendPhase).toBe('sending');
    expect(selectUnsentChanges(ui())).toEqual(batch);

    vi.advanceTimersByTime(1500);
    expect(ui().sendPhase).toBe('review');
    expect(ui().sentChanges).toEqual(batch);
    expect(selectUnsentChanges(ui())).toEqual([]);
  });

  it('ignores a second send while one is in flight', () => {
    vi.useFakeTimers();

    ui().send();
    ui().send();
    vi.advanceTimersByTime(1500);

    expect(ui().sendPhase).toBe('review');
    expect(selectUnsentChanges(ui())).toEqual([]);
  });

  // Criterion 7's badge: work that piles up after a send joins the next one,
  // so a marker seeded mid-flight survives the freeze as the new unsent list.
  it('keeps a change that arrived while sending out of the frozen batch', () => {
    vi.useFakeTimers();
    const batch = selectUnsentChanges(ui());
    const late = { id: 'f-login', name: 'login.yaml', change: 'edited' } as const;

    ui().send();
    useUiStore.setState({ changes: [...ui().changes, late] });
    vi.advanceTimersByTime(1500);

    expect(ui().sentChanges).toEqual(batch);
    expect(selectUnsentChanges(ui())).toEqual([late]);
  });

  it('cancels an in-flight send when the store resets', () => {
    vi.useFakeTimers();

    ui().send();
    resetUiStore();
    vi.advanceTimersByTime(1500);

    expect(ui().sendPhase).toBe('idle');
    expect(ui().sentChanges).toEqual([]);
    expect(selectUnsentChanges(ui()).map((change) => change.id)).toEqual(['f-teste', 'f-busca']);
  });
});

/** Criteria 19 and 49 — the sidebar search. */
describe('search', () => {
  it('holds the query', () => {
    ui().setQuery('check');

    expect(ui().query).toBe('check');
  });

  it('clears the query', () => {
    ui().setQuery('check');

    ui().clearQuery();

    expect(ui().query).toBe('');
  });
});

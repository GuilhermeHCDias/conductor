import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVE_TAB_ID, OPEN_TABS } from '../fixtures/flows';
import { setPrefersDark } from '../test-setup';
import {
  APPEARANCE_KEY,
  initialAppearance,
  resetUiStore,
  selectMirrorWidth,
  selectSidebarVisible,
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

/** Criteria 24 and 25 — document tabs. */
describe('tabs', () => {
  it('starts on the fixture document', () => {
    expect(ui().tabs).toEqual(OPEN_TABS);
    expect(ui().activeTabId).toBe(ACTIVE_TAB_ID);
  });

  it('opens a flow from the sidebar and makes it active', () => {
    ui().openFlow('f-checkout');

    expect(ui().activeTabId).toBe('f-checkout');
    expect(ui().tabs.map((tab) => tab.id)).toEqual(['f-teste', 'f-checkout']);
    expect(ui().tabs.at(-1)?.label).toBe('checkout.yaml');
  });

  it('re-activates an already open flow instead of opening it twice', () => {
    ui().openFlow('f-checkout');
    ui().selectTab('f-teste');

    ui().openFlow('f-checkout');

    expect(ui().tabs).toHaveLength(2);
    expect(ui().activeTabId).toBe('f-checkout');
  });

  it('ignores a flow id that is not in the suite', () => {
    ui().openFlow('f-nope');

    expect(ui().tabs).toHaveLength(1);
    expect(ui().activeTabId).toBe('f-teste');
  });

  it('makes a selected tab the active document', () => {
    ui().openFlow('f-login');

    ui().selectTab('f-teste');

    expect(ui().activeTabId).toBe('f-teste');
  });

  it('closes a tab', () => {
    ui().openFlow('f-login');

    ui().closeTab('f-login');

    expect(ui().tabs.map((tab) => tab.id)).toEqual(['f-teste']);
  });

  it('activates a surviving tab when the active one is closed', () => {
    ui().openFlow('f-login');
    expect(ui().activeTabId).toBe('f-login');

    ui().closeTab('f-login');

    expect(ui().activeTabId).toBe('f-teste');
  });

  it('leaves the active document alone when another tab is closed', () => {
    ui().openFlow('f-login');
    ui().selectTab('f-teste');

    ui().closeTab('f-login');

    expect(ui().activeTabId).toBe('f-teste');
  });

  // There is always a document; an empty working area has nothing to show.
  it('refuses to close the last remaining tab', () => {
    ui().closeTab('f-teste');

    expect(ui().tabs).toEqual(OPEN_TABS);
    expect(ui().activeTabId).toBe('f-teste');
  });

  it('opens a new empty document', () => {
    ui().newTab();

    expect(ui().tabs).toHaveLength(2);
    expect(ui().activeTabId).toBe(ui().tabs.at(-1)?.id);
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

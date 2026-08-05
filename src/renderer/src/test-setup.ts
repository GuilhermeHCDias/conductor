import '@testing-library/jest-dom/vitest';
import type { ConductorApi } from '@shared/ipc';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach } from 'vitest';

// Vitest runs without `globals`, so Testing Library cannot register its own
// auto-cleanup. Without this, every test inherits the previous test's DOM.
afterEach(() => {
  cleanup();
  observers.clear();
  prefersDark = false;
});

/* ── window.conductor ─────────────────────────────────────────────────────────
   The preload bridge does not exist under jsdom, and it is the one seam the
   renderer's tests are allowed to mock. This is the quiet default — nothing
   attached, nothing failing — so a test about the layout never has to know that
   a panel inside it talks to main. A test about the device replaces it. */

/** Answers every channel with the shape of "nothing here yet". */
function idleConductor(): ConductorApi {
  return {
    appInfo: () => Promise.resolve({ ok: false, error: { code: 'test/stub', message: 'stub' } }),
    configGet: () => Promise.resolve({ ok: false, error: { code: 'test/stub', message: 'stub' } }),
    deviceList: () =>
      Promise.resolve({ ok: true, data: { devices: [], selectedId: null, properties: null } }),
    deviceAppInfo: () =>
      Promise.resolve({ ok: false, error: { code: 'test/stub', message: 'stub' } }),
    viewerOpen: () => Promise.resolve({ ok: false, error: { code: 'test/stub', message: 'stub' } }),
    mirrorStart: () =>
      Promise.resolve({ ok: false, error: { code: 'test/stub', message: 'stub' } }),
    mirrorStop: () => Promise.resolve({ ok: false, error: { code: 'test/stub', message: 'stub' } }),
    onDeviceChanged: () => () => {},
    onMirrorEvent: () => () => {},
  };
}

beforeEach(() => {
  window.conductor = idleConductor();
});

/* ── ResizeObserver ───────────────────────────────────────────────────────────
   jsdom has no ResizeObserver and no layout, so the two hooks that measure
   (`useElementWidth`, and the mirror bay) would never fire. This stub records
   its observers; `resizeElement` sets an element's client box and notifies
   them, which is how a test drives a width-dependent branch. */

type Observed = { callback: ResizeObserverCallback; targets: Set<Element> };

const observers = new Set<Observed>();

class TestResizeObserver implements ResizeObserver {
  private readonly entry: Observed;

  constructor(callback: ResizeObserverCallback) {
    this.entry = { callback, targets: new Set() };
    observers.add(this.entry);
  }

  observe(target: Element): void {
    this.entry.targets.add(target);
  }

  unobserve(target: Element): void {
    this.entry.targets.delete(target);
  }

  disconnect(): void {
    observers.delete(this.entry);
  }
}

globalThis.ResizeObserver = TestResizeObserver;

/**
 * Give `element` a client box and notify every observer watching it. Returns
 * how many were notified, so a test can prove an observer was disconnected.
 */
export function resizeElement(element: Element, size: { width: number; height?: number }): number {
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: size.width,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: size.height ?? 0,
  });
  let notified = 0;
  for (const observer of observers) {
    if (observer.targets.has(element)) {
      notified += 1;
      observer.callback([], {} as ResizeObserver);
    }
  }
  return notified;
}

/* ── matchMedia ───────────────────────────────────────────────────────────────
   Also absent from jsdom. Only `prefers-color-scheme: dark` is consulted, and
   only when nothing is persisted (criterion 6). */

let prefersDark = false;

/** Set what `prefers-color-scheme: dark` reports for the rest of the test. */
export function setPrefersDark(value: boolean): void {
  prefersDark = value;
}

globalThis.matchMedia = (query: string): MediaQueryList => {
  const list: MediaQueryList = {
    matches: query.includes('prefers-color-scheme: dark') ? prefersDark : false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  };
  return list;
};

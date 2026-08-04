import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Vitest runs without `globals`, so Testing Library cannot register its own
// auto-cleanup. Without this, every test inherits the previous test's DOM.
afterEach(() => {
  cleanup();
  observers.clear();
  prefersDark = false;
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

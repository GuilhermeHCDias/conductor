import { type RefCallback, useCallback, useRef, useState } from 'react';

/**
 * Measures an element and keeps reporting it as it changes. Three things in the
 * shell are measurement-driven: which panes the breakpoint shows (criterion
 * 44), how far the device header has degraded (criterion 37), and how far the
 * phone scales to fit its bay (criterion 41).
 *
 * The ref is a callback ref rather than an object ref so the observer attaches
 * the moment the element exists — an effect keyed on a `useRef` would miss an
 * element that mounts, unmounts and remounts, which the sidebar does.
 */

export type ElementSize = {
  readonly width: number;
  readonly height: number;
};

export function useElementSize(fallback: ElementSize): [RefCallback<Element>, ElementSize] {
  const [size, setSize] = useState(fallback);
  const observer = useRef<ResizeObserver | null>(null);

  const ref = useCallback<RefCallback<Element>>((element) => {
    observer.current?.disconnect();
    observer.current = null;

    if (element === null) {
      return;
    }

    const measure = (): void => {
      // Replacing an equal size would re-render on every observer callback,
      // and the mirror bay gets one per animation frame while dragging.
      setSize((previous) =>
        previous.width === element.clientWidth && previous.height === element.clientHeight
          ? previous
          : { width: element.clientWidth, height: element.clientHeight },
      );
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(element);
    observer.current = resizeObserver;
    measure();

    return () => {
      resizeObserver.disconnect();
      observer.current = null;
    };
  }, []);

  return [ref, size];
}

/** The width alone, for the two places that only care about one dimension. */
export function useElementWidth(fallback: number): [RefCallback<Element>, number] {
  const [ref, size] = useElementSize({ width: fallback, height: 0 });
  return [ref, size.width];
}

import { act, render, renderHook, screen } from '@testing-library/react';
import type { JSX } from 'react';
import { describe, expect, it } from 'vitest';
import { resizeElement } from '../test-setup';
import { useElementWidth } from './useElementWidth';

function Probe({ initial }: { initial: number }): JSX.Element {
  const [ref, width] = useElementWidth(initial);
  return (
    <div data-testid="box" ref={ref}>
      {width}
    </div>
  );
}

/**
 * The measurement behind the pane toggles and the device header's degradation.
 * jsdom has no layout, so `resizeElement` stands in for one (see test-setup).
 */
describe('useElementWidth', () => {
  // Measured on attach rather than on the first resize: waiting would paint the
  // fallback once and then jump to the real width.
  it('measures the element as soon as it attaches', () => {
    render(<Probe initial={1280} />);

    // jsdom does no layout, so an attached element measures 0 — the point is
    // that the fallback no longer stands in for it.
    expect(screen.getByTestId('box')).toHaveTextContent('0');
  });

  it('reports the element width once it is measured', () => {
    render(<Probe initial={1280} />);
    const box = screen.getByTestId('box');

    act(() => {
      resizeElement(box, { width: 940 });
    });

    expect(box).toHaveTextContent('940');
  });

  it('reports every later resize', () => {
    render(<Probe initial={0} />);
    const box = screen.getByTestId('box');

    act(() => {
      resizeElement(box, { width: 940 });
    });
    act(() => {
      resizeElement(box, { width: 1440 });
    });

    expect(box).toHaveTextContent('1440');
  });

  it('holds the fallback while no element is attached', () => {
    const { result } = renderHook(() => useElementWidth(268));

    expect(result.current[1]).toBe(268);
  });

  // A ResizeObserver that outlives its component is a leak with a framerate.
  it('disconnects its observer on unmount', () => {
    const { unmount } = render(<Probe initial={0} />);
    const box = screen.getByTestId('box');
    let notified = 0;
    act(() => {
      notified = resizeElement(box, { width: 800 });
    });
    expect(notified).toBe(1);

    unmount();

    expect(resizeElement(box, { width: 900 })).toBe(0);
  });
});

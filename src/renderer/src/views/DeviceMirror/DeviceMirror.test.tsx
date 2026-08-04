import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEVICE } from '../../fixtures/flows';
import { DEVICE as PHONE } from '../../lib/mirror-fit';
import { resetUiStore, useUiStore } from '../../stores/ui.store';
import { resizeElement } from '../../test-setup';
import { DeviceMirror } from './DeviceMirror';

const ui = () => useUiStore.getState();

/** Sizes the bay and lets the mirror re-fit to it. */
function sizeBay(width: number, height: number): void {
  act(() => {
    resizeElement(screen.getByTestId('mirror-bay'), { width, height });
  });
}

function sizeHeader(width: number): void {
  act(() => {
    resizeElement(screen.getByTestId('device-header'), { width });
  });
}

beforeEach(() => {
  resetUiStore();
});

/** Criteria 35–43. */
describe('DeviceMirror', () => {
  it('is a region a screen reader can find by name', () => {
    render(<DeviceMirror />);

    expect(screen.getByRole('region', { name: 'Device' })).toBeInTheDocument();
  });

  /** Criterion 35. */
  it.each([
    [1440, 340],
    [1200, 308],
    [900, 290],
  ])('is 40px wider than the mirror the %ipx window asks for (%ipx)', (window, expected) => {
    render(<DeviceMirror />);

    act(() => {
      ui().setWindowWidth(window);
    });

    expect(screen.getByRole('region', { name: 'Device' })).toHaveStyle({
      width: `${expected}px`,
    });
  });

  /** Criterion 36. */
  it('heads the panel with the device it is mirroring and its tools', () => {
    render(<DeviceMirror />);
    sizeHeader(300);

    expect(screen.getByText('Device')).toBeInTheDocument();
    expect(screen.getByText(DEVICE.serial)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload mirror' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Screenshot' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument();
  });

  it('shows inspect as the mode the window is already in', () => {
    render(<DeviceMirror />);
    sizeHeader(300);

    expect(screen.getByRole('button', { name: 'Inspect' })).toHaveAttribute('aria-pressed', 'true');
  });

  /** Criterion 37 — degradation in priority order. */
  describe('as the header narrows', () => {
    it('keeps everything while there is room', () => {
      render(<DeviceMirror />);
      sizeHeader(250);

      expect(screen.getByText('Device')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reload mirror' })).toBeInTheDocument();
    });

    it('drops the label first', () => {
      render(<DeviceMirror />);
      sizeHeader(200);

      expect(screen.queryByText('Device')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reload mirror' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Screenshot' })).toBeInTheDocument();
    });

    it('drops reload and screenshot next', () => {
      render(<DeviceMirror />);
      sizeHeader(150);

      expect(screen.queryByRole('button', { name: 'Reload mirror' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Screenshot' })).not.toBeInTheDocument();
    });

    // It is the mode the whole window is in, so it is the last thing to go.
    it.each([250, 200, 150, 90])('keeps inspect at %ipx', (width) => {
      render(<DeviceMirror />);
      sizeHeader(width);

      expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument();
    });

    // Criterion 38: the serial is the first thing to give ground — it stays on
    // the header at every width and truncates instead. That it truncates is a
    // CSS declaration, guarded in `styles.test.ts`.
    it('keeps the serial on the header at every width', () => {
      render(<DeviceMirror />);
      sizeHeader(90);

      expect(screen.getByText(DEVICE.serial)).toBeInTheDocument();
    });
  });

  /** Criteria 39–41. */
  describe('the phone', () => {
    it('keeps a fixed logical size and scales to fit', () => {
      render(<DeviceMirror />);
      act(() => {
        ui().setWindowWidth(1440);
      });
      sizeBay(400, 400);

      const phone = screen.getByTestId('phone');

      // 400 / 664 = 0.602…, floored to a hundredth.
      expect(phone).toHaveStyle({
        width: `${PHONE.width}px`,
        height: `${PHONE.height}px`,
        transform: 'scale(0.6)',
      });
    });

    it('does not change its logical size when the bay does', () => {
      render(<DeviceMirror />);
      sizeBay(400, 400);
      sizeBay(200, 260);

      expect(screen.getByTestId('phone')).toHaveStyle({
        width: `${PHONE.width}px`,
        height: `${PHONE.height}px`,
      });
    });

    it('reserves the footprint the scaled phone actually occupies', () => {
      render(<DeviceMirror />);
      act(() => {
        ui().setWindowWidth(1440);
      });
      sizeBay(400, 400);

      // floor(346 * 0.6) x floor(664 * 0.6)
      expect(screen.getByTestId('phone-footprint')).toHaveStyle({
        width: '207px',
        height: '398px',
      });
    });

    it('caps the scale at the breakpoint the window is in', () => {
      render(<DeviceMirror />);
      act(() => {
        ui().setWindowWidth(900);
      });
      sizeBay(4000, 4000);

      // 250 / 330 = 0.757…
      expect(screen.getByTestId('phone')).toHaveStyle({ transform: 'scale(0.75)' });
    });

    it('clamps rather than shrinking the phone away in a tiny bay', () => {
      render(<DeviceMirror />);
      sizeBay(10, 10);

      expect(screen.getByTestId('phone')).toHaveStyle({ transform: 'scale(0.35)' });
    });
  });

  /** Criterion 43. */
  it('says why the screen is empty', () => {
    render(<DeviceMirror />);

    expect(screen.getByText('No device connected')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Conductor talks to Android over adb. Plug in a phone or start an emulator.',
      ),
    ).toBeInTheDocument();
  });
});

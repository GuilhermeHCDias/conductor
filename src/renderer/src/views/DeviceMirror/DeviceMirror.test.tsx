import type { AppIdentity, ConductorApi, Device, DeviceSnapshot, Result } from '@shared/ipc';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEVICE as PHONE } from '../../lib/mirror-fit';
import { resetDeviceStore, useDeviceStore } from '../../stores/device.store';
import { resetUiStore, useUiStore } from '../../stores/ui.store';
import { resizeElement } from '../../test-setup';
import { DeviceMirror } from './DeviceMirror';

/** The one seam mocked is `window.conductor` — no store, hook or component. */

const ui = () => useUiStore.getState();
const device = () => useDeviceStore.getState();

const ANDROID: Device = { id: 'R9QYC01EMXL', model: 'SM_G991B', state: 'device' };
const SECOND: Device = { id: 'emulator-5554', model: 'sdk_gphone64', state: 'device' };
const UNAUTHORIZED: Device = { id: '9A271FFAZ005LN', model: null, state: 'unauthorized' };

const IDENTITY: AppIdentity = {
  appId: 'com.vtex.pnp',
  installed: true,
  versionName: '4.0.2',
  running: true,
  foreground: true,
};

const snapshot = (over: Partial<DeviceSnapshot> = {}): Result<DeviceSnapshot> => ({
  ok: true,
  data: {
    devices: [ANDROID],
    selectedId: ANDROID.id,
    properties: { model: 'SM-G991B', release: '14', size: null, density: null },
    ...over,
  },
});

let conductor: {
  deviceList: ReturnType<typeof vi.fn>;
  deviceAppInfo: ReturnType<typeof vi.fn>;
  viewerOpen: ReturnType<typeof vi.fn>;
  onDeviceChanged: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  resetUiStore();
  resetDeviceStore();
  conductor = {
    deviceList: vi.fn(() =>
      Promise.resolve<Result<DeviceSnapshot>>({
        ok: true,
        data: { devices: [], selectedId: null, properties: null },
      }),
    ),
    deviceAppInfo: vi.fn(() => Promise.resolve({ ok: true, data: IDENTITY })),
    viewerOpen: vi.fn(() => Promise.resolve({ ok: true, data: { url: 'http://127.0.0.1:9999/' } })),
    onDeviceChanged: vi.fn(() => () => {}),
  };
  window.conductor = conductor as unknown as ConductorApi;
});

/** Renders, then lets whatever the mount asked for settle. */
async function mount(): Promise<void> {
  render(<DeviceMirror />);
  await waitFor(() => {
    expect(conductor.deviceList).toHaveBeenCalled();
  });
}

/** Pushes a snapshot the way main would, and waits for the app-identity round trip. */
async function push(payload: Result<DeviceSnapshot>): Promise<void> {
  act(() => {
    device().applySnapshot(payload);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

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

describe('DeviceMirror', () => {
  it('is a region a screen reader can find by name', async () => {
    await mount();

    expect(screen.getByRole('region', { name: 'Device' })).toBeInTheDocument();
  });

  /** Criterion 35, unchanged by this spec. */
  it.each([
    [1440, 340],
    [1200, 308],
    [900, 290],
  ])('is 40px wider than the mirror the %ipx window asks for (%ipx)', async (window, expected) => {
    await mount();

    act(() => {
      ui().setWindowWidth(window);
    });

    expect(screen.getByRole('region', { name: 'Device' })).toHaveStyle({
      width: `${expected}px`,
    });
  });
});

/** Criterion 27 — the header reports the device, not a fixture. */
describe('the header', () => {
  it('names the device by the model it reported about itself', async () => {
    await mount();
    sizeHeader(340);
    await push(snapshot());

    expect(screen.getByText('SM-G991B')).toBeInTheDocument();
  });

  it('falls back to the serial when no model was reported', async () => {
    await mount();
    sizeHeader(340);
    await push(snapshot({ devices: [UNAUTHORIZED], selectedId: null, properties: null }));

    expect(screen.getByText(UNAUTHORIZED.id)).toBeInTheDocument();
  });

  it('says there is no device when there is none', async () => {
    await mount();
    sizeHeader(340);

    expect(screen.getByText('No device')).toBeInTheDocument();
  });

  /** Criterion 13 — one line, telling the four app states apart. */
  it('carries the app identity line', async () => {
    await mount();
    sizeHeader(340);
    await push(snapshot());

    expect(screen.getByText('com.vtex.pnp 4.0.2 · foreground')).toBeInTheDocument();
  });

  it('keeps its tools', async () => {
    await mount();
    sizeHeader(340);

    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument();
  });

  it('shows inspect as the mode the window is already in', async () => {
    await mount();
    sizeHeader(340);

    expect(screen.getByRole('button', { name: 'Inspect' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('re-reads the device state when refresh is pressed', async () => {
    await mount();
    sizeHeader(340);

    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(conductor.deviceList).toHaveBeenCalledTimes(2);
  });

  /** Criterion 28 — degradation in priority order, app identity first. */
  describe('as the header narrows', () => {
    it('keeps everything while there is room', async () => {
      await mount();
      sizeHeader(340);
      await push(snapshot());

      expect(screen.getByText('com.vtex.pnp 4.0.2 · foreground')).toBeInTheDocument();
      expect(screen.getByText('Device')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    });

    it('drops the app identity first', async () => {
      await mount();
      sizeHeader(280);
      await push(snapshot());

      expect(screen.queryByText('com.vtex.pnp 4.0.2 · foreground')).not.toBeInTheDocument();
      expect(screen.getByText('Device')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    });

    it('drops the label next', async () => {
      await mount();
      sizeHeader(200);
      await push(snapshot());

      expect(screen.queryByText('Device')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
    });

    it('drops the tools last', async () => {
      await mount();
      sizeHeader(150);

      expect(screen.queryByRole('button', { name: 'Refresh' })).not.toBeInTheDocument();
    });

    it.each([340, 280, 200, 150, 90])('keeps inspect at %ipx', async (width) => {
      await mount();
      sizeHeader(width);

      expect(screen.getByRole('button', { name: 'Inspect' })).toBeInTheDocument();
    });

    // Criterion 28: the device's own name stays at every width and truncates
    // instead. That it truncates is a CSS declaration, guarded in styles.test.ts.
    it.each([340, 200, 90])('keeps the device name at %ipx', async (width) => {
      await mount();
      sizeHeader(width);
      await push(snapshot());

      expect(screen.getByText('SM-G991B')).toBeInTheDocument();
    });
  });
});

/** Criteria 39–41 — the phone is still an object of a fixed size. */
describe('the phone', () => {
  it('keeps a fixed logical size and scales to fit', async () => {
    await mount();
    act(() => {
      ui().setWindowWidth(1440);
    });
    sizeBay(400, 400);

    expect(screen.getByTestId('phone')).toHaveStyle({
      width: `${PHONE.width}px`,
      height: `${PHONE.height}px`,
      transform: 'scale(0.6)',
    });
  });

  it('reserves the footprint the scaled phone actually occupies', async () => {
    await mount();
    act(() => {
      ui().setWindowWidth(1440);
    });
    sizeBay(400, 400);

    expect(screen.getByTestId('phone-footprint')).toHaveStyle({
      width: '207px',
      height: '398px',
    });
  });

  it('clamps rather than shrinking the phone away in a tiny bay', async () => {
    await mount();
    sizeBay(10, 10);

    expect(screen.getByTestId('phone')).toHaveStyle({ transform: 'scale(0.35)' });
  });

  /**
   * Criterion 24 — the drawn status bar and nav bar are gone. They were
   * furniture for a mirror, and this panel is not one.
   */
  it('draws no status bar and no nav bar of its own', async () => {
    await mount();

    expect(screen.queryByText('12:29')).not.toBeInTheDocument();
    expect(document.querySelector('[class*="statusBar"]')).toBeNull();
    expect(document.querySelector('[class*="navBar"]')).toBeNull();
  });
});

/** Criterion 26 — exactly one state per condition, each naming a next action. */
describe('what the panel says', () => {
  const stateIs = (state: string): void => {
    expect(screen.getByTestId('device-state')).toHaveAttribute('data-state', state);
  };

  it('reports an empty bench', async () => {
    await mount();
    await push(snapshot({ devices: [], selectedId: null, properties: null }));

    stateIs('no-device');
    expect(screen.getByText('No device connected')).toBeInTheDocument();
    expect(
      screen.getByText('Plug an Android phone in over USB, with USB debugging turned on.'),
    ).toBeInTheDocument();
  });

  it('reports a missing adb with the reason main gave', async () => {
    await mount();
    await push({
      ok: false,
      error: { code: 'device/adb-not-found', message: 'No adb found. Install platform-tools.' },
    });

    stateIs('adb-unavailable');
    expect(screen.getByText('No adb found. Install platform-tools.')).toBeInTheDocument();
  });

  /** The first screen every first-time user sees. */
  it('reports an unauthorized device and what to do about it', async () => {
    await mount();
    await push(snapshot({ devices: [UNAUTHORIZED], selectedId: null, properties: null }));

    stateIs('unauthorized');
    expect(screen.getByText('Device not authorized')).toBeInTheDocument();
    expect(screen.getByText(/Accept the USB debugging prompt/)).toBeInTheDocument();
  });

  it('offers the choice when more than one device is usable', async () => {
    await mount();
    await push(snapshot({ devices: [ANDROID, SECOND], selectedId: null, properties: null }));

    stateIs('choose-device');
    expect(screen.getByRole('button', { name: 'SM_G991B' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'sdk_gphone64' })).toBeInTheDocument();
  });

  it('reads the app identity of whichever device was picked', async () => {
    await mount();
    await push(snapshot({ devices: [ANDROID, SECOND], selectedId: null, properties: null }));

    await userEvent.click(screen.getByRole('button', { name: 'sdk_gphone64' }));

    expect(conductor.deviceAppInfo).toHaveBeenCalledWith(SECOND.id);
  });

  it('reports an app that is not installed, without naming an app id of its own', async () => {
    conductor.deviceAppInfo.mockResolvedValue({
      ok: true,
      data: { ...IDENTITY, installed: false, versionName: null },
    });
    await mount();
    await push(snapshot());

    stateIs('app-missing');
    expect(screen.getByText('com.vtex.pnp is not installed')).toBeInTheDocument();
  });

  it('reports a missing Maestro under its own state', async () => {
    conductor.viewerOpen.mockResolvedValue({
      ok: false,
      error: { code: 'viewer/maestro-not-found', message: 'The Maestro CLI is not installed.' },
    });
    await mount();
    await push(snapshot());

    await userEvent.click(screen.getByRole('button', { name: 'Open screen in browser' }));

    stateIs('maestro-missing');
    expect(screen.getByText('The Maestro CLI is not installed.')).toBeInTheDocument();
  });

  it.each([
    ['viewer/handshake-timeout', 'Maestro did not answer in time.'],
    ['viewer/tool-missing', 'This Maestro is too old.'],
    ['viewer/untrusted-url', 'The Viewer URL was not a local address.'],
  ])('reports %s as a failed viewer', async (code, message) => {
    conductor.viewerOpen.mockResolvedValue({ ok: false, error: { code, message } });
    await mount();
    await push(snapshot());

    await userEvent.click(screen.getByRole('button', { name: 'Open screen in browser' }));

    stateIs('viewer-failed');
    expect(screen.getByText(message)).toBeInTheDocument();
  });

  it('says the screen opens elsewhere when everything is ready', async () => {
    await mount();
    await push(snapshot());

    stateIs('ready');
    expect(
      screen.getByText('The screen opens in your browser, not in this panel.'),
    ).toBeInTheDocument();
  });
});

/** Criteria 25 and 29 — the control, what it says, and when it can be used. */
describe('the viewer control', () => {
  it('says where the screen actually appears', async () => {
    await mount();
    await push(snapshot());

    expect(screen.getByRole('button', { name: 'Open screen in browser' })).toBeInTheDocument();
    expect(screen.getByText("Maestro's own Viewer, in a browser tab.")).toBeInTheDocument();
  });

  it('is disabled while no device is selected', async () => {
    await mount();
    await push(snapshot({ devices: [], selectedId: null, properties: null }));

    expect(screen.getByRole('button', { name: 'Open screen in browser' })).toBeDisabled();
  });

  it('is enabled once a device is selected', async () => {
    await mount();
    await push(snapshot());

    expect(screen.getByRole('button', { name: 'Open screen in browser' })).toBeEnabled();
  });

  it('asks main to open it', async () => {
    await mount();
    await push(snapshot());

    await userEvent.click(screen.getByRole('button', { name: 'Open screen in browser' }));

    expect(conductor.viewerOpen).toHaveBeenCalledTimes(1);
  });

  // The first open pays a JVM cold start. A control that looks idle through it
  // reads as broken, and gets clicked again.
  it('shows progress while the child starts', async () => {
    conductor.viewerOpen.mockReturnValue(new Promise(() => {}));
    await mount();
    await push(snapshot());

    await userEvent.click(screen.getByRole('button', { name: 'Open screen in browser' }));

    expect(screen.getByRole('button', { name: 'Starting Maestro…' })).toBeDisabled();
    expect(
      screen.getByText('The first open starts Maestro, which takes a moment.'),
    ).toBeInTheDocument();
  });
});

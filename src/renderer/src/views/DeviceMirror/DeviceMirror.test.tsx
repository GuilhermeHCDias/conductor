import type { AppIdentity, ConductorApi, Device, DeviceSnapshot, Result } from '@shared/ipc';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  mirrorStart: ReturnType<typeof vi.fn>;
  mirrorStop: ReturnType<typeof vi.fn>;
  onDeviceChanged: ReturnType<typeof vi.fn>;
  onMirrorEvent: ReturnType<typeof vi.fn>;
};

/** The stream the Galaxy A07 actually opened at `max_size=1024`. */
const STREAM = { sessionId: 'mirror-1', codec: 'h264', width: 464, height: 1024 };

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
    mirrorStart: vi.fn(() => Promise.resolve({ ok: true, data: STREAM })),
    mirrorStop: vi.fn(() => Promise.resolve({ ok: true, data: { sessionId: 'mirror-1' } })),
    onDeviceChanged: vi.fn(() => () => {}),
    onMirrorEvent: vi.fn(() => () => {}),
  };
  window.conductor = conductor as unknown as ConductorApi;
  // jsdom has no WebCodecs. The view's own tests are about what it renders, so
  // the decoder is present-but-inert; the hook's tests are where it is driven.
  installDecoder();
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'VideoDecoder');
});

/** Present but inert. These tests are about what the panel renders; the hook's
 * own tests are where the decoder is actually driven. */
function installDecoder(): void {
  Object.defineProperty(globalThis, 'VideoDecoder', {
    configurable: true,
    writable: true,
    value: class {
      state = 'unconfigured';
      configure(): void {}
      decode(): void {}
      close(): void {}
    },
  });
}

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

/**
 * Criteria 33 and 37 — the bezel, the shadow and the phone's own palette stay;
 * what fills them is now the device's framebuffer rather than a message about
 * where the screen went.
 */
describe('the phone', () => {
  it('keeps the placeholder size until a stream declares its own', async () => {
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

  it('takes the stream’s own dimensions once one is up', async () => {
    await mount();
    await push(snapshot());
    await waitFor(() => {
      expect(device().mirrorStatus).toBe('streaming');
    });
    sizeBay(400, 900);

    expect(screen.getByTestId('phone')).toHaveStyle({ width: '464px', height: '1024px' });
  });

  /** Criterion 33 — fitted by `transform: scale()` alone. The canvas' own
   * width and height are the framebuffer's, and nothing may rewrite them. */
  it('fits the stream by scale, never by resizing the canvas', async () => {
    await mount();
    await push(snapshot());
    await waitFor(() => {
      expect(device().mirrorStatus).toBe('streaming');
    });
    sizeBay(400, 520);

    const canvas = screen.getByTestId('mirror-canvas');
    expect(canvas).toHaveAttribute('width', '464');
    expect(canvas).toHaveAttribute('height', '1024');
    expect(screen.getByTestId('phone')).toHaveStyle({ transform: 'scale(0.5)' });
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

  /** Criterion 37 — the drawn status bar and nav bar are gone for good. The
   * phone draws its own now. */
  it('draws no status bar and no nav bar of its own', async () => {
    await mount();

    expect(screen.queryByText('12:29')).not.toBeInTheDocument();
    expect(document.querySelector('[class*="statusBar"]')).toBeNull();
    expect(document.querySelector('[class*="navBar"]')).toBeNull();
  });
});

/** Criterion 37 — the panel fills, so nothing in it may still say the screen is
 * somewhere else. */
describe('the mirror', () => {
  it('renders a canvas in the bezel once a device is selected', async () => {
    await mount();
    await push(snapshot());

    await waitFor(() => {
      expect(screen.getByTestId('mirror-canvas')).toBeInTheDocument();
    });
  });

  it('asks main for the stream of the selected device', async () => {
    await mount();
    await push(snapshot());

    await waitFor(() => {
      expect(conductor.mirrorStart).toHaveBeenCalledWith(ANDROID.id);
    });
  });

  /** Criterion 41 — the subscription belongs to this view, so it ends with it. */
  it('mounts the mirror subscription itself rather than leaving it to App', async () => {
    await mount();
    await push(snapshot());

    await waitFor(() => {
      expect(conductor.onMirrorEvent).toHaveBeenCalled();
    });
  });

  /** Nothing to listen for with no phone attached, and a listener at 30 fps is
   * not something to hold open on the chance one arrives. */
  it('subscribes to nothing while no device is selected', async () => {
    await mount();

    expect(conductor.onMirrorEvent).not.toHaveBeenCalled();
  });

  it('says nothing about a browser anywhere on the panel', async () => {
    await mount();
    await push(snapshot());

    expect(screen.queryByText(/in your browser/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/not in this panel/i)).not.toBeInTheDocument();
  });
});

/**
 * Criterion 38 — exactly one empty state per condition, each naming a next
 * action, and none of them about Maestro.
 */
describe('what the panel says instead', () => {
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

  /** Criterion 38's sixth condition, and the one this spec introduces. */
  it('reports a mirror that could not start, with the reason main gave', async () => {
    conductor.mirrorStart.mockResolvedValue({
      ok: false,
      error: {
        code: 'mirror/start-failed',
        message: 'ERROR: Could not find "/data/local/tmp/s.jar"',
      },
    });
    await mount();
    await push(snapshot());

    await waitFor(() => {
      stateIs('mirror-failed');
    });
    expect(screen.getByText('ERROR: Could not find "/data/local/tmp/s.jar"')).toBeInTheDocument();
  });

  it('reports a device that went away mid-session as a device problem, not a mirror one', async () => {
    await mount();
    await push(snapshot());
    await waitFor(() => {
      expect(device().mirrorStatus).toBe('streaming');
    });

    act(() => {
      device().mirrorEnded('mirror-1', {
        code: 'mirror/device-lost',
        message: 'The device closed the mirror stream.',
      });
    });
    await push(snapshot({ devices: [], selectedId: null, properties: null }));

    stateIs('no-device');
  });

  /** Criterion 43 — an explicit state, not a blank canvas. */
  it('reports a renderer that cannot decode at all', async () => {
    Reflect.deleteProperty(globalThis, 'VideoDecoder');
    await mount();
    await push(snapshot());

    await waitFor(() => {
      stateIs('unsupported');
    });
    expect(screen.queryByTestId('mirror-canvas')).not.toBeInTheDocument();
  });

  /**
   * Criterion 38 — the two states that belonged to the demoted control are gone.
   * A Maestro that is not installed no longer takes the picture off the panel,
   * because the picture never came from Maestro.
   */
  it.each([
    ['viewer/maestro-not-found', 'The Maestro CLI is not installed.'],
    ['viewer/handshake-timeout', 'Maestro did not answer in time.'],
  ])('no longer turns %s into a state of the whole panel', async (code, message) => {
    conductor.viewerOpen.mockResolvedValue({ ok: false, error: { code, message } });
    await mount();
    await push(snapshot());
    await waitFor(() => {
      expect(screen.getByTestId('mirror-canvas')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Open in Maestro Viewer' }));

    expect(screen.getByTestId('mirror-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('device-state')).not.toBeInTheDocument();
  });
});

/**
 * Criterion 38 demotes the Viewer: the mirror is the panel now, and the Viewer
 * is what still offers *interaction*, since this spec ships `control=false`. So
 * the control survives, out of the way, and reports its own failures beside
 * itself rather than over the picture.
 */
describe('the demoted viewer control', () => {
  it('sits outside the phone, not on its screen', async () => {
    await mount();
    await push(snapshot());

    const control = screen.getByRole('button', { name: 'Open in Maestro Viewer' });
    expect(screen.getByTestId('phone').contains(control)).toBe(false);
  });

  it('is disabled while no device is selected', async () => {
    await mount();
    await push(snapshot({ devices: [], selectedId: null, properties: null }));

    expect(screen.getByRole('button', { name: 'Open in Maestro Viewer' })).toBeDisabled();
  });

  it('asks main to open it', async () => {
    await mount();
    await push(snapshot());

    await userEvent.click(screen.getByRole('button', { name: 'Open in Maestro Viewer' }));

    expect(conductor.viewerOpen).toHaveBeenCalledTimes(1);
  });

  it('shows progress while the child starts', async () => {
    conductor.viewerOpen.mockReturnValue(new Promise(() => {}));
    await mount();
    await push(snapshot());

    await userEvent.click(screen.getByRole('button', { name: 'Open in Maestro Viewer' }));

    expect(screen.getByRole('button', { name: 'Starting Maestro…' })).toBeDisabled();
  });

  it('reports its own failure beside itself', async () => {
    conductor.viewerOpen.mockResolvedValue({
      ok: false,
      error: { code: 'viewer/maestro-not-found', message: 'The Maestro CLI is not installed.' },
    });
    await mount();
    await push(snapshot());

    await userEvent.click(screen.getByRole('button', { name: 'Open in Maestro Viewer' }));

    expect(screen.getByText('The Maestro CLI is not installed.')).toBeInTheDocument();
  });
});

/** Criterion 39 — the dot reports the real device and the real session. */
describe('the header status dot', () => {
  const dot = (): HTMLElement => screen.getByTestId('device-dot');

  it('is offline with nothing plugged in', async () => {
    await mount();

    expect(dot()).toHaveAttribute('data-state', 'offline');
  });

  it('turns connected once frames are actually arriving', async () => {
    await mount();
    await push(snapshot());

    await waitFor(() => {
      expect(dot()).toHaveAttribute('data-state', 'connected');
    });
  });

  it('reports a mirror that failed', async () => {
    conductor.mirrorStart.mockResolvedValue({
      ok: false,
      error: { code: 'mirror/start-failed', message: 'no' },
    });
    await mount();
    await push(snapshot());

    await waitFor(() => {
      expect(dot()).toHaveAttribute('data-state', 'fail');
    });
  });
});

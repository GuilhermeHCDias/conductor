import type {
  AppIdentity,
  ConductorApi,
  Device,
  DeviceSnapshot,
  Result,
  SynthesizedSelector,
} from '@shared/ipc';
import type { SnapshotView, TreeNode } from '@shared/types';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOW_YAML } from '../../fixtures/flows';
import { DEVICE as PHONE } from '../../lib/mirror-fit';
import { resetDeviceStore, useDeviceStore } from '../../stores/device.store';
import { resetFlowStore, useFlowStore } from '../../stores/flow.store';
import { resetInspectStore, useInspectStore } from '../../stores/inspect.store';
import { resetUiStore, useUiStore } from '../../stores/ui.store';
import { resizeElement } from '../../test-setup';
import { DeviceMirror } from './DeviceMirror';

/** The one seam mocked is `window.conductor` — no store, hook or component. */

const ui = () => useUiStore.getState();
const device = () => useDeviceStore.getState();
const inspect = () => useInspectStore.getState();
const flow = () => useFlowStore.getState();

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
  mirrorStart: ReturnType<typeof vi.fn>;
  mirrorStop: ReturnType<typeof vi.fn>;
  mirrorInput: ReturnType<typeof vi.fn>;
  maestroSnapshot: ReturnType<typeof vi.fn>;
  maestroSynthesizeSelector: ReturnType<typeof vi.fn>;
  onDeviceChanged: ReturnType<typeof vi.fn>;
  onMirrorEvent: ReturnType<typeof vi.fn>;
};

/** A frame that stops short of the screen's bottom — the strip below y=1400
 * belongs to no element — with one tappable button in its top-left quadrant. */
const emptyNode: Omit<TreeNode, 'children'> = {
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
};

const TREE: TreeNode = {
  ...emptyNode,
  children: [
    {
      ...emptyNode,
      bounds: { x1: 0, y1: 0, x2: 720, y2: 1400 },
      className: 'android.widget.FrameLayout',
      children: [
        {
          ...emptyNode,
          bounds: { x1: 0, y1: 0, x2: 360, y2: 800 },
          className: 'android.widget.Button',
          text: 'Entrar',
          clickable: true,
          children: [],
        },
      ],
    },
  ],
};

const VIEW: SnapshotView = {
  snapshotId: 'snapshot-1',
  tree: TREE,
  screenshotWidth: 720,
  screenshotHeight: 1600,
  scale: 1,
};

const SELECTOR: SynthesizedSelector = { level: 'text', selector: 'text: "Entrar"', fragile: false };

/** The stream the Galaxy A07 actually opened at `max_size=1024`. */
const STREAM = {
  sessionId: 'mirror-1',
  codec: 'h264',
  width: 464,
  height: 1024,
  control: true,
};

beforeEach(() => {
  resetUiStore();
  resetDeviceStore();
  resetInspectStore();
  resetFlowStore();
  conductor = {
    deviceList: vi.fn(() =>
      Promise.resolve<Result<DeviceSnapshot>>({
        ok: true,
        data: { devices: [], selectedId: null, properties: null },
      }),
    ),
    deviceAppInfo: vi.fn(() => Promise.resolve({ ok: true, data: IDENTITY })),
    mirrorStart: vi.fn(() => Promise.resolve({ ok: true, data: STREAM })),
    mirrorStop: vi.fn(() => Promise.resolve({ ok: true, data: { sessionId: 'mirror-1' } })),
    mirrorInput: vi.fn(() => Promise.resolve({ ok: true, data: { sessionId: 'mirror-1' } })),
    maestroSnapshot: vi.fn(() => Promise.resolve({ ok: true, data: VIEW })),
    maestroSynthesizeSelector: vi.fn(() => Promise.resolve({ ok: true, data: SELECTOR })),
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

  /** Nothing to listen for with no phone attached, and a listener at 60 fps is
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
});

/**
 * Criterion 23. The Viewer survived the mirror spec as a footer control,
 * because it still offered the one thing the mirror did not: interaction. It
 * does not survive this one — the `maestro mcp` child it stood on now answers
 * `inspect_screen`, nothing in the app opens a viewer URL, and a button whose
 * whole backend was deleted is a button that fails.
 *
 * Interaction is not lost, only deferred: the sibling `scrcpy-control-socket`
 * spec puts tapping and typing on the mirror itself, where the person is
 * already looking.
 */
describe('the viewer control that used to sit in the footer', () => {
  it('is gone', async () => {
    await mount();
    await push(snapshot());

    expect(screen.queryByRole('button', { name: /viewer/i })).not.toBeInTheDocument();
  });

  it('takes its note with it', async () => {
    await mount();
    await push(snapshot());

    expect(screen.queryByText(/Tapping and typing still happen there/i)).not.toBeInTheDocument();
  });

  /** The picture and the states around it are untouched: this spec is
   * subtractive on the footer and nowhere else. */
  it('leaves the mirror itself alone', async () => {
    await mount();
    await push(snapshot());

    await waitFor(() => {
      expect(screen.getByTestId('mirror-canvas')).toBeInTheDocument();
    });
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

/**
 * Criteria 6–15. The panel stops being a picture and becomes a surface: the
 * canvas takes a pointer and the keyboard, and a back control joins the header
 * beside `Refresh` and `Inspect`.
 *
 * The one seam is still `window.conductor`, so what these drive is the real
 * store, the real coordinate math and the real key routing.
 */
describe('driving the device', () => {
  /** Mounts, streams, and gives the bay a size so the mirror is actually drawn. */
  async function streaming(): Promise<HTMLCanvasElement> {
    await mount();
    await push(snapshot());
    await waitFor(() => {
      expect(device().mirrorStatus).toBe('streaming');
    });
    sizeBay(400, 900);
    return screen.getByTestId('mirror-canvas') as HTMLCanvasElement;
  }

  /**
   * jsdom lays nothing out, so the canvas' box has to be stated — and it has to
   * be stated at the scale the view *actually* drew at, which is read back off
   * the phone's own transform rather than assumed. A box and a scale that
   * disagree would make this test pass on arithmetic the app never performs.
   */
  function drawAt(canvas: HTMLCanvasElement): number {
    const scale = renderedScale();
    canvas.getBoundingClientRect = () =>
      ({
        left: 40,
        top: 100,
        width: 464 * scale,
        height: 1024 * scale,
        right: 40 + 464 * scale,
        bottom: 100 + 1024 * scale,
        x: 40,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    return scale;
  }

  /** `fitMirror`'s scale, as the view put it on the phone. */
  function renderedScale(): number {
    const transform = screen.getByTestId('phone').style.transform;
    return Number(/scale\(([\d.]+)\)/.exec(transform)?.[1]);
  }

  const settleInput = async (): Promise<void> => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 32));
    });
  };

  /** Criterion 6 — a click is a touch at the device pixel under it. */
  it('sends a tap at the device pixel the click landed on', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);

    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 40 + 232 * scale,
          clientY: 100 + 512 * scale,
        }),
      );
    });
    await settleInput();

    expect(conductor.mirrorInput).toHaveBeenCalledWith('mirror-1', {
      type: 'tap',
      x: 232,
      y: 512,
      screenWidth: 464,
      screenHeight: 1024,
    });
  });

  /** Criterion 8 — the bezel and the bay gutter are the app, not the phone. */
  it('sends nothing for a click outside the drawn picture', async () => {
    const canvas = await streaming();
    drawAt(canvas);

    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }),
      );
    });
    await settleInput();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  /** Criterion 10 — the canvas takes focus, and only then does it take keys. */
  it('is focusable, so the keyboard has somewhere to go', async () => {
    const canvas = await streaming();

    expect(canvas).toHaveAttribute('tabindex', '0');
    // A tab stop that announces nothing is a trap, so it carries a name too.
    expect(screen.getByLabelText('Device screen')).toBe(canvas);
  });

  it('takes focus when the picture is clicked', async () => {
    const canvas = await streaming();
    drawAt(canvas);

    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, clientX: 100, clientY: 200 }),
      );
    });

    expect(document.activeElement).toBe(canvas);
  });

  /** Criterion 11 — printable characters are text. */
  it('sends typed characters as text', async () => {
    const canvas = await streaming();
    canvas.focus();

    await userEvent.keyboard('hi');
    await settleInput();

    expect(conductor.mirrorInput).toHaveBeenCalledWith('mirror-1', { type: 'text', text: 'hi' });
  });

  it('routes no keystroke while the canvas does not hold focus', async () => {
    await streaming();
    document.body.focus();

    await userEvent.keyboard('hi');
    await settleInput();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  /** Criterion 12 — a key with no character of its own is a keycode. */
  it('sends a non-printable key as a keycode rather than as text', async () => {
    const canvas = await streaming();
    canvas.focus();

    await userEvent.keyboard('{Backspace}');
    await settleInput();

    expect(conductor.mirrorInput).toHaveBeenCalledWith('mirror-1', {
      type: 'key',
      key: 'backspace',
    });
  });

  /** ⚠️ Criterion 13. Swallowing every key would take Cmd-Q away from the person
   * while the mirror has focus — the window would stop being quittable. */
  it('leaves a shortcut alone rather than claiming it for the device', async () => {
    const canvas = await streaming();
    canvas.focus();

    await userEvent.keyboard('{Meta>}q{/Meta}');
    await settleInput();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  it('stops the browser handling a key it routed to the device', async () => {
    const canvas = await streaming();
    canvas.focus();
    const arrow = new KeyboardEvent('keydown', {
      key: 'ArrowDown',
      bubbles: true,
      cancelable: true,
    });
    const shortcut = new KeyboardEvent('keydown', {
      key: 'q',
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });

    act(() => {
      canvas.dispatchEvent(arrow);
      canvas.dispatchEvent(shortcut);
    });

    expect(arrow.defaultPrevented).toBe(true);
    expect(shortcut.defaultPrevented).toBe(false);
  });

  /** Criterion 14 — beside `Refresh` and `Inspect`, in the same chrome. */
  it('offers a back control in the header', async () => {
    await streaming();

    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  it('sends the back action when it is clicked', async () => {
    await streaming();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await settleInput();

    expect(conductor.mirrorInput).toHaveBeenCalledWith('mirror-1', { type: 'back' });
  });

  /** Criterion 15 — none of it has a target when nothing is streaming. */
  it('offers no back control before a stream is up', async () => {
    await mount();

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  it('offers no back control once the mirror has failed', async () => {
    conductor.mirrorStart.mockResolvedValue({
      ok: false,
      error: { code: 'mirror/start-failed', message: 'no' },
    });
    await mount();
    await push(snapshot());

    await waitFor(() => {
      expect(device().mirrorStatus).toBe('failed');
    });
    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
  });

  /** Criterion 4 — a picture that arrived without a control channel is still a
   * picture; what goes away is the ability to drive it. */
  it('offers no controls for a session that arrived without control', async () => {
    conductor.mirrorStart.mockResolvedValue({ ok: true, data: { ...STREAM, control: false } });
    const canvas = await streaming();
    const scale = drawAt(canvas);

    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          clientX: 40 + 100 * scale,
          clientY: 100 + 100 * scale,
        }),
      );
    });
    await settleInput();

    expect(screen.queryByRole('button', { name: 'Back' })).not.toBeInTheDocument();
    expect(conductor.mirrorInput).not.toHaveBeenCalled();
    expect(screen.getByTestId('mirror-canvas')).toBeInTheDocument();
  });

  /** Criterion 16 — control failing says so beside the phone, and leaves the
   * picture where it is. */
  it('reports a control failure without taking the picture away', async () => {
    await streaming();
    conductor.mirrorInput.mockResolvedValue({
      ok: false,
      error: { code: 'mirror/control-failed', message: 'The control socket is gone.' },
    });

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    await settleInput();

    expect(await screen.findByText(/control socket is gone/i)).toBeInTheDocument();
    expect(screen.getByTestId('mirror-canvas')).toBeInTheDocument();
    expect(device().mirrorStatus).toBe('streaming');
  });
});

/**
 * §5.5's authoring surface (criteria 11–29, 36–44): hover highlights the
 * element Maestro sees, hit-tested locally against the frozen snapshot; a
 * right-click synthesises in main and opens the command menu; picking a
 * command appends the step, and the tap family also drives the device.
 *
 * The one seam is still `window.conductor`. The geometry is the real one:
 * 720×1600 snapshot at scale 1 over a 464×1024 stream, so hierarchy (180,400)
 * is stream (116,256).
 */
describe('inspecting the screen', () => {
  /** Mounts, streams, waits for the snapshot, sizes the bay. */
  async function inspecting(): Promise<{ canvas: HTMLCanvasElement; scale: number }> {
    await mount();
    await push(snapshot());
    await waitFor(() => {
      expect(device().mirrorStatus).toBe('streaming');
    });
    sizeBay(400, 900);
    await waitFor(() => {
      expect(inspect().snapshot).not.toBeNull();
    });
    const canvas = screen.getByTestId('mirror-canvas') as HTMLCanvasElement;
    return { canvas, scale: stateBox(canvas) };
  }

  /** jsdom lays nothing out: the canvas box is stated at the scale the view
   * actually drew at, read back off the phone's transform. */
  function stateBox(canvas: HTMLCanvasElement): number {
    const transform = screen.getByTestId('phone').style.transform;
    const scale = Number(/scale\(([\d.]+)\)/.exec(transform)?.[1]);
    canvas.getBoundingClientRect = () =>
      ({
        left: 40,
        top: 100,
        width: 464 * scale,
        height: 1024 * scale,
        right: 40 + 464 * scale,
        bottom: 100 + 1024 * scale,
        x: 40,
        y: 100,
        toJSON: () => ({}),
      }) as DOMRect;
    return scale;
  }

  /** Stream-space coordinates in, client-space MouseEvent out. */
  function at(
    scale: number,
    streamX: number,
    streamY: number,
  ): { clientX: number; clientY: number } {
    return { clientX: 40 + streamX * scale, clientY: 100 + streamY * scale };
  }

  function hoverAt(canvas: HTMLCanvasElement, point: { clientX: number; clientY: number }): void {
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, ...point }));
    });
  }

  async function rightClickAt(
    canvas: HTMLCanvasElement,
    point: { clientX: number; clientY: number },
  ): Promise<void> {
    await act(async () => {
      canvas.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, ...point }),
      );
      await Promise.resolve();
    });
  }

  const settleInput = async (): Promise<void> => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 32));
    });
  };

  /** Criteria 13–14 — the DS highlight over the hovered element, labelled from
   * the tree, positioned in the canvas's own pre-transform space. */
  it('highlights the hovered element with its literal label', async () => {
    const { canvas, scale } = await inspecting();

    hoverAt(canvas, at(scale, 116, 256));

    // 360×800 hierarchy → 232×512 stream px, floating point and all.
    const style = screen.getByTestId('inspect-highlight').style;
    expect(Number.parseFloat(style.left)).toBeCloseTo(0, 5);
    expect(Number.parseFloat(style.top)).toBeCloseTo(0, 5);
    expect(Number.parseFloat(style.width)).toBeCloseTo(232, 5);
    expect(Number.parseFloat(style.height)).toBeCloseTo(512, 5);
    expect(screen.getByText('Button · "Entrar"')).toBeInTheDocument();
    expect(canvas).toHaveAttribute('data-inspect', 'true');
  });

  /** Criterion 46 — hover costs zero IPC and zero process work: the hit-test
   * runs against the in-memory snapshot, and synthesis waits for right-click. */
  it('crosses no IPC while hovering', async () => {
    const { canvas, scale } = await inspecting();

    hoverAt(canvas, at(scale, 116, 256));
    hoverAt(canvas, at(scale, 200, 400));
    hoverAt(canvas, at(scale, 60, 100));

    // One capture opened the snapshot; the mousemoves added nothing.
    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(1);
    expect(conductor.maestroSynthesizeSelector).not.toHaveBeenCalled();
    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  /** Criterion 15 — off the canvas, off the screen. */
  it('clears the highlight when the pointer leaves', async () => {
    const { canvas, scale } = await inspecting();
    hoverAt(canvas, at(scale, 116, 256));

    act(() => {
      // React synthesises onPointerLeave from the bubbling pointerout, judged
      // by where the pointer went — here, off the canvas entirely.
      canvas.dispatchEvent(
        new MouseEvent('pointerout', { bubbles: true, relatedTarget: document.body }),
      );
    });

    expect(screen.queryByTestId('inspect-highlight')).not.toBeInTheDocument();
  });

  /** Criterion 11 — Alt climbs to the container; releasing returns. */
  it('retargets the hover to the parent while Alt is held', async () => {
    const { canvas, scale } = await inspecting();
    hoverAt(canvas, at(scale, 116, 256));
    expect(screen.getByText('Button · "Entrar"')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Alt' }));
    });
    expect(screen.getByText('FrameLayout')).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Alt' }));
    });
    expect(screen.getByText('Button · "Entrar"')).toBeInTheDocument();
  });

  /** Criterion 23 — the right-click synthesises in main and opens the menu at
   * the cursor, titled with the element. */
  it('opens the command menu over the hit element', async () => {
    const { canvas, scale } = await inspecting();

    await rightClickAt(canvas, at(scale, 116, 256));

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(conductor.maestroSynthesizeSelector).toHaveBeenCalledWith('snapshot-1', [0, 0]);
    expect(screen.getByText('Button · "Entrar"')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'tapOn' })).toBeInTheDocument();
  });

  /** Criterion 25 — no element, no menu, and never the browser's own. */
  it('opens nothing where no element is hit', async () => {
    const { canvas, scale } = await inspecting();

    await rightClickAt(canvas, at(scale, 322, 960));

    expect(conductor.maestroSynthesizeSelector).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('suppresses the native context menu anywhere on the mirror', async () => {
    await inspecting();
    const panel = screen.getByRole('region', { name: 'Device' });
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });

    act(() => {
      panel.dispatchEvent(event);
    });

    expect(event.defaultPrevented).toBe(true);
  });

  /** Criterion 26 — while the menu is open, the mirror takes no input. */
  it('suppresses pointer forwarding while the menu is open', async () => {
    const { canvas, scale } = await inspecting();
    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');

    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, ...at(scale, 116, 256) }),
      );
    });
    await settleInput();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  it('suppresses keyboard forwarding while the menu is open', async () => {
    const { canvas, scale } = await inspecting();
    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');

    act(() => {
      canvas.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }),
      );
    });
    await settleInput();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  it('closes on Escape writing nothing', async () => {
    const { canvas, scale } = await inspecting();
    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(flow().yaml).toBe(FLOW_YAML);
  });

  /** Criteria 37, 38, 40 — the step appends additively and the tap executes at
   * the element's centre, in stream coordinates, through the ordered queue. */
  it('appends the tapOn step and performs the tap', async () => {
    const { canvas, scale } = await inspecting();
    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');

    await userEvent.click(screen.getByRole('menuitem', { name: 'tapOn' }));
    await settleInput();

    expect(flow().yaml).toBe(`${FLOW_YAML}- tapOn:\n    text: "Entrar"\n`);
    expect(conductor.mirrorInput).toHaveBeenCalledWith('mirror-1', {
      type: 'tap',
      x: 116,
      y: 256,
      screenWidth: 464,
      screenHeight: 1024,
    });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('performs a long press for longPressOn', async () => {
    const { canvas, scale } = await inspecting();
    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');

    await userEvent.click(screen.getByRole('menuitem', { name: 'longPressOn' }));
    await settleInput();

    expect(conductor.mirrorInput).toHaveBeenCalledWith('mirror-1', {
      type: 'long-press',
      x: 116,
      y: 256,
      screenWidth: 464,
      screenHeight: 1024,
    });
  });

  /** Criterion 42 — assert, wait and app commands insert and never execute. */
  it('inserts assertVisible without driving the device', async () => {
    const { canvas, scale } = await inspecting();
    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');

    await userEvent.click(screen.getByRole('menuitem', { name: 'assertVisible' }));
    await settleInput();

    expect(flow().yaml).toBe(`${FLOW_YAML}- assertVisible:\n    text: "Entrar"\n`);
    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  /** Criterion 27 — §5.4 makes the fragility warning mandatory. */
  it('warns before the user picks when the selector is point-based', async () => {
    conductor.maestroSynthesizeSelector.mockResolvedValue({
      ok: true,
      data: { level: 'point', selector: 'point: 25%,25%', fragile: true },
    });
    const { canvas, scale } = await inspecting();

    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');

    expect(screen.getByText('Position-based selector — this step is fragile.')).toBeInTheDocument();
  });

  /** Criterion 28 — synthesis failed: no menu, nothing written, said aloud. */
  it('opens no menu and surfaces a synthesis failure', async () => {
    conductor.maestroSynthesizeSelector.mockResolvedValue({
      ok: false,
      error: { code: 'selector/no-match', message: 'Synthesis matched nothing.' },
    });
    const { canvas, scale } = await inspecting();

    await rightClickAt(canvas, at(scale, 116, 256));

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(await screen.findByText('Synthesis matched nothing.')).toBeInTheDocument();
    expect(flow().yaml).toBe(FLOW_YAML);
  });

  /** Criterion 41 — the dialog collects the text; the pair is born complete,
   * the focusing tap goes out, and the text rides the ordered queue. */
  it('collects inputText through the dialog and executes the pair', async () => {
    const { canvas, scale } = await inspecting();
    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');

    await userEvent.click(screen.getByRole('menuitem', { name: 'inputText' }));
    const dialog = await screen.findByRole('dialog', { name: 'Input text' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insert' })).toBeDisabled();

    await userEvent.type(screen.getByLabelText('Text to type'), 'red shoes');
    await userEvent.click(screen.getByRole('button', { name: 'Insert' }));
    await settleInput();

    expect(flow().yaml).toBe(
      `${FLOW_YAML}- tapOn:\n    text: "Entrar"\n- inputText: "red shoes"\n`,
    );
    expect(conductor.mirrorInput).toHaveBeenNthCalledWith(1, 'mirror-1', {
      type: 'tap',
      x: 116,
      y: 256,
      screenWidth: 464,
      screenHeight: 1024,
    });
    expect(conductor.mirrorInput).toHaveBeenNthCalledWith(2, 'mirror-1', {
      type: 'text',
      text: 'red shoes',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('cancels the dialog writing and executing nothing', async () => {
    const { canvas, scale } = await inspecting();
    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');
    await userEvent.click(screen.getByRole('menuitem', { name: 'inputText' }));
    await screen.findByRole('dialog');

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settleInput();

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(flow().yaml).toBe(FLOW_YAML);
    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  /** Criterion 16 — a capture in flight is visible, never hidden. */
  it('shows the updating chip while a capture is in flight', async () => {
    let release: (value: Result<SnapshotView>) => void = () => {};
    conductor.maestroSnapshot.mockReturnValueOnce(
      new Promise<Result<SnapshotView>>((resolve) => {
        release = resolve;
      }),
    );
    await mount();
    await push(snapshot());
    await waitFor(() => {
      expect(device().mirrorStatus).toBe('streaming');
    });
    sizeBay(400, 900);

    expect(await screen.findByTestId('stale-chip')).toBeInTheDocument();

    await act(async () => {
      release({ ok: true, data: VIEW });
      await Promise.resolve();
    });
    expect(screen.queryByTestId('stale-chip')).not.toBeInTheDocument();
  });

  /** Criterion 17 — the failure surfaces with a retry; the picture stays. */
  it('surfaces a failed capture with a retry, leaving the picture alone', async () => {
    conductor.maestroSnapshot.mockResolvedValueOnce({
      ok: false,
      error: { code: 'mcp/call-failed', message: 'inspect_screen refused.' },
    });
    await mount();
    await push(snapshot());
    await waitFor(() => {
      expect(device().mirrorStatus).toBe('streaming');
    });
    sizeBay(400, 900);

    expect(await screen.findByText(/inspect_screen refused/)).toBeInTheDocument();
    expect(screen.getByTestId('mirror-canvas')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));

    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(2);
    await waitFor(() => {
      expect(screen.queryByText(/inspect_screen refused/)).not.toBeInTheDocument();
    });
  });

  /** Criterion 21 — the manual refresh, in the inspector's own header. */
  it('recaptures on the snapshot refresh control', async () => {
    await inspecting();

    await userEvent.click(screen.getByRole('button', { name: 'Refresh snapshot' }));

    expect(conductor.maestroSnapshot).toHaveBeenCalledTimes(2);
  });

  /** Criterion 44 — no control channel: the menu keeps working and the tap
   * family inserts without executing. */
  it('keeps the menu working without control, inserting only', async () => {
    conductor.mirrorStart.mockResolvedValue({
      ok: true,
      data: { ...STREAM, control: false },
    });
    const { canvas, scale } = await inspecting();

    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');
    await userEvent.click(screen.getByRole('menuitem', { name: 'tapOn' }));
    await settleInput();

    expect(flow().yaml).toBe(`${FLOW_YAML}- tapOn:\n    text: "Entrar"\n`);
    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });
});

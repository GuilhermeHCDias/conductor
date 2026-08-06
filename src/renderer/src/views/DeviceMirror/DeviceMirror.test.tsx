import type {
  AppIdentity,
  ConductorApi,
  Device,
  DeviceSnapshot,
  Result,
  SynthesizedSelector,
} from '@shared/ipc';
import type { SnapshotView, TreeNode } from '@shared/types';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

/** The open flow the command menu appends into — the editor's usual state. */
const FLOW_YAML = 'appId: com.example.app\n---\n- launchApp:\n    clearState: true\n';

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
  // The command menu appends into the open flow; without one open, appending
  // is a no-op by design — so these tests always hold one open.
  useFlowStore.setState({ openPath: 'teste.yaml', yaml: FLOW_YAML });
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

  /** The header tools read at a glance: their glyphs take the md drawing (16px)
   * in the sm box, instead of the sm default (14px). */
  it('draws its tool glyphs at 16px', async () => {
    await mount();
    sizeHeader(340);

    for (const name of ['Refresh', 'Inspect']) {
      const glyph = screen.getByRole('button', { name }).querySelector('svg');
      expect(glyph).toHaveAttribute('width', '16');
    }
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

  /**
   * The hand on the glass, one event at a time. The press reaches the device
   * before the release exists — the drag is streamed while it happens, which
   * is what lets the screen follow the finger — so there is no whole gesture
   * to dispatch: each phase is its own event. The travel and the release are
   * dispatched on the canvas and bubble to the window, where the view listens:
   * a real drag routinely travels and ends past the bezel.
   */
  function press(
    canvas: HTMLCanvasElement,
    point: { clientX: number; clientY: number },
    options: { readonly button?: number; readonly ctrlKey?: boolean } = {},
  ): void {
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, ...options, ...point }));
    });
  }

  function travel(canvas: HTMLCanvasElement, point: { clientX: number; clientY: number }): void {
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointermove', { bubbles: true, ...point }));
    });
  }

  function release(canvas: HTMLCanvasElement, point: { clientX: number; clientY: number }): void {
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, ...point }));
    });
  }

  /** The inputs that actually crossed the seam, in the order they crossed. */
  const sent = (): unknown[] => conductor.mirrorInput.mock.calls.map(([, input]) => input);

  /** A phase, as the wire sees it. */
  const touch = (
    action: 'down' | 'move' | 'up',
    x: number,
    y: number,
  ): Record<string, unknown> => ({
    type: 'touch',
    action,
    x,
    y,
    screenWidth: 464,
    screenHeight: 1024,
  });

  /**
   * The heart of the live drag: the press is on the device the moment it
   * happens. Nothing waits for the button to come back up — until this, the
   * whole gesture replayed after the release, and the screen followed the
   * finger only once the finger was done moving.
   */
  it('presses the device the moment the pointer goes down', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);

    press(canvas, { clientX: 40 + 232 * scale, clientY: 100 + 512 * scale });
    await settleInput();

    expect(sent()).toEqual([touch('down', 232, 512)]);
  });

  /** Criterion 6, live: a click is the finger landing and lifting at the
   * device pixel under it. Whether that is a tap is Android's own touch slop's
   * call now — the same call the glass would make. */
  it('makes a click of a press that stayed put', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);
    const point = { clientX: 40 + 232 * scale, clientY: 100 + 512 * scale };

    press(canvas, point);
    release(canvas, point);
    await settleInput();

    expect(sent()).toEqual([touch('down', 232, 512), touch('up', 232, 512)]);
  });

  /** The travel crosses while the hand makes it, so the app scrolls under the
   * finger rather than after it — and the pacing Android reads a fling from is
   * the hand's own arrival times. */
  it('follows the travel while the button is down', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);
    const x = 40 + 232 * scale;

    press(canvas, { clientX: x, clientY: 100 + 800 * scale });
    travel(canvas, { clientX: x, clientY: 100 + 600 * scale });
    travel(canvas, { clientX: x, clientY: 100 + 200 * scale });
    release(canvas, { clientX: x, clientY: 100 + 200 * scale });
    await settleInput();

    expect(sent()).toEqual([
      touch('down', 232, 800),
      touch('move', 232, 600),
      touch('move', 232, 200),
      touch('up', 232, 200),
    ]);
  });

  /** The wire needs no duplicate: motion within one device pixel is not a
   * move. The release still answers, even from the pixel the finger is on. */
  it('repeats no move while the pointer stays on one device pixel', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);
    const point = { clientX: 40 + 232 * scale, clientY: 100 + 512 * scale };

    press(canvas, point);
    travel(canvas, point);
    travel(canvas, point);
    release(canvas, point);
    await settleInput();

    expect(sent()).toEqual([touch('down', 232, 512), touch('up', 232, 512)]);
  });

  /**
   * A hand does not stop at our bezel. The travel and the release are watched
   * at the window precisely so a scroll that leaves the phone — or the panel —
   * is still that scroll, pinned to the glass rather than thrown away.
   */
  it('pins the travel and the release to the glass when the hand leaves it', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);

    press(canvas, { clientX: 40 + 232 * scale, clientY: 100 + 800 * scale });
    travel(canvas, { clientX: 40 + 232 * scale, clientY: 0 });
    release(canvas, { clientX: 40 + 600 * scale, clientY: 0 });
    await settleInput();

    expect(sent()).toEqual([touch('down', 232, 800), touch('move', 232, 0), touch('up', 463, 0)]);
  });

  /**
   * A gesture the system took away still put a finger on the device, and that
   * finger must come back up — a DOWN with no UP behind it leaves the app
   * under test holding a press nobody is making. The release that follows the
   * cancel belongs to no gesture and resolves into nothing.
   */
  it('releases where the finger last was when the press is cancelled', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);
    const x = 40 + 232 * scale;

    press(canvas, { clientX: x, clientY: 100 + 800 * scale });
    travel(canvas, { clientX: x, clientY: 100 + 600 * scale });
    act(() => {
      canvas.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }));
    });
    release(canvas, { clientX: x, clientY: 100 + 200 * scale });
    await settleInput();

    expect(sent()).toEqual([
      touch('down', 232, 800),
      touch('move', 232, 600),
      touch('up', 232, 600),
    ]);
  });

  /**
   * ⚠️ The same promise on the other exit: a mirror that goes away mid-drag
   * takes the whole gesture with it. The panel's unmount stops the session —
   * the device-side server dies, and the finger it was pressing dies with it —
   * so nothing further may cross: not a lift into the dead session, and not
   * the release the hand eventually performs, which must never be resolved
   * against whatever session comes next.
   */
  it('sends nothing more once the mirror is gone mid-drag', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);
    const x = 40 + 232 * scale;

    press(canvas, { clientX: x, clientY: 100 + 800 * scale });
    travel(canvas, { clientX: x, clientY: 100 + 600 * scale });
    await settleInput();

    cleanup();
    act(() => {
      window.dispatchEvent(
        new MouseEvent('pointerup', { bubbles: true, clientX: x, clientY: 100 + 200 * scale }),
      );
    });
    await settleInput();

    expect(sent()).toEqual([touch('down', 232, 800), touch('move', 232, 600)]);
  });

  /** A right-click belongs to the command menu alone. The `pointerdown` that
   * precedes `contextmenu` must not also press the app under test — that would
   * change the very screen the menu is about to describe. */
  it('sends no touch for the pointerdown half of a right-click', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);
    const point = { clientX: 40 + 232 * scale, clientY: 100 + 512 * scale };

    // The whole gesture, release included: a right-click that started a drag
    // would come back as a click the moment the button came up.
    press(canvas, point, { button: 2 });
    release(canvas, point);
    await settleInput();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  /** macOS delivers Ctrl+click as a context menu, so its pointerdown is the
   * menu's too. */
  it('sends no touch for a Ctrl+click', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);
    const point = { clientX: 40 + 232 * scale, clientY: 100 + 512 * scale };

    press(canvas, point, { ctrlKey: true });
    release(canvas, point);
    await settleInput();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  /** Criterion 8 — the bezel and the bay gutter are the app, not the phone. */
  it('sends nothing for a click outside the drawn picture', async () => {
    const canvas = await streaming();
    drawAt(canvas);

    press(canvas, { clientX: 10, clientY: 10 });
    release(canvas, { clientX: 10, clientY: 10 });
    await settleInput();

    expect(conductor.mirrorInput).not.toHaveBeenCalled();
  });

  /**
   * The near end is what decides, and it decides the same way live: a press
   * that began in the gutter began on the app, however far it travels onto
   * the phone afterwards — no phase of it ever reaches the device.
   */
  it('sends nothing for a drag that began outside the drawn picture', async () => {
    const canvas = await streaming();
    const scale = drawAt(canvas);

    press(canvas, { clientX: 10, clientY: 10 });
    travel(canvas, { clientX: 40 + 232 * scale, clientY: 100 + 512 * scale });
    release(canvas, { clientX: 40 + 232 * scale, clientY: 100 });
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

  /**
   * A highlight chasing the pointer through a scroll describes a tree the drag
   * is in the middle of invalidating — every box it draws mid-gesture is about
   * an element that has already moved. So the overlay holds still until the
   * gesture lands, and the recapture it triggers re-aims it.
   */
  it('holds the highlight still while a drag is under way', async () => {
    const { canvas, scale } = await inspecting();
    hoverAt(canvas, at(scale, 116, 256));

    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, ...at(scale, 116, 256) }),
      );
    });
    // Off the button and onto the frame behind it — which would retarget the
    // highlight, were the drag not holding it.
    hoverAt(canvas, at(scale, 322, 257));

    expect(screen.getByText('Button · "Entrar"')).toBeInTheDocument();
  });

  it('lets the hover follow the pointer again once the drag is over', async () => {
    const { canvas, scale } = await inspecting();

    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, ...at(scale, 116, 256) }),
      );
      canvas.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, ...at(scale, 116, 256) }));
    });
    hoverAt(canvas, at(scale, 116, 256));

    expect(screen.getByText('Button · "Entrar"')).toBeInTheDocument();
  });

  /**
   * A right-click mid-drag would open a menu about a screen the finger is in
   * the middle of changing — and its commands would drive touches into the
   * live gesture, a second finger the device never saw go down. The drag owns
   * the pointer until it ends.
   */
  it('opens no menu while a drag is under way', async () => {
    const { canvas, scale } = await inspecting();

    act(() => {
      canvas.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, ...at(scale, 116, 256) }),
      );
    });
    await rightClickAt(canvas, at(scale, 116, 256));

    expect(inspect().menu).toBeNull();
    expect(conductor.maestroSynthesizeSelector).not.toHaveBeenCalled();
  });

  /** The label must stay readable at any fit: it counter-scales through
   * `--fit-scale`, which the phone carries for the overlay's CSS. */
  it('hands the overlay the fit scale it must counter', async () => {
    const { scale } = await inspecting();

    expect(screen.getByTestId('phone').style.getPropertyValue('--fit-scale')).toBe(String(scale));
  });

  /** An element at the very top has no room for a label above it: the label
   * flips inside the box instead of clipping out of the screen. */
  it('flips the label inside the box at the top of the screen', async () => {
    const { canvas, scale } = await inspecting();

    // The Button's bounds start at y=0 — no room above.
    hoverAt(canvas, at(scale, 116, 256));

    expect(screen.getByText('Button · "Entrar"')).toHaveAttribute('data-flip', 'true');
  });

  it('keeps the label above the box everywhere else', async () => {
    conductor.maestroSnapshot.mockResolvedValue({
      ok: true,
      data: {
        ...VIEW,
        tree: {
          ...emptyNode,
          children: [
            {
              ...emptyNode,
              bounds: { x1: 0, y1: 1000, x2: 360, y2: 1200 },
              className: 'android.widget.Button',
              text: 'Entrar',
              clickable: true,
              children: [],
            },
          ],
        },
      },
    });
    const { canvas, scale } = await inspecting();

    // Hierarchy y=1100 → stream y=704: far from the top edge.
    hoverAt(canvas, at(scale, 116, 704));

    expect(screen.getByText('Button · "Entrar"')).not.toHaveAttribute('data-flip');
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

  /**
   * The crosshair is a switch now. Off, the mirror is purely a phone: no
   * highlight, no command menu, no crosshair cursor — while driving (taps,
   * keys) keeps working untouched.
   */
  describe('the inspect switch', () => {
    const toggle = async (): Promise<void> => {
      await userEvent.click(screen.getByRole('button', { name: 'Inspect' }));
    };

    it('reads as pressed while on, and unpressed once toggled off', async () => {
      await inspecting();

      const button = screen.getByRole('button', { name: 'Inspect' });
      expect(button).toHaveAttribute('aria-pressed', 'true');

      await toggle();

      expect(button).toHaveAttribute('aria-pressed', 'false');
    });

    it('takes the standing highlight and the crosshair cursor with it', async () => {
      const { canvas, scale } = await inspecting();
      hoverAt(canvas, at(scale, 116, 256));
      expect(screen.getByTestId('inspect-highlight')).toBeInTheDocument();

      await toggle();

      expect(screen.queryByTestId('inspect-highlight')).not.toBeInTheDocument();
      expect(canvas).not.toHaveAttribute('data-inspect');
    });

    it('draws no highlight for a hover while off', async () => {
      const { canvas, scale } = await inspecting();
      await toggle();

      hoverAt(canvas, at(scale, 116, 256));

      expect(screen.queryByTestId('inspect-highlight')).not.toBeInTheDocument();
    });

    it('opens no menu for a right-click while off, still suppressing the native one', async () => {
      const { canvas, scale } = await inspecting();
      await toggle();

      const event = new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        ...at(scale, 116, 256),
      });
      await act(async () => {
        canvas.dispatchEvent(event);
        await Promise.resolve();
      });

      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(conductor.maestroSynthesizeSelector).not.toHaveBeenCalled();
      expect(event.defaultPrevented).toBe(true);
    });

    it('leaves driving alone: a left-click still lands and lifts', async () => {
      const { canvas, scale } = await inspecting();
      await toggle();

      act(() => {
        canvas.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, ...at(scale, 116, 256) }),
        );
        canvas.dispatchEvent(
          new MouseEvent('pointerup', { bubbles: true, ...at(scale, 116, 256) }),
        );
      });
      await settleInput();

      expect(conductor.mirrorInput).toHaveBeenCalledWith('mirror-1', {
        type: 'touch',
        action: 'down',
        x: 116,
        y: 256,
        screenWidth: 464,
        screenHeight: 1024,
      });
      expect(conductor.mirrorInput).toHaveBeenCalledWith('mirror-1', {
        type: 'touch',
        action: 'up',
        x: 116,
        y: 256,
        screenWidth: 464,
        screenHeight: 1024,
      });
    });

    it('puts away the snapshot refresh, which serves nothing while off', async () => {
      await inspecting();
      expect(screen.getByRole('button', { name: 'Refresh snapshot' })).toBeInTheDocument();

      await toggle();

      expect(screen.queryByRole('button', { name: 'Refresh snapshot' })).not.toBeInTheDocument();
    });

    it('hides the updating chip while off', async () => {
      const { canvas } = await inspecting();
      await toggle();
      conductor.maestroSnapshot.mockReturnValueOnce(new Promise(() => {}));

      act(() => {
        inspect().refresh(ANDROID.id);
      });

      expect(canvas).toBeInTheDocument();
      expect(screen.queryByTestId('stale-chip')).not.toBeInTheDocument();
    });

    it('highlights again as soon as it is switched back on', async () => {
      const { canvas, scale } = await inspecting();
      await toggle();
      await toggle();

      hoverAt(canvas, at(scale, 116, 256));

      expect(screen.getByTestId('inspect-highlight')).toBeInTheDocument();
    });
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

  /** Criterion 43 — control is there and the touch is refused anyway. The step
   * is the artifact and the gesture only a convenience, so the step stays
   * written, the refusal surfaces through the control note, and the picture is
   * never touched. This pins the ordering: append first, drive second. */
  it('keeps the appended step when the gesture is refused', async () => {
    const { canvas, scale } = await inspecting();
    conductor.mirrorInput.mockResolvedValue({
      ok: false,
      error: { code: 'mirror/control-failed', message: 'The device refused the touch.' },
    });

    await rightClickAt(canvas, at(scale, 116, 256));
    await screen.findByRole('menu');
    await userEvent.click(screen.getByRole('menuitem', { name: 'tapOn' }));
    await settleInput();

    expect(conductor.mirrorInput).toHaveBeenCalled();
    expect(flow().yaml).toBe(`${FLOW_YAML}- tapOn:\n    text: "Entrar"\n`);
    expect(screen.getByText('The device refused the touch.')).toBeInTheDocument();
    expect(canvas).toBeInTheDocument();
  });
});

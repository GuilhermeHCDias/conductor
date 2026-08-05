import type { ConductorApi, MirrorEvent, PushPayload, Result } from '@shared/ipc';
import { act, render, waitFor } from '@testing-library/react';
import { type JSX, useRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDeviceStore, useDeviceStore } from '../stores/device.store';
import { useMirrorStream } from './useMirrorStream';

/**
 * The one seam mocked is `window.conductor` — plus `VideoDecoder` and the 2D
 * context, which jsdom does not implement at all. Those two are the environment,
 * not a collaborator: stubbing them is the same move `test-setup.ts` already
 * makes for `ResizeObserver` and `matchMedia`.
 *
 * The decode *decisions* are not tested here. They live in `lib/h264.ts`, where
 * they can be driven from real SPS bytes with nothing mounted.
 */

const PHONE = { id: 'R9QYC01EMXL', model: 'SM_G991B', state: 'device' as const };

const START_4 = [0x00, 0x00, 0x00, 0x01];
/** The Galaxy A07's real config packet: High profile, level 3.2 -> avc1.640020. */
const CONFIG_PAYLOAD = new Uint8Array([
  ...START_4,
  0x67,
  0x64,
  0x00,
  0x20,
  0xac,
  0x1b,
  0x1a,
  0x81,
  0xd0,
  0x20,
  0x69,
  0xa8,
  0x08,
  0x08,
  0x08,
  0x3c,
  0x22,
  0x11,
  0xa8,
  ...START_4,
  0x68,
  0xea,
  0x43,
  0xcb,
]);
const IDR_PAYLOAD = new Uint8Array([...START_4, 0x65, 0x88, 0x84]);
const DELTA_PAYLOAD = new Uint8Array([...START_4, 0x41, 0x9a, 0x02]);

/* ── the WebCodecs jsdom does not have ───────────────────────────────────── */

class FakeVideoFrame {
  closed = 0;
  readonly displayWidth: number;
  readonly displayHeight: number;
  constructor(displayWidth = 464, displayHeight = 1024) {
    this.displayWidth = displayWidth;
    this.displayHeight = displayHeight;
  }
  close(): void {
    this.closed += 1;
  }
}

type DecoderRecord = {
  configs: VideoDecoderConfig[];
  chunks: Array<{ type: 'key' | 'delta'; timestamp: number; data: Uint8Array }>;
  closes: number;
  emit: (frame: FakeVideoFrame) => void;
  fail: (error: Error) => void;
};

const decoders: DecoderRecord[] = [];
let contexts: Array<{ drawn: FakeVideoFrame[] }> = [];
/** jsdom's canvas has no 2D context at all; `null` is what it really returns. */
let contextAvailable = true;

function installWebCodecs(): void {
  class FakeEncodedVideoChunk {
    readonly type: 'key' | 'delta';
    readonly timestamp: number;
    readonly data: Uint8Array;
    constructor(init: { type: 'key' | 'delta'; timestamp: number; data: Uint8Array }) {
      this.type = init.type;
      this.timestamp = init.timestamp;
      this.data = new Uint8Array(init.data);
    }
  }

  class FakeVideoDecoder {
    state: 'unconfigured' | 'configured' | 'closed' = 'unconfigured';
    private readonly record: DecoderRecord;

    constructor(init: { output: (frame: FakeVideoFrame) => void; error: (e: Error) => void }) {
      this.record = {
        configs: [],
        chunks: [],
        closes: 0,
        emit: init.output,
        fail: init.error,
      };
      decoders.push(this.record);
    }

    configure(config: VideoDecoderConfig): void {
      this.record.configs.push(config);
      this.state = 'configured';
    }

    decode(chunk: FakeEncodedVideoChunk): void {
      this.record.chunks.push({ type: chunk.type, timestamp: chunk.timestamp, data: chunk.data });
    }

    close(): void {
      this.record.closes += 1;
      this.state = 'closed';
    }
  }

  define('VideoDecoder', FakeVideoDecoder);
  define('EncodedVideoChunk', FakeEncodedVideoChunk);
}

/** jsdom is `globalThis` and `window` at once, so removing it here is what a
 * Chromium without WebCodecs really looks like — the property is absent, not
 * set to `undefined`. */
function removeWebCodecs(): void {
  Reflect.deleteProperty(globalThis, 'VideoDecoder');
  Reflect.deleteProperty(globalThis, 'EncodedVideoChunk');
}

function define(name: string, value: unknown): void {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}

/* ── driving the hook ─────────────────────────────────────────────────────── */

let conductor: {
  deviceList: ReturnType<typeof vi.fn>;
  deviceAppInfo: ReturnType<typeof vi.fn>;
  mirrorStart: ReturnType<typeof vi.fn>;
  mirrorStop: ReturnType<typeof vi.fn>;
  onDeviceChanged: ReturnType<typeof vi.fn>;
  onMirrorEvent: ReturnType<typeof vi.fn>;
};

let listeners: Array<(payload: PushPayload<'mirror:event'>) => void>;
let unsubscribes: number;

/** Renders a canvas and mounts the hook on it, the way the view does. */
function Harness(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  useMirrorStream(canvas);
  return <canvas data-testid="mirror" ref={canvas} />;
}

beforeEach(() => {
  resetDeviceStore();
  decoders.length = 0;
  contexts = [];
  contextAvailable = true;
  listeners = [];
  unsubscribes = 0;
  installWebCodecs();

  HTMLCanvasElement.prototype.getContext = vi.fn(() => {
    if (!contextAvailable) {
      return null;
    }
    const context = { drawn: [] as FakeVideoFrame[] };
    contexts.push(context);
    return {
      drawImage: (frame: FakeVideoFrame) => {
        context.drawn.push(frame);
      },
    };
  }) as unknown as typeof HTMLCanvasElement.prototype.getContext;

  conductor = {
    deviceList: vi.fn(() =>
      Promise.resolve({ ok: true, data: { devices: [], selectedId: null, properties: null } }),
    ),
    deviceAppInfo: vi.fn(() => Promise.resolve({ ok: false, error: { code: 'x', message: 'x' } })),
    mirrorStart: vi.fn(() =>
      Promise.resolve({
        ok: true,
        data: { sessionId: 'mirror-1', codec: 'h264', width: 464, height: 1024 },
      }),
    ),
    mirrorStop: vi.fn(() => Promise.resolve({ ok: true, data: { sessionId: 'mirror-1' } })),
    onDeviceChanged: vi.fn(() => () => {}),
    onMirrorEvent: vi.fn((listener: (payload: PushPayload<'mirror:event'>) => void) => {
      listeners.push(listener);
      return () => {
        unsubscribes += 1;
      };
    }),
  };
  window.conductor = conductor as unknown as ConductorApi;
});

afterEach(() => {
  removeWebCodecs();
});

/** Puts a device on the bench, the way main's snapshot would. */
function selectDevice(id = PHONE.id): void {
  act(() => {
    useDeviceStore.getState().applySnapshot({
      ok: true,
      data: { devices: [{ ...PHONE, id }], selectedId: id, properties: null },
    });
  });
}

const frame = (
  payload: Uint8Array,
  over: Partial<{ config: boolean; keyFrame: boolean; pts: number; sessionId: string }> = {},
): Result<MirrorEvent> => ({
  ok: true,
  data: {
    type: 'frame',
    sessionId: over.sessionId ?? 'mirror-1',
    config: over.config ?? false,
    keyFrame: over.keyFrame ?? false,
    pts: over.pts ?? 0,
    data: payload,
  },
});

function push(payload: Result<MirrorEvent>): void {
  act(() => {
    for (const listener of listeners) {
      listener(payload);
    }
  });
}

/** Mounts and waits for the start round trip main answers. */
async function mount(): Promise<{ unmount: () => void; container: HTMLElement }> {
  const view = render(<Harness />);
  selectDevice();
  await waitFor(() => {
    expect(useDeviceStore.getState().mirrorStatus).toBe('streaming');
  });
  return view;
}

describe('starting and stopping', () => {
  it('asks main for a mirror of the selected device', async () => {
    await mount();

    expect(conductor.mirrorStart).toHaveBeenCalledWith(PHONE.id);
  });

  it('asks for nothing while no device is selected', async () => {
    render(<Harness />);
    await act(async () => {
      await Promise.resolve();
    });

    expect(conductor.mirrorStart).not.toHaveBeenCalled();
  });

  /** Criterion 32 — a listener at 60 fps that outlives its view is a memory
   * leak with a framerate. */
  it('unsubscribes when the view goes away', async () => {
    const view = await mount();

    view.unmount();

    expect(listeners).toHaveLength(1);
    expect(unsubscribes).toBe(1);
  });

  /** Criterion 41 — the session belongs to the view, so it ends with it. */
  it('stops the session when the view goes away', async () => {
    const view = await mount();

    view.unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(conductor.mirrorStop).toHaveBeenCalledWith('mirror-1');
  });

  it('starts a new session when the person picks another device', async () => {
    await mount();

    selectDevice('emulator-5554');
    await waitFor(() => {
      expect(conductor.mirrorStart).toHaveBeenCalledTimes(2);
    });

    expect(conductor.mirrorStart).toHaveBeenLastCalledWith('emulator-5554');
  });
});

/** Criterion 43 — an explicit state, never a blank canvas. */
describe('a renderer with no WebCodecs', () => {
  it('says so rather than showing an empty bezel', async () => {
    removeWebCodecs();
    render(<Harness />);
    selectDevice();

    await waitFor(() => {
      expect(useDeviceStore.getState().mirrorStatus).toBe('unsupported');
    });
  });

  it('asks main for no stream it could never draw', async () => {
    removeWebCodecs();
    render(<Harness />);
    selectDevice();
    await act(async () => {
      await Promise.resolve();
    });

    expect(conductor.mirrorStart).not.toHaveBeenCalled();
  });
});

describe('decoding', () => {
  /** Criteria 34 and 35 — the codec string comes off the SPS, and the absence of
   * a `description` is what says the bitstream is Annex-B. */
  it('configures the decoder from the config packet', async () => {
    await mount();

    push(frame(CONFIG_PAYLOAD, { config: true }));

    expect(decoders[0]?.configs).toEqual([{ codec: 'avc1.640020', optimizeForLatency: true }]);
  });

  it('never hands the config packet to the decoder as a frame', async () => {
    await mount();

    push(frame(CONFIG_PAYLOAD, { config: true }));

    expect(decoders[0]?.chunks).toEqual([]);
  });

  it('decodes a key frame as key and the rest as delta', async () => {
    await mount();
    push(frame(CONFIG_PAYLOAD, { config: true }));

    push(frame(IDR_PAYLOAD, { keyFrame: true, pts: 652021984203 }));
    push(frame(DELTA_PAYLOAD, { pts: 652022017536 }));

    expect(decoders[0]?.chunks.map(({ type, timestamp }) => ({ type, timestamp }))).toEqual([
      { type: 'key', timestamp: 652021984203 },
      { type: 'delta', timestamp: 652022017536 },
    ]);
  });

  /**
   * With no `description`, WebCodecs reads SPS and PPS from the bitstream
   * itself, and scrcpy sends them only in the config packet. A key frame handed
   * over bare decodes to nothing — silently, no error and no output, a mirror
   * that streams and stays black. So the config packet rides in front of every
   * key frame.
   */
  it('puts the parameter sets in front of every key frame', async () => {
    await mount();
    push(frame(CONFIG_PAYLOAD, { config: true }));

    push(frame(IDR_PAYLOAD, { keyFrame: true }));

    expect(decoders[0]?.chunks[0]?.data).toEqual(
      new Uint8Array([...CONFIG_PAYLOAD, ...IDR_PAYLOAD]),
    );
  });

  it('hands delta frames over untouched', async () => {
    await mount();
    push(frame(CONFIG_PAYLOAD, { config: true }));
    push(frame(IDR_PAYLOAD, { keyFrame: true }));

    push(frame(DELTA_PAYLOAD));

    expect(decoders[0]?.chunks[1]?.data).toEqual(DELTA_PAYLOAD);
  });

  /** After an encoder reset the stream carries new parameter sets; a key frame
   * must travel with the ones that describe it, not the ones before. */
  it('fronts a key frame with the latest config packet', async () => {
    const reconfigured = new Uint8Array([...START_4, 0x67, 0x42, 0xc0, 0x1e]);
    await mount();
    push(frame(CONFIG_PAYLOAD, { config: true }));
    push(frame(IDR_PAYLOAD, { keyFrame: true }));

    push(frame(reconfigured, { config: true }));
    push(frame(IDR_PAYLOAD, { keyFrame: true }));

    expect(decoders[0]?.chunks[1]?.data).toEqual(new Uint8Array([...reconfigured, ...IDR_PAYLOAD]));
  });

  /** A decoder that has never been configured throws on `decode`. The stream
   * always opens with a config packet, so this only happens to a late joiner. */
  it('drops frames that arrive before the decoder is configured', async () => {
    await mount();

    push(frame(IDR_PAYLOAD, { keyFrame: true }));

    expect(decoders[0]?.chunks).toEqual([]);
  });

  it('reconfigures when a second config packet arrives', async () => {
    await mount();
    push(frame(CONFIG_PAYLOAD, { config: true }));

    push(frame(new Uint8Array([...START_4, 0x67, 0x42, 0xc0, 0x1e]), { config: true }));

    expect(decoders[0]?.configs.map((config) => config.codec)).toEqual([
      'avc1.640020',
      'avc1.42c01e',
    ]);
  });

  it('survives a config packet with no SPS in it', async () => {
    await mount();

    push(frame(new Uint8Array([...START_4, 0x68, 0xcb]), { config: true }));

    expect(decoders[0]?.configs).toEqual([]);
  });
});

/** Criterion 36 — every frame closed, and the decoder closed on unmount. An
 * unclosed `VideoFrame` holds a GPU buffer and stalls the decoder within
 * seconds. */
describe('the frames it draws', () => {
  it('draws each one onto the canvas', async () => {
    await mount();
    const decoded = new FakeVideoFrame();

    act(() => {
      decoders[0]?.emit(decoded);
    });

    expect(contexts[0]?.drawn).toEqual([decoded]);
  });

  it('closes every frame it draws', async () => {
    await mount();
    const decoded = new FakeVideoFrame();

    act(() => {
      decoders[0]?.emit(decoded);
    });

    expect(decoded.closed).toBe(1);
  });

  it('closes a frame it could not draw', async () => {
    contextAvailable = false;
    await mount();
    const decoded = new FakeVideoFrame();

    act(() => {
      decoders[0]?.emit(decoded);
    });

    expect(decoded.closed).toBe(1);
  });

  it('closes the decoder when the view goes away', async () => {
    const view = await mount();

    view.unmount();

    expect(decoders[0]?.closes).toBe(1);
  });
});

/**
 * A rotation swaps the stream's size mid-session. Only the SPS announces it and
 * only the decoded frames carry it — the codec header spoke once, at the start.
 * The canvas must follow the frames, or a landscape picture lands cropped
 * inside a portrait bitmap and stays there.
 */
describe('a stream that changes size', () => {
  it('resizes the canvas to the frame before drawing it', async () => {
    const view = await mount();
    const canvasEl = view.container.querySelector('canvas');

    act(() => {
      decoders[0]?.emit(new FakeVideoFrame(1024, 464));
    });

    expect(canvasEl?.width).toBe(1024);
    expect(canvasEl?.height).toBe(464);
  });

  it('tells the store the stream it is showing changed size', async () => {
    await mount();

    act(() => {
      decoders[0]?.emit(new FakeVideoFrame(1024, 464));
    });

    expect(useDeviceStore.getState()).toMatchObject({ mirrorWidth: 1024, mirrorHeight: 464 });
  });

  /** Criterion 42 — a frame that changes nothing must cost nothing: a store
   * write per frame would re-render the window at the phone's framerate. */
  it('leaves the store alone while the size holds', async () => {
    await mount();
    act(() => {
      decoders[0]?.emit(new FakeVideoFrame(1024, 464));
    });
    const before = useDeviceStore.getState();

    act(() => {
      decoders[0]?.emit(new FakeVideoFrame(1024, 464));
    });

    expect(useDeviceStore.getState()).toBe(before);
  });
});

describe('a session that ends on its own', () => {
  /** Criterion 25 — back to a disconnected state, not stalled on the last frame. */
  it('tells the store which session died and why', async () => {
    await mount();

    push({
      ok: true,
      data: {
        type: 'ended',
        sessionId: 'mirror-1',
        code: 'mirror/device-lost',
        message: 'The device closed the mirror stream.',
      },
    });

    expect(useDeviceStore.getState()).toMatchObject({
      mirrorStatus: 'failed',
      mirrorError: { code: 'mirror/device-lost' },
    });
  });

  it('reports a decoder that refused the stream', async () => {
    await mount();

    act(() => {
      decoders[0]?.fail(new Error('Unsupported configuration'));
    });

    expect(useDeviceStore.getState()).toMatchObject({
      mirrorStatus: 'failed',
      mirrorError: { code: 'mirror/decode-failed' },
    });
  });
});

/**
 * Criterion 42, and the reason the store has no frame in it: a picture arriving
 * 30 times a second must not touch state that anything else selects from.
 */
describe('what a frame costs', () => {
  it('leaves the store exactly as it found it', async () => {
    await mount();
    push(frame(CONFIG_PAYLOAD, { config: true }));
    const before = useDeviceStore.getState();

    for (let index = 0; index < 30; index += 1) {
      push(frame(DELTA_PAYLOAD, { pts: index }));
    }

    expect(useDeviceStore.getState()).toBe(before);
  });
});

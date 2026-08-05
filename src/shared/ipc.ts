import { z } from 'zod';

/**
 * The single IPC contract: channel names, one Zod schema per channel payload,
 * the `Result` union, and the `ConductorApi` type derived from them. Main
 * imports the schemas to validate; the preload implements `ConductorApi`; the
 * renderer imports types only.
 */

/** `<domain>:<action>`, kebab-case. Declared here and nowhere else. */
export const CHANNELS = {
  appInfo: 'app:info',
  configGet: 'config:get',
  deviceList: 'device:list',
  deviceAppInfo: 'device:app-info',
  mirrorStart: 'mirror:start',
  mirrorStop: 'mirror:stop',
  mirrorInput: 'mirror:input',
} as const;

/** Channels main pushes on. They read as events, and carry the same `Result`
 * an invoke would: an adb that vanished mid-session has to reach the UI with
 * its stable code whether the renderer asked just then or not. */
export const PUSH_CHANNELS = {
  deviceChanged: 'device:changed',
  mirrorEvent: 'mirror:event',
} as const;

/** Channels that take no request payload still validate their argument list. */
const noArguments = z.tuple([]);

const appInfoResponse = z.object({
  appVersion: z.string(),
  electronVersion: z.string(),
  chromeVersion: z.string(),
  nodeVersion: z.string(),
  platform: z.string(),
});

/** The shape of `CONFIG` as it crosses to the sandboxed renderer, which has
 * no `process.env` of its own (.context.md §2). */
const configGetResponse = z.object({
  APP_ID: z.string(),
  REPO_URL: z.string(),
  REPO_BASE_BRANCH: z.string(),
  FLOWS_DIR: z.string(),
  FLOW_EXTENSIONS: z.array(z.string()).readonly(),
});

/**
 * What `adb devices -l` reports about a device. `unauthorized` is its own
 * condition, not a flavour of absent: the phone is right there, and the person
 * has an RSA prompt to accept on it.
 */
const deviceState = z.enum(['device', 'unauthorized', 'offline']);

const device = z.object({
  /** Opaque above `AdbBridge` — a serial today, whatever a remote runner hands
   * back tomorrow (.context.md §10.1). Nothing parses it. */
  id: z.string(),
  /** `model:` from `adb devices -l`, or `null` when it was not reported. */
  model: z.string().nullable(),
  state: deviceState,
});

/** Everything read off the selected device. `null` is "not reported" — never a
 * substituted default (.context.md §5.2). */
const deviceProperties = z.object({
  model: z.string().nullable(),
  /** The Android release, as `ro.build.version.release` prints it: `14`. */
  release: z.string().nullable(),
  size: z.object({ width: z.number().int(), height: z.number().int() }).nullable(),
  density: z.number().int().nullable(),
});

const deviceSnapshot = z.object({
  devices: z.array(device).readonly(),
  /** Set only when exactly one device is usable; the person picks otherwise. */
  selectedId: z.string().nullable(),
  /** Of the selected device. `null` when none is selected. */
  properties: deviceProperties.nullable(),
});

/** The app under test, identified by `CONFIG.APP_ID` and nothing else. */
const appIdentity = z.object({
  appId: z.string(),
  installed: z.boolean(),
  /** `versionName` from `dumpsys package`, or `null` when the field is absent. */
  versionName: z.string().nullable(),
  running: z.boolean(),
  /** `null` when the device's `dumpsys` carries no marker we recognise. */
  foreground: z.boolean().nullable(),
});

/**
 * Criterion 28. What `mirror:start` answers with, and all it answers with: the
 * session to stop later, and the size the canvas takes from the stream's own
 * codec header. The handler returns this the moment the device declares it and
 * never waits on a frame — long work is streamed, never awaited.
 */
const mirrorStream = z.object({
  sessionId: z.string(),
  /** As the stream declared it, from the codec header: `h264`. */
  codec: z.string(),
  width: z.number().int(),
  height: z.number().int(),
  /**
   * Criterion 4. Whether this session can be driven as well as watched. A
   * picture without control is a real state rather than a failure — the panel
   * shows the phone and offers no tap target, instead of ending the session over
   * a capability the person may not need every time.
   */
  control: z.boolean(),
});

/** Names the session an answer is about, and nothing else. Shared by every
 * channel whose reply is just "that one" — `mirror:stop` and `mirror:input`. */
const mirrorSessionRef = z.object({ sessionId: z.string() });

/** The named keys criterion 12 routes as keycodes rather than as text. Android's
 * own numbers stay in main: the renderer names the key, `SCRCPY_KEYCODES` maps
 * it, and nothing above the Gateway learns what 67 means. */
const mirrorKey = z.enum([
  'backspace',
  'enter',
  'tab',
  'escape',
  'delete',
  'arrow-up',
  'arrow-down',
  'arrow-left',
  'arrow-right',
]);

/** `INJECT_TEXT_MAX_LENGTH` in scrcpy-server 3.3.4, read out of the pinned jar.
 * Counted in **UTF-8 bytes** — it is the buffer the server allocates, not a
 * character budget, so every layer that enforces it measures encoded length. */
export const MAX_INPUT_TEXT_LENGTH = 300;

/** What the wire counts. `String.length` counts UTF-16 code units, which is a
 * different number for anything outside ASCII. */
function textByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** A u16 on the wire, and a stream is never zero-sized. */
const streamAxis = z.number().int().positive().max(65_535);

/**
 * Criterion 6. One tap is a touch-down and a touch-up at one point, so the
 * renderer asks for the gesture and main expands it into the pair — a round trip
 * per half would let the two straddle a session change.
 *
 * ⚠️ It carries the stream size it was aimed at because scrcpy's `PositionMapper`
 * silently drops a touch whose declared size is not the video's current one, and
 * after a rotation the renderer holds the only fresh size (main's is the codec
 * header's, and that never changes again).
 */
const mirrorTap = z
  .object({
    type: z.literal('tap'),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    screenWidth: streamAxis,
    screenHeight: streamAxis,
  })
  .refine((tap) => tap.x < tap.screenWidth && tap.y < tap.screenHeight, {
    message: 'The tap is outside the stream it names.',
  });

const mirrorInput = z.union([
  mirrorTap,
  z.object({
    type: z.literal('text'),
    text: z
      .string()
      .min(1)
      .refine((text) => textByteLength(text) <= MAX_INPUT_TEXT_LENGTH, {
        message: `Text is past the ${MAX_INPUT_TEXT_LENGTH} bytes the server will read.`,
      }),
  }),
  z.object({ type: z.literal('key'), key: mirrorKey }),
  z.object({ type: z.literal('back') }),
]);

/**
 * Criterion 29. The payload crosses as bytes, never as a path: the device may
 * share no filesystem with us today and no machine at all tomorrow (§10.1
 * rule 2). Electron's structured clone carries a `Uint8Array` natively.
 */
const mirrorFrame = z.object({
  type: z.literal('frame'),
  sessionId: z.string(),
  /** Carries SPS and PPS. It configures the decoder and is never drawn. */
  config: z.boolean(),
  keyFrame: z.boolean(),
  /** Microseconds, from the low 62 bits of the frame header. */
  pts: z.number(),
  // A predicate rather than `z.instanceof`: the latter pins the backing buffer
  // to `ArrayBuffer`, and a view whose buffer came from elsewhere is still the
  // bytes we asked for.
  data: z.custom<Uint8Array>((value) => value instanceof Uint8Array),
});

/**
 * Criterion 25. A session that ended, and why. It travels as an event rather
 * than as an `ok: false` because the subscription did not fail — the session
 * did, and the renderer needs to know *which* one to put away.
 */
const mirrorEnded = z.object({
  type: z.literal('ended'),
  sessionId: z.string(),
  code: z.string(),
  message: z.string(),
});

const mirrorEvent = z.discriminatedUnion('type', [mirrorFrame, mirrorEnded]);

export const IPC = {
  [CHANNELS.appInfo]: { request: noArguments, response: appInfoResponse },
  [CHANNELS.configGet]: { request: noArguments, response: configGetResponse },
  [CHANNELS.deviceList]: { request: noArguments, response: deviceSnapshot },
  [CHANNELS.deviceAppInfo]: { request: z.tuple([z.string()]), response: appIdentity },
  [CHANNELS.mirrorStart]: { request: z.tuple([z.string()]), response: mirrorStream },
  [CHANNELS.mirrorStop]: { request: z.tuple([z.string()]), response: mirrorSessionRef },
  [CHANNELS.mirrorInput]: {
    request: z.tuple([z.string(), mirrorInput]),
    response: mirrorSessionRef,
  },
} as const;

/** Push payloads, by channel. Same schemas, travelling the other way. */
export const PUSH = {
  [PUSH_CHANNELS.deviceChanged]: deviceSnapshot,
  [PUSH_CHANNELS.mirrorEvent]: mirrorEvent,
} as const;

export type Channel = keyof typeof IPC;
export type Request<C extends Channel> = z.infer<(typeof IPC)[C]['request']>;
export type Response<C extends Channel> = z.infer<(typeof IPC)[C]['response']>;

export type PushChannel = keyof typeof PUSH;
export type PushPayload<C extends PushChannel> = Result<z.infer<(typeof PUSH)[C]>>;

export type DeviceState = z.infer<typeof deviceState>;
export type Device = z.infer<typeof device>;
export type DeviceProperties = z.infer<typeof deviceProperties>;
export type DeviceSnapshot = z.infer<typeof deviceSnapshot>;
export type AppIdentity = z.infer<typeof appIdentity>;
export type MirrorStream = z.infer<typeof mirrorStream>;
export type MirrorFrame = z.infer<typeof mirrorFrame>;
export type MirrorEvent = z.infer<typeof mirrorEvent>;
export type MirrorKey = z.infer<typeof mirrorKey>;
export type MirrorTap = z.infer<typeof mirrorTap>;
export type MirrorInput = z.infer<typeof mirrorInput>;

/**
 * Expected failures cross the boundary as values, not exceptions: Electron
 * strips custom fields from rejected `invoke`s, and the doctor UX needs stable
 * `code`s to tell one failure from another. Throwing is reserved for bugs.
 */
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

/** Stable failure codes. The doctor tells one from another by `code`, so these
 * are part of the contract and are declared where the channels are. */
export const ERROR_CODES = {
  adbNotFound: 'device/adb-not-found',
  adbFailed: 'device/adb-failed',
  deviceNotFound: 'device/not-found',
  /**
   * The `maestro mcp` session, which is where the view hierarchy comes from.
   * These said `viewer/` while that child existed to open the Maestro Viewer;
   * nothing opens one now, and a prefix naming a feature the app no longer has
   * is a code that means nothing to whoever reads it next.
   */
  maestroNotFound: 'mcp/maestro-not-found',
  mcpStartFailed: 'mcp/start-failed',
  mcpHandshakeTimeout: 'mcp/handshake-timeout',
  mcpToolMissing: 'mcp/tool-missing',
  mcpCallFailed: 'mcp/call-failed',
  /** `inspect_screen` answered with something that is not the documented shape.
   * A tool's schema carries no version contract the way a released CLI
   * subcommand does, so this is where a server that changed shape surfaces —
   * loudly, rather than as a best-guess tree. */
  hierarchyParseFailed: 'hierarchy/parse-failed',
  /** `screencap` ran and produced nothing usable. Its own code, not `adb`'s:
   * "no adb" is a prerequisite the doctor can fix and this is not. */
  captureFailed: 'capture/failed',
  /** The server could not be pushed, forwarded, started or connected to. */
  mirrorStartFailed: 'mirror/start-failed',
  /** The stream ended inside the dummy byte, the device name or the codec
   * header. Its own code because that prefix is strict and its failure looks
   * nothing like a mid-stream one. */
  mirrorHandshakeFailed: 'mirror/handshake-failed',
  /** The wire said something impossible — a packet longer than the ceiling. */
  mirrorProtocolFailed: 'mirror/protocol-failed',
  /** The phone went away mid-session. The inspector goes back to disconnected
   * rather than stalling on the last frame it drew. */
  mirrorDeviceLost: 'mirror/device-lost',
  /** A stop naming a session that is already gone. */
  mirrorSessionNotFound: 'mirror/session-not-found',
  /**
   * Criterion 16. The control socket refused, died, or would not take a message.
   * Its own code because the picture is untouched: the panel puts the tap target
   * away and keeps showing the phone, rather than reading this as the stream
   * ending the way `mirror/device-lost` means it.
   */
  mirrorControlFailed: 'mirror/control-failed',
  /** WebCodecs refused the stream. The renderer's only failure of the set — the
   * bytes arrived, and this Chromium would not decode them. */
  mirrorDecodeFailed: 'mirror/decode-failed',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** One named function per channel — the whole surface of `window.conductor`. */
export interface ConductorApi {
  appInfo: (...args: Request<'app:info'>) => Promise<Result<Response<'app:info'>>>;
  configGet: (...args: Request<'config:get'>) => Promise<Result<Response<'config:get'>>>;
  deviceList: (...args: Request<'device:list'>) => Promise<Result<Response<'device:list'>>>;
  deviceAppInfo: (
    ...args: Request<'device:app-info'>
  ) => Promise<Result<Response<'device:app-info'>>>;
  mirrorStart: (...args: Request<'mirror:start'>) => Promise<Result<Response<'mirror:start'>>>;
  mirrorStop: (...args: Request<'mirror:stop'>) => Promise<Result<Response<'mirror:stop'>>>;
  /** Criterion 5 and §9.3: input crosses as a named function with typed fields,
   * never as raw `ipcRenderer` and never as a composed string. */
  mirrorInput: (...args: Request<'mirror:input'>) => Promise<Result<Response<'mirror:input'>>>;
  /** Returns its own unsubscribe — a listener at poll rate that outlives its
   * view is a memory leak on a timer. */
  onDeviceChanged: (listener: (payload: PushPayload<'device:changed'>) => void) => () => void;
  /** Criterion 32. Same rule, and it bites harder here: this one fires 30 times
   * a second, so a listener left behind is a memory leak with a framerate. */
  onMirrorEvent: (listener: (payload: PushPayload<'mirror:event'>) => void) => () => void;
}

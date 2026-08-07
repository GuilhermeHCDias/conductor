import { z } from 'zod';
import type { FlowIndex, FlowMeta, RunEvent, SnapshotView, TreeNode } from './types';

/**
 * The single IPC contract: channel names, one Zod schema per channel payload,
 * the `Result` union, and the `ConductorApi` type derived from them. Main
 * imports the schemas to validate; the preload implements `ConductorApi`; the
 * renderer imports types only.
 */

/** `<domain>:<action>`, kebab-case. Declared here and nowhere else. */
export const CHANNELS = {
  appInfo: 'app:info',
  appReadClipboard: 'app:read-clipboard',
  appWriteClipboard: 'app:write-clipboard',
  configGet: 'config:get',
  repoList: 'repo:list',
  repoResolve: 'repo:resolve',
  repoConnect: 'repo:connect',
  repoSwitch: 'repo:switch',
  deviceList: 'device:list',
  deviceAppInfo: 'device:app-info',
  mirrorStart: 'mirror:start',
  mirrorStop: 'mirror:stop',
  mirrorInput: 'mirror:input',
  maestroSnapshot: 'maestro:snapshot',
  maestroSynthesizeSelector: 'maestro:synthesize-selector',
  runStart: 'run:start',
  runCancel: 'run:cancel',
  flowList: 'flow:list',
  flowRead: 'flow:read',
  flowSave: 'flow:save',
  flowCreate: 'flow:create',
  flowCreateFolder: 'flow:create-folder',
  flowRename: 'flow:rename',
  flowRenameFolder: 'flow:rename-folder',
  flowDuplicate: 'flow:duplicate',
  flowDelete: 'flow:delete',
  flowDeleteFolder: 'flow:delete-folder',
  publishStatus: 'publish:status',
  publishDescribe: 'publish:describe',
  publishSend: 'publish:send',
  publishCancel: 'publish:cancel',
  publishOpenPr: 'publish:open-pr',
} as const;

/** Channels main pushes on. They read as events, and carry the same `Result`
 * an invoke would: an adb that vanished mid-session has to reach the UI with
 * its stable code whether the renderer asked just then or not. */
export const PUSH_CHANNELS = {
  deviceChanged: 'device:changed',
  mirrorEvent: 'mirror:event',
  runEvent: 'run:event',
  flowChanged: 'flow:changed',
  repoChanged: 'repo:changed',
  repoResolveEvent: 'repo:resolve-event',
  publishChanged: 'publish:changed',
  publishEvent: 'publish:event',
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
 * no `process.env` of its own (.context.md §2) — only true constants: the app
 * under test is runtime state derived from the active repo, never here
 * (§12.6). */
const configGetResponse = z.object({
  REPO_BASE_BRANCH: z.string(),
  FLOWS_DIR: z.string(),
  FLOW_EXTENSIONS: z.array(z.string()).readonly(),
});

/**
 * §2.1 — the app under test, as derived from the active repo's `app.json`.
 * The two ids may legitimately diverge, so the model carries both sides from
 * the start; a side the config does not declare is `null`, never absent.
 */
const repoAppId = z.object({
  android: z.string().nullable(),
  ios: z.string().nullable(),
});

/**
 * What resolution derived from the clone — everything the found card shows
 * (§2.1). `branch` is the clone's checked-out branch, `null` when it could
 * not be read; `flowCount` counts real flows under `conductor/` by the same
 * §7.1 classification the index uses, and zero is "empty for now", never a
 * failure.
 */
const resolvedRepo = z.object({
  url: z.string(),
  org: z.string(),
  name: z.string(),
  appName: z.string(),
  appId: repoAppId,
  branch: z.string().nullable(),
  flowCount: z.number().int().nonnegative(),
});

/** A connected repo: the resolved facts plus the slug main derived from
 * sanitized `org/name` (§7) and the moment it joined the list. */
const connectedRepo = resolvedRepo.extend({
  slug: z.string(),
  connectedAt: z.string(),
});

/** The whole projection the renderer holds. Main owns the truth — the list
 * and the active repo live in `userData`, never renderer-side (§2.1). */
const repoState = z.object({
  repos: z.array(connectedRepo).readonly(),
  /** The active repo's slug, or `null` before the first connect. */
  active: z.string().nullable(),
});

const resolveId = z.number().int().nonnegative();

/** Names the resolution an answer or an event is about. What `repo:resolve`
 * gives back is deliberately only this — progress is pushed, never awaited. */
const repoResolveRef = z.object({ resolveId });

/**
 * Resolution progress, as pushes. The three steps are real stages — clone,
 * read `app.json`, scan `conductor/` — and `step` is how many completed, so
 * it advances 0→3 as work actually finishes, never on a timer. A failure is
 * an event rather than an `ok: false` for `mirror:event`'s reason: the
 * subscription did not fail, the named resolution did — and the renderer
 * needs to know which one.
 */
const repoResolveEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('step'), resolveId, step: z.number().int().min(0).max(3) }),
  z.object({ kind: z.literal('found'), resolveId, repo: resolvedRepo }),
  z.object({ kind: z.literal('failed'), resolveId, code: z.string(), message: z.string() }),
]);

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

/** The app under test, identified by the active repo's appId (§2.1) and
 * nothing else. */
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
 * per half would let the two straddle a session change. The long press and the
 * double tap are the same shape expanded the same way, timing included: nothing
 * above the Gateway learns what a long press is made of.
 *
 * ⚠️ Every touch carries the stream size it was aimed at because scrcpy's
 * `PositionMapper` silently drops a touch whose declared size is not the
 * video's current one, and after a rotation the renderer holds the only fresh
 * size (main's is the codec header's, and that never changes again).
 */
const touchFields = {
  x: z.number().int().nonnegative(),
  y: z.number().int().nonnegative(),
  screenWidth: streamAxis,
  screenHeight: streamAxis,
} as const;

type TouchLike = { x: number; y: number; screenWidth: number; screenHeight: number };

const insideStream = (touch: TouchLike): boolean =>
  touch.x < touch.screenWidth && touch.y < touch.screenHeight;

const outsideStream = { message: 'The touch is outside the stream it names.' };

const mirrorTap = z
  .object({ type: z.literal('tap'), ...touchFields })
  .refine(insideStream, outsideStream);

const mirrorLongPress = z
  .object({ type: z.literal('long-press'), ...touchFields })
  .refine(insideStream, outsideStream);

const mirrorDoubleTap = z
  .object({ type: z.literal('double-tap'), ...touchFields })
  .refine(insideStream, outsideStream);

/**
 * One phase of the live drag: the finger lands, travels, lifts — and each
 * crossing happens while the hand is still mid-gesture, because following the
 * hand is the point. No composed form could carry a drag in real time: when
 * the DOWN must already be on the device, the far end does not exist yet. The
 * ordering the composed gestures got for free from arriving whole, the drag
 * gets from the store's send queue — nothing overtakes anything there.
 */
const mirrorTouch = z
  .object({
    type: z.literal('touch'),
    action: z.enum(['down', 'move', 'up']),
    ...touchFields,
  })
  .refine(insideStream, outsideStream);

const mirrorInput = z.union([
  mirrorTap,
  mirrorLongPress,
  mirrorDoubleTap,
  mirrorTouch,
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

/** `[x1,y1][x2,y2]` as numbers. Negative coordinates are real — an element can
 * sit partly off-screen — so only integrality is enforced. */
const bounds = z.object({
  x1: z.number().int(),
  y1: z.number().int(),
  x2: z.number().int(),
  y2: z.number().int(),
});

/**
 * The recursive tree, spelled to match `TreeNode` exactly — `z.lazy` because a
 * node's children are nodes. Typed explicitly so a drift between this schema
 * and the shared type is a compile error here, not a runtime surprise in a
 * handler.
 */
const treeNode: z.ZodType<TreeNode> = z.lazy(() =>
  z.object({
    bounds: bounds.nullable(),
    className: z.string().nullable(),
    text: z.string().nullable(),
    resourceId: z.string().nullable(),
    contentDescription: z.string().nullable(),
    hintText: z.string().nullable(),
    scrollable: z.boolean().nullable(),
    clickable: z.boolean().nullable(),
    enabled: z.boolean().nullable(),
    focused: z.boolean().nullable(),
    selected: z.boolean().nullable(),
    checked: z.boolean().nullable(),
    children: z.array(treeNode).readonly(),
  }),
);

/** Criterion 6 rides in the shape itself: there is no field for the
 * screenshot's bytes, so they cannot cross by accident. */
const snapshotView: z.ZodType<SnapshotView> = z.object({
  snapshotId: z.string(),
  tree: treeNode,
  screenshotWidth: z.number().int().positive(),
  screenshotHeight: z.number().int().positive(),
  scale: z.number().positive(),
});

/** The node a synthesis is about: its path of child indices in the snapshot's
 * tree — the renderer hit-tested it there, and main resolves the same path
 * against the same tree (criterion 5). */
const treePath = z.array(z.number().int().nonnegative()).readonly();

/** §5.4's ladder, named rung by rung. `point` is the last resort and the only
 * fragile one — criterion 27 makes warning about it mandatory. */
const selectorLevel = z.enum(['id', 'text', 'text-index', 'relational', 'point']);

/**
 * Criterion 35. What `SelectorSynth` answers with: the rung it stopped on, the
 * selector as a YAML fragment (relatively indented — `lib/command-templates`
 * re-homes it under whichever command the person picks), and whether §5.4
 * obliges the UI to warn before it is written.
 */
const synthesizedSelector = z.object({
  level: selectorLevel,
  selector: z.string(),
  fragile: z.boolean(),
});

/** Names the run an answer or an event is about. What `run:start` gives back
 * is deliberately only this — progress is pushed, never awaited (criterion 1). */
const runRef = z.object({ runId: z.string() });

/** Criterion 7's vocabulary — see `RunOutcome` in `shared/types.ts`. */
const runOutcome = z.enum(['passed', 'failed', 'canceled', 'error']);

/**
 * Criterion 6. Typed explicitly so a drift between this schema and the shared
 * `RunEvent` is a compile error here, the way `treeNode` pins `TreeNode`.
 */
const runEvent: z.ZodType<RunEvent> = z.discriminatedUnion('type', [
  z.object({ type: z.literal('started'), runId: z.string() }),
  z.object({ type: z.literal('step-started'), runId: z.string(), label: z.string() }),
  z.object({ type: z.literal('step-passed'), runId: z.string(), label: z.string() }),
  z.object({ type: z.literal('step-failed'), runId: z.string(), label: z.string() }),
  z.object({ type: z.literal('log'), runId: z.string(), lines: z.array(z.string()).readonly() }),
  z.object({
    type: z.literal('finished'),
    runId: z.string(),
    outcome: runOutcome,
    message: z.string().nullable(),
  }),
]);

/**
 * A flow's identity — its path relative to `conductor/`, which legitimately
 * carries `/` (§7.2). Deliberately just a string here: refusal happens in main
 * by *resolving* against the root (§9.3), and it answers with a stable
 * `flow/…` code the sidebar's states are built from — never a schema error
 * (criterion 5). The same goes for typed names: an empty or separator-carrying
 * name earns `flow/invalid-name`, so the schema must let it through.
 */
const flowPathArgument = z.string();

/** One index entry, pinned to the shared `FlowMeta` the way `treeNode` pins
 * `TreeNode` — a drift is a compile error here. */
const flowMeta: z.ZodType<FlowMeta> = z.object({
  path: z.string(),
  name: z.string(),
  folder: z.string(),
  commandCount: z.number().int().nonnegative(),
  hash: z.string(),
});

/** Criterion 2's answer and criterion 4's push — metadata only, never file
 * bodies (the editor pulls those over `flow:read`). */
const flowIndex: z.ZodType<FlowIndex> = z.object({
  flows: z.array(flowMeta).readonly(),
  folders: z.array(z.string()).readonly(),
});

/** Names the flow an answer is about — where it lives now, after a save,
 * create, rename, duplicate, or where it lived until a delete. */
const flowRef = z.object({ path: z.string() });

/** The folder-shaped twin. */
const flowFolderRef = z.object({ folder: z.string() });

/** What happened to a file since the last send — the sheet's whole vocabulary
 * (criterion 8). A rename crosses as its Added/Deleted pair, never as a kind
 * of its own: two rows the person can read, not one they cannot. */
const publishChangeKind = z.enum(['added', 'changed', 'deleted']);

/** One unsent change (criterion 5): the path relative to `conductor/` — the
 * flow identity of §7.2 — and what happened to it. Never a diff, never file
 * bodies: the sheet lists, it does not review (§8.5). */
const publishChange = z.object({
  path: z.string(),
  kind: publishChangeKind,
});

/**
 * The whole publish projection (criteria 1–3): what the toolbar control and
 * the sheet derive every state from. The PR's number and URL deliberately
 * never cross — rule 24 keeps them off the screen, and criterion 27 has main
 * open the stored URL itself, so the renderer holds only "a review is open".
 */
const publishState = z
  .object({
    changes: z.array(publishChange).readonly(),
    reviewOpen: z.boolean(),
  })
  .strict();

/** Names a describe or send job. One numbering for both kinds, so a cancel
 * names either (decision: `publish:cancel` serves both). */
const publishJobId = z.number().int().nonnegative();

/**
 * Publish progress, as pushes. The describe result is an event rather than the
 * invoke's answer because the job outlives the handler (criterion 10); its
 * `note` is the description alone — the title is AI-owned and never reaches
 * the renderer (§8.4). A send failure travels with its stable code, and the
 * message is product language: raw git/gh output stays in main's console
 * (criterion 26).
 */
const publishEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('described'), describeId: publishJobId, note: z.string() }).strict(),
  z.object({
    kind: z.literal('send-step'),
    sendId: publishJobId,
    step: z.enum(['checking', 'sending', 'opening-review']),
  }),
  z.object({ kind: z.literal('sent'), sendId: publishJobId, joined: z.boolean() }),
  z.object({
    kind: z.literal('send-failed'),
    sendId: publishJobId,
    code: z.string(),
    message: z.string(),
  }),
]);

export const IPC = {
  [CHANNELS.appInfo]: { request: noArguments, response: appInfoResponse },
  // Clipboard crosses through main because the sandboxed renderer's permission
  // handler denies `navigator.clipboard` (§9.3) — and it should: the read
  // happens on the Paste click, never behind the person's back.
  [CHANNELS.appReadClipboard]: {
    request: noArguments,
    response: z.object({ text: z.string() }),
  },
  // Bounded like `mirror:input`'s text: the only thing ever written is one
  // of our own short commands, so anything huge is a bug, not a payload.
  [CHANNELS.appWriteClipboard]: {
    request: z.tuple([z.string().max(2048)]),
    response: z.object({ text: z.string() }),
  },
  [CHANNELS.configGet]: { request: noArguments, response: configGetResponse },
  [CHANNELS.repoList]: { request: noArguments, response: repoState },
  // The raw pasted URL and nothing else (§9.3): main parses, sanitizes and
  // derives slug and paths itself. The answer is the id, immediately —
  // progress arrives as `repo:resolve-event` pushes, and a clone against a
  // remote hangs often enough that awaiting it here would freeze the window.
  // Bounded: no repository address is measured in kilobytes.
  [CHANNELS.repoResolve]: { request: z.tuple([z.string().max(2048)]), response: repoResolveRef },
  // Confirming names the resolution main already holds; the derived facts
  // never make a renderer round-trip.
  [CHANNELS.repoConnect]: { request: z.tuple([resolveId]), response: repoState },
  [CHANNELS.repoSwitch]: { request: z.tuple([z.string()]), response: repoState },
  [CHANNELS.deviceList]: { request: noArguments, response: deviceSnapshot },
  [CHANNELS.deviceAppInfo]: { request: z.tuple([z.string()]), response: appIdentity },
  [CHANNELS.mirrorStart]: { request: z.tuple([z.string()]), response: mirrorStream },
  [CHANNELS.mirrorStop]: { request: z.tuple([z.string()]), response: mirrorSessionRef },
  [CHANNELS.mirrorInput]: {
    request: z.tuple([z.string(), mirrorInput]),
    response: mirrorSessionRef,
  },
  [CHANNELS.maestroSnapshot]: { request: z.tuple([z.string()]), response: snapshotView },
  [CHANNELS.maestroSynthesizeSelector]: {
    request: z.tuple([z.string(), treePath]),
    response: synthesizedSelector,
  },
  // The device id and the open flow's YAML text — what you see is what runs
  // (criterion 15), and an empty flow is refused at the boundary the way the
  // Run button already disables it (criterion 17).
  [CHANNELS.runStart]: {
    request: z.tuple([z.string(), z.string().refine((yaml) => yaml.trim() !== '')]),
    response: runRef,
  },
  [CHANNELS.runCancel]: { request: z.tuple([z.string()]), response: runRef },
  [CHANNELS.flowList]: { request: noArguments, response: flowIndex },
  [CHANNELS.flowRead]: {
    request: z.tuple([flowPathArgument]),
    response: z.object({ yaml: z.string() }),
  },
  // The path and the text — and an empty text is a legal save: editing is
  // saving (criterion 6), and clearing the editor is an edit. `run:start`
  // refuses the same emptiness because an empty *run* is meaningless.
  [CHANNELS.flowSave]: {
    request: z.tuple([flowPathArgument, z.string()]),
    response: flowRef,
  },
  // The target folder (`''` is the root) and the name as typed — appending
  // the extension is main's job (criterion 18), never the person's problem.
  [CHANNELS.flowCreate]: {
    request: z.tuple([flowPathArgument, z.string()]),
    response: flowRef,
  },
  [CHANNELS.flowCreateFolder]: {
    request: z.tuple([z.string()]),
    response: flowFolderRef,
  },
  // A rename never moves: the new name is a single segment resolved in the
  // old parent (criterion 21; §7.2 keeps *move* out deliberately).
  [CHANNELS.flowRename]: {
    request: z.tuple([flowPathArgument, z.string()]),
    response: flowRef,
  },
  [CHANNELS.flowRenameFolder]: {
    request: z.tuple([flowPathArgument, z.string()]),
    response: flowFolderRef,
  },
  // The copy's name is derived main-side — `-copy`, then `-copy-2` while
  // taken (criterion 22) — so only the source crosses.
  [CHANNELS.flowDuplicate]: { request: z.tuple([flowPathArgument]), response: flowRef },
  [CHANNELS.flowDelete]: { request: z.tuple([flowPathArgument]), response: flowRef },
  [CHANNELS.flowDeleteFolder]: {
    request: z.tuple([flowPathArgument]),
    response: flowFolderRef,
  },
  [CHANNELS.publishStatus]: { request: noArguments, response: publishState },
  // The sheet opening is the trigger and main computes the change set itself,
  // so nothing crosses in; the id comes back immediately and the note arrives
  // as a `publish:event` push (criterion 10) — never awaited here.
  [CHANNELS.publishDescribe]: {
    request: noArguments,
    response: z.object({ describeId: publishJobId }),
  },
  // The note as the person edited it (criterion 17), bounded (criterion 32),
  // and the flow open right now — the slug source at publication birth
  // (criterion 20), null when none is. The title never crosses: it is
  // AI-owned and lives main-side (§8.4).
  [CHANNELS.publishSend]: {
    request: z.tuple([z.string().max(10_000), z.string().nullable()]),
    response: z.object({ sendId: publishJobId }),
  },
  [CHANNELS.publishCancel]: {
    request: z.tuple([publishJobId]),
    response: z.object({ jobId: publishJobId }),
  },
  // No arguments by design (criterion 27): main validates and opens the URL
  // it stored, and answers with what it opened. The renderer never sends one.
  [CHANNELS.publishOpenPr]: { request: noArguments, response: z.object({ url: z.string() }) },
} as const;

/** Push payloads, by channel. Same schemas, travelling the other way. */
export const PUSH = {
  [PUSH_CHANNELS.deviceChanged]: deviceSnapshot,
  [PUSH_CHANNELS.mirrorEvent]: mirrorEvent,
  [PUSH_CHANNELS.runEvent]: runEvent,
  [PUSH_CHANNELS.flowChanged]: flowIndex,
  [PUSH_CHANNELS.repoChanged]: repoState,
  [PUSH_CHANNELS.repoResolveEvent]: repoResolveEvent,
  [PUSH_CHANNELS.publishChanged]: publishState,
  [PUSH_CHANNELS.publishEvent]: publishEvent,
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
export type MirrorTouch = z.infer<typeof mirrorTouch>;
export type MirrorInput = z.infer<typeof mirrorInput>;
export type SelectorLevel = z.infer<typeof selectorLevel>;
export type SynthesizedSelector = z.infer<typeof synthesizedSelector>;
export type RepoAppId = z.infer<typeof repoAppId>;
export type ResolvedRepo = z.infer<typeof resolvedRepo>;
export type ConnectedRepo = z.infer<typeof connectedRepo>;
export type RepoState = z.infer<typeof repoState>;
export type RepoResolveEvent = z.infer<typeof repoResolveEvent>;
export type PublishChangeKind = z.infer<typeof publishChangeKind>;
export type PublishChange = z.infer<typeof publishChange>;
export type PublishState = z.infer<typeof publishState>;
export type PublishEvent = z.infer<typeof publishEvent>;

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
  /** §12.6 as amended — the app id comes from the active repo, and before
   * one is connected there is no app to ask about. */
  deviceAppUnknown: 'device/app-unknown',
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
  /** No node of the captured tree carries bounds, so there is nothing to
   * calibrate scale against (§5.2) — and a guessed scale is a hit-test that
   * silently selects the wrong element. */
  snapshotNoBounds: 'snapshot/no-bounds',
  /**
   * Criterion 5. The named snapshot was replaced by a newer capture of that
   * device. The renderer re-captures and retries — a selector synthesised from
   * a tree the user is no longer seeing would look right and tap wrong.
   */
  snapshotStale: 'snapshot/stale',
  /** A synthesis naming a path the snapshot's tree does not have. The renderer
   * and main disagree about the tree, which criterion 5 resolves by
   * re-capturing — never by guessing which node was meant. */
  selectorNodeMissing: 'selector/node-missing',
  /** §5.4's 0-match case: no rung of the ladder can name the element. A bug by
   * definition — logged, and nothing is written. */
  selectorNoMatch: 'selector/no-match',
  /**
   * A run is already active. Both faces of §4.3.2's exclusion wear it: a second
   * `run:start` is refused (criterion 4), and a snapshot capture asked for
   * mid-run is refused too — the renderer reads it as "stale until the run
   * ends", never as the inspector breaking (criterion 11).
   */
  runActive: 'run/active',
  /**
   * Criterion 3. The `maestro` binary could not be resolved, answered on
   * `run:start` itself. Distinct from the mcp child's `mcp/maestro-not-found`
   * because it surfaces on a different path — and distinct by construction
   * from a mid-run failure, which travels as a terminal event, not a code.
   */
  runMaestroNotFound: 'run/maestro-not-found',
  /** Criterion 9. A cancel naming a run that is unknown or already finished —
   * refused, and nothing is emitted for it. */
  runNotFound: 'run/not-found',
  /** The run could not begin — the temp file would not write, the spawn threw.
   * The honest fallback for `run:start`, the way `capture/failed` is for the
   * snapshot path. */
  runStartFailed: 'run/start-failed',
  /**
   * Criterion 36. The workspace root could not be created, read or written —
   * the sidebar's error state with its retry, never a silent empty tree. The
   * fallback for every flow operation the way `run/start-failed` is for the
   * run path.
   */
  flowWorkspaceUnavailable: 'flow/workspace-unavailable',
  /** An operation naming a flow or folder that is not on disk any more — an
   * external delete racing a click is a state, not a bug. */
  flowNotFound: 'flow/not-found',
  /** Criterion 17 — the name collides (case-insensitively, §7.2's macOS
   * filesystems) inside its folder. The draft row stays open with the inline
   * error: the typed name is worth correcting. */
  flowNameTaken: 'flow/name-taken',
  /** Criterion 5 — empty once trimmed, carrying a separator, or resolving
   * outside the root (§9.3, checked by resolution, never by pattern). */
  flowInvalidName: 'flow/invalid-name',
  /** §2.1's open ❓ — the repo's Android and iOS ids diverge, so a new flow
   * has no single header value yet. Creating refuses with the reason rather
   * than choosing in silence (§12.22). */
  flowAppIdUnknown: 'flow/app-id-unknown',
  /** The pasted text does not parse as a repository address at all. */
  repoInvalidUrl: 'repo/invalid-url',
  /** It parsed, but the host is not github.com — GitHub only, for now. */
  repoUnsupportedHost: 'repo/unsupported-host',
  /** Case-insensitive `org/name` is already in the connected list. */
  repoAlreadyConnected: 'repo/already-connected',
  /**
   * `gh` could not be found at all. Distinct from being logged out because
   * the fixes differ — install vs `gh auth login` — and §8.1 wants the
   * message specific, never generic.
   */
  repoGhMissing: 'repo/gh-missing',
  /** `gh` is installed but `gh auth status` refused. The most likely failure
   * in practice (§8.1), and the one `gh auth login` fixes. */
  repoGhUnauthenticated: 'repo/gh-unauthenticated',
  /** The clone itself failed — unreachable, nonexistent, or refused. */
  repoCloneFailed: 'repo/clone-failed',
  /**
   * §2.1 MVP — `app.json` missing or unparsable, or neither `android.package`
   * nor `ios.bundleIdentifier` present. The message names exactly what was
   * missing; a dynamic `app.config.js` lands here too, by design, rather
   * than being evaluated.
   */
  repoAppConfigUnreadable: 'repo/app-config-unreadable',
  /** A connect naming a resolution that is not pending any more. */
  repoResolveNotFound: 'repo/resolve-not-found',
  /** A switch naming a slug the connected list does not have. */
  repoNotFound: 'repo/not-found',
  /** A publish operation before any repo is connected — an expected state at
   * boot, which the store keeps quiet about rather than surfacing. */
  publishNoRepo: 'publish/no-repo',
  /** Criterion 24 — §8.3's "nothing new to send": the send is refused and the
   * sheet returns to the idle truth. */
  publishNothingToSend: 'publish/nothing-to-send',
  /** A second send while one is in flight. One publication, one pipeline. */
  publishSendActive: 'publish/send-active',
  /**
   * Criterion 19 — the gate cannot run at all. Distinct from the run path's
   * `run/maestro-not-found` because it reaches a different surface with its
   * own message, the way that one is distinct from `mcp/maestro-not-found`.
   */
  publishMaestroMissing: 'publish/maestro-missing',
  /** Criterion 19 — a changed flow failed `check-syntax`. The message names
   * the file in product language; raw Maestro output never crosses. */
  publishSyntaxError: 'publish/syntax-error',
  /**
   * Criterion 26 — the honest fallback for a pipeline that failed anywhere
   * else: fetch, commit, push, or `gh`. What happened and what to do, in
   * product language; the raw stderr goes to main's console alone. The gh
   * failures deliberately have no publish twins — `repo/gh-missing` and
   * `repo/gh-unauthenticated` are reused so each keeps its one specific fix.
   */
  publishSendFailed: 'publish/send-failed',
  /** A cancel naming a job that is unknown or already finished — a state,
   * not a bug, exactly like `run/not-found`. */
  publishJobNotFound: 'publish/job-not-found',
  /** View on GitHub with no open review, or with a stored URL that does not
   * parse as a GitHub PR (criterion 27) — refused, nothing opens. */
  publishNoReview: 'publish/no-review',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** One named function per channel — the whole surface of `window.conductor`. */
export interface ConductorApi {
  appInfo: (...args: Request<'app:info'>) => Promise<Result<Response<'app:info'>>>;
  /** The Paste affordance and the error surface's Copy button — the sandboxed
   * renderer's permission handler denies `navigator.clipboard`, so both cross
   * through main (§9.3). */
  appReadClipboard: (
    ...args: Request<'app:read-clipboard'>
  ) => Promise<Result<Response<'app:read-clipboard'>>>;
  appWriteClipboard: (
    ...args: Request<'app:write-clipboard'>
  ) => Promise<Result<Response<'app:write-clipboard'>>>;
  configGet: (...args: Request<'config:get'>) => Promise<Result<Response<'config:get'>>>;
  /** The repo state on demand — the boot query behind the connect-or-workspace
   * decision. The steady state arrives on `onRepoChanged` instead. */
  repoList: (...args: Request<'repo:list'>) => Promise<Result<Response<'repo:list'>>>;
  /** Starts resolving the pasted URL and answers with the resolve id the
   * moment the work is accepted — progress arrives on `onRepoResolveEvent`,
   * never here. The renderer sends the raw URL and nothing else (§9.3). */
  repoResolve: (...args: Request<'repo:resolve'>) => Promise<Result<Response<'repo:resolve'>>>;
  /** Persists the named resolution as a connected repo and makes it active —
   * main is the only writer of that state (§2.1). */
  repoConnect: (...args: Request<'repo:connect'>) => Promise<Result<Response<'repo:connect'>>>;
  repoSwitch: (...args: Request<'repo:switch'>) => Promise<Result<Response<'repo:switch'>>>;
  deviceList: (...args: Request<'device:list'>) => Promise<Result<Response<'device:list'>>>;
  deviceAppInfo: (
    ...args: Request<'device:app-info'>
  ) => Promise<Result<Response<'device:app-info'>>>;
  mirrorStart: (...args: Request<'mirror:start'>) => Promise<Result<Response<'mirror:start'>>>;
  mirrorStop: (...args: Request<'mirror:stop'>) => Promise<Result<Response<'mirror:stop'>>>;
  /** Criterion 5 and §9.3: input crosses as a named function with typed fields,
   * never as raw `ipcRenderer` and never as a composed string. */
  mirrorInput: (...args: Request<'mirror:input'>) => Promise<Result<Response<'mirror:input'>>>;
  /** The frozen snapshot the hover hit-tests against (§5.5). Requested on
   * stream start, after inputs settle, on rotation and on demand — never per
   * mousemove: hover costs zero IPC by design (criterion 46). */
  maestroSnapshot: (
    ...args: Request<'maestro:snapshot'>
  ) => Promise<Result<Response<'maestro:snapshot'>>>;
  /** Synthesis runs in main, against the same tree the renderer hit-tested —
   * the snapshotId says which, and a stale one is refused (criterion 5). */
  maestroSynthesizeSelector: (
    ...args: Request<'maestro:synthesize-selector'>
  ) => Promise<Result<Response<'maestro:synthesize-selector'>>>;
  /** Starts the open flow on the device and answers with the run id the moment
   * the child is spawned — progress arrives on `onRunEvent`, never here
   * (criterion 1). */
  runStart: (...args: Request<'run:start'>) => Promise<Result<Response<'run:start'>>>;
  /** Criterion 9. Cancellation is its own channel: a push against a device that
   * hangs must never be what stands between the person and the Stop button. */
  runCancel: (...args: Request<'run:cancel'>) => Promise<Result<Response<'run:cancel'>>>;
  /** The index on demand — the retry behind criterion 36's error state. The
   * steady state arrives on `onFlowChanged` instead. */
  flowList: (...args: Request<'flow:list'>) => Promise<Result<Response<'flow:list'>>>;
  flowRead: (...args: Request<'flow:read'>) => Promise<Result<Response<'flow:read'>>>;
  /** §8.2 — writes the file, atomically, and nothing else: no commit, no
   * push. Editing is saving; there is no Save button anywhere. */
  flowSave: (...args: Request<'flow:save'>) => Promise<Result<Response<'flow:save'>>>;
  /** Criterion 19 — the file lands on disk with the active repo's appId header
   * the moment the draft commits; the appId never exists renderer-side. */
  flowCreate: (...args: Request<'flow:create'>) => Promise<Result<Response<'flow:create'>>>;
  flowCreateFolder: (
    ...args: Request<'flow:create-folder'>
  ) => Promise<Result<Response<'flow:create-folder'>>>;
  flowRename: (...args: Request<'flow:rename'>) => Promise<Result<Response<'flow:rename'>>>;
  flowRenameFolder: (
    ...args: Request<'flow:rename-folder'>
  ) => Promise<Result<Response<'flow:rename-folder'>>>;
  flowDuplicate: (
    ...args: Request<'flow:duplicate'>
  ) => Promise<Result<Response<'flow:duplicate'>>>;
  flowDelete: (...args: Request<'flow:delete'>) => Promise<Result<Response<'flow:delete'>>>;
  flowDeleteFolder: (
    ...args: Request<'flow:delete-folder'>
  ) => Promise<Result<Response<'flow:delete-folder'>>>;
  /** The publish projection on demand — the boot query, and the sheet-open
   * refresh trigger (criterion 28). The steady state arrives on
   * `onPublishChanged` instead. */
  publishStatus: (
    ...args: Request<'publish:status'>
  ) => Promise<Result<Response<'publish:status'>>>;
  /** Starts the AI note (criterion 10) and answers with the job id the moment
   * the work is accepted — the note itself arrives on `onPublishEvent`. */
  publishDescribe: (
    ...args: Request<'publish:describe'>
  ) => Promise<Result<Response<'publish:describe'>>>;
  /** Starts the send pipeline (criterion 18): the id immediately, progress as
   * `publish:event` pushes, and never a pipeline awaited in the handler. */
  publishSend: (...args: Request<'publish:send'>) => Promise<Result<Response<'publish:send'>>>;
  /** Criterion 14 — the sheet closing kills the describe job's `claude` child.
   * One cancel for both job kinds. */
  publishCancel: (
    ...args: Request<'publish:cancel'>
  ) => Promise<Result<Response<'publish:cancel'>>>;
  /** Criterion 27 — main validates and opens the stored PR URL itself; the
   * renderer asks, and sends nothing. */
  publishOpenPr: (
    ...args: Request<'publish:open-pr'>
  ) => Promise<Result<Response<'publish:open-pr'>>>;
  /** Returns its own unsubscribe — a listener at poll rate that outlives its
   * view is a memory leak on a timer. */
  onDeviceChanged: (listener: (payload: PushPayload<'device:changed'>) => void) => () => void;
  /** Criterion 32. Same rule, and it bites harder here: this one fires 30 times
   * a second, so a listener left behind is a memory leak with a framerate. */
  onMirrorEvent: (listener: (payload: PushPayload<'mirror:event'>) => void) => () => void;
  /** Criterion 25. Same rule again — a run's log can be thousands of lines,
   * and the subscription is consumed in one app-wide hook's effect cleanup. */
  onRunEvent: (listener: (payload: PushPayload<'run:event'>) => void) => () => void;
  /** Criterion 4 — one event for every kind of change, Conductor's own or an
   * external editor's (§12.21). Carries the fresh index, never file bodies. */
  onFlowChanged: (listener: (payload: PushPayload<'flow:changed'>) => void) => () => void;
  /** One event for every kind of repo-state change — first connect, a switch
   * — carrying the same projection `repo:list` answers. */
  onRepoChanged: (listener: (payload: PushPayload<'repo:changed'>) => void) => () => void;
  /** Resolution progress: the real stages as they complete, the found card's
   * facts, or the failure with its stable code — each naming its resolution. */
  onRepoResolveEvent: (
    listener: (payload: PushPayload<'repo:resolve-event'>) => void,
  ) => () => void;
  /** The unsent set and the review state, recomputed off `flow:changed`
   * (debounced) and on a repo switch — criterion 9's one path. */
  onPublishChanged: (listener: (payload: PushPayload<'publish:changed'>) => void) => () => void;
  /** Describe results and send progress, each event naming its job — a late
   * event from a superseded job must never decorate a live one. */
  onPublishEvent: (listener: (payload: PushPayload<'publish:event'>) => void) => () => void;
}

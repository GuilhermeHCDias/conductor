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
  runOpenRecording: 'run:open-recording',
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
  aiSend: 'ai:send',
  aiCancel: 'ai:cancel',
  aiReset: 'ai:reset',
  aiStatus: 'ai:status',
  doctorStatus: 'doctor:status',
  doctorCheck: 'doctor:check',
  doctorInstall: 'doctor:install',
  doctorLogin: 'doctor:login',
  doctorLoginCancel: 'doctor:login-cancel',
  doctorOpenLoginUrl: 'doctor:open-login-url',
  doctorOpenUrl: 'doctor:open-url',
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
  aiEvent: 'ai:event',
  doctorChanged: 'doctor:changed',
  doctorInstallEvent: 'doctor:install-event',
  doctorLoginEvent: 'doctor:login-event',
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
  // `branches` rides on the event, not on `resolvedRepo`, because it is a
  // resolution-time affordance and not a fact about a repo: the choice exists
  // only before connecting. Switching branch on a connected clone would mean a
  // `checkout` under the user, which rule 23 bans outright. Empty when the
  // listing failed — the card then shows the cloned branch alone, which is
  // exactly the behaviour that shipped before the picker existed.
  z.object({
    kind: z.literal('found'),
    resolveId,
    repo: resolvedRepo,
    branches: z.array(z.string()).readonly(),
  }),
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
    recording: z.enum(['pending', 'none']),
  }),
  // Recording criteria 13–15. One `type`, two shapes, so the follow-up is a
  // union of its own on `ok` — the same split `Result` draws.
  z.discriminatedUnion('ok', [
    z.object({
      type: z.literal('recording'),
      runId: z.string(),
      ok: z.literal(true),
      // A name, never a path (criterion 17): the file is main's, and only
      // main opens it.
      fileName: z.string().refine((name) => !/[\\/]/.test(name)),
      fromSeconds: z.number().int().nonnegative().nullable(),
    }),
    z.object({
      type: z.literal('recording'),
      runId: z.string(),
      ok: z.literal(false),
      message: z.string(),
    }),
  ]),
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
    /** The slug of the repo this projection describes — main already publishes
     * it in the repo list. It is how the renderer tells a repo switch from a
     * recompute, so a note drafted for one repo never publishes for another. */
    repo: z.string(),
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

/** Names the assistant turn an answer or an event is about. What `ai:send`
 * gives back is deliberately only this — everything after it arrives as
 * `ai:event` pushes, never here (criterion 8's start → push → cancel shape). */
const aiTurnRef = z.object({ turnId: z.string() });

/** How a turn ended (criterion 8): the child finished, the person stopped it,
 * or it failed — timeout included. */
const aiOutcome = z.enum(['done', 'canceled', 'failed']);

/**
 * The assistant stream (criterion 8). Every turn-scoped event names its turn,
 * so a late event from a killed turn never decorates a live one — the run
 * stream's rule. `activity` carries an app-authored, product-language line
 * (criterion 9): tool names never cross this boundary. `file-edited` carries
 * the §7.2 flow identity — the path relative to `conductor/`, the vocabulary
 * of `flow:changed` and `flow:save` — so the renderer can open it (criterion
 * 26). Spend is deliberately not in any payload: the number stops at
 * `AiService` (§6.4 as amended; criterion 25).
 */
const aiEvent = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('turn-started'), turnId: z.string() }),
  z.object({ kind: z.literal('text-delta'), turnId: z.string(), text: z.string() }),
  z.object({ kind: z.literal('activity'), turnId: z.string(), label: z.string() }),
  z.object({ kind: z.literal('file-edited'), turnId: z.string(), path: z.string() }),
  z.object({
    kind: z.literal('turn-ended'),
    turnId: z.string(),
    outcome: aiOutcome,
    /** Product language when the turn failed; `null` on a quiet end. */
    message: z.string().nullable(),
  }),
  /** Criterion 12 — pushed so the renderer empties the thread, whether the
   * reset was asked for or implied by a repo switch. */
  z.object({ kind: z.literal('reset') }),
]);

/** The eight things the doctor reports on (doctor criterion 1), in the order
 * the sheet lists them. Declared as the contract's own vocabulary so a row the
 * renderer never heard of cannot arrive. */
const doctorRowId = z.enum([
  'maestro',
  'adb',
  'java',
  'xcode-clt',
  'gh',
  'github-auth',
  'claude',
  'claude-auth',
]);

/** Three states and no fourth: the sheet colours by this alone. */
const doctorRowStatus = z.enum(['ok', 'warn', 'fail']);

/**
 * One row (doctor criterion 1). `detail` is machine register — the CLI's own
 * first line, never a transcript (criterion 5) — and `short` the version
 * alone, for the Ready section. `label` is the one word of state.
 */
const doctorRow = z
  .object({
    id: doctorRowId,
    name: z.string(),
    status: doctorRowStatus,
    label: z.string(),
    detail: z.string(),
    short: z.string(),
  })
  .strict();

/** The whole report, pushed once when every check has settled (criterion 3),
 * with `issues` = rows not `ok` (criterion 4) — the badge's count. */
const doctorReport = z
  .object({
    rows: z.array(doctorRow).readonly(),
    checkedAt: z.number().int().nonnegative(),
    issues: z.number().int().nonnegative(),
  })
  .strict();

/** The four tools the doctor manages (managed-tools criterion 1), in install
 * order: the JDK first so Maestro's verify runs against a real JVM. */
const toolId = z.enum(['java', 'maestro', 'gh', 'adb']);

/**
 * One line of the plan (managed-tools criterion 3): what the setup window
 * will do about a tool. `present` carries the doctor row's detail; `install`
 * the method; `unavailable` is an Intel Mac (criterion 6). The four tools
 * are mandatory — nothing is ever skipped.
 */
const doctorPlanEntry = z
  .object({
    id: toolId,
    state: z.enum(['present', 'install', 'unavailable']),
    method: z.enum(['homebrew', 'direct']).nullable(),
    detail: z.string(),
  })
  .strict();

/** The plan the setup window shows before its one click: the four entries,
 * where `brew` was found (or not), whether the Android terms are in play,
 * and which shell profile gets the `PATH` block — home-relative, `null` for a
 * shell Conductor does not write (criterion 20). */
const doctorPlan = z
  .object({
    tools: z.array(doctorPlanEntry).readonly(),
    homebrew: z.string().nullable(),
    androidTermsRequired: z.boolean(),
    profile: z.string().nullable(),
  })
  .strict();

/** The whole-number percentage of an install, and the step it is in. `pct`
 * is `null` while Homebrew runs — it prints no progress (criterion 12). */
const doctorInstallProgress = z.object({
  installId: z.string(),
  tool: toolId,
  pct: z.number().min(0).max(100).nullable(),
  step: z.string(),
});

/** How an install failed (criterion 17): the stable code, one product-language
 * sentence chosen by code, and the raw cause for the doctor row. */
const doctorInstallFailure = z
  .object({ code: z.string(), message: z.string(), detail: z.string() })
  .strict();

/** The sign-in's failure carries the same three fields. */
const doctorLoginFailure = doctorInstallFailure;

/**
 * The doctor state (criterion 36): the last report or none, whether a check is
 * in flight, whether this launch is the setup window and why — with the plan
 * once it is built — the install in flight or the one that settled (its
 * failures by tool), and the sign-in in flight or the one that failed. Main
 * owns every field; the renderer holds a projection.
 */
const doctorState = z
  .object({
    report: doctorReport.nullable(),
    checking: z.boolean(),
    setup: z
      .object({
        active: z.boolean(),
        // `sign-in`: every tool is there and gh is signed out (managed-tools criterion 32).
        reason: z.enum(['first-run', 'update', 'sign-in']).nullable(),
        plan: doctorPlan.nullable(),
      })
      .strict(),
    install: z.union([
      z.null(),
      doctorInstallProgress.strict(),
      z
        .object({ installId: z.string(), failed: z.partialRecord(toolId, doctorInstallFailure) })
        .strict(),
    ]),
    /** The sign-in (criteria 28–31): running, with the one-time code once gh
     * printed it — shown, never stored — or the way it failed. No token. */
    login: z.union([
      z.null(),
      z.object({ loginId: z.string(), code: z.string().nullable() }).strict(),
      z.object({ loginId: z.string(), failed: doctorLoginFailure }).strict(),
    ]),
    /** The tools whose path the person configured (`CONFIG.MAESTRO_PATH`,
     * `GH_PATH`, `ADB_PATH` — doctor criterion 10, managed-tools 42): the
     * sheet offers no Install on those. The paths themselves never cross. */
    overridden: z.array(toolId).readonly(),
    /** The pin, `CONFIG.MAESTRO_VERSION` — what the Setup view names
     * (criteria 19, 21). A push carries the constant; nothing else does. */
    version: z.string(),
  })
  .strict();

/** Install progress as pushes (criterion 15): the invoke answered with the id
 * at once, and everything after it arrives here, naming that id and the tool
 * it is about; `settled` closes the whole run (managed-tools criterion 17). */
const doctorInstallEvent = z.discriminatedUnion('kind', [
  doctorInstallProgress.extend({ kind: z.literal('progress') }).strict(),
  z
    .object({ kind: z.literal('done'), installId: z.string(), tool: toolId, version: z.string() })
    .strict(),
  doctorInstallFailure
    .extend({ kind: z.literal('failed'), installId: z.string(), tool: toolId })
    .strict(),
  z
    .object({
      kind: z.literal('settled'),
      installId: z.string(),
      failed: z.array(toolId).readonly(),
    })
    .strict(),
]);

/** The sign-in as pushes (criteria 29, 31): the one-time code with the URL to
 * enter it at, then done with the account, failed with the sentence, or
 * cancelled. The token never appears in any of them (§9.0). */
const doctorLoginEvent = z.discriminatedUnion('kind', [
  z
    .object({ kind: z.literal('code'), loginId: z.string(), code: z.string(), url: z.string() })
    .strict(),
  z.object({ kind: z.literal('done'), loginId: z.string(), account: z.string() }).strict(),
  doctorLoginFailure.extend({ kind: z.literal('failed'), loginId: z.string() }).strict(),
  z.object({ kind: z.literal('cancelled'), loginId: z.string() }).strict(),
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
  // The raw pasted URL (§9.3): main parses, sanitizes and derives slug and
  // paths itself. The answer is the id, immediately — progress arrives as
  // `repo:resolve-event` pushes, and a clone against a remote hangs often
  // enough that awaiting it here would freeze the window. Bounded: no
  // repository address is measured in kilobytes.
  // The second argument is which branch to resolve at — `null` means the
  // repository's own default. Picking a branch in the card re-runs exactly
  // this, because a branch changes every fact on it: `app.json` (and so the
  // bundle id) and the flows under `conductor/` are both per-branch. A ref
  // name is a git object name, not a URL, so it is bounded far tighter.
  [CHANNELS.repoResolve]: {
    request: z.tuple([z.string().max(2048), z.string().min(1).max(255).nullable()]),
    response: repoResolveRef,
  },
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
  // Run button already disables it (criterion 17). The open flow's identity
  // rides along (recording criterion 31): main names a failed run's video
  // after it, and `null` — an unsaved flow — is a legitimate answer that has
  // to be said rather than left out.
  [CHANNELS.runStart]: {
    request: z.tuple([
      z.string(),
      z.string().refine((yaml) => yaml.trim() !== ''),
      z.string().nullable(),
    ]),
    response: runRef,
  },
  [CHANNELS.runCancel]: { request: z.tuple([z.string()]), response: runRef },
  // Recording criterion 17 — the run id and nothing else: main opens the file
  // it wrote itself, and a path from the renderer would be a path it did not.
  [CHANNELS.runOpenRecording]: { request: z.tuple([z.string()]), response: runRef },
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
  // The person's message — bounded, non-empty once trimmed (criterion 14) —
  // and the flow open in the editor, the volatile fact only the renderer
  // holds (criterion 19; `publish:send` set the shape). The answer is the
  // turn id, immediately: the stream arrives on `ai:event`.
  [CHANNELS.aiSend]: {
    request: z.tuple([
      z
        .string()
        .max(10_000)
        .refine((message) => message.trim() !== ''),
      z.string().nullable(),
    ]),
    response: aiTurnRef,
  },
  // No arguments: there is at most one turn in flight, and naming it would
  // let a stale click cancel a newer turn. The answer says which turn was
  // put down — or that none was, which is a state, not a failure.
  [CHANNELS.aiCancel]: {
    request: noArguments,
    response: z.object({ turnId: z.string().nullable() }),
  },
  [CHANNELS.aiReset]: {
    request: noArguments,
    response: z.object({ turnId: z.string().nullable() }),
  },
  // Criteria 6, 25 — the availability question the panel and the status line
  // read. Blocked states answer as the `Result` error with their stable code
  // (`ai/no-repo`, `ai/claude-missing`); ready is the only data shape.
  [CHANNELS.aiStatus]: {
    request: noArguments,
    response: z.object({ ready: z.literal(true) }),
  },
  // The doctor's invokes send intent (criterion 37): which tools, a terms
  // decision, a page by id — never a path, URL or command. Main decides
  // everything about where a tool lives and which URL a name means. Status
  // is the boot query; the steady state is `doctor:changed`.
  [CHANNELS.doctorStatus]: { request: noArguments, response: doctorState },
  // `started` is false when the trigger was coalesced into a check already
  // in flight (criterion 6) — a state, not a failure.
  [CHANNELS.doctorCheck]: {
    request: noArguments,
    response: z.object({ started: z.boolean() }).strict(),
  },
  // The id immediately; the pipeline streams as `doctor:install-event` and is
  // never awaited in the handler (criterion 15).
  [CHANNELS.doctorInstall]: {
    request: z.tuple([
      z
        .object({
          tools: z.array(toolId).readonly().optional(),
          androidTermsAccepted: z.boolean(),
        })
        .strict(),
    ]),
    response: z.object({ installId: z.string() }).strict(),
  },
  // The id immediately; the code and the outcome stream as `doctor:login-event`.
  [CHANNELS.doctorLogin]: {
    request: noArguments,
    response: z.object({ loginId: z.string() }).strict(),
  },
  [CHANNELS.doctorLoginCancel]: { request: noArguments, response: z.object({}).strict() },
  // The one device-flow URL, held in main (managed-tools criterion 30).
  [CHANNELS.doctorOpenLoginUrl]: { request: noArguments, response: z.object({}).strict() },
  // A page by id, resolved to its URL in main (managed-tools criterion 37).
  [CHANNELS.doctorOpenUrl]: {
    request: z.tuple([z.object({ id: z.enum(['android-terms']) }).strict()]),
    response: z.object({}).strict(),
  },
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
  [PUSH_CHANNELS.aiEvent]: aiEvent,
  [PUSH_CHANNELS.doctorChanged]: doctorState,
  [PUSH_CHANNELS.doctorInstallEvent]: doctorInstallEvent,
  [PUSH_CHANNELS.doctorLoginEvent]: doctorLoginEvent,
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
export type AiOutcome = z.infer<typeof aiOutcome>;
export type AiEvent = z.infer<typeof aiEvent>;
export type DoctorRowId = z.infer<typeof doctorRowId>;
export type DoctorRowStatus = z.infer<typeof doctorRowStatus>;
export type DoctorRow = z.infer<typeof doctorRow>;
export type DoctorReport = z.infer<typeof doctorReport>;
export type DoctorInstallFailure = z.infer<typeof doctorInstallFailure>;
export type DoctorState = z.infer<typeof doctorState>;
export type DoctorInstallEvent = z.infer<typeof doctorInstallEvent>;
export type DoctorLoginEvent = z.infer<typeof doctorLoginEvent>;
export type ToolId = z.infer<typeof toolId>;
export type DoctorPlan = z.infer<typeof doctorPlan>;
export type DoctorPlanEntry = z.infer<typeof doctorPlanEntry>;
export type DoctorInstallMethod = NonNullable<DoctorPlanEntry['method']>;

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
   * Recording criteria 18–19. `run:open-recording` named a run that saved no
   * video this session, or a video that has since left the Movies folder —
   * refused, and nothing opens.
   */
  runRecordingMissing: 'run/recording-missing',
  /** Recording criterion 18. The OS declined to open the file; the message is
   * its own words. */
  runRecordingOpenFailed: 'run/recording-open-failed',
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
  /** An `ai:send` before any repo is connected — the assistant works on one
   * clone's flows, and there is none to work on yet. */
  aiNoRepo: 'ai/no-repo',
  /**
   * `resolveClaude` found no binary. The panel explains what Claude Code is
   * and that installing it enables the assistant (criterion 6) — the same
   * install-vs-broken distinction `repo/gh-missing` draws for `gh`.
   */
  aiClaudeMissing: 'ai/claude-missing',
  /**
   * An assistant turn is in flight. Both faces of §4.3.2's exclusion wear it,
   * exactly as `run/active` does for runs: a second `ai:send` is refused, and
   * a snapshot capture asked for mid-turn reads as "the assistant is looking
   * at the screen" — distinct from `run/active` so each surface names its own
   * cause (criterion 16).
   */
  aiActive: 'ai/active',
  /** The conversation reached `CONFIG.AI_BUDGET_USD`. The message names a
   * limit, never an amount — no surface of the app shows a cost (§6.4 as
   * amended, criterion 25). */
  aiBudgetExceeded: 'ai/budget-exceeded',
  /** The honest fallback for a turn that ended wrong — the child exited
   * non-zero, or would not start. Auth failures keep this code but carry
   * their own message: the person's Claude sign-in is what fixes them
   * (criterion 7). */
  aiTurnFailed: 'ai/turn-failed',
  /** A second `doctor:install` while one runs — one pipeline, one copy. */
  doctorInstallActive: 'doctor/install-active',
  /** `CONFIG.MAESTRO_PATH` is set: an explicit path is the person's decision,
   * and the installer never runs over it (doctor criterion 10). */
  doctorMaestroOverridden: 'doctor/maestro-overridden',
  /** The four ways the install pipeline fails (criterion 17), each with its
   * own product-language sentence; the raw cause rides in `detail`. */
  doctorDownloadFailed: 'doctor/download-failed',
  doctorChecksumMismatch: 'doctor/checksum-mismatch',
  doctorExtractFailed: 'doctor/extract-failed',
  doctorVerifyFailed: 'doctor/verify-failed',
  /** A step after the archive — the tree, the links — failed for a reason
   * that is neither the download nor the unpacking (a permission, a file
   * in the way). Managed-tools criterion 14's fifth sentence. */
  doctorInstallFailed: 'doctor/install-failed',
  /** Homebrew exited non-zero (managed-tools criterion 15); the next attempt
   * downloads directly. */
  doctorBrewFailed: 'doctor/brew-failed',
  /** `doctor:login` with no `gh` on the ladder (criterion 28). */
  doctorGhMissing: 'doctor/gh-missing',
  /** A second `doctor:login` while one runs. */
  doctorLoginActive: 'doctor/login-active',
  /** `gh auth login` exited non-zero — gh's own device-code expiry lands here. */
  doctorLoginFailed: 'doctor/login-failed',
  /** A direct install asked for on an Intel Mac (criterion 6). */
  doctorUnsupportedArch: 'doctor/unsupported-arch',
  /** `doctor:install` with `adb` in the queue and the Android SDK terms not
   * accepted (criterion 10) — the tools are mandatory, so nothing is skipped;
   * the install waits for the checkbox. */
  doctorTermsRequired: 'doctor/terms-required',
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
  /** Recording criterion 17 — asks main to open the video it saved for this
   * run in the OS's player. The renderer never sends a path. */
  runOpenRecording: (
    ...args: Request<'run:open-recording'>
  ) => Promise<Result<Response<'run:open-recording'>>>;
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
  /** Starts an assistant turn and answers with its id the moment the child is
   * spawned — the reply streams in on `onAiEvent`, never here (criterion 8). */
  aiSend: (...args: Request<'ai:send'>) => Promise<Result<Response<'ai:send'>>>;
  /** Criterion 11 — kills the in-flight child and rolls nothing back: an edit
   * already on disk stays, exactly as saving works everywhere else. Its own
   * channel, so a child that hangs never stands between the person and Stop. */
  aiCancel: (...args: Request<'ai:cancel'>) => Promise<Result<Response<'ai:cancel'>>>;
  /** Criterion 12 — ends any turn, clears the remembered session and the
   * accumulated spend; the renderer empties the thread on the pushed reset. */
  aiReset: (...args: Request<'ai:reset'>) => Promise<Result<Response<'ai:reset'>>>;
  /** The availability question (criteria 6, 25): ready, or the blocking
   * reason as the error's stable code and product-language message. */
  aiStatus: (...args: Request<'ai:status'>) => Promise<Result<Response<'ai:status'>>>;
  /** The doctor state on demand — the boot query behind the setup-or-app
   * decision. The steady state arrives on `onDoctorChanged` instead. */
  doctorStatus: (...args: Request<'doctor:status'>) => Promise<Result<Response<'doctor:status'>>>;
  /** Runs every check again (criterion 6); the report lands on
   * `onDoctorChanged` once all have settled. */
  doctorCheck: (...args: Request<'doctor:check'>) => Promise<Result<Response<'doctor:check'>>>;
  /** Starts installing the tools whose plan state is `install` — all of them,
   * or the ones named — and answers with the id at once; progress arrives on
   * `onDoctorInstallEvent`, one tool at a time (managed-tools criterion 9). */
  doctorInstall: (
    ...args: Request<'doctor:install'>
  ) => Promise<Result<Response<'doctor:install'>>>;
  /** Starts gh's own device flow and answers with the id at once; the code
   * and the outcome arrive on `onDoctorLoginEvent` (criterion 28). */
  doctorLogin: (...args: Request<'doctor:login'>) => Promise<Result<Response<'doctor:login'>>>;
  /** Kills the sign-in child (criterion 31). */
  doctorLoginCancel: (
    ...args: Request<'doctor:login-cancel'>
  ) => Promise<Result<Response<'doctor:login-cancel'>>>;
  /** Opens github.com/login/device in the browser — the one URL, held in
   * main (criterion 30). */
  doctorOpenLoginUrl: (
    ...args: Request<'doctor:open-login-url'>
  ) => Promise<Result<Response<'doctor:open-login-url'>>>;
  /** Opens a page by id — the Android SDK terms (criterion 37). */
  doctorOpenUrl: (
    ...args: Request<'doctor:open-url'>
  ) => Promise<Result<Response<'doctor:open-url'>>>;
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
  /** The assistant stream — text deltas, activity, edits, turn ends, resets.
   * Mounted app-wide (criterion 24): events keep landing while the Run tab
   * is selected, and the unsubscribe is consumed in effect cleanup. */
  onAiEvent: (listener: (payload: PushPayload<'ai:event'>) => void) => () => void;
  /** The whole doctor state, whenever any of it changes — a report landing, a
   * check starting, the setup window closing, an install starting or ending. */
  onDoctorChanged: (listener: (payload: PushPayload<'doctor:changed'>) => void) => () => void;
  /** Install progress at ~10 Hz while a download runs — mounted app-wide, and
   * the unsubscribe is consumed in effect cleanup like every other stream. */
  onDoctorInstallEvent: (
    listener: (payload: PushPayload<'doctor:install-event'>) => void,
  ) => () => void;
  /** The sign-in's code and outcome (criteria 29, 31) — same rule. */
  onDoctorLoginEvent: (
    listener: (payload: PushPayload<'doctor:login-event'>) => void,
  ) => () => void;
}

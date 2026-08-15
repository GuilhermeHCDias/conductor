import { ERROR_CODES, type ErrorCode, type Result, type SynthesizedSelector } from '@shared/ipc';
import type { Bounds, SnapshotView, TreeNode } from '@shared/types';
import type { MaestroGateway } from '../maestro/MaestroGateway';
import { parsePngSize } from '../maestro/png-size';
import {
  SelectorSynthError,
  type SynthesisScreen,
  synthesizeSelector,
} from '../maestro/SelectorSynth';

/**
 * The frozen `{hierarchy, screenshot, scale}` of §5.5, captured together and
 * held in main so synthesis runs against **the same tree** the renderer
 * hit-tested. The screenshot's bytes never leave this process — they exist to
 * calibrate the scale and to timestamp the capture, and nothing in this spec
 * renders them (criterion 6).
 *
 * Holds no process, no socket and no watcher, so it has no `dispose`: the MCP
 * child behind `hierarchy()` belongs to `MaestroMcpService`, and the Gateway
 * is a seam, not a resource.
 */

export type SnapshotServiceDeps = {
  readonly gateway: MaestroGateway;
};

/**
 * Who holds the device while the snapshot path is suspended (§4.3.2, both
 * faces): a flow run's CLI child, or the AI turn's own `maestro mcp`. The
 * holder decides the refusal each surface shows — `run/active` and
 * `ai/active` are different causes with different words (ai-assistant-session
 * criterion 16) — and the two exclude each other: `suspend` for one owner
 * while the other holds is *rejected*, carrying the holder's code, which is
 * how `run:start` into an AI turn and `ai:send` into a run both refuse
 * without either service knowing the other exists.
 */
export type SnapshotLeaseOwner = 'run' | 'ai';

/** The rejection `suspend` answers when the lease is already held by the
 * other owner. Carries the holder's stable code, so `RunService.start`'s
 * catch path and `AiService.send`'s surface it untranslated. */
class SnapshotLeaseHeldError extends Error {
  readonly code: ErrorCode;

  constructor(holder: SnapshotLeaseOwner) {
    super(
      holder === 'run'
        ? 'A flow is running on the device. Try again when it ends.'
        : 'The assistant is looking at the screen. Try again when it finishes.',
    );
    this.name = 'SnapshotLeaseHeldError';
    this.code = holder === 'run' ? ERROR_CODES.runActive : ERROR_CODES.aiActive;
  }
}

/** One device's current snapshot: the view the renderer holds, plus the screen
 * frame `point:` percentages are computed against. */
type HeldSnapshot = {
  readonly view: SnapshotView;
  readonly screen: SynthesisScreen;
};

export class SnapshotService {
  private readonly deps: SnapshotServiceDeps;
  /** The latest snapshot per device — replaced, never accumulated. */
  private readonly held = new Map<string, HeldSnapshot>();
  /** Monotonic, so an id is never reused within a run (criterion 5). */
  private nextSnapshot = 1;
  /** §4.3.2 (run criteria 11–12, ai criteria 15–16): who holds the device
   * while the snapshot path is off — `null` when nobody does. */
  private heldBy: SnapshotLeaseOwner | null = null;
  /** Captures currently talking to the device, and who is waiting them out. */
  private inFlight = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(deps: SnapshotServiceDeps) {
    this.deps = deps;
  }

  /**
   * Run criterion 12: holds new captures off and waits the in-flight one out.
   * `RunService` awaits this before spawning the CLI — a raw `maestro test`
   * racing a live `inspect_screen` silently loses hierarchy nodes and calls
   * it success, which is worse than either failing (§4.3.2's amendment). The
   * AI turn holds the same lease as `'ai'` (ai criterion 15), and a suspend
   * against the *other* owner's hold rejects with that holder's code — the
   * mutual exclusion both `run:start` and `ai:send` ride.
   */
  suspend(owner: SnapshotLeaseOwner = 'run'): Promise<void> {
    if (this.heldBy !== null && this.heldBy !== owner) {
      return Promise.reject(new SnapshotLeaseHeldError(this.heldBy));
    }
    this.heldBy = owner;
    if (this.inFlight === 0) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve);
    });
  }

  /** The run or turn settled — the device is ours again. Only the holder can
   * lift its own hold: `RunService`'s failure-path resume must never open the
   * gate under a live AI turn. */
  resume(owner: SnapshotLeaseOwner = 'run'): void {
    if (this.heldBy === owner) {
      this.heldBy = null;
    }
  }

  /**
   * Criterion 1. Hierarchy and screenshot leave together — the screenshot is
   * ~200ms through the OS and the hierarchy ~300ms through the warm MCP
   * session, and running them in sequence would put both on the critical path.
   *
   * `allSettled` rather than `all`: when both fail, `all` would leave the
   * second rejection unobserved, and this process treats an unhandled
   * rejection as a bug.
   */
  async capture(deviceId: string): Promise<Result<SnapshotView>> {
    // Run criterion 11: while a flow runs, the mcp child is not called at all.
    // The renderer reads this code as "stale until the run ends" and recovers
    // through the end-of-run recapture, never by retrying into the run. An AI
    // turn holds the same gate under its own name (ai criterion 16): each
    // surface tells the person which of the two is on the device.
    if (this.heldBy === 'run') {
      return refuse(
        ERROR_CODES.runActive,
        'A flow is running on the device. The screen inspector resumes when it ends.',
      );
    }
    if (this.heldBy === 'ai') {
      return refuse(
        ERROR_CODES.aiActive,
        'The assistant is looking at the screen. The inspector resumes when it finishes.',
      );
    }

    this.inFlight += 1;
    try {
      return await this.captureNow(deviceId);
    } finally {
      this.inFlight -= 1;
      if (this.inFlight === 0) {
        const waiters = this.idleWaiters;
        this.idleWaiters = [];
        for (const waiter of waiters) {
          waiter();
        }
      }
    }
  }

  private async captureNow(deviceId: string): Promise<Result<SnapshotView>> {
    const [tree, shot] = await Promise.allSettled([
      this.deps.gateway.hierarchy(deviceId),
      this.deps.gateway.screenshot(deviceId),
    ]);
    // Criterion 4: the underlying code crosses untranslated, and no partial
    // snapshot is held or answered.
    if (tree.status === 'rejected') {
      return failure(tree.reason);
    }
    if (shot.status === 'rejected') {
      return failure(shot.reason);
    }

    const size = parsePngSize(shot.value);
    if (size === null) {
      return refuse(
        ERROR_CODES.captureFailed,
        'The screenshot was not a readable PNG, so there is nothing to calibrate against.',
      );
    }

    // Criterion 2 and §5.2's amendment: the anchor is the widest node that
    // *carries* bounds. The reference hardware's root reports none, and
    // dividing by its absence was exactly the bug the amendment records.
    const widest = widestBounds(tree.value);
    if (widest === null) {
      return refuse(
        ERROR_CODES.snapshotNoBounds,
        'No element of the captured hierarchy carries bounds, so the scale cannot be calibrated (§5.2). A guessed scale would hit-test the wrong element.',
      );
    }

    const scale = size.width / (widest.x2 - widest.x1);
    const view: SnapshotView = {
      snapshotId: `snapshot-${this.nextSnapshot}`,
      tree: tree.value,
      screenshotWidth: size.width,
      screenshotHeight: size.height,
      scale,
    };
    this.nextSnapshot += 1;
    this.held.set(deviceId, {
      view,
      // The screen in hierarchy units — the frame `point:` percentages are
      // relative to, derived from the same calibration as everything else.
      screen: { width: size.width / scale, height: size.height / scale },
    });
    return { ok: true, data: view };
  }

  /**
   * Criterion 5. Synthesis names the snapshot it was hit-tested against, and
   * anything but the current one is refused: the renderer re-captures and
   * retries, and a selector is never written from a tree the user is not
   * seeing.
   */
  synthesize(snapshotId: string, path: readonly number[]): Result<SynthesizedSelector> {
    const current = [...this.held.values()].find((held) => held.view.snapshotId === snapshotId);
    if (current === undefined) {
      return refuse(
        ERROR_CODES.snapshotStale,
        `Snapshot ${snapshotId} is no longer current. Re-capture and synthesise against the fresh tree.`,
      );
    }

    try {
      return { ok: true, data: synthesizeSelector(current.view.tree, path, current.screen) };
    } catch (error) {
      // §5.4's 0-match rule spells it out: never written, *logged*. The refusal
      // crosses to the renderer as a value, so this line is the only trail the
      // bug leaves in main.
      if (error instanceof SelectorSynthError && error.code === ERROR_CODES.selectorNoMatch) {
        console.error(`Selector synthesis matched nothing for ${snapshotId}:`, error.message);
      }
      return failure(error);
    }
  }
}

/** The widest bounds in the tree, by width — depth-first, first winner kept,
 * zero-width rectangles skipped: a sliver cannot calibrate anything. */
function widestBounds(node: TreeNode): Bounds | null {
  let widest: Bounds | null = null;
  const visit = (candidate: TreeNode): void => {
    const bounds = candidate.bounds;
    if (bounds !== null && bounds.x2 > bounds.x1) {
      if (widest === null || bounds.x2 - bounds.x1 > widest.x2 - widest.x1) {
        widest = bounds;
      }
    }
    for (const child of candidate.children) {
      visit(child);
    }
  };
  visit(node);
  return widest;
}

/** `ERROR_CODES`' own values. A thrown error's `code` is only one of ours if
 * it is in here — `spawn` failures carry `ENOENT`, and a cast would have typed
 * that errno as an `ErrorCode` on its way across IPC. */
const KNOWN_CODES: ReadonlySet<string> = new Set(Object.values(ERROR_CODES));

function isErrorCode(value: string): value is ErrorCode {
  return KNOWN_CODES.has(value);
}

/** The thrower's own stable code — `SelectorSynthError` and the Gateway's
 * errors all carry one — with `capture/failed` as the honest fallback for a
 * code we do not publish. */
function failure(error: unknown): Result<never> {
  const code =
    error instanceof SelectorSynthError
      ? error.code
      : typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          typeof error.code === 'string' &&
          isErrorCode(error.code)
        ? error.code
        : ERROR_CODES.captureFailed;
  return {
    ok: false,
    error: {
      code,
      message: error instanceof Error ? error.message : 'The snapshot could not be captured.',
    },
  };
}

function refuse(code: ErrorCode, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

import { readFile } from 'node:fs/promises';
import { join, relative, resolve, sep } from 'node:path';
import { type AiEvent, ERROR_CODES, type ErrorCode, type Result } from '@shared/ipc';
import type { ExitReason, SpawnOptions, StreamingProcess } from '../process/run';
import { stripFrontMatter } from './publish.service';
import type { ActiveClone } from './repo.service';
import type { SnapshotLeaseOwner } from './snapshot.service';

/**
 * The AI window's engine (§6): one headless `claude -p` child per message,
 * dead at turn end, the conversation carried across processes by `--resume`
 * (Decision: respawn per message). The child is isolated from the person's
 * environment (`--setting-sources ""`, `--strict-mcp-config`), carries our
 * plugin's skills, sees the device through its own `maestro mcp`, and can
 * write only inside `conductor/` — every §6 guardrail is a flag, not a
 * prompt. Everything here was verified against the installed CLI (2.1.232)
 * before it was written; the findings travel in the PR.
 *
 * This service holds the turn lifecycle, the stream-json parsing, the
 * `--resume` bookkeeping, the budget arithmetic (§6.4 — the number stops
 * here: it crosses no channel, enters no store, reaches no screen), and the
 * snapshot lease that keeps the AI's `maestro mcp` and our own off the
 * device at the same time (§4.3.2, criteria 15–16).
 */

/** Criterion 10's ceiling — generous on purpose: a turn legitimately spends
 * minutes reading code, inspecting the screen and writing. Injectable so the
 * tests need not wait ten minutes. */
export const TURN_TIMEOUT_MS = 10 * 60_000;

/** How much child output is kept for diagnosing a failed exit — enough for
 * the auth banner, bounded so a chatty child cannot grow main's heap. */
const OUTPUT_TAIL_LIMIT = 4_096;

/** The §4.3.4 allowlist, exactly — plus the criterion-3 containment: writes
 * scoped to the flows folder, reads to the clone (patterns resolve against
 * the child's cwd, verified). `Skill` is deliberately absent: it needs no
 * permission entry, so the allowlist stays exactly the spec's nine. */
function allowedTools(flowsDir: string): string[] {
  return [
    'mcp__maestro__inspect_screen',
    'mcp__maestro__take_screenshot',
    'mcp__maestro__list_devices',
    'mcp__maestro__cheat_sheet',
    'Read(**)',
    `Edit(${flowsDir}/**)`,
    `Write(${flowsDir}/**)`,
    'Glob',
    'Grep',
  ];
}

/** The available toolset (§12.18): no `Bash`, no `WebFetch`, no `Task` — not
 * merely unpermitted, *absent*. `Skill` rides here or the plugin's skills
 * could never load (verified: `--tools` leaves MCP tools untouched). */
const BUILTIN_TOOLS = 'Read,Edit,Write,Glob,Grep,Skill';

/** The device fact the context block carries (criterion 19). */
export type AiDeviceFact = {
  readonly id: string;
  readonly model: string | null;
};

/** The slice of `SnapshotService` this service holds the device through. */
export type SnapshotLease = {
  suspend: (owner: SnapshotLeaseOwner) => Promise<void>;
  resume: (owner: SnapshotLeaseOwner) => void;
};

export type AiServiceDeps = {
  /** `CONFIG.AI_MODEL` — always the `sonnet` alias (§6.0). */
  readonly model: string;
  /** `CONFIG.AI_BUDGET_USD` — the §6.4 conversation ceiling. */
  readonly budgetUsd: number;
  /** `resources/conductor-plugin`, resolved for dev and packaged runs (§8.4). */
  readonly pluginDir: string;
  /** `CONFIG.FLOWS_DIR` — the one writable surface (§12.18 as amended). */
  readonly flowsDir: string;
  /** The active repo's clone, live — the child's cwd and the conversation's
   * subject; a switch resets the conversation (criterion 12). */
  readonly activeClone: () => ActiveClone | null;
  /** The active repo's single header id (§2.1), or `null` — a session fact
   * for the system prompt, never a constant (§12.6). */
  readonly appId: () => string | null;
  /** The selected device, for the context block — `null` when none. */
  readonly device: () => Promise<AiDeviceFact | null>;
  readonly resolveClaude: () => string | null;
  readonly resolveMaestro: () => string | null;
  readonly snapshots: SnapshotLease;
  /** The one streaming door (§10.1) — `spawnStreaming`, injected. */
  readonly spawn: (
    command: string,
    args: readonly string[],
    options: SpawnOptions,
  ) => StreamingProcess;
  /** The person's own environment — their `claude` login (§6.4, §9.0). */
  readonly env: NodeJS.ProcessEnv;
  readonly emit: (payload: Result<AiEvent>) => void;
  /** Criterion 10's injectable override. */
  readonly turnTimeoutMs?: number;
};

type ActiveTurn = {
  readonly turnId: string;
  readonly cloneRoot: string;
  /** Which conversation this turn belongs to — a reset ends one and starts
   * the next, and a killed turn's late cost must charge the ledger it spent
   * from, never the fresh one. */
  readonly conversation: number;
  child: StreamingProcess | null;
  canceled: boolean;
  timedOut: boolean;
  /** Unterminated stdout tail awaiting its newline. */
  lineBuffer: string;
  /** The last bytes the child said, for diagnosing a failed exit. */
  outputTail: string;
  /** From the `result` event: what the turn cost, its session, its verdict. */
  costUsd: number | null;
  resultSessionId: string | null;
  resultIsError: boolean | null;
  resultText: string | null;
  timer: ReturnType<typeof setTimeout> | null;
};

export class AiService {
  private readonly deps: AiServiceDeps;
  private turn: ActiveTurn | null = null;
  /** Monotonic, so a late event from a killed turn never wears a live one's
   * id (the run stream's rule). */
  private nextTurn = 1;
  /** The session the next turn resumes — only ever the id a *completed* turn
   * reported (criterion 4); a canceled or failed turn's id is discarded. */
  private sessionId: string | null = null;
  /** §6.4 — accumulated main-side and nowhere else. */
  private spentUsd = 0;
  /** Bumped by every reset; the ledger only takes costs from its own era. */
  private conversation = 0;
  private disposed = false;

  constructor(deps: AiServiceDeps) {
    this.deps = deps;
  }

  /**
   * Criterion 1's whole path: refuse what must be refused, take the slot
   * synchronously (two sends racing the awaits would spawn two children),
   * take the device lease, and spawn — the answer is the turn id, and
   * everything after it crosses as `ai:event` pushes.
   */
  async send(message: string, openFlowPath: string | null): Promise<Result<{ turnId: string }>> {
    if (this.disposed) {
      return refuse(ERROR_CODES.aiActive, 'Conductor is shutting down.');
    }
    const clone = this.deps.activeClone();
    if (clone === null) {
      return refuse(ERROR_CODES.aiNoRepo, 'Connect a project to use the assistant.');
    }
    const claude = this.deps.resolveClaude();
    if (claude === null) {
      return refuse(
        ERROR_CODES.aiClaudeMissing,
        'The assistant runs on Claude Code, which is not installed on this Mac. Install Claude Code and sign in with a Claude account to turn the assistant on.',
      );
    }
    if (this.turn !== null) {
      return refuse(
        ERROR_CODES.aiActive,
        'The assistant is already working on a reply. Stop it or wait for it to finish.',
      );
    }
    if (this.spentUsd >= this.deps.budgetUsd) {
      // Criterion 5 — a limit, never an amount (§6.4 as amended).
      return refuse(
        ERROR_CODES.aiBudgetExceeded,
        'This conversation has reached its limit — start a new one to keep going.',
      );
    }

    const turn: ActiveTurn = {
      turnId: `turn-${this.nextTurn}`,
      cloneRoot: clone.root,
      conversation: this.conversation,
      child: null,
      canceled: false,
      timedOut: false,
      lineBuffer: '',
      outputTail: '',
      costUsd: null,
      resultSessionId: null,
      resultIsError: null,
      resultText: null,
      timer: null,
    };
    this.nextTurn += 1;
    this.turn = turn;

    // Criterion 15 — the same discipline `RunService` holds: no capture may
    // be talking to the device when the child's `maestro mcp` wakes up. A
    // lease held by a run rejects with `run/active`, which is criterion 5's
    // symmetric refusal — surfaced untranslated.
    try {
      await this.deps.snapshots.suspend('ai');
    } catch (error) {
      this.turn = null;
      return refuse(codeOf(error), messageOf(error, 'The assistant could not start.'));
    }

    let systemPrompt: string;
    try {
      systemPrompt = await this.systemPrompt();
    } catch (error) {
      // The skill file is packaged with the app; not finding it is a broken
      // install, not a state the panel can fix — honest failure, no spawn.
      console.error('The work-in-conductor skill could not be read:', error);
      this.turn = null;
      this.deps.snapshots.resume('ai');
      return refuse(
        ERROR_CODES.aiTurnFailed,
        'The assistant could not start. Reinstall Conductor if this keeps happening.',
      );
    }

    const device = await this.deps.device().catch(() => null);
    if (this.turn !== turn) {
      // A reset or dispose landed while the device was being read.
      this.deps.snapshots.resume('ai');
      return refuse(ERROR_CODES.aiActive, 'The assistant was reset. Try again.');
    }

    const prompt = composePrompt(
      message,
      this.contextFlowPath(clone, openFlowPath),
      device,
      this.deps.flowsDir,
    );
    turn.child = this.deps.spawn(claude, this.argv(systemPrompt, prompt), {
      cwd: clone.root,
      // The person's own environment — their `claude` login (§9.0) — plus
      // §12 rule 10 for the maestro child ours spawns.
      env: { ...this.deps.env, MAESTRO_CLI_NO_ANALYTICS: '1' },
      // The child owns a JVM: the kill must take the whole tree.
      killTree: true,
    });
    turn.child.onStdout((chunk) => {
      this.consume(turn, chunk);
    });
    turn.child.onStderr((chunk) => {
      turn.outputTail = tail(turn.outputTail + chunk);
    });
    turn.child.onExit((reason) => {
      this.settle(turn, reason);
    });
    turn.timer = setTimeout(() => {
      // Criterion 10 — past the ceiling the child dies and the turn says so.
      turn.timedOut = true;
      turn.child?.kill();
    }, this.deps.turnTimeoutMs ?? TURN_TIMEOUT_MS);

    if (this.disposed || turn.canceled) {
      // `before-quit` or a cancel landed while the awaits above settled.
      turn.canceled = true;
      turn.child.kill();
    }

    this.push({ kind: 'turn-started', turnId: turn.turnId });
    return { ok: true, data: { turnId: turn.turnId } };
  }

  /** Criterion 11 — kill now, roll nothing back: an edit already on disk
   * stays (§12.23). The terminal event arrives when the exit does. */
  cancel(): Result<{ turnId: string | null }> {
    const turn = this.turn;
    if (turn === null) {
      return { ok: true, data: { turnId: null } };
    }
    turn.canceled = true;
    turn.child?.kill();
    return { ok: true, data: { turnId: turn.turnId } };
  }

  /** Criterion 12 — a fresh conversation: any turn ends, the remembered
   * session and the spend go, and the renderer empties the thread on the
   * pushed reset. */
  reset(): Result<{ turnId: string | null }> {
    const ended = this.clearConversation();
    this.push({ kind: 'reset' });
    return { ok: true, data: { turnId: ended } };
  }

  /** Criterion 12's implicit half — a conversation is about one repo's flows
   * and one clone's cwd, so a switch or disconnect resets it the same way. */
  activeRepoChanged(): void {
    this.clearConversation();
    this.push({ kind: 'reset' });
  }

  /** Criteria 6, 25 — what the panel and the status line ask. */
  status(): Result<{ ready: true }> {
    if (this.deps.activeClone() === null) {
      return refuse(ERROR_CODES.aiNoRepo, 'Connect a project to use the assistant.');
    }
    if (this.deps.resolveClaude() === null) {
      return refuse(
        ERROR_CODES.aiClaudeMissing,
        'The assistant runs on Claude Code, which is not installed on this Mac. Install Claude Code and sign in with a Claude account to turn the assistant on.',
      );
    }
    return { ok: true, data: { ready: true } };
  }

  /** Criterion 13 — `before-quit` leaves no `claude` child and no held lease
   * behind. */
  dispose(): void {
    this.disposed = true;
    if (this.turn !== null) {
      this.turn.canceled = true;
      this.turn.child?.kill();
    }
    this.deps.snapshots.resume('ai');
  }

  private clearConversation(): string | null {
    const turn = this.turn;
    if (turn !== null) {
      turn.canceled = true;
      if (turn.child === null) {
        // Not spawned yet, so no exit is coming to settle the slot. Freeing
        // it here makes the in-flight send see the slot change hands: it
        // releases the lease itself and answers a refusal instead of
        // spawning a turn into the conversation the reset just emptied.
        this.turn = null;
      } else {
        turn.child.kill();
      }
    }
    this.sessionId = null;
    this.spentUsd = 0;
    this.conversation += 1;
    return turn?.turnId ?? null;
  }

  /** The invocation, exactly as verified against the installed CLI — see the
   * PR's findings. The message rides after `--`, so a message that begins
   * with a dash can never parse as a flag (§12.19's spirit). */
  private argv(systemPrompt: string, prompt: string): string[] {
    const maestro = this.deps.resolveMaestro() ?? 'maestro';
    const remaining = (this.deps.budgetUsd - this.spentUsd).toFixed(4);
    return [
      '-p',
      '--model',
      this.deps.model,
      '--output-format',
      'stream-json',
      // Read off the installed CLI: -p + stream-json refuses without it.
      '--verbose',
      '--include-partial-messages',
      // §6.0 as amended — nothing of the user's configuration, only ours.
      '--setting-sources',
      '',
      '--strict-mcp-config',
      '--plugin-dir',
      this.deps.pluginDir,
      '--mcp-config',
      JSON.stringify({
        mcpServers: {
          maestro: {
            command: maestro,
            args: ['mcp', '--no-viewer'],
            env: { MAESTRO_CLI_NO_ANALYTICS: '1' },
          },
        },
      }),
      '--tools',
      BUILTIN_TOOLS,
      '--allowedTools',
      ...allowedTools(this.deps.flowsDir),
      '--max-budget-usd',
      remaining,
      '--append-system-prompt',
      systemPrompt,
      ...(this.sessionId === null ? [] : ['--resume', this.sessionId]),
      '--',
      prompt,
    ];
  }

  /**
   * Criterion 18 — the `work-in-conductor` body through the §8.4 read path
   * (`conductorPluginDir` + `stripFrontMatter`), read every turn so the skill
   * file stays the one source, plus the facts that hold for the whole
   * conversation.
   */
  private async systemPrompt(): Promise<string> {
    const path = join(this.deps.pluginDir, 'skills', 'work-in-conductor', 'SKILL.md');
    const body = stripFrontMatter(await readFile(path, 'utf8')).trimEnd();
    const appId = this.deps.appId();
    const facts = [
      '',
      '',
      '## This session',
      ...(appId === null
        ? []
        : [
            `- The app under test is \`appId: ${appId}\`. A new flow takes its header from a sibling flow, or from this id.`,
          ]),
      '- Always reply in the language the person writes in.',
    ];
    return `${body}${facts.join('\n')}\n`;
  }

  /** The open flow for the context block, only once it resolves inside the
   * flows folder (§9.3 — containment by resolution, never by pattern). */
  private contextFlowPath(clone: ActiveClone, openFlowPath: string | null): string | null {
    if (openFlowPath === null) {
      return null;
    }
    const root = resolve(clone.root, this.deps.flowsDir);
    const target = resolve(root, openFlowPath);
    if (target === root || !target.startsWith(root + sep)) {
      return null;
    }
    return relative(root, target).split(sep).join('/');
  }

  /**
   * One chunk of stream-json. Lines are reassembled across chunks; adjacent
   * text deltas inside a chunk coalesce into one push (constraint: a token
   * stream must not become whole-app re-renders); everything unknown is
   * ignored, never fatal (criterion 8 — the real stream carries kinds this
   * app never asked for).
   */
  private consume(turn: ActiveTurn, chunk: string): void {
    turn.outputTail = tail(turn.outputTail + chunk);
    turn.lineBuffer += chunk;
    const lines = turn.lineBuffer.split('\n');
    turn.lineBuffer = lines.pop() ?? '';

    let pendingText = '';
    const flushText = (): void => {
      if (pendingText !== '' && this.turn === turn) {
        this.push({ kind: 'text-delta', turnId: turn.turnId, text: pendingText });
      }
      pendingText = '';
    };

    for (const raw of lines) {
      let event: unknown;
      try {
        event = JSON.parse(raw);
      } catch {
        continue;
      }
      if (typeof event !== 'object' || event === null) {
        continue;
      }
      const typed = event as Record<string, unknown>;
      switch (typed.type) {
        case 'stream_event': {
          const inner = typed.event as Record<string, unknown> | undefined;
          if (inner === undefined) {
            break;
          }
          if (inner.type === 'content_block_delta') {
            const delta = inner.delta as Record<string, unknown> | undefined;
            if (delta?.type === 'text_delta' && typeof delta.text === 'string') {
              pendingText += delta.text;
            }
            break;
          }
          if (inner.type === 'content_block_start') {
            const block = inner.content_block as Record<string, unknown> | undefined;
            if (block?.type === 'tool_use' && typeof block.name === 'string') {
              flushText();
              this.pushActivity(turn, block.name);
            }
          }
          break;
        }
        case 'assistant': {
          // The completed content blocks — where a tool call's input is
          // whole, which is what the file-edited path needs (criterion 8).
          const message = typed.message as Record<string, unknown> | undefined;
          const content = Array.isArray(message?.content) ? message.content : [];
          for (const block of content as Array<Record<string, unknown>>) {
            if (block.type !== 'tool_use') {
              continue;
            }
            if (block.name !== 'Edit' && block.name !== 'Write') {
              continue;
            }
            const input = block.input as Record<string, unknown> | undefined;
            const path = this.editedFlowPath(turn, input?.file_path);
            if (path !== null) {
              flushText();
              this.push({ kind: 'file-edited', turnId: turn.turnId, path });
            }
          }
          break;
        }
        case 'result': {
          if (typeof typed.total_cost_usd === 'number') {
            turn.costUsd = typed.total_cost_usd;
          }
          if (typeof typed.session_id === 'string') {
            turn.resultSessionId = typed.session_id;
          }
          if (typeof typed.is_error === 'boolean') {
            turn.resultIsError = typed.is_error;
          }
          if (typeof typed.result === 'string') {
            turn.resultText = typed.result;
          }
          break;
        }
        default:
          // rate_limit_event, system/thinking_tokens, whatever ships next.
          break;
      }
    }
    flushText();
  }

  /** Criterion 9 — the mapping speaks the product's language; tool names
   * never cross the boundary. An unmapped tool says nothing at all. */
  private pushActivity(turn: ActiveTurn, tool: string): void {
    if (this.turn !== turn) {
      return;
    }
    const label =
      tool === 'Read' || tool === 'Glob' || tool === 'Grep'
        ? "Reading the app's code…"
        : tool === 'mcp__maestro__inspect_screen' || tool === 'mcp__maestro__take_screenshot'
          ? 'Looking at the screen…'
          : tool === 'mcp__maestro__list_devices'
            ? 'Checking the connected device…'
            : tool === 'mcp__maestro__cheat_sheet' || tool === 'Skill'
              ? 'Getting ready…'
              : tool === 'Edit' || tool === 'Write'
                ? 'Writing the test…'
                : null;
    if (label !== null) {
      this.push({ kind: 'activity', turnId: turn.turnId, label });
    }
  }

  /** An `Edit`/`Write` under `conductor/`, as the §7.2 flow identity —
   * `flow:changed`'s own vocabulary, so the renderer can open it. */
  private editedFlowPath(turn: ActiveTurn, filePath: unknown): string | null {
    if (typeof filePath !== 'string' || filePath === '') {
      return null;
    }
    const root = resolve(turn.cloneRoot, this.deps.flowsDir);
    const target = resolve(turn.cloneRoot, filePath);
    if (target === root || !target.startsWith(root + sep)) {
      return null;
    }
    return relative(root, target).split(sep).join('/');
  }

  /**
   * The one exit, whatever it was. Resume comes first — the end-of-turn
   * recapture rides on the terminal event finding the gate open, exactly as
   * `RunService.settle` reasons. Spend is accumulated on every outcome that
   * reported a cost; the session id is remembered only from a *completed*
   * turn (criterion 4).
   */
  private settle(turn: ActiveTurn, reason: ExitReason): void {
    if (this.turn !== turn) {
      return;
    }
    this.turn = null;
    if (turn.timer !== null) {
      clearTimeout(turn.timer);
      turn.timer = null;
    }
    this.deps.snapshots.resume('ai');
    if (turn.costUsd !== null && turn.conversation === this.conversation) {
      this.spentUsd += turn.costUsd;
    }

    const outcome = outcomeOf(turn, reason);
    if (outcome === 'done' && turn.resultSessionId !== null) {
      this.sessionId = turn.resultSessionId;
    }
    if (outcome === 'failed') {
      // The raw words stay in main's console (§8.0 — the panel gets product
      // language, whoever debugs gets the truth).
      console.error(
        `AI turn ${turn.turnId} failed:`,
        reason.error ?? `exit code ${reason.code}`,
        turn.outputTail.trim() === '' ? '' : `\n${turn.outputTail.trim()}`,
      );
    }
    this.push({
      kind: 'turn-ended',
      turnId: turn.turnId,
      outcome,
      message: outcome === 'failed' ? failureMessage(turn) : null,
    });
  }

  private push(event: AiEvent): void {
    if (this.disposed) {
      return;
    }
    this.deps.emit({ ok: true, data: event });
  }
}

/** Criterion 8's outcome — from the exit and the child's own verdict. */
function outcomeOf(turn: ActiveTurn, reason: ExitReason): 'done' | 'canceled' | 'failed' {
  if (turn.canceled) {
    return 'canceled';
  }
  if (turn.timedOut || reason.error !== null || reason.code !== 0) {
    return 'failed';
  }
  if (turn.resultIsError === false) {
    return 'done';
  }
  return 'failed';
}

/**
 * Criterion 7 — authentication is its own failure with its own fix, told
 * apart from the generic `ai/turn-failed` the way `repo/gh-missing` and
 * `repo/gh-unauthenticated` are. The patterns cover what the installed CLI
 * prints when it is signed out; anything unrecognized stays generic.
 */
function failureMessage(turn: ActiveTurn): string {
  if (turn.timedOut) {
    return 'The assistant took too long and was stopped. Try asking again.';
  }
  const said = `${turn.outputTail}\n${turn.resultText ?? ''}`;
  if (
    /invalid api key|please run \/login|not logged in|log ?in to continue|oauth|authentication/i.test(
      said,
    )
  ) {
    return 'The assistant needs you to sign in to Claude Code on this Mac. Open Claude Code, sign in, and try again.';
  }
  if (/budget/i.test(said)) {
    return 'This conversation has reached its limit — start a new one to keep going.';
  }
  return 'The assistant hit a problem and stopped. Try again.';
}

/** Criterion 19 — the app-authored fenced block, the person's words verbatim
 * after it. The device and flow facts are for the model, not the screen, so
 * ids are fine here (§8.0 governs app-authored *UI* strings). */
function composePrompt(
  message: string,
  flowPath: string | null,
  device: AiDeviceFact | null,
  flowsDir: string,
): string {
  const flow = flowPath === null ? 'none' : `${flowsDir}/${flowPath}`;
  const seen =
    device === null ? 'none' : device.model === null ? device.id : `${device.id} (${device.model})`;
  return [
    '[conductor-context — provided by the app, not typed by the person]',
    `flow open in the editor: ${flow}`,
    `connected device: ${seen}`,
    '[/conductor-context]',
    '',
    message,
  ].join('\n');
}

function tail(text: string): string {
  return text.length <= OUTPUT_TAIL_LIMIT ? text : text.slice(text.length - OUTPUT_TAIL_LIMIT);
}

/** Codes that are actually ours — the lease's rejection carries `run/active`
 * or `ai/active`; anything else falls back honestly. */
const KNOWN_CODES = new Set<string>(Object.values(ERROR_CODES));

function codeOf(error: unknown): ErrorCode {
  return typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    KNOWN_CODES.has(error.code)
    ? (error.code as ErrorCode)
    : ERROR_CODES.aiTurnFailed;
}

function messageOf(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function refuse(code: ErrorCode, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

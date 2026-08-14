import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type AiEvent, ERROR_CODES, type Result } from '@shared/ipc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExitReason, SpawnOptions, StreamingProcess } from '../process/run';
import { AiService, type AiServiceDeps, TURN_TIMEOUT_MS } from './ai.service';

/**
 * The turn lifecycle, driven end to end through a fake streaming child that
 * emits canned stream-json lines — the exact shapes read off claude 2.1.232
 * (spec constraint: behaviour read from the real binary, never deduced). No
 * `claude` runs here (§9.0); what these tests pin is *our* half: the argv,
 * the isolation flags, the lease, the budget arithmetic, the resume
 * bookkeeping, and what crosses as `ai:event`.
 */

/* ── the fake child ─────────────────────────────────────────────────────── */

type FakeChild = StreamingProcess & {
  emitStdout: (chunk: string) => void;
  emitExit: (reason: ExitReason) => void;
  killed: boolean;
};

function fakeChild(): FakeChild {
  const stdoutListeners: Array<(chunk: string) => void> = [];
  const exitListeners: Array<(reason: ExitReason) => void> = [];
  let exited: ExitReason | null = null;
  const child: FakeChild = {
    killed: false,
    write: () => {},
    onStdout: (listener) => {
      stdoutListeners.push(listener);
    },
    onStderr: () => {},
    onExit: (listener) => {
      if (exited !== null) {
        listener(exited);
        return;
      }
      exitListeners.push(listener);
    },
    kill: () => {
      child.killed = true;
    },
    emitStdout: (chunk) => {
      for (const listener of stdoutListeners) {
        listener(chunk);
      }
    },
    emitExit: (reason) => {
      exited = reason;
      for (const listener of exitListeners) {
        listener(reason);
      }
    },
  };
  return child;
}

type Spawned = {
  readonly command: string;
  readonly args: readonly string[];
  readonly options: SpawnOptions;
  readonly child: FakeChild;
};

/* ── canned stream lines (shapes from the installed CLI) ────────────────── */

const line = (value: unknown): string => `${JSON.stringify(value)}\n`;

const textDelta = (text: string): string =>
  line({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text } },
  });

const thinkingDelta = (thinking: string): string =>
  line({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking } },
  });

const toolStart = (name: string): string =>
  line({
    type: 'stream_event',
    event: { type: 'content_block_start', content_block: { type: 'tool_use', name } },
  });

const toolUse = (name: string, input: Record<string, unknown>): string =>
  line({
    type: 'assistant',
    message: { content: [{ type: 'tool_use', name, input }] },
  });

const resultLine = (over: Record<string, unknown> = {}): string =>
  line({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: 'done',
    total_cost_usd: 0.01,
    session_id: 'session-1',
    ...over,
  });

/* ── the deps harness ───────────────────────────────────────────────────── */

const pluginDir = mkdtempSync(join(tmpdir(), 'conductor-plugin-'));
mkdirSync(join(pluginDir, 'skills', 'work-in-conductor'), { recursive: true });
writeFileSync(
  join(pluginDir, 'skills', 'work-in-conductor', 'SKILL.md'),
  '---\nname: work-in-conductor\ndescription: test body\n---\n\n# House rules\n\nWrite the file.\n',
  'utf8',
);

const CLONE_ROOT = join(tmpdir(), 'conductor-test-clone');

type Harness = {
  readonly service: AiService;
  readonly spawns: Spawned[];
  readonly events: AiEvent[];
  readonly lease: { suspends: string[]; resumes: string[] };
};

function harness(over: Partial<AiServiceDeps> = {}): Harness {
  const spawns: Spawned[] = [];
  const events: AiEvent[] = [];
  const lease = { suspends: [] as string[], resumes: [] as string[] };
  const deps: AiServiceDeps = {
    model: 'sonnet',
    budgetUsd: 0.5,
    pluginDir,
    flowsDir: 'conductor',
    activeClone: () => ({ slug: 'acme-shop', org: 'acme', name: 'shop', root: CLONE_ROOT }),
    appId: () => 'com.acme.shop',
    device: () => Promise.resolve({ id: 'emulator-5554', model: 'Pixel 7' }),
    resolveClaude: () => '/fake/claude',
    resolveMaestro: () => '/fake/maestro',
    snapshots: {
      suspend: (owner) => {
        lease.suspends.push(owner);
        return Promise.resolve();
      },
      resume: (owner) => {
        lease.resumes.push(owner);
      },
    },
    spawn: (command, args, options) => {
      const child = fakeChild();
      spawns.push({ command, args, options, child });
      return child;
    },
    env: { PATH: '/usr/bin', HOME: '/Users/someone' },
    emit: (payload: Result<AiEvent>) => {
      if (payload.ok) {
        events.push(payload.data);
      }
    },
    ...over,
  };
  return { service: new AiService(deps), spawns, events, lease };
}

function refusalCode(result: Result<unknown>): string {
  if (result.ok) {
    throw new Error('Expected a refusal, got a turn.');
  }
  return result.error.code;
}

function refusalMessage(result: Result<unknown>): string {
  if (result.ok) {
    throw new Error('Expected a refusal, got a turn.');
  }
  return result.error.message;
}

/** The value following a flag in the argv. */
function flagValue(args: readonly string[], flag: string): string {
  const at = args.indexOf(flag);
  if (at === -1 || at + 1 >= args.length) {
    throw new Error(`${flag} is not in the argv: ${args.join(' ')}`);
  }
  return args[at + 1] as string;
}

/** The variadic entries following a flag, up to the next `--`-prefixed token. */
function flagValues(args: readonly string[], flag: string): string[] {
  const at = args.indexOf(flag);
  if (at === -1) {
    throw new Error(`${flag} is not in the argv.`);
  }
  const values: string[] = [];
  for (let index = at + 1; index < args.length; index += 1) {
    const value = args[index] as string;
    if (value.startsWith('--')) {
      break;
    }
    values.push(value);
  }
  return values;
}

async function startTurn(h: Harness, message = 'Write a login test'): Promise<Spawned> {
  const result = await h.service.send(message, null);
  if (!result.ok) {
    throw new Error(`send refused: ${result.error.code}`);
  }
  const spawned = h.spawns.at(-1);
  if (spawned === undefined) {
    throw new Error('Nothing was spawned.');
  }
  return spawned;
}

/** Runs a whole successful turn so the next send resumes from `sessionId`. */
async function completeTurn(h: Harness, over: Record<string, unknown> = {}): Promise<void> {
  const spawned = await startTurn(h);
  spawned.child.emitStdout(resultLine(over));
  spawned.child.emitExit({ code: 0, error: null });
}

afterEach(() => {
  vi.useRealTimers();
});

/* ── the spawn: isolation, allowlist, containment (criteria 1–3, 18–19) ── */

describe('the spawned child', () => {
  it('spawns exactly one claude per turn, through the injected seam', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    expect(h.spawns).toHaveLength(1);
    expect(spawned.command).toBe('/fake/claude');
  });

  it('carries the verified invocation profile', async () => {
    const h = harness();
    const { args } = await startTurn(h);

    expect(args).toContain('-p');
    expect(flagValue(args, '--model')).toBe('sonnet');
    expect(flagValue(args, '--output-format')).toBe('stream-json');
    // Read off the installed CLI: -p + stream-json refuses without it.
    expect(args).toContain('--verbose');
    expect(args).toContain('--include-partial-messages');
    expect(flagValue(args, '--setting-sources')).toBe('');
    expect(args).toContain('--strict-mcp-config');
    expect(flagValue(args, '--plugin-dir')).toBe(pluginDir);
    expect(args).not.toContain('--bare');
  });

  it('runs one maestro mcp server, offline, through --mcp-config', async () => {
    const h = harness();
    const { args } = await startTurn(h);

    const config = JSON.parse(flagValue(args, '--mcp-config'));
    expect(config).toEqual({
      mcpServers: {
        maestro: {
          command: '/fake/maestro',
          args: ['mcp', '--no-viewer'],
          env: { MAESTRO_CLI_NO_ANALYTICS: '1' },
        },
      },
    });
  });

  /** §4.3.4 — the allowlist, exactly, with the criterion-3 containment rules
   * on the write tools and the whole-clone scope on Read. `Skill` is
   * deliberately not here: it needs no permission entry (verified), so the
   * allowlist stays exactly the spec's nine. */
  it('allowlists exactly the nine tools, writes scoped to conductor/', async () => {
    const h = harness();
    const { args } = await startTurn(h);

    expect(flagValues(args, '--allowedTools')).toEqual([
      'mcp__maestro__inspect_screen',
      'mcp__maestro__take_screenshot',
      'mcp__maestro__list_devices',
      'mcp__maestro__cheat_sheet',
      'Read(**)',
      'Edit(conductor/**)',
      'Write(conductor/**)',
      'Glob',
      'Grep',
    ]);
  });

  /** §12.18's "no Bash" holds by construction: the tool is not even
   * available, not merely unpermitted. `Skill` rides here or the plugin's
   * skills could never load (verified against the installed CLI). */
  it('restricts the available toolset — no Bash anywhere in the argv', async () => {
    const h = harness();
    const { args } = await startTurn(h);

    expect(flagValue(args, '--tools')).toBe('Read,Edit,Write,Glob,Grep,Skill');
    expect(args.join(' ')).not.toMatch(/Bash/);
    expect(args).not.toContain('--disallowedTools');
    expect(args).not.toContain('--disallowed-tools');
  });

  it('rides the full budget on the first turn', async () => {
    const h = harness();
    const { args } = await startTurn(h);

    expect(Number.parseFloat(flagValue(args, '--max-budget-usd'))).toBeCloseTo(0.5);
  });

  /** Criterion 2 — cwd is the clone root, the env is the person's own plus
   * the analytics kill-switch, and the kill takes the whole tree: the child
   * owns a JVM. */
  it('runs in the clone root under the passed-through env', async () => {
    const h = harness();
    const { options } = await startTurn(h);

    expect(options.cwd).toBe(CLONE_ROOT);
    expect(options.env).toMatchObject({
      PATH: '/usr/bin',
      HOME: '/Users/someone',
      MAESTRO_CLI_NO_ANALYTICS: '1',
    });
    expect(options.killTree).toBe(true);
  });

  /** Criterion 2 + §12.19 — the message is one argv element, after the `--`
   * terminator so a message that begins with a dash can never parse as a
   * flag (verified against the installed CLI). */
  it('crosses the message as the final argv element, behind --', async () => {
    const h = harness();
    const { args } = await startTurn(h, '-p is how this message starts');

    expect(args.at(-2)).toBe('--');
    expect(args.at(-1)).toContain('-p is how this message starts');
  });

  it('spawns nothing while a turn is already being prepared', async () => {
    let release: (value: { id: string; model: string | null } | null) => void = () => {};
    const gate = new Promise<{ id: string; model: string | null } | null>((resolvePromise) => {
      release = resolvePromise;
    });
    const slow = harness({ device: () => gate });

    const first = slow.service.send('one', null);
    const second = await slow.service.send('two', null);

    expect(refusalCode(second)).toBe(ERROR_CODES.aiActive);
    release(null);
    expect((await first).ok).toBe(true);
    expect(slow.spawns).toHaveLength(1);
  });
});

/* ── context the model receives (criteria 18–20) ────────────────────────── */

describe('the context', () => {
  it('appends the work-in-conductor body, frontmatter stripped, plus the session facts', async () => {
    const h = harness();
    const { args } = await startTurn(h);

    const prompt = flagValue(args, '--append-system-prompt');
    expect(prompt).toContain('# House rules');
    expect(prompt).toContain('Write the file.');
    expect(prompt).not.toContain('name: work-in-conductor');
    expect(prompt).toContain('com.acme.shop');
    expect(prompt).toMatch(/language the person/i);
  });

  it('omits the appId fact when no id is known', async () => {
    const h = harness({ appId: () => null });
    const { args } = await startTurn(h);

    expect(flagValue(args, '--append-system-prompt')).not.toContain('appId');
  });

  /** Criterion 19 — the volatile facts ride each message in an app-authored
   * fenced block; the person's words cross verbatim after it. */
  it('prepends the fenced context block and keeps the words verbatim', async () => {
    const h = harness();
    const result = await h.service.send('Quero um teste do login', 'checkout/pix.yml');

    expect(result.ok).toBe(true);
    const message = h.spawns[0]?.args.at(-1) as string;
    expect(message).toContain('[conductor-context');
    expect(message).toContain('[/conductor-context]');
    expect(message).toContain('conductor/checkout/pix.yml');
    expect(message).toContain('emulator-5554 (Pixel 7)');
    expect(message.endsWith('Quero um teste do login')).toBe(true);
  });

  it('says when no flow is open and no device is connected — and still sends', async () => {
    const h = harness({ device: () => Promise.resolve(null) });
    const result = await h.service.send('oi', null);

    expect(result.ok).toBe(true);
    const message = h.spawns[0]?.args.at(-1) as string;
    expect(message).toMatch(/flow open in the editor: none/);
    expect(message).toMatch(/connected device: none/);
  });

  /** A flow path that resolves outside `conductor/` is nobody's context. */
  it('drops an open-flow path that escapes the flows folder', async () => {
    const h = harness();
    await h.service.send('oi', '../secrets.env');

    const message = h.spawns[0]?.args.at(-1) as string;
    expect(message).not.toContain('secrets.env');
    expect(message).toMatch(/flow open in the editor: none/);
  });
});

/* ── refusals (criteria 5–6) ────────────────────────────────────────────── */

describe('refusing a send', () => {
  it('refuses with ai/no-repo before a repo is connected', async () => {
    const h = harness({ activeClone: () => null });

    expect(refusalCode(await h.service.send('oi', null))).toBe(ERROR_CODES.aiNoRepo);
    expect(h.spawns).toHaveLength(0);
  });

  it('refuses with ai/claude-missing when no binary resolves, in product language', async () => {
    const h = harness({ resolveClaude: () => null });
    const result = await h.service.send('oi', null);

    expect(refusalCode(result)).toBe(ERROR_CODES.aiClaudeMissing);
    expect(refusalMessage(result)).toMatch(/Claude Code/);
    expect(refusalMessage(result)).toMatch(/install/i);
  });

  it('refuses a second send while a turn is in flight', async () => {
    const h = harness();
    await startTurn(h);

    expect(refusalCode(await h.service.send('another', null))).toBe(ERROR_CODES.aiActive);
    expect(h.spawns).toHaveLength(1);
  });

  /** Criterion 5 — the lease held by a run refuses the send with the run's
   * own code, and the slot is released so the next send can try again. */
  it('refuses with run/active while a flow run holds the device', async () => {
    const h = harness({
      snapshots: {
        suspend: () =>
          Promise.reject(
            Object.assign(new Error('A flow is running on the device. Try again when it ends.'), {
              code: ERROR_CODES.runActive,
            }),
          ),
        resume: () => {},
      },
    });
    const result = await h.service.send('oi', null);

    expect(refusalCode(result)).toBe(ERROR_CODES.runActive);
    expect(h.spawns).toHaveLength(0);
    // The refused attempt left no slot behind: with the lease free the next
    // send goes through.
    const again = harness();
    expect((await again.service.send('oi', null)).ok).toBe(true);
  });

  /** Criterion 5 — the budget refusal names a limit, never an amount. */
  it('refuses with ai/budget-exceeded once the conversation spent its ceiling', async () => {
    const h = harness({ budgetUsd: 0.05 });
    await completeTurn(h, { total_cost_usd: 0.05 });

    const result = await h.service.send('more', null);

    expect(refusalCode(result)).toBe(ERROR_CODES.aiBudgetExceeded);
    expect(refusalMessage(result)).toMatch(/limit/i);
    expect(refusalMessage(result)).toMatch(/start a new/i);
    expect(refusalMessage(result)).not.toMatch(/[0-9]|\$|usd/i);
  });

  it('rides the remaining budget on the next turn', async () => {
    const h = harness({ budgetUsd: 0.5 });
    await completeTurn(h, { total_cost_usd: 0.2 });

    const { args } = await startTurn(h);

    expect(Number.parseFloat(flagValue(args, '--max-budget-usd'))).toBeCloseTo(0.3);
  });
});

/* ── the stream (criteria 8–9) ──────────────────────────────────────────── */

describe('the stream', () => {
  it('pushes turn-started when the child spawns', async () => {
    const h = harness();
    const result = await h.service.send('oi', null);

    expect(result.ok && result.data.turnId).toBe('turn-1');
    expect(h.events[0]).toEqual({ kind: 'turn-started', turnId: 'turn-1' });
  });

  it('forwards text deltas as they arrive, and never thinking', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    spawned.child.emitStdout(thinkingDelta('hmm'));
    spawned.child.emitStdout(textDelta('Vou escrever'));
    spawned.child.emitStdout(textDelta(' o teste.'));

    const text = h.events
      .filter((event) => event.kind === 'text-delta')
      .map((event) => (event as { text: string }).text)
      .join('');
    expect(text).toBe('Vou escrever o teste.');
    expect(JSON.stringify(h.events)).not.toContain('hmm');
  });

  it('reassembles a line split across chunks', async () => {
    const h = harness();
    const spawned = await startTurn(h);
    const whole = textDelta('inteiro');

    spawned.child.emitStdout(whole.slice(0, 12));
    spawned.child.emitStdout(whole.slice(12));

    expect(h.events.some((event) => event.kind === 'text-delta')).toBe(true);
  });

  /** Criterion 9 — product language, never tool vocabulary. */
  it('maps tool starts to product-language activity', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    spawned.child.emitStdout(toolStart('Read'));
    spawned.child.emitStdout(toolStart('mcp__maestro__inspect_screen'));
    spawned.child.emitStdout(toolStart('Edit'));

    const labels = h.events
      .filter((event) => event.kind === 'activity')
      .map((event) => (event as { label: string }).label);
    expect(labels).toEqual([
      "Reading the app's code…",
      'Looking at the screen…',
      'Writing the test…',
    ]);
    for (const label of labels) {
      expect(label).not.toMatch(/mcp__|Edit|Read\b|YAML|selector|regex/);
    }
  });

  /** Criterion 8 — an Edit/Write under `conductor/` crosses as the §7.2 flow
   * identity; anything else crosses as nothing. */
  it('reports a file edit with the conductor-relative path', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    spawned.child.emitStdout(
      toolUse('Edit', { file_path: join(CLONE_ROOT, 'conductor', 'checkout', 'pix.yml') }),
    );
    spawned.child.emitStdout(toolUse('Write', { file_path: join(CLONE_ROOT, 'README.md') }));
    spawned.child.emitStdout(
      toolUse('Read', { file_path: join(CLONE_ROOT, 'conductor', 'a.yml') }),
    );

    const edits = h.events.filter((event) => event.kind === 'file-edited');
    expect(edits).toEqual([{ kind: 'file-edited', turnId: 'turn-1', path: 'checkout/pix.yml' }]);
  });

  it('resolves a relative edit path against the clone root', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    spawned.child.emitStdout(toolUse('Write', { file_path: 'conductor/login.yml' }));

    expect(h.events.filter((event) => event.kind === 'file-edited')).toEqual([
      { kind: 'file-edited', turnId: 'turn-1', path: 'login.yml' },
    ]);
  });

  /** The real stream carries kinds this app never asked for
   * (`rate_limit_event`, `system/thinking_tokens`) — and whatever the next
   * CLI adds. None of it may kill a turn. */
  it('ignores unknown event kinds and unparsable lines', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    spawned.child.emitStdout(line({ type: 'rate_limit_event', rate_limit_info: {} }));
    spawned.child.emitStdout(line({ type: 'system', subtype: 'thinking_tokens' }));
    spawned.child.emitStdout('this is not json\n');
    spawned.child.emitStdout(textDelta('ainda vivo'));

    expect(h.events.some((event) => event.kind === 'text-delta')).toBe(true);
  });

  /** §6.4 as amended — spend is main-side arithmetic. No event carries it. */
  it('pushes no event carrying a cost', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    spawned.child.emitStdout(resultLine({ total_cost_usd: 0.1234 }));
    spawned.child.emitExit({ code: 0, error: null });

    expect(JSON.stringify(h.events)).not.toMatch(/cost|usd|budget|0\.1234/i);
  });
});

/* ── the turn's end (criteria 4, 7, 10–11) ──────────────────────────────── */

describe('ending a turn', () => {
  it('ends done on a clean exit and remembers the session for --resume', async () => {
    const h = harness();
    await completeTurn(h, { session_id: 'session-abc' });

    expect(h.events.at(-1)).toEqual({
      kind: 'turn-ended',
      turnId: 'turn-1',
      outcome: 'done',
      message: null,
    });

    const { args } = await startTurn(h);
    expect(flagValue(args, '--resume')).toBe('session-abc');
  });

  it('passes no --resume on the first turn', async () => {
    const h = harness();
    const { args } = await startTurn(h);

    expect(args).not.toContain('--resume');
  });

  it('ends canceled on cancel, keeps the lease discipline, and discards the id', async () => {
    const h = harness();
    await completeTurn(h, { session_id: 'session-good' });
    const spawned = await startTurn(h);

    const canceled = h.service.cancel();
    expect(canceled.ok && canceled.data.turnId).toBe('turn-2');
    expect(spawned.child.killed).toBe(true);

    spawned.child.emitExit({ code: null, error: null });
    expect(h.events.at(-1)).toEqual({
      kind: 'turn-ended',
      turnId: 'turn-2',
      outcome: 'canceled',
      message: null,
    });

    // Criterion 4 — the next turn resumes from the last *completed* state.
    const { args } = await startTurn(h);
    expect(flagValue(args, '--resume')).toBe('session-good');
  });

  it('answers a cancel with no turn in flight as null, and emits nothing', async () => {
    const h = harness();
    const result = h.service.cancel();

    expect(result.ok && result.data.turnId).toBeNull();
    expect(h.events).toHaveLength(0);
  });

  it('ends failed on a non-zero exit, with an honest generic message', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    spawned.child.emitExit({ code: 1, error: null });

    const ended = h.events.at(-1) as { outcome: string; message: string };
    expect(ended.outcome).toBe('failed');
    expect(ended.message).toMatch(/assistant/i);
  });

  /** Criterion 7 — authentication is its own failure, with its own fix. */
  it('says the Claude sign-in is needed when the child failed on auth', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    spawned.child.emitStdout('Invalid API key · Please run /login\n');
    spawned.child.emitExit({ code: 1, error: null });

    const ended = h.events.at(-1) as { outcome: string; message: string };
    expect(ended.outcome).toBe('failed');
    expect(ended.message).toMatch(/sign in/i);
  });

  it('ends failed when the result reports an error even on a clean exit', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    spawned.child.emitStdout(resultLine({ subtype: 'error_during_execution', is_error: true }));
    spawned.child.emitExit({ code: 0, error: null });

    expect((h.events.at(-1) as { outcome: string }).outcome).toBe('failed');
  });

  /** Criterion 10 — the ceiling is generous and injectable; past it the child
   * is killed and the turn says so honestly. */
  it('kills the child at the time ceiling and ends failed', async () => {
    vi.useFakeTimers();
    const h = harness({ turnTimeoutMs: 5_000 });
    const spawned = await startTurn(h);

    vi.advanceTimersByTime(5_001);
    expect(spawned.child.killed).toBe(true);

    spawned.child.emitExit({ code: null, error: null });
    const ended = h.events.at(-1) as { outcome: string; message: string };
    expect(ended.outcome).toBe('failed');
    expect(ended.message).toMatch(/too long|stopped/i);
  });

  it('defaults the ceiling to minutes, not seconds', () => {
    expect(TURN_TIMEOUT_MS).toBeGreaterThanOrEqual(5 * 60_000);
  });

  /** Criterion 15 — the lease wraps the turn, whatever the outcome. */
  it('suspends as ai before the spawn and resumes on every outcome', async () => {
    const done = harness();
    await completeTurn(done);
    expect(done.lease.suspends).toEqual(['ai']);
    expect(done.lease.resumes).toEqual(['ai']);

    const failed = harness();
    const spawnedFailed = await startTurn(failed);
    spawnedFailed.child.emitExit({ code: 1, error: null });
    expect(failed.lease.resumes).toEqual(['ai']);

    const canceled = harness();
    const spawnedCanceled = await startTurn(canceled);
    canceled.service.cancel();
    spawnedCanceled.child.emitExit({ code: null, error: null });
    expect(canceled.lease.resumes).toEqual(['ai']);
  });
});

/* ── reset, repo change, dispose (criteria 12–13) ───────────────────────── */

describe('reset and dispose', () => {
  it('reset ends the turn, clears the session and the spend, and pushes the reset', async () => {
    const h = harness();
    await completeTurn(h, { session_id: 'session-old', total_cost_usd: 0.2 });
    const spawned = await startTurn(h);

    const result = h.service.reset();

    expect(result.ok && result.data.turnId).toBe('turn-2');
    expect(spawned.child.killed).toBe(true);
    expect(h.events.at(-1)).toEqual({ kind: 'reset' });

    spawned.child.emitExit({ code: null, error: null });
    // A fresh conversation: no --resume, the full budget again.
    const { args } = await startTurn(h);
    expect(args).not.toContain('--resume');
    expect(Number.parseFloat(flagValue(args, '--max-budget-usd'))).toBeCloseTo(0.5);
  });

  it('reset with nothing in flight still clears and pushes', async () => {
    const h = harness();
    await completeTurn(h, { session_id: 'session-old' });

    const result = h.service.reset();

    expect(result.ok && result.data.turnId).toBeNull();
    expect(h.events.at(-1)).toEqual({ kind: 'reset' });
    const { args } = await startTurn(h);
    expect(args).not.toContain('--resume');
  });

  /** A reset racing a send that has not spawned yet: the turn dies before it
   * exists, the lease settles, and the emptied thread stays empty — the send
   * answers a refusal, never a live turn. */
  it('a reset during preparation stops the turn before it spawns', async () => {
    let release: (value: { id: string; model: string | null } | null) => void = () => {};
    const gate = new Promise<{ id: string; model: string | null } | null>((resolvePromise) => {
      release = resolvePromise;
    });
    const h = harness({ device: () => gate });

    const pending = h.service.send('oi', null);
    const result = h.service.reset();
    expect(result.ok && result.data.turnId).toBe('turn-1');
    release(null);

    expect(refusalCode(await pending)).toBe(ERROR_CODES.aiActive);
    expect(h.spawns).toHaveLength(0);
    expect(h.lease.resumes).toEqual(['ai']);
  });

  /** A turn the reset killed belongs to the conversation the reset ended —
   * its reported cost must not charge the fresh ledger. */
  it('a turn killed by reset never charges the fresh conversation', async () => {
    const h = harness({ budgetUsd: 0.5 });
    const spawned = await startTurn(h);
    spawned.child.emitStdout(resultLine({ total_cost_usd: 0.2 }));

    h.service.reset();
    spawned.child.emitExit({ code: null, error: null });

    const { args } = await startTurn(h);
    expect(Number.parseFloat(flagValue(args, '--max-budget-usd'))).toBeCloseTo(0.5);
  });

  /** Criterion 12 — a conversation is about one repo's flows and one clone's
   * cwd: switching or disconnecting resets implicitly. */
  it('a repo switch resets the conversation the same way', async () => {
    const h = harness();
    await completeTurn(h, { session_id: 'session-old' });

    h.service.activeRepoChanged();

    expect(h.events.at(-1)).toEqual({ kind: 'reset' });
    const { args } = await startTurn(h);
    expect(args).not.toContain('--resume');
  });

  /** Criterion 13 — before-quit leaves no claude child behind. */
  it('dispose kills the live child, settles the lease, and refuses new sends', async () => {
    const h = harness();
    const spawned = await startTurn(h);

    h.service.dispose();

    expect(spawned.child.killed).toBe(true);
    expect(h.lease.resumes).toContain('ai');
    expect(refusalCode(await h.service.send('oi', null))).toBe(ERROR_CODES.aiActive);
  });
});

/* ── status (criteria 6, 25) ────────────────────────────────────────────── */

describe('status', () => {
  it('answers ready when a repo and a claude are both there', () => {
    const h = harness();
    const result = h.service.status();

    expect(result.ok && result.data.ready).toBe(true);
  });

  it('answers ai/no-repo before a repo is connected', () => {
    const h = harness({ activeClone: () => null });

    expect(refusalCode(h.service.status())).toBe(ERROR_CODES.aiNoRepo);
  });

  it('answers ai/claude-missing when no binary resolves', () => {
    const h = harness({ resolveClaude: () => null });

    expect(refusalCode(h.service.status())).toBe(ERROR_CODES.aiClaudeMissing);
  });
});

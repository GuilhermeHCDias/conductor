import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Result } from '@shared/ipc';
import { ERROR_CODES } from '@shared/ipc';
import type { RunEvent } from '@shared/types';
import { afterEach, describe, expect, it } from 'vitest';
import type { MaestroGateway, RunFlowHandlers } from '../maestro/MaestroGateway';
import { RunService } from './run.service';

/**
 * The run lifecycle against a fake Gateway and a fake snapshot gate: ordering,
 * outcome-from-exit, cancellation, the temp-file's life, and §4.3.2's mutual
 * exclusion. No maestro and no filesystem beyond a scratch temp dir — the
 * file's atomicity story is §8.2's, exercised here only as "written before the
 * spawn, gone after the settle".
 */

const YAML = 'appId: com.vtex.pnp\n---\n- launchApp\n';
const DEVICE = 'R9QYC01EMXL';

type StartedRun = {
  deviceId: string;
  flowPath: string;
  handlers: RunFlowHandlers;
  killed: number;
};

function coded(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const scratch: string[] = [];

afterEach(() => {
  for (const dir of scratch.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function harness(overrides: { spawnError?: Error; holdSuspend?: boolean } = {}): {
  service: RunService;
  runs: StartedRun[];
  events: RunEvent[];
  gateCalls: string[];
  releaseSuspend: () => void;
  runsDir: string;
} {
  const dir = mkdtempSync(join(tmpdir(), 'conductor-run-service-'));
  scratch.push(dir);
  const runsDir = join(dir, 'runs');

  const runs: StartedRun[] = [];
  const gateway = {
    listDevices: () => Promise.reject(new Error('RunService does not list devices.')),
    deviceProperties: () => Promise.reject(new Error('RunService does not read properties.')),
    appIdentity: () => Promise.reject(new Error('RunService does not read app identity.')),
    hierarchy: () => Promise.reject(new Error('RunService never touches the mcp child.')),
    screenshot: () => Promise.reject(new Error('RunService does not capture.')),
    startMirror: () => Promise.reject(new Error('RunService does not open mirrors.')),
    runFlow: (deviceId: string, flowPath: string, handlers: RunFlowHandlers) => {
      if (overrides.spawnError !== undefined) {
        throw overrides.spawnError;
      }
      const started: StartedRun = { deviceId, flowPath, handlers, killed: 0 };
      runs.push(started);
      return {
        kill: () => {
          started.killed += 1;
        },
      };
    },
  } as unknown as MaestroGateway;

  const gateCalls: string[] = [];
  let releaseSuspend: () => void = () => {};
  const snapshots = {
    suspend: (): Promise<void> => {
      gateCalls.push('suspend');
      if (overrides.holdSuspend === true) {
        return new Promise((resolve) => {
          releaseSuspend = resolve;
        });
      }
      return Promise.resolve();
    },
    resume: (): void => {
      gateCalls.push('resume');
    },
  };

  const events: RunEvent[] = [];
  const service = new RunService({
    gateway,
    snapshots,
    runsDir,
    emit: (payload: Result<RunEvent>) => {
      if (payload.ok) {
        events.push(payload.data);
      }
    },
  });

  return { service, runs, events, gateCalls, releaseSuspend: () => releaseSuspend(), runsDir };
}

function runId(result: Result<{ runId: string }>): string {
  if (!result.ok) {
    throw new Error(`Expected a run, got ${result.error.code}: ${result.error.message}`);
  }
  return result.data.runId;
}

function code(result: Result<unknown>): string {
  if (result.ok) {
    throw new Error('Expected a refusal, got a success.');
  }
  return result.error.code;
}

describe('starting a run', () => {
  /** Criterion 1 — the id comes back the moment the child is spawned; the
   * run's completion is nowhere in this answer. */
  it('answers a fresh run id as soon as the child is spawned', async () => {
    const { service, runs, events } = harness();

    const result = await service.start(DEVICE, YAML);

    expect(runId(result)).toBe('run-1');
    expect(runs).toHaveLength(1);
    expect(runs[0]?.deviceId).toBe(DEVICE);
    expect(events.filter((event) => event.type === 'finished')).toEqual([]);
  });

  /** Criterion 1 — the in-memory flow, materialised where the app owns files. */
  it('writes the flow text to the temp file it hands maestro', async () => {
    const { service, runs, runsDir } = harness();

    await service.start(DEVICE, YAML);

    const flowPath = runs[0]?.flowPath ?? '';
    expect(flowPath.startsWith(runsDir)).toBe(true);
    expect(readFileSync(flowPath, 'utf8')).toBe(YAML);
  });

  /** Criterion 6 — started first, then progress, every event tagged. */
  it('emits started and forwards progress tagged with the run id', async () => {
    const { service, runs, events } = harness();
    await service.start(DEVICE, YAML);

    runs[0]?.handlers.onProgress({ type: 'step-started', label: 'Launch app "x"' });
    runs[0]?.handlers.onProgress({ type: 'log', lines: ['Running on R9QYC01EMXL'] });

    expect(events).toEqual([
      { type: 'started', runId: 'run-1' },
      { type: 'step-started', runId: 'run-1', label: 'Launch app "x"' },
      { type: 'log', runId: 'run-1', lines: ['Running on R9QYC01EMXL'] },
    ]);
  });

  /** Criterion 4 — one run at a time, per window. */
  it('refuses a second start while one is active', async () => {
    const { service, runs } = harness();
    await service.start(DEVICE, YAML);

    expect(code(await service.start(DEVICE, YAML))).toBe(ERROR_CODES.runActive);
    expect(runs).toHaveLength(1);
  });

  it('allows a new run once the previous one settled', async () => {
    const { service, runs } = harness();
    await service.start(DEVICE, YAML);
    runs[0]?.handlers.onExit({ code: 0, error: null });

    expect(runId(await service.start(DEVICE, YAML))).toBe('run-2');
  });

  /** Criterion 3 — the resolver's own code crosses, and the failed start
   * leaves nothing behind: no file, no suspension, no events. */
  it('answers the resolver’s code when maestro is missing, and cleans up', async () => {
    const missing = coded(ERROR_CODES.runMaestroNotFound, 'The Maestro CLI is not installed.');
    const { service, events, gateCalls, runsDir } = harness({ spawnError: missing });

    const result = await service.start(DEVICE, YAML);

    expect(code(result)).toBe(ERROR_CODES.runMaestroNotFound);
    expect(events).toEqual([]);
    expect(gateCalls).toEqual(['suspend', 'resume']);
    expect(existsSync(join(runsDir, 'run-1.yaml'))).toBe(false);
    // The slot was cleared: the next click reaches the resolver again instead
    // of being refused as run/active over a run that never began.
    expect(code(await service.start(DEVICE, YAML))).toBe(ERROR_CODES.runMaestroNotFound);
  });

  it('answers run/start-failed when the temp file cannot be written', async () => {
    const { service, runsDir, gateCalls } = harness();
    // The runs dir's place is taken by a file, so mkdir cannot create it.
    writeFileSync(runsDir, 'not a directory');

    expect(code(await service.start(DEVICE, YAML))).toBe(ERROR_CODES.runStartFailed);
    expect(gateCalls).toEqual(['suspend', 'resume']);
  });
});

describe('the outcome', () => {
  /** Criterion 7 — the verdict is the exit's, never the parser's. */
  it.each([
    ['passed', { code: 0, error: null }, null],
    ['failed', { code: 1, error: null }, 'Maestro exited with code 1.'],
  ] as const)('exit %s', async (outcome, reason, message) => {
    const { service, runs, events } = harness();
    await service.start(DEVICE, YAML);

    runs[0]?.handlers.onExit(reason);

    expect(events.at(-1)).toEqual({ type: 'finished', runId: 'run-1', outcome, message });
  });

  it('reports a child that never started as an error with its cause', async () => {
    const { service, runs, events } = harness();
    await service.start(DEVICE, YAML);

    runs[0]?.handlers.onExit({ code: null, error: new Error('spawn maestro ENOENT') });

    expect(events.at(-1)).toEqual({
      type: 'finished',
      runId: 'run-1',
      outcome: 'error',
      message: 'spawn maestro ENOENT',
    });
  });

  it('reports a signal nobody sent as an error', async () => {
    const { service, runs, events } = harness();
    await service.start(DEVICE, YAML);

    runs[0]?.handlers.onExit({ code: null, error: null });

    expect(events.at(-1)).toMatchObject({ type: 'finished', outcome: 'error' });
  });

  /** Criterion 5 — gone when the run ends, whatever the outcome. */
  it.each([
    ['a pass', { code: 0, error: null }],
    ['a failure', { code: 1, error: null }],
  ] as const)('deletes the temp file after %s', async (_label, reason) => {
    const { service, runs } = harness();
    await service.start(DEVICE, YAML);
    const flowPath = runs[0]?.flowPath ?? '';
    expect(existsSync(flowPath)).toBe(true);

    runs[0]?.handlers.onExit(reason);
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(existsSync(flowPath)).toBe(false);
  });
});

describe('cancellation', () => {
  /** Criterion 9 — kill now, and the exit that follows reads as canceled, not
   * as whatever code the dying JVM happened to leave. */
  it('kills the child and reports the settle as canceled', async () => {
    const { service, runs, events } = harness();
    const started = await service.start(DEVICE, YAML);

    const result = service.cancel(runId(started));
    expect(result.ok).toBe(true);
    expect(runs[0]?.killed).toBe(1);

    runs[0]?.handlers.onExit({ code: 143, error: null });
    expect(events.at(-1)).toEqual({
      type: 'finished',
      runId: 'run-1',
      outcome: 'canceled',
      message: null,
    });
  });

  /** Criterion 9 — unknown or finished: refused, and *nothing* emitted. */
  it('refuses a cancel for a run it does not hold', async () => {
    const { service, runs, events } = harness();
    await service.start(DEVICE, YAML);
    const before = events.length;

    expect(code(service.cancel('run-99'))).toBe(ERROR_CODES.runNotFound);
    expect(runs[0]?.killed).toBe(0);
    expect(events).toHaveLength(before);
  });

  it('refuses a cancel for a run that already settled', async () => {
    const { service, runs } = harness();
    await service.start(DEVICE, YAML);
    runs[0]?.handlers.onExit({ code: 0, error: null });

    expect(code(service.cancel('run-1'))).toBe(ERROR_CODES.runNotFound);
  });
});

describe('the §4.3.2 exclusion', () => {
  /** Criteria 11–12: captures are held off before the CLI ever spawns, and
   * released the moment the run settles — any outcome. */
  it('suspends captures before spawning and resumes on settle', async () => {
    const { service, runs, gateCalls } = harness();

    await service.start(DEVICE, YAML);
    expect(gateCalls).toEqual(['suspend']);

    runs[0]?.handlers.onExit({ code: 1, error: null });
    expect(gateCalls).toEqual(['suspend', 'resume']);
  });

  it('waits an in-flight capture out before the CLI spawns', async () => {
    const { service, runs, releaseSuspend } = harness({ holdSuspend: true });

    const starting = service.start(DEVICE, YAML);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(runs).toHaveLength(0);

    releaseSuspend();
    runId(await starting);
    expect(runs).toHaveLength(1);
  });
});

describe('dispose', () => {
  /** Criterion 10 — no orphaned JVM survives `before-quit`. */
  it('kills a live run child', async () => {
    const { service, runs } = harness();
    await service.start(DEVICE, YAML);

    service.dispose();

    expect(runs[0]?.killed).toBe(1);
  });

  it('refuses a start once disposed', async () => {
    const { service } = harness();
    service.dispose();

    expect((await service.start(DEVICE, YAML)).ok).toBe(false);
  });
});

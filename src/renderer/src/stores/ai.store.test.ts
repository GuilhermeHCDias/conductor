import type { AiEvent, PushPayload, Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetAiStore,
  selectActivity,
  selectAvailability,
  selectStreaming,
  selectThread,
  selectWashLines,
  useAiStore,
} from './ai.store';

/**
 * The AI domain, renderer side: a projection of the `ai:event` stream plus
 * the turn id the send answered with. Main owns the truth — the child, the
 * session, the budget — and this store never sees a cost (criterion 25). Its
 * actions are the only renderer code invoking the ai channels.
 */

beforeEach(() => {
  resetAiStore();
});

function push(event: AiEvent): void {
  useAiStore.getState().applyEvent({ ok: true, data: event } as PushPayload<'ai:event'>);
}

function okSend(turnId = 'turn-1'): void {
  window.conductor.aiSend = vi.fn(() => Promise.resolve({ ok: true as const, data: { turnId } }));
}

function refusedSend(code: string, message: string): void {
  window.conductor.aiSend = vi.fn(() =>
    Promise.resolve({ ok: false, error: { code, message } } as Result<{ turnId: string }>),
  );
}

describe('sending', () => {
  it('appends the person turn and an empty streaming assistant turn on accept', async () => {
    okSend('turn-1');

    const accepted = await useAiStore.getState().send('Quero um teste do login', null);

    expect(accepted).toBe(true);

    expect(window.conductor.aiSend).toHaveBeenCalledExactlyOnceWith(
      'Quero um teste do login',
      null,
    );
    const thread = selectThread(useAiStore.getState());
    expect(thread).toEqual([
      { id: 'person-turn-1', role: 'person', text: 'Quero um teste do login' },
      { id: 'turn-1', role: 'assistant', text: '', status: 'streaming' },
    ]);
    expect(selectStreaming(useAiStore.getState())).toBe(true);
  });

  it('passes the open flow through to the send', async () => {
    okSend();

    await useAiStore.getState().send('adiciona um passo', 'checkout/pix.yml');

    expect(window.conductor.aiSend).toHaveBeenCalledExactlyOnceWith(
      'adiciona um passo',
      'checkout/pix.yml',
    );
  });

  /** Criterion 21 — a refusal is a quiet in-thread notice; the person's words
   * stay in the composer (the draft only clears on a successful send). */
  it('turns a refusal into a notice and keeps the thread free of the message', async () => {
    refusedSend('ai/budget-exceeded', 'This conversation has reached its limit.');

    const accepted = await useAiStore.getState().send('mais uma coisa', null);

    expect(accepted).toBe(false);

    const thread = selectThread(useAiStore.getState());
    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({
      role: 'notice',
      text: 'This conversation has reached its limit.',
    });
    expect(selectStreaming(useAiStore.getState())).toBe(false);
  });

  it('ignores a second send while one is streaming', async () => {
    okSend();
    await useAiStore.getState().send('primeira', null);
    const calls = vi.mocked(window.conductor.aiSend).mock.calls.length;

    await useAiStore.getState().send('segunda', null);

    expect(vi.mocked(window.conductor.aiSend).mock.calls.length).toBe(calls);
  });

  /** The renderer half of the spec's reset race (criterion 12): a send whose
   * answer lands after a pushed reset emptied the thread must not repopulate
   * it — main already killed that turn. */
  it('drops a send that resolves after a reset emptied the thread', async () => {
    type SendAnswer = Awaited<ReturnType<typeof window.conductor.aiSend>>;
    let answer: (value: SendAnswer) => void = () => {};
    window.conductor.aiSend = vi.fn(
      () =>
        new Promise<SendAnswer>((resolvePromise) => {
          answer = resolvePromise;
        }),
    );

    const pending = useAiStore.getState().send('oi', null);
    push({ kind: 'reset' });
    answer({ ok: true, data: { turnId: 'turn-1' } });

    await expect(pending).resolves.toBe(false);
    expect(selectThread(useAiStore.getState())).toEqual([]);
    expect(selectStreaming(useAiStore.getState())).toBe(false);
  });
});

describe('the stream', () => {
  beforeEach(async () => {
    okSend('turn-1');
    await useAiStore.getState().send('oi', null);
  });

  it('grows the assistant turn as deltas land', () => {
    push({ kind: 'text-delta', turnId: 'turn-1', text: 'Vou escrever' });
    push({ kind: 'text-delta', turnId: 'turn-1', text: ' o teste.' });

    const thread = selectThread(useAiStore.getState());
    expect(thread.at(-1)).toMatchObject({ role: 'assistant', text: 'Vou escrever o teste.' });
  });

  it('drops events wearing a stale turn id', () => {
    push({ kind: 'text-delta', turnId: 'turn-9', text: 'fantasma' });

    expect(JSON.stringify(selectThread(useAiStore.getState()))).not.toContain('fantasma');
  });

  it('shows the current activity while tools run, and text replaces it', () => {
    push({ kind: 'activity', turnId: 'turn-1', label: 'Looking at the screen…' });
    expect(selectActivity(useAiStore.getState())).toBe('Looking at the screen…');

    push({ kind: 'text-delta', turnId: 'turn-1', text: 'Pronto.' });
    expect(selectActivity(useAiStore.getState())).toBeNull();
  });

  it('remembers the last edited flow so the wash watcher can claim it', () => {
    push({ kind: 'file-edited', turnId: 'turn-1', path: 'checkout/pix.yml' });

    expect(useAiStore.getState().pendingEditPath).toBe('checkout/pix.yml');
  });

  it('settles the turn as done and stops streaming', () => {
    push({ kind: 'text-delta', turnId: 'turn-1', text: 'Feito.' });
    push({ kind: 'turn-ended', turnId: 'turn-1', outcome: 'done', message: null });

    const state = useAiStore.getState();
    expect(selectStreaming(state)).toBe(false);
    expect(selectActivity(state)).toBeNull();
    expect(selectThread(state).at(-1)).toMatchObject({ text: 'Feito.', status: 'done' });
  });

  /** Criterion 11 — the panel keeps the partial text, marked stopped. */
  it('keeps the partial text marked stopped on a cancel', () => {
    push({ kind: 'text-delta', turnId: 'turn-1', text: 'Escrevendo…' });
    push({ kind: 'turn-ended', turnId: 'turn-1', outcome: 'canceled', message: null });

    expect(selectThread(useAiStore.getState()).at(-1)).toMatchObject({
      text: 'Escrevendo…',
      status: 'stopped',
    });
  });

  /** Criterion 21 — a failure is the turn marked failed plus a quiet notice
   * carrying main's product-language message. */
  it('marks a failed turn and appends the failure notice', () => {
    push({
      kind: 'turn-ended',
      turnId: 'turn-1',
      outcome: 'failed',
      message: 'The assistant hit a problem and stopped.',
    });

    const thread = selectThread(useAiStore.getState());
    expect(thread.at(-2)).toMatchObject({ role: 'assistant', status: 'failed' });
    expect(thread.at(-1)).toMatchObject({
      role: 'notice',
      text: 'The assistant hit a problem and stopped.',
    });
  });

  /** Criterion 12 — the pushed reset empties the thread, one path whether the
   * person asked or a repo switch implied it. */
  it('empties everything on the pushed reset', () => {
    push({ kind: 'text-delta', turnId: 'turn-1', text: 'algo' });
    useAiStore.getState().setWash('checkout/pix.yml', [2]);

    push({ kind: 'reset' });

    const state = useAiStore.getState();
    expect(selectThread(state)).toEqual([]);
    expect(selectStreaming(state)).toBe(false);
    expect(selectWashLines(state)).toEqual([]);
    expect(state.pendingEditPath).toBeNull();
  });
});

describe('cancel and reset', () => {
  it('asks main to cancel and changes nothing itself', async () => {
    okSend();
    await useAiStore.getState().send('oi', null);
    window.conductor.aiCancel = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { turnId: 'turn-1' } }),
    );

    await useAiStore.getState().cancel();

    expect(window.conductor.aiCancel).toHaveBeenCalledOnce();
    // The turn is over when main says it is — the terminal event.
    expect(selectStreaming(useAiStore.getState())).toBe(true);
  });

  it('cancels nothing while nothing streams', async () => {
    window.conductor.aiCancel = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { turnId: null } }),
    );

    await useAiStore.getState().cancel();

    expect(window.conductor.aiCancel).not.toHaveBeenCalled();
  });

  it('asks main to reset and leaves the emptying to the pushed event', async () => {
    okSend();
    await useAiStore.getState().send('oi', null);
    window.conductor.aiReset = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { turnId: null } }),
    );

    await useAiStore.getState().reset();

    expect(window.conductor.aiReset).toHaveBeenCalledOnce();
  });
});

describe('availability', () => {
  it('reads ready from ai:status', async () => {
    window.conductor.aiStatus = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { ready: true as const } }),
    );

    await useAiStore.getState().refreshStatus();

    expect(selectAvailability(useAiStore.getState())).toEqual({ ready: true });
  });

  /** Criteria 23, 25 — the blocking reason, code and words, for the composer
   * and the status line. */
  it('keeps the blocking reason when status refuses', async () => {
    window.conductor.aiStatus = vi.fn(() =>
      Promise.resolve({
        ok: false,
        error: { code: 'ai/claude-missing', message: 'Install Claude Code to turn this on.' },
      } as Result<{ ready: true }>),
    );

    await useAiStore.getState().refreshStatus();

    expect(selectAvailability(useAiStore.getState())).toEqual({
      ready: false,
      code: 'ai/claude-missing',
      message: 'Install Claude Code to turn this on.',
    });
  });
});

describe('the wash', () => {
  it('holds the washed lines for the path they belong to', () => {
    useAiStore.getState().setWash('checkout/pix.yml', [2, 5]);

    const state = useAiStore.getState();
    expect(state.washPath).toBe('checkout/pix.yml');
    expect(selectWashLines(state)).toEqual([2, 5]);
  });

  it('consumes the pending edit when the wash lands', async () => {
    okSend();
    await useAiStore.getState().send('oi', null);
    push({ kind: 'file-edited', turnId: 'turn-1', path: 'login.yml' });

    useAiStore.getState().setWash('login.yml', [1]);

    expect(useAiStore.getState().pendingEditPath).toBeNull();
  });

  it('clears whole on clearWash', () => {
    useAiStore.getState().setWash('login.yml', [1]);

    useAiStore.getState().clearWash();

    const state = useAiStore.getState();
    expect(state.washPath).toBeNull();
    expect(selectWashLines(state)).toEqual([]);
  });
});

import type { Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetPublishStore,
  selectCanSend,
  selectControlPhase,
  selectSheetPhase,
  usePublishStore,
} from './publish.store';

/**
 * The publish store: a projection of main's truth (the unsent set, the review
 * state) plus the sheet's own UI state. Exactly one seam is faked —
 * `window.conductor` — per the renderer's testing rule.
 */

function ok<T>(data: T): Result<T> {
  return { ok: true, data };
}

function refusal(code: string, message: string): Result<never> {
  return { ok: false, error: { code, message } };
}

function store(): ReturnType<typeof usePublishStore.getState> {
  return usePublishStore.getState();
}

const CHANGE = { path: 'checkout/pix.yml', kind: 'changed' } as const;

beforeEach(() => {
  resetPublishStore();
});

describe('init', () => {
  it('stores the answer and marks the state loaded', async () => {
    window.conductor.publishStatus = vi.fn(() =>
      Promise.resolve(
        ok({ repo: 'loja-verde-pnp-1a2b3c4d', changes: [CHANGE], reviewOpen: false }),
      ),
    );

    await store().init();

    expect(store().loaded).toBe(true);
    expect(store().changes).toEqual([CHANGE]);
    expect(store().reviewOpen).toBe(false);
  });

  /** `publish/no-repo` is the boot truth before a connect — quiet, empty,
   * never an error in anyone's console. */
  it('treats publish/no-repo as the quiet empty truth', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    window.conductor.publishStatus = vi.fn(() =>
      Promise.resolve(refusal('publish/no-repo', 'No repository is connected yet.')),
    );

    await store().init();

    expect(store().loaded).toBe(true);
    expect(store().changes).toEqual([]);
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });
});

describe('the control phase', () => {
  /** Criteria 1–3 — the three states, derived from the two facts. */
  it('derives sent-all, unsent and review from the state', () => {
    expect(selectControlPhase(store())).toBe('sent-all');

    usePublishStore.setState({ changes: [CHANGE] });
    expect(selectControlPhase(store())).toBe('unsent');

    usePublishStore.setState({ reviewOpen: true });
    expect(selectControlPhase(store())).toBe('review');
  });
});

describe('the pushed state', () => {
  it('applies a publish:changed push', () => {
    store().applyState(
      ok({ repo: 'loja-verde-pnp-1a2b3c4d', changes: [CHANGE], reviewOpen: true }),
    );

    expect(store().changes).toEqual([CHANGE]);
    expect(store().reviewOpen).toBe(true);
  });

  /** Criterion 13 across repos — a draft typed for one repo must never offer
   * itself as what publishes for another; the projection's own repo slug is
   * how a switch is told apart from a recompute (criterion 9's second half). */
  it('drops the drafts of another repo when the projection switches', () => {
    store().applyState(
      ok({ repo: 'loja-verde-pnp-1a2b3c4d', changes: [CHANGE], reviewOpen: false }),
    );
    store().editNote('Words for the first repo.');

    store().applyState(ok({ repo: 'acme-app-9z8y7x6w', changes: [], reviewOpen: true }));

    expect(store().note).toBe('');
    expect(store().noteEdited).toBe(false);
    expect(store().writing).toBe(false);
    expect(store().failure).toBeNull();
  });

  it('keeps the typed draft across a recompute of the same repo', () => {
    store().applyState(
      ok({ repo: 'loja-verde-pnp-1a2b3c4d', changes: [CHANGE], reviewOpen: false }),
    );
    store().editNote('My own words.');

    store().applyState(
      ok({ repo: 'loja-verde-pnp-1a2b3c4d', changes: [CHANGE], reviewOpen: false }),
    );

    expect(store().note).toBe('My own words.');
    expect(store().noteEdited).toBe(true);
  });
});

describe('the sheet and the describe job', () => {
  it('opens the sheet and starts the note when changes exist', async () => {
    const describe = vi.fn(() => Promise.resolve(ok({ describeId: 7 })));
    window.conductor.publishDescribe = describe;
    usePublishStore.setState({ changes: [CHANGE] });

    store().openSheet();

    expect(store().sheetOpen).toBe(true);
    expect(store().writing).toBe(true);
    await Promise.resolve();
    expect(describe).toHaveBeenCalledOnce();
  });

  /** Criterion 28 — the sheet opening is a refresh trigger: the status ask
   * reaches main, whose handler refreshes the PR state behind it. It matters
   * most with zero changes — the Waiting for review sheet is exactly where a
   * merged review must be noticed. */
  it('asks for the fresh state every time the sheet opens', () => {
    const status = vi.fn(() =>
      Promise.resolve(ok({ repo: 'loja-verde-pnp-1a2b3c4d', changes: [], reviewOpen: true })),
    );
    window.conductor.publishStatus = status;

    store().openSheet();

    expect(status).toHaveBeenCalledOnce();
  });

  /** Criterion 10 with main as the only gate: the local set is a projection
   * that can lag disk, so opening always asks — an actually-empty set answers
   * with main's quiet `publish/nothing-to-send` refusal, never a phantom job. */
  it('asks for a describe even when the local set looks empty', async () => {
    const describe = vi.fn(() =>
      Promise.resolve(refusal('publish/nothing-to-send', 'There is nothing new to send.')),
    );
    window.conductor.publishDescribe = describe;

    store().openSheet();

    expect(store().sheetOpen).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(describe).toHaveBeenCalledOnce();
    expect(store().writing).toBe(false);
  });

  /** Criterion 13 — the note arrives into an untouched field… */
  it('prefills the note from the described event', async () => {
    window.conductor.publishDescribe = vi.fn(() => Promise.resolve(ok({ describeId: 7 })));
    usePublishStore.setState({ changes: [CHANGE] });
    store().openSheet();
    await Promise.resolve();

    store().applyEvent(ok({ kind: 'described' as const, describeId: 7, note: 'The test waits.' }));

    expect(store().writing).toBe(false);
    expect(store().note).toBe('The test waits.');
  });

  /** The field is locked while the AI writes (product owner, 2026-08-08), and
   * the rule lives here — the view's `readOnly` only announces it. Typing into
   * a field whose content is about to be replaced is work thrown away. */
  it('ignores an edit while the note is being written', async () => {
    window.conductor.publishDescribe = vi.fn(() => Promise.resolve(ok({ describeId: 7 })));
    usePublishStore.setState({ changes: [CHANGE] });
    store().openSheet();

    store().editNote('Typed too early.');

    expect(store().note).toBe('');
    expect(store().noteEdited).toBe(false);
  });

  /** …so the written note always lands, and the person edits after it. */
  it('lands the written note, then takes the edits', async () => {
    window.conductor.publishDescribe = vi.fn(() => Promise.resolve(ok({ describeId: 7 })));
    usePublishStore.setState({ changes: [CHANGE] });
    store().openSheet();

    store().applyEvent(ok({ kind: 'described' as const, describeId: 7, note: 'The test waits.' }));
    store().editNote('My own words.');

    expect(store().note).toBe('My own words.');
    expect(store().noteEdited).toBe(true);
    expect(store().writing).toBe(false);
  });

  it('drops a described event when no job is writing', () => {
    store().applyEvent(ok({ kind: 'described' as const, describeId: 9, note: 'Stale.' }));

    expect(store().note).toBe('');
  });

  /** Criterion 14 — closing the sheet kills the claude child. */
  it('cancels the running describe job when the sheet closes', async () => {
    const cancel = vi.fn(() => Promise.resolve(ok({ jobId: 7 })));
    window.conductor.publishDescribe = vi.fn(() => Promise.resolve(ok({ describeId: 7 })));
    window.conductor.publishCancel = cancel;
    usePublishStore.setState({ changes: [CHANGE] });
    store().openSheet();
    await Promise.resolve();
    await Promise.resolve();

    store().closeSheet();

    expect(store().sheetOpen).toBe(false);
    expect(store().writing).toBe(false);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(7);
  });

  it('closes without a cancel when nothing is writing', () => {
    const cancel = vi.fn(() => Promise.resolve(ok({ jobId: 7 })));
    window.conductor.publishCancel = cancel;
    store().openSheet();

    store().closeSheet();

    expect(cancel).not.toHaveBeenCalled();
  });
});

describe('what can be sent', () => {
  /** Criterion 17 as amended — the description is the person's word about
   * their own work, so nothing sends without it, and nothing sends while the
   * AI is still writing one. */
  it('allows a send only with changes, a description and no job running', () => {
    usePublishStore.setState({ changes: [CHANGE], note: 'The test waits.' });
    expect(selectCanSend(store())).toBe(true);

    usePublishStore.setState({ writing: true });
    expect(selectCanSend(store())).toBe(false);

    usePublishStore.setState({ writing: false, sending: true });
    expect(selectCanSend(store())).toBe(false);

    usePublishStore.setState({ sending: false, note: '   ' });
    expect(selectCanSend(store())).toBe(false);

    usePublishStore.setState({ note: 'The test waits.', changes: [] });
    expect(selectCanSend(store())).toBe(false);
  });
});

describe('sending', () => {
  /** The disabled button is the affordance; this is the rule — blank text
   * never reaches main. */
  it('refuses to send with nothing described', async () => {
    const send = vi.fn(() => Promise.resolve(ok({ sendId: 3 })));
    window.conductor.publishSend = send;
    usePublishStore.setState({ changes: [CHANGE], note: '  \n ' });

    await store().sendForReview(null);

    expect(send).not.toHaveBeenCalled();
    expect(store().sending).toBe(false);
  });

  /** The AI's own sentence is not the person's yet — a send while it is being
   * written would publish a text nobody has read. */
  it('refuses to send while the note is still being written', async () => {
    const send = vi.fn(() => Promise.resolve(ok({ sendId: 3 })));
    window.conductor.publishSend = send;
    usePublishStore.setState({ changes: [CHANGE], note: 'Half a sen', writing: true });

    await store().sendForReview(null);

    expect(send).not.toHaveBeenCalled();
    expect(store().sending).toBe(false);
  });

  it('starts the send with the note and the open flow path', async () => {
    const send = vi.fn(() => Promise.resolve(ok({ sendId: 3 })));
    window.conductor.publishSend = send;
    usePublishStore.setState({ changes: [CHANGE], note: 'The words.' });

    await store().sendForReview('checkout/pix.yml');

    expect(send).toHaveBeenCalledExactlyOnceWith('The words.', 'checkout/pix.yml');
    expect(store().sending).toBe(true);
    expect(store().sendStep).toBe('checking');
  });

  it('drives the steps off publish:event pushes', async () => {
    window.conductor.publishSend = vi.fn(() => Promise.resolve(ok({ sendId: 3 })));
    usePublishStore.setState({ note: 'The words.' });
    await store().sendForReview(null);

    store().applyEvent(ok({ kind: 'send-step' as const, sendId: 3, step: 'sending' as const }));

    expect(store().sendStep).toBe('sending');
  });

  /** Criterion 25 — sent flips the sheet to the sent state at once; the
   * `publish:changed` push then confirms the same truth. */
  it('marks the review open and the field clean on sent', async () => {
    window.conductor.publishSend = vi.fn(() => Promise.resolve(ok({ sendId: 3 })));
    usePublishStore.setState({ changes: [CHANGE], note: 'The words.', noteEdited: true });
    await store().sendForReview(null);

    store().applyEvent(ok({ kind: 'sent' as const, sendId: 3, joined: false }));

    expect(store().sending).toBe(false);
    expect(store().reviewOpen).toBe(true);
    expect(store().changes).toEqual([]);
    expect(store().note).toBe('');
    expect(selectSheetPhase(store())).toBe('sent');
  });

  /** Criterion 23's UI clause — a subsequent send's changes joined the review
   * already open; the sheet reads that fact from here. */
  it('remembers whether the sent changes joined an open review', async () => {
    window.conductor.publishSend = vi.fn(() => Promise.resolve(ok({ sendId: 3 })));
    usePublishStore.setState({ note: 'The words.' });
    await store().sendForReview(null);

    store().applyEvent(ok({ kind: 'sent' as const, sendId: 3, joined: true }));

    expect(store().sentJoined).toBe(true);
  });

  it('forgets the joined mark when the sheet reopens', () => {
    usePublishStore.setState({ sentJoined: true });

    store().openSheet();

    expect(store().sentJoined).toBe(false);
  });

  /** Criterion 26 — the failure lands with its stable code and message. */
  it('surfaces a send failure', async () => {
    window.conductor.publishSend = vi.fn(() => Promise.resolve(ok({ sendId: 3 })));
    usePublishStore.setState({ note: 'The words.' });
    await store().sendForReview(null);

    store().applyEvent(
      ok({
        kind: 'send-failed' as const,
        sendId: 3,
        code: 'repo/gh-unauthenticated',
        message: 'gh is installed but not signed in.',
      }),
    );

    expect(store().sending).toBe(false);
    expect(store().failure).toEqual({
      code: 'repo/gh-unauthenticated',
      message: 'gh is installed but not signed in.',
    });
  });

  /** Criterion 24 — "nothing new to send" returns the sheet to the idle
   * truth: the state is re-asked, and no failure shows. */
  it('returns to the idle truth when the send refuses with nothing-to-send', async () => {
    window.conductor.publishSend = vi.fn(() =>
      Promise.resolve(refusal('publish/nothing-to-send', 'There is nothing new to send.')),
    );
    const status = vi.fn(() =>
      Promise.resolve(ok({ repo: 'loja-verde-pnp-1a2b3c4d', changes: [], reviewOpen: false })),
    );
    window.conductor.publishStatus = status;
    usePublishStore.setState({ changes: [CHANGE], note: 'The words.' });

    await store().sendForReview(null);

    expect(store().sending).toBe(false);
    expect(store().failure).toBeNull();
    expect(status).toHaveBeenCalledOnce();
  });

  it('surfaces any other refusal of the invoke', async () => {
    window.conductor.publishSend = vi.fn(() =>
      Promise.resolve(refusal('publish/send-active', 'Your changes are already being sent.')),
    );
    usePublishStore.setState({ note: 'The words.' });

    await store().sendForReview(null);

    expect(store().failure).toEqual({
      code: 'publish/send-active',
      message: 'Your changes are already being sent.',
    });
  });
});

describe('View on GitHub', () => {
  /** Criterion 27 — the renderer asks; the URL never crosses from here. */
  it('asks main to open the review', async () => {
    const openPr = vi.fn(() =>
      Promise.resolve(ok({ url: 'https://github.com/loja-verde/pnp/pull/41' })),
    );
    window.conductor.publishOpenPr = openPr;

    await store().openOnGitHub();

    expect(openPr).toHaveBeenCalledExactlyOnceWith();
  });
});

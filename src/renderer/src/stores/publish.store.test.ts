import type { Result } from '@shared/ipc';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resetPublishStore,
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
      Promise.resolve(ok({ changes: [CHANGE], reviewOpen: false })),
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
    store().applyState(ok({ changes: [CHANGE], reviewOpen: true }));

    expect(store().changes).toEqual([CHANGE]);
    expect(store().reviewOpen).toBe(true);
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
    const status = vi.fn(() => Promise.resolve(ok({ changes: [], reviewOpen: true })));
    window.conductor.publishStatus = status;

    store().openSheet();

    expect(status).toHaveBeenCalledOnce();
  });

  /** Criterion 10 asks for ≥ 1 unsent change — an empty sheet asks nothing. */
  it('opens the sheet without a describe job when nothing is unsent', () => {
    const describe = vi.fn(() => Promise.resolve(ok({ describeId: 7 })));
    window.conductor.publishDescribe = describe;

    store().openSheet();

    expect(store().sheetOpen).toBe(true);
    expect(store().writing).toBe(false);
    expect(describe).not.toHaveBeenCalled();
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

  /** …and never over the person's own words. */
  it('never overwrites a note the person already typed', async () => {
    window.conductor.publishDescribe = vi.fn(() => Promise.resolve(ok({ describeId: 7 })));
    usePublishStore.setState({ changes: [CHANGE] });
    store().openSheet();
    store().editNote('My own words.');

    store().applyEvent(ok({ kind: 'described' as const, describeId: 7, note: 'The test waits.' }));

    expect(store().note).toBe('My own words.');
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

describe('sending', () => {
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

  /** Criterion 26 — the failure lands with its stable code and message. */
  it('surfaces a send failure', async () => {
    window.conductor.publishSend = vi.fn(() => Promise.resolve(ok({ sendId: 3 })));
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
    const status = vi.fn(() => Promise.resolve(ok({ changes: [], reviewOpen: false })));
    window.conductor.publishStatus = status;
    usePublishStore.setState({ changes: [CHANGE] });

    await store().sendForReview(null);

    expect(store().sending).toBe(false);
    expect(store().failure).toBeNull();
    expect(status).toHaveBeenCalledOnce();
  });

  it('surfaces any other refusal of the invoke', async () => {
    window.conductor.publishSend = vi.fn(() =>
      Promise.resolve(refusal('publish/send-active', 'Your changes are already being sent.')),
    );

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

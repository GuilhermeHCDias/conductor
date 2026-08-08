import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFlowStore, useFlowStore } from '../../stores/flow.store';
import { resetPublishStore, usePublishStore } from '../../stores/publish.store';
import { PublishSheet } from './PublishSheet';

/**
 * The publish sheet (spec criteria 5–6, 13, 17–18, 24–27) — the kit's
 * `CSendSheet`: the unsent changes as rows, the editable "What changed?"
 * note, the send footer, and the sent state. Rule 24 holds on every string:
 * not a word of Git, except the literal "View on GitHub".
 */

const CHANGES = [
  { path: 'checkout/pix.yml', kind: 'changed' },
  { path: 'boleto.yml', kind: 'added' },
  { path: 'old.yml', kind: 'deleted' },
] as const;

function openWith(changes: readonly (typeof CHANGES)[number][]): void {
  window.conductor.publishDescribe = vi.fn(() =>
    Promise.resolve({ ok: true as const, data: { describeId: 7 } }),
  );
  // The open-time refresh (criterion 28) answers the same truth the store
  // was seeded with, the way main would.
  window.conductor.publishStatus = vi.fn(() =>
    Promise.resolve({
      ok: true as const,
      data: { repo: 'loja-verde-pnp-1a2b3c4d', changes: [...changes], reviewOpen: false },
    }),
  );
  usePublishStore.setState({ loaded: true, changes: [...changes] });
  act(() => {
    usePublishStore.getState().openSheet();
  });
}

/** The describe job answering — the state every send starts from, since a
 * publication cannot be sent undescribed. */
function described(note = 'The checkout test waits for the button.'): void {
  act(() => {
    usePublishStore.getState().applyEvent({
      ok: true,
      data: { kind: 'described', describeId: 7, note },
    });
  });
}

beforeEach(() => {
  resetPublishStore();
  resetFlowStore();
});

describe('PublishSheet', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<PublishSheet />);

    expect(container).toBeEmptyDOMElement();
  });

  /** Criterion 5 — every unsent change as a row: icon + verb, file name,
   * `conductor/<folder>/` path. */
  it('lists every unsent change with its verb and its place', () => {
    render(<PublishSheet />);
    openWith(CHANGES);

    expect(screen.getByRole('dialog', { name: 'Send 3 changes' })).toBeInTheDocument();
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0] as HTMLElement).getByText('pix.yml')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('conductor/checkout/')).toBeInTheDocument();
    expect(within(rows[0] as HTMLElement).getByText('Changed')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('Added')).toBeInTheDocument();
    expect(within(rows[1] as HTMLElement).getByText('conductor/')).toBeInTheDocument();
    expect(within(rows[2] as HTMLElement).getByText('Deleted')).toBeInTheDocument();
  });

  it('titles a single change in the singular', () => {
    render(<PublishSheet />);
    openWith([CHANGES[0]]);

    expect(screen.getByRole('dialog', { name: 'Send 1 change' })).toBeInTheDocument();
  });

  /** Criterion 13 as amended (product owner, 2026-08-08) — the field is
   * locked while the AI writes. `readOnly`, not `disabled`: the field is
   * being written into, not unavailable, so it keeps its place in the tab
   * order and its own look under the writing treatment. */
  it('locks the field while the describe job runs', () => {
    render(<PublishSheet />);
    openWith([CHANGES[0]]);

    expect(screen.getByText('Writing…')).toBeInTheDocument();
    const field = screen.getByRole('textbox');
    expect(field).toHaveAttribute('readonly');
    expect(field).toHaveAttribute('aria-busy', 'true');
  });

  /** …and the lock holds against real typing, not merely against the eye. */
  it('takes no typing until the note has landed', async () => {
    render(<PublishSheet />);
    openWith([CHANGES[0]]);

    await userEvent.type(screen.getByRole('textbox'), 'Too early.');

    expect(screen.getByRole('textbox')).toHaveValue('');

    described();
    await userEvent.type(screen.getByRole('textbox'), ' And mine.');

    expect(screen.getByRole('textbox')).not.toHaveAttribute('readonly');
    expect(screen.getByRole('textbox')).toHaveValue(
      'The checkout test waits for the button. And mine.',
    );
  });

  /** Criterion 13 as amended — a sentence still being written is nobody's
   * word yet, so sending waits for it to land. */
  it('holds the send back while the note is being written', () => {
    render(<PublishSheet />);
    openWith([CHANGES[0]]);

    expect(screen.getByRole('button', { name: 'Send for review' })).toBeDisabled();

    described();

    expect(screen.getByRole('textbox')).not.toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Send for review' })).toBeEnabled();
  });

  /** Criterion 17 as amended — the description is required: emptying the
   * field takes the send away, typing gives it back. */
  it('requires a description before the changes can be sent', async () => {
    render(<PublishSheet />);
    openWith([CHANGES[0]]);
    described();

    await userEvent.clear(screen.getByRole('textbox'));

    expect(screen.getByRole('button', { name: 'Send for review' })).toBeDisabled();
    expect(screen.getByText('Required — your team reads this.')).toBeInTheDocument();

    await userEvent.type(screen.getByRole('textbox'), 'It waits for the button now.');

    expect(screen.getByRole('button', { name: 'Send for review' })).toBeEnabled();
  });

  it('prefills the note when the describe job answers', () => {
    render(<PublishSheet />);
    openWith([CHANGES[0]]);

    act(() => {
      usePublishStore.getState().applyEvent({
        ok: true,
        data: { kind: 'described', describeId: 7, note: 'It waits now.' },
      });
    });

    expect(screen.getByRole('textbox')).toHaveValue('It waits now.');
    expect(screen.queryByText('Writing…')).not.toBeInTheDocument();
  });

  /** Criterion 17 — the person edits freely; the edited text is what
   * publishes. */
  it('sends the edited note and the open flow path', async () => {
    const send = vi.fn(() => Promise.resolve({ ok: true as const, data: { sendId: 3 } }));
    window.conductor.publishSend = send;
    useFlowStore.setState({ openPath: 'checkout/pix.yml' });
    render(<PublishSheet />);
    openWith([CHANGES[0]]);
    described();

    await userEvent.clear(screen.getByRole('textbox'));
    await userEvent.type(screen.getByRole('textbox'), 'My words.');
    await userEvent.click(screen.getByRole('button', { name: 'Send for review' }));

    expect(send).toHaveBeenCalledExactlyOnceWith('My words.', 'checkout/pix.yml');
  });

  /** Criterion 18 — the push events drive the sheet through the steps. */
  it('walks the sending steps and blocks the exits meanwhile', async () => {
    window.conductor.publishSend = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { sendId: 3 } }),
    );
    render(<PublishSheet />);
    openWith([CHANGES[0]]);
    described();

    await userEvent.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(screen.getByRole('button', { name: /Checking/ })).toBeDisabled();

    act(() => {
      usePublishStore
        .getState()
        .applyEvent({ ok: true, data: { kind: 'send-step', sendId: 3, step: 'opening-review' } });
    });

    expect(screen.getByRole('button', { name: /Opening the review/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await userEvent.click(screen.getByTestId('dialog-backdrop'));
    expect(usePublishStore.getState().sheetOpen).toBe(true);
  });

  /** Criteria 5 and 25 — the sent state: Waiting for review, View on GitHub,
   * Done — and nothing left to fill. */
  it('shows the sent state once the review is open with nothing unsent', () => {
    render(<PublishSheet />);
    openWith([CHANGES[0]]);

    act(() => {
      usePublishStore.setState({ sending: true });
      usePublishStore
        .getState()
        .applyEvent({ ok: true, data: { kind: 'sent', sendId: 3, joined: false } });
    });

    expect(screen.getByRole('dialog', { name: 'Waiting for review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View on GitHub' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  /** Criterion 23's UI clause — a subsequent send says the changes joined the
   * review already open, not the first-send copy. */
  it('says the changes joined the review already open on a subsequent send', () => {
    render(<PublishSheet />);
    openWith([CHANGES[0]]);
    act(() => {
      usePublishStore.setState({ reviewOpen: true, sending: true });
      usePublishStore
        .getState()
        .applyEvent({ ok: true, data: { kind: 'sent', sendId: 3, joined: true } });
    });

    expect(
      screen.getByText(/joined the review your team is already looking at/),
    ).toBeInTheDocument();
  });

  /** Criterion 6 — a review open with fresh unsent changes offers sending
   * them into it, never a second review. */
  it('offers sending fresh changes into the open review', () => {
    render(<PublishSheet />);
    openWith([CHANGES[0]]);
    described();
    act(() => {
      usePublishStore.setState({ reviewOpen: true });
    });

    expect(screen.getByRole('dialog', { name: 'Send 1 change' })).toBeInTheDocument();
    expect(screen.getByText(/join the review your team is already looking at/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send for review' })).toBeEnabled();
  });

  /** Criterion 27 — the ask crosses; no URL does. */
  it('asks main to open the review from View on GitHub', async () => {
    const openPr = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { url: 'https://github.com/o/r/pull/41' } }),
    );
    window.conductor.publishOpenPr = openPr;
    render(<PublishSheet />);
    act(() => {
      usePublishStore.setState({ loaded: true, reviewOpen: true, sheetOpen: true });
    });

    await userEvent.click(screen.getByRole('button', { name: 'View on GitHub' }));

    expect(openPr).toHaveBeenCalledOnce();
  });

  it('closes from Done', async () => {
    render(<PublishSheet />);
    act(() => {
      usePublishStore.setState({ loaded: true, reviewOpen: true, sheetOpen: true });
    });

    await userEvent.click(screen.getByRole('button', { name: 'Done' }));

    expect(usePublishStore.getState().sheetOpen).toBe(false);
  });

  /** Criterion 14 rides the close: the describe job's child is killed. */
  it('cancels the writing job when the sheet closes', async () => {
    const cancel = vi.fn(() => Promise.resolve({ ok: true as const, data: { jobId: 7 } }));
    window.conductor.publishCancel = cancel;
    render(<PublishSheet />);
    openWith([CHANGES[0]]);
    await act(async () => {
      await Promise.resolve();
    });

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(usePublishStore.getState().sheetOpen).toBe(false);
    expect(cancel).toHaveBeenCalledExactlyOnceWith(7);
  });

  /** Criterion 26 — the failure in product language, from the stable code's
   * message; the sheet stays open for the retry. */
  it('shows a send failure in product language', () => {
    render(<PublishSheet />);
    openWith([CHANGES[0]]);
    described();

    act(() => {
      usePublishStore.setState({
        failure: { code: 'publish/syntax-error', message: 'This test has an error…' },
      });
    });

    expect(screen.getByRole('alert')).toHaveTextContent('This test has an error…');
    expect(screen.getByRole('button', { name: 'Send for review' })).toBeEnabled();
  });
});

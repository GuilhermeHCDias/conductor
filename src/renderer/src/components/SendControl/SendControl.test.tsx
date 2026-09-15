import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SendControl } from './SendControl';

/**
 * The toolbar's send control (spec criteria 1–4): three states, one slot.
 * Presentational — props in, callbacks out; the phases and copy are the kit's
 * (`CSendControl`), with rule 24 holding everywhere: not a word of Git.
 */

describe('SendControl', () => {
  /** Criterion 1 — quiet and non-interactive: a state, not an action. */
  it('shows the quiet Everything sent state without a button', () => {
    render(<SendControl count={0} onClick={vi.fn()} phase="sent-all" />);

    expect(screen.getByText('Everything sent')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /** Criterion 2 — the filled accent action carrying the unsent count. */
  it('shows Send changes with the count while changes are unsent', () => {
    render(<SendControl count={3} onClick={vi.fn()} phase="unsent" />);

    const button = screen.getByRole('button', { name: /Send changes/ });
    expect(button).toHaveAttribute('data-phase', 'unsent');
    expect(button).toHaveTextContent('3');
  });

  /** Criterion 4 — any interactive state opens the sheet. */
  it('reports a click on the send state', async () => {
    const onClick = vi.fn();
    render(<SendControl count={3} onClick={onClick} phase="unsent" />);

    await userEvent.click(screen.getByRole('button', { name: /Send changes/ }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  /** Criterion 3 as amended (2026-09-09) — the neutral pill, and never a
   * count beside it: changes made while a review is open are their own future
   * review, so the store hands this phase nothing to add up. */
  it('shows the Waiting for review pill without a count', () => {
    render(<SendControl count={0} onClick={vi.fn()} phase="review" />);

    const button = screen.getByRole('button', { name: /Waiting for review/ });
    expect(button).toHaveAttribute('data-phase', 'review');
    expect(button).not.toHaveTextContent('+');
  });

  it('reports a click on the review state too', async () => {
    const onClick = vi.fn();
    render(<SendControl count={0} onClick={onClick} phase="review" />);

    await userEvent.click(screen.getByRole('button', { name: /Waiting for review/ }));

    expect(onClick).toHaveBeenCalledOnce();
  });
});

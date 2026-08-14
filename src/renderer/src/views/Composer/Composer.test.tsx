import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAiStore, useAiStore } from '../../stores/ai.store';
import { resetFlowStore, useFlowStore } from '../../stores/flow.store';
import { Composer } from './Composer';

/**
 * Criterion 23: send on the control and on Enter (Shift+Enter inserts a
 * newline), the draft clearing on a successful send, the stop control while
 * a turn streams, and the availability gate with its reason nearby.
 */

const input = () => screen.getByRole('textbox', { name: 'Ask Conductor' });

function acceptSend(): ReturnType<typeof vi.fn> {
  const aiSend = vi.fn(() => Promise.resolve({ ok: true as const, data: { turnId: 'turn-1' } }));
  window.conductor.aiSend = aiSend;
  return aiSend;
}

beforeEach(() => {
  resetAiStore();
  resetFlowStore();
});

describe('the composer', () => {
  it('invites a message in the assistant’s own words', () => {
    render(<Composer />);

    expect(screen.getByPlaceholderText('Ask Conductor to write a test…')).toBeInTheDocument();
    expect(input()).toBeInTheDocument();
  });

  it('sends the draft with the open flow, and clears it on success', async () => {
    const aiSend = acceptSend();
    useFlowStore.setState({ openPath: 'checkout/pix.yml' });
    render(<Composer />);

    await userEvent.type(input(), 'Quero um teste do login');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(aiSend).toHaveBeenCalledExactlyOnceWith('Quero um teste do login', 'checkout/pix.yml');
    expect(input()).toHaveValue('');
  });

  it('keeps the draft when the send is refused', async () => {
    window.conductor.aiSend = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        error: { code: 'ai/budget-exceeded', message: 'This conversation has reached its limit.' },
      }),
    );
    render(<Composer />);

    await userEvent.type(input(), 'mais uma coisa');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(input()).toHaveValue('mais uma coisa');
  });

  it('sends on Enter', async () => {
    const aiSend = acceptSend();
    render(<Composer />);

    await userEvent.type(input(), 'Quero um teste{Enter}');

    expect(aiSend).toHaveBeenCalledExactlyOnceWith('Quero um teste', null);
  });

  it('inserts a newline on Shift+Enter instead of sending', async () => {
    const aiSend = acceptSend();
    render(<Composer />);

    await userEvent.type(input(), 'primeira linha{Shift>}{Enter}{/Shift}segunda');

    expect(aiSend).not.toHaveBeenCalled();
    expect(input()).toHaveValue('primeira linha\nsegunda');
  });

  it('sends nothing while the draft is empty or whitespace', async () => {
    const aiSend = acceptSend();
    render(<Composer />);

    await userEvent.type(input(), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Send' }));

    expect(aiSend).not.toHaveBeenCalled();
  });

  /** While a turn streams, send becomes stop, wired to `ai:cancel`. */
  it('replaces send with a stop control while a turn streams', async () => {
    const aiCancel = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { turnId: 'turn-1' } }),
    );
    window.conductor.aiCancel = aiCancel;
    useAiStore.setState({ activeTurnId: 'turn-1' });
    render(<Composer />);

    expect(screen.queryByRole('button', { name: 'Send' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(aiCancel).toHaveBeenCalledOnce();
  });

  /** Criterion 23 — no repo / no claude disables it, the reason nearby. */
  it('disables itself with the reason when the assistant is unavailable', () => {
    useAiStore.setState({
      availability: {
        ready: false,
        code: 'ai/claude-missing',
        message: 'The assistant runs on Claude Code, which is not installed on this Mac.',
      },
    });
    render(<Composer />);

    expect(input()).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled();
    expect(screen.getByText(/Claude Code/)).toBeInTheDocument();
  });
});

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetAiStore, useAiStore } from '../../stores/ai.store';
import { resetFlowStore, useFlowStore } from '../../stores/flow.store';
import { AIPanel } from './AIPanel';

/**
 * Criteria 21–22: the real conversation from the ai store — person turns
 * bubbled, assistant turns unbubbled under the byline, streaming text
 * growing, the activity line while tools run, errors as quiet notices — and
 * the greeting with app-authored pills while the thread is empty. The
 * fixture code block and its "Insert into flow" button are gone: a flow is
 * delivered as the file, never as chat text (§12.21).
 */

beforeEach(() => {
  resetAiStore();
  resetFlowStore();
});

describe('the empty thread', () => {
  it('greets and offers the suggestion pills', () => {
    render(<AIPanel />);

    expect(screen.getByText(/tell me what the test should do/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Write a test for the login flow' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Test the checkout journey' })).toBeVisible();
  });

  it('sends a pill as a message, with the open flow riding along', async () => {
    const aiSend = vi.fn(() => Promise.resolve({ ok: true as const, data: { turnId: 'turn-1' } }));
    window.conductor.aiSend = aiSend;
    useFlowStore.setState({ openPath: 'checkout/pix.yml' });
    render(<AIPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Write a test for the login flow' }));

    expect(aiSend).toHaveBeenCalledExactlyOnceWith(
      'Write a test for the login flow',
      'checkout/pix.yml',
    );
  });

  it('drops the greeting and the pills once the conversation starts', () => {
    useAiStore.setState({
      thread: [{ id: 'person-turn-1', role: 'person', text: 'oi' }],
    });
    render(<AIPanel />);

    expect(screen.queryByText(/tell me what the test should do/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Write a test for the login flow' }),
    ).not.toBeInTheDocument();
  });
});

describe('the conversation', () => {
  it('bubbles the person and leaves the assistant under the byline', () => {
    useAiStore.setState({
      thread: [
        { id: 'person-turn-1', role: 'person', text: 'Quero um teste do login' },
        { id: 'turn-1', role: 'assistant', text: 'Vou escrever o teste.', status: 'done' },
      ],
    });
    render(<AIPanel />);

    const turns = screen.getAllByTestId('chat-turn');
    expect(turns.map((turn) => turn.getAttribute('data-role'))).toEqual(['user', 'assistant']);
    expect(screen.getByText('Vou escrever o teste.')).toBeInTheDocument();
    expect(screen.getByText('Conductor')).toBeInTheDocument();
  });

  it('shows the streaming text as it grows', () => {
    useAiStore.setState({
      activeTurnId: 'turn-1',
      thread: [{ id: 'turn-1', role: 'assistant', text: 'Escrev', status: 'streaming' }],
    });
    const view = render(<AIPanel />);
    expect(screen.getByText('Escrev')).toBeInTheDocument();

    useAiStore.setState({
      thread: [
        { id: 'turn-1', role: 'assistant', text: 'Escrevendo o teste', status: 'streaming' },
      ],
    });
    view.rerender(<AIPanel />);

    expect(screen.getByText('Escrevendo o teste')).toBeInTheDocument();
  });

  /** Criterion 8's activity, on screen while tools run. */
  it('shows the current activity line', () => {
    useAiStore.setState({
      activeTurnId: 'turn-1',
      activity: 'Looking at the screen…',
      thread: [{ id: 'turn-1', role: 'assistant', text: '', status: 'streaming' }],
    });
    render(<AIPanel />);

    expect(screen.getByTestId('chat-activity')).toHaveTextContent('Looking at the screen…');
  });

  /** Criterion 11 — the partial text stays, marked stopped. */
  it('marks a stopped turn', () => {
    useAiStore.setState({
      thread: [{ id: 'turn-1', role: 'assistant', text: 'Escrevendo…', status: 'stopped' }],
    });
    render(<AIPanel />);

    expect(screen.getByText('Escrevendo…')).toBeInTheDocument();
    expect(screen.getByText(/stopped/i)).toBeInTheDocument();
  });

  /** Criterion 21 — error states are quiet in-thread notices. */
  it('renders a notice quietly in the thread', () => {
    useAiStore.setState({
      thread: [
        { id: 'notice-1', role: 'notice', text: 'The assistant hit a problem and stopped.' },
      ],
    });
    render(<AIPanel />);

    expect(screen.getByTestId('chat-notice')).toHaveTextContent(
      'The assistant hit a problem and stopped.',
    );
  });

  /** §12.21 — the file is the deliverable; the chat never hands over a flow. */
  it('offers no code surface and no insert affordance', () => {
    useAiStore.setState({
      thread: [
        { id: 'turn-1', role: 'assistant', text: '- tapOn: "Detalhes do pedido"', status: 'done' },
      ],
    });
    render(<AIPanel />);

    expect(screen.queryByTestId('chat-code')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /insert into flow/i })).not.toBeInTheDocument();
  });
});

describe('within the tabpanel', () => {
  it('keeps every turn inside the thread container', () => {
    useAiStore.setState({
      thread: [
        { id: 'person-turn-1', role: 'person', text: 'oi' },
        { id: 'turn-1', role: 'assistant', text: 'olá', status: 'done' },
      ],
    });
    const { container } = render(<AIPanel />);

    const thread = container.firstElementChild as HTMLElement;
    expect(within(thread).getAllByTestId('chat-turn')).toHaveLength(2);
  });
});

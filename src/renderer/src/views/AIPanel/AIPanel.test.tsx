import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { SUGGESTIONS, THREAD } from '../../fixtures/flows';
import { resetUiStore, useUiStore } from '../../stores/ui.store';
import { AIPanel } from './AIPanel';

beforeEach(() => {
  resetUiStore();
});

/** Criterion 33. */
describe('AIPanel', () => {
  it('opens with the assistant turn, unbubbled', () => {
    render(<AIPanel />);

    const turns = screen.getAllByTestId('chat-turn');

    expect(turns).toHaveLength(1);
    expect(turns[0]).toHaveAttribute('data-role', 'assistant');
    expect(screen.getByText(/Right-click anything on the device/)).toBeInTheDocument();
  });

  it('bubbles a user turn', () => {
    useUiStore.setState({
      thread: [...THREAD, { id: 'u1', role: 'user', body: 'Open the first pending order' }],
    });
    render(<AIPanel />);

    const turns = screen.getAllByTestId('chat-turn');

    expect(turns.map((turn) => turn.getAttribute('data-role'))).toEqual(['assistant', 'user']);
  });

  it('offers the suggestion pills while the thread holds only the opening message', () => {
    render(<AIPanel />);

    for (const suggestion of SUGGESTIONS) {
      expect(screen.getByRole('button', { name: suggestion })).toBeInTheDocument();
    }
  });

  it('drops the pills once the conversation has started', () => {
    useUiStore.setState({
      thread: [...THREAD, { id: 'u1', role: 'user', body: 'Open the first pending order' }],
    });
    render(<AIPanel />);

    for (const suggestion of SUGGESTIONS) {
      expect(screen.queryByRole('button', { name: suggestion })).not.toBeInTheDocument();
    }
  });

  it('renders a YAML block in a turn as a code surface with an insert action', () => {
    useUiStore.setState({
      thread: [
        {
          id: 'a1',
          role: 'assistant',
          body: 'This taps it by visible text.',
          code: '- tapOn:\n    text: "Detalhes do pedido"',
        },
      ],
    });
    render(<AIPanel />);

    const block = screen.getByTestId('chat-code');

    expect(within(block).getByText(/tapOn/)).toBeInTheDocument();
    expect(within(block).getByRole('button', { name: 'Insert into flow' })).toBeInTheDocument();
  });

  it('renders no code surface on a turn that carries no YAML', () => {
    render(<AIPanel />);

    expect(screen.queryByTestId('chat-code')).not.toBeInTheDocument();
  });
});

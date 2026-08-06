import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EmptyState } from './EmptyState';

/**
 * The DS zero-state, ported for criterion 35: one instruction filling an
 * empty panel — a chip, a title, a plain-language next step, and the action
 * that takes it.
 */
describe('EmptyState', () => {
  it('renders the title, the instruction and the action', async () => {
    const onAction = vi.fn();
    render(
      <EmptyState
        action={
          <button onClick={onAction} type="button">
            New flow
          </button>
        }
        description="Create a flow and it saves itself here as you edit."
        icon="scroll-text"
        title="No flows yet"
      />,
    );

    expect(screen.getByText('No flows yet')).toBeInTheDocument();
    expect(
      screen.getByText('Create a flow and it saves itself here as you edit.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'New flow' }));
    expect(onAction).toHaveBeenCalled();
  });

  it('renders without a description or action', () => {
    render(<EmptyState icon="play" title="No runs yet" />);

    expect(screen.getByText('No runs yet')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('carries the compact size as data for the stylesheet', () => {
    render(<EmptyState icon="play" size="sm" title="Quiet" />);

    expect(screen.getByTestId('empty-state')).toHaveAttribute('data-size', 'sm');
  });
});

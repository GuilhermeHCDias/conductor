import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { IconButton } from './IconButton';

/** Criterion 51 — every icon-only control carries an accessible name. */
describe('IconButton', () => {
  it('is reachable by its label', () => {
    render(<IconButton icon="plus" label="New flow" />);

    expect(screen.getByRole('button', { name: 'New flow' })).toBeInTheDocument();
  });

  it('reports a selected control as pressed', () => {
    render(<IconButton icon="crosshair" label="Inspect" selected />);

    expect(screen.getByRole('button', { name: 'Inspect' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('leaves aria-pressed off a control that is not a toggle', () => {
    render(<IconButton icon="camera" label="Screenshot" />);

    expect(screen.getByRole('button', { name: 'Screenshot' })).not.toHaveAttribute('aria-pressed');
  });

  it('calls back when activated', async () => {
    const onClick = vi.fn();
    render(<IconButton icon="x" label="Close tab" onClick={onClick} />);

    await userEvent.click(screen.getByRole('button', { name: 'Close tab' }));

    expect(onClick).toHaveBeenCalledOnce();
  });

  // Inside a form-less shell a default-type button is still a submit button;
  // the tab close button sits inside no form, but the search row does.
  it('is never a submit button', () => {
    render(<IconButton icon="search" label="Search" />);

    expect(screen.getByRole('button', { name: 'Search' })).toHaveAttribute('type', 'button');
  });
});

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { Composer } from './Composer';

/** Criterion 34. */
describe('Composer', () => {
  it('invites a step in the assistant’s own words', () => {
    render(<Composer />);

    expect(screen.getByPlaceholderText('Ask Conductor to write a step…')).toBeInTheDocument();
  });

  it('gives the field an accessible name of its own', () => {
    render(<Composer />);

    expect(screen.getByRole('textbox', { name: 'Ask Conductor' })).toBeInTheDocument();
  });

  it('offers a send action', () => {
    render(<Composer />);

    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
  });

  it('takes what is typed into it', async () => {
    render(<Composer />);

    await userEvent.type(screen.getByRole('textbox', { name: 'Ask Conductor' }), 'tap the card');

    expect(screen.getByRole('textbox', { name: 'Ask Conductor' })).toHaveValue('tap the card');
  });
});

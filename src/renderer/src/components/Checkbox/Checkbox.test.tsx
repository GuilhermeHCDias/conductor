import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Checkbox } from './Checkbox';

describe('Checkbox', () => {
  it('is a real checkbox named by its label, reporting each change', async () => {
    const onChange = vi.fn();
    render(<Checkbox checked={false} label="I accept the terms" onChange={onChange} />);

    const box = screen.getByRole('checkbox', { name: 'I accept the terms' });
    expect(box).not.toBeChecked();
    await userEvent.click(box);

    expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  });

  it('reads checked and disabled from its props', () => {
    render(<Checkbox checked disabled label="Terms" onChange={() => {}} />);

    expect(screen.getByRole('checkbox', { name: 'Terms' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Terms' })).toBeDisabled();
  });
});

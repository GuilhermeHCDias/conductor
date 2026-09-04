import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { DoctorBadge } from './DoctorBadge';

/**
 * The toolbar badge (doctor criteria 34–35), the kit's `CDoctorBadge`:
 * presentational — `{ issues, selected, onClick }` in, a click out.
 */
describe('DoctorBadge', () => {
  it('is the quiet Doctor icon button while nothing needs the person', () => {
    render(<DoctorBadge issues={0} onClick={vi.fn()} selected={false} />);

    const button = screen.getByRole('button', { name: 'Doctor' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    expect(button).not.toHaveTextContent(/\d/);
  });

  it('reads as selected while the sheet is open', () => {
    render(<DoctorBadge issues={0} onClick={vi.fn()} selected />);

    expect(screen.getByRole('button', { name: 'Doctor' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('is the amber count with the singular name for one item', () => {
    render(<DoctorBadge issues={1} onClick={vi.fn()} selected={false} />);

    const button = screen.getByRole('button', { name: 'Doctor · 1 item needs you' });
    expect(button).toHaveTextContent('1');
    expect(button).toHaveAttribute('data-issues', 'true');
  });

  it('pluralises the name for several', () => {
    render(<DoctorBadge issues={3} onClick={vi.fn()} selected={false} />);

    expect(screen.getByRole('button', { name: 'Doctor · 3 items need you' })).toHaveTextContent(
      '3',
    );
  });

  it('reports a click in either state', async () => {
    const onClick = vi.fn();
    const { rerender } = render(<DoctorBadge issues={0} onClick={onClick} selected={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Doctor' }));

    rerender(<DoctorBadge issues={2} onClick={onClick} selected={false} />);
    await userEvent.click(screen.getByRole('button', { name: 'Doctor · 2 items need you' }));

    expect(onClick).toHaveBeenCalledTimes(2);
  });
});

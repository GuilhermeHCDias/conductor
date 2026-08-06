import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusDot } from './StatusDot';

/**
 * The dot is decorative — the state it reports is always spelled out in the
 * text beside it — so the state travels as a data attribute and the module CSS
 * turns it into a `--state-*` token.
 */
describe('StatusDot', () => {
  it.each(['pass', 'fail', 'running', 'idle', 'connected', 'offline'] as const)(
    'carries the %s state',
    (state) => {
      render(<StatusDot data-testid="dot" state={state} />);

      expect(screen.getByTestId('dot')).toHaveAttribute('data-state', state);
    },
  );

  it('is hidden from the accessibility tree', () => {
    render(<StatusDot data-testid="dot" state="pass" />);

    expect(screen.getByTestId('dot')).toHaveAttribute('aria-hidden', 'true');
  });
});

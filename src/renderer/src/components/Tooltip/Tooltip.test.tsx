import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IconButton } from '../IconButton/IconButton';
import { Tooltip } from './Tooltip';

describe('Tooltip', () => {
  it('renders the control it wraps', () => {
    render(
      <Tooltip content="Hide sidebar" shortcut="⌘B">
        <IconButton icon="panel-left" label="Toggle sidebar" />
      </Tooltip>,
    );

    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toBeInTheDocument();
  });

  // The control already carries the accessible name; a tooltip that also
  // announced itself would have the screen reader say it twice.
  it('does not add a second name to the accessibility tree', () => {
    render(
      <Tooltip content="Hide sidebar">
        <IconButton icon="panel-left" label="Toggle sidebar" />
      </Tooltip>,
    );

    expect(screen.getByText('Hide sidebar')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Toggle sidebar' })).toBeInTheDocument();
  });
});

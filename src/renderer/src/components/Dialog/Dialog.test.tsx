import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Dialog } from './Dialog';

/**
 * The modal layer, ported from the design system's `surface/Dialog`. It is the
 * `inputText` prompt's shell (criterion 41): rendered means open, the backdrop
 * and Escape both dismiss, and the footer carries whatever actions the caller
 * composes.
 */

function renderDialog(
  children?: React.ReactNode,
  footer?: React.ReactNode,
): ReturnType<typeof vi.fn> {
  const onClose = vi.fn();
  render(
    <Dialog
      footer={footer}
      icon="text-cursor-input"
      onClose={onClose}
      subtitle='Types into Button · "Entrar".'
      title="Input text"
    >
      {children}
    </Dialog>,
  );
  return onClose;
}

describe('Dialog', () => {
  it('is a modal dialog named by its title', () => {
    renderDialog(<input aria-label="Text" />);

    const dialog = screen.getByRole('dialog', { name: 'Input text' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Types into Button · "Entrar".')).toBeInTheDocument();
    expect(screen.getByLabelText('Text')).toBeInTheDocument();
  });

  it('renders the footer actions', () => {
    renderDialog(null, <button type="button">Insert</button>);

    expect(screen.getByRole('button', { name: 'Insert' })).toBeInTheDocument();
  });

  it('closes on a backdrop click but not on a click inside', async () => {
    const onClose = renderDialog(<input aria-label="Text" />);

    await userEvent.click(screen.getByLabelText('Text'));
    expect(onClose).not.toHaveBeenCalled();

    await userEvent.click(screen.getByTestId('dialog-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', async () => {
    const onClose = renderDialog(<input aria-label="Text" />);

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('offers a close control', async () => {
    const onClose = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalled();
  });
});

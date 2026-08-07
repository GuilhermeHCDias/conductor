import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetRepoStore, useRepoStore } from '../../stores/repo.store';
import { AddRepoDialog } from './AddRepoDialog';

/**
 * The add sheet: the same resolver as first run, in a dialog, reset and
 * autofocused on open (criterion). Resolution behaviour itself is the
 * resolver's and the store's — proven there.
 */

beforeEach(() => {
  resetRepoStore();
});

describe('the add sheet', () => {
  it('renders nothing while closed', () => {
    const { container } = render(<AddRepoDialog />);

    expect(container).toBeEmptyDOMElement();
  });

  it('opens as the kit sheet with the field reset and focused', () => {
    useRepoStore.setState({ url: 'left over from before' });
    act(() => {
      useRepoStore.getState().openAdd();
    });
    render(<AddRepoDialog />);

    expect(screen.getByRole('dialog', { name: 'Add repository' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Conductor reads the app, its bundle id and the conductor/ folder from the repo.',
      ),
    ).toBeInTheDocument();
    const field = screen.getByRole('textbox', { name: 'Repository address' });
    expect(field).toHaveValue('');
    expect(field).toHaveFocus();
  });

  it('closes through Cancel', async () => {
    act(() => {
      useRepoStore.getState().openAdd();
    });
    render(<AddRepoDialog />);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(useRepoStore.getState().addOpen).toBe(false);
  });

  it('keeps Open project disabled until something is found', () => {
    act(() => {
      useRepoStore.getState().openAdd();
    });
    render(<AddRepoDialog />);

    expect(screen.getByRole('button', { name: 'Open project' })).toBeDisabled();
  });
});

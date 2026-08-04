import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ENVIRONMENT } from '../../fixtures/flows';
import {
  APPEARANCE_KEY,
  resetUiStore,
  selectSidebarVisible,
  useUiStore,
} from '../../stores/ui.store';
import { Toolbar } from './Toolbar';

const ui = () => useUiStore.getState();

beforeEach(() => {
  localStorage.clear();
  resetUiStore();
});

/** Criteria 10–13. */
describe('Toolbar', () => {
  it('renders its controls left to right', () => {
    render(<Toolbar />);

    const names = within(screen.getByRole('toolbar'))
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent);

    expect(names).toEqual(['Toggle sidebar', ENVIRONMENT, 'Run', 'Dark appearance', 'Save flow']);
  });

  it('names the active document and counts its commands', () => {
    render(<Toolbar />);

    expect(screen.getByText('teste.yaml')).toBeInTheDocument();
    expect(screen.getByText('1 commands · saved to suite')).toBeInTheDocument();
  });

  it('follows the active document when the tab changes', () => {
    render(<Toolbar />);

    act(() => {
      ui().openFlow('f-checkout');
    });

    expect(screen.getByText('checkout.yaml')).toBeInTheDocument();
    expect(screen.queryByText('teste.yaml')).not.toBeInTheDocument();
  });

  it('toggles the sidebar', async () => {
    render(<Toolbar />);
    ui().setWindowWidth(1440);

    await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));

    expect(selectSidebarVisible(ui())).toBe(false);
  });

  it('flips the appearance and persists it', async () => {
    render(<Toolbar />);

    await userEvent.click(screen.getByRole('button', { name: 'Dark appearance' }));

    expect(ui().dark).toBe(true);
    expect(localStorage.getItem(APPEARANCE_KEY)).toBe('1');
    expect(screen.getByRole('button', { name: 'Light appearance' })).toBeInTheDocument();
  });

  it('shows the environment the flow would run against', () => {
    render(<Toolbar />);

    expect(screen.getByRole('button', { name: ENVIRONMENT })).toBeInTheDocument();
  });

  // Criterion 12 — the Run button becomes Stop while a run is in flight.
  it('offers Run while idle', () => {
    render(<Toolbar />);

    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });

  it('offers Stop while running', () => {
    useUiStore.setState({ running: true });
    render(<Toolbar />);

    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
  });
});

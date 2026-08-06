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

    expect(names).toEqual([
      'Toggle sidebar',
      ENVIRONMENT,
      'Run',
      'Send changes2',
      'Dark appearance',
    ]);
  });

  /**
   * There is no Save control. An edit is on disk the instant it happens
   * (`.context.md` §8.2), so a button that saves would be a button that does
   * what already happened — and the subtitle says so instead.
   */
  it('offers nothing to save', () => {
    render(<Toolbar />);

    expect(screen.queryByRole('button', { name: 'Save flow' })).not.toBeInTheDocument();
  });

  it('names the active document and counts its commands', () => {
    render(<Toolbar />);

    expect(screen.getByText('teste.yaml')).toBeInTheDocument();
    expect(screen.getByText('1 command · saved on this Mac')).toBeInTheDocument();
  });

  it('says the flow is running rather than saved while a run is in flight', () => {
    useUiStore.setState({ running: true });
    render(<Toolbar />);

    expect(screen.getByText('1 command · running')).toBeInTheDocument();
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

/**
 * Criteria 4–8 of aurora-rehue-toolbar-publish — the Send control, in the slot
 * the removed Save button left (§8.5). Three states, one slot.
 */
describe('the Send control', () => {
  /** Criterion 4 — the slot the Save button left: right of the hairline. */
  it('sits immediately after the hairline separator', () => {
    render(<Toolbar />);

    const slot = screen.getByRole('button', { name: /^Send changes/ }).parentElement;

    expect(slot?.previousElementSibling).toHaveAttribute('aria-hidden', 'true');
  });

  /** Criterion 6 — changes waiting: a filled button carrying the count. */
  it('offers to send the fixture’s changed flows', () => {
    render(<Toolbar />);

    const send = screen.getByRole('button', { name: /^Send changes/ });

    expect(within(send).getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Send 2 changes to the team')).toBeInTheDocument();
  });

  it('speaks in the singular for a single change', () => {
    useUiStore.setState({ changes: [{ id: 'f-teste', name: 'teste.yaml', change: 'edited' }] });
    render(<Toolbar />);

    expect(screen.getByText('Send 1 change to the team')).toBeInTheDocument();
  });

  it('keeps offering the button while the send is in flight', () => {
    useUiStore.setState({ sendPhase: 'sending' });
    render(<Toolbar />);

    expect(screen.getByRole('button', { name: /^Send changes/ })).toBeInTheDocument();
  });

  /** Criterion 5 — nothing to send: a quiet confirmation, not a control. */
  it('goes inert once everything is sent', () => {
    useUiStore.setState({ changes: [] });
    render(<Toolbar />);

    expect(screen.getByText('Everything sent')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /Everything sent|Send changes/ }),
    ).not.toBeInTheDocument();
  });

  /** Criterion 7 — waiting for a colleague is normal, not a warning. */
  it('turns into a quiet pill while the batch waits for review', () => {
    useUiStore.setState({ sendPhase: 'review', changes: [] });
    render(<Toolbar />);

    expect(screen.getByRole('button', { name: 'Waiting for review' })).toBeInTheDocument();
    expect(screen.getByText('Waiting for review · sent 2 min ago')).toBeInTheDocument();
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
  });

  it('counts changes that piled up after the send', () => {
    useUiStore.setState({ sendPhase: 'review' });
    render(<Toolbar />);

    const pill = screen.getByRole('button', { name: /^Waiting for review/ });

    expect(within(pill).getByText('+2')).toBeInTheDocument();
  });

  /** Criterion 8 — activating the control opens the sheet. */
  it('opens the sheet from the send button', async () => {
    render(<Toolbar />);

    await userEvent.click(screen.getByRole('button', { name: /^Send changes/ }));

    expect(ui().sendOpen).toBe(true);
  });

  it('opens the sheet from the review pill', async () => {
    useUiStore.setState({ sendPhase: 'review' });
    render(<Toolbar />);

    await userEvent.click(screen.getByRole('button', { name: /^Waiting for review/ }));

    expect(ui().sendOpen).toBe(true);
  });
});

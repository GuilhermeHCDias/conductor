import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ENVIRONMENT } from '../../fixtures/flows';
import { resetDeviceStore, useDeviceStore } from '../../stores/device.store';
import { resetFlowStore, useFlowStore } from '../../stores/flow.store';
import { resetRunStore, useRunStore } from '../../stores/run.store';
import {
  APPEARANCE_KEY,
  resetUiStore,
  selectSidebarVisible,
  useUiStore,
} from '../../stores/ui.store';
import { Toolbar } from './Toolbar';

const ui = () => useUiStore.getState();

const DEVICE = 'R9QYC01EMXL';

/** A usable phone, selected by main the way one device always is. */
function connectDevice(): void {
  useDeviceStore.setState({
    devices: [{ id: DEVICE, model: 'SM-A075M', state: 'device' }],
    autoSelectedId: DEVICE,
    loaded: true,
  });
}

beforeEach(() => {
  localStorage.clear();
  resetUiStore();
  resetDeviceStore();
  resetFlowStore();
  resetRunStore();
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

  /** The count is the open flow's own — the store the Run button executes —
   * not a fixture's; a step the command menu appends moves it. */
  it('counts the commands of the flow as edited', () => {
    render(<Toolbar />);

    act(() => {
      useFlowStore.getState().appendStep('- tapOn: "Buy"');
    });

    expect(screen.getByText('2 commands · saved to suite')).toBeInTheDocument();
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
    useRunStore.setState({ running: true });
    render(<Toolbar />);

    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Run' })).not.toBeInTheDocument();
  });
});

/** Run criteria 15–18. */
describe('the Run button', () => {
  /** Criterion 17 — nothing to run on, or nothing to run. */
  it('is disabled while no device is connected', () => {
    render(<Toolbar />);

    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
  });

  it('is disabled while the flow is empty', () => {
    connectDevice();
    useFlowStore.setState({ yaml: '   \n' });
    render(<Toolbar />);

    expect(screen.getByRole('button', { name: 'Run' })).toBeDisabled();
  });

  it('is enabled with a device and a flow', () => {
    connectDevice();
    render(<Toolbar />);

    expect(screen.getByRole('button', { name: 'Run' })).toBeEnabled();
  });

  /** Criterion 15 — what you see is what runs: the store's current text,
   * dirty or not, on the selected device. And the button flips. */
  it('starts the open flow on the selected device and flips to Stop', async () => {
    connectDevice();
    useFlowStore.getState().appendStep('- tapOn: "Entrar"');
    const runStart = vi.fn(() => Promise.resolve({ ok: true as const, data: { runId: 'run-1' } }));
    window.conductor.runStart = runStart;
    render(<Toolbar />);

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(runStart).toHaveBeenCalledWith(DEVICE, useFlowStore.getState().yaml);
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  /** Criterion 18 — the report is in the Run tab, so that is where a click
   * takes the window. */
  it('switches the lower panel to Run on click', async () => {
    connectDevice();
    window.conductor.runStart = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { runId: 'run-1' } }),
    );
    render(<Toolbar />);
    expect(ui().lowerPanel).toBe('assistant');

    await userEvent.click(screen.getByRole('button', { name: 'Run' }));

    expect(ui().lowerPanel).toBe('run');
  });

  /** Criterion 16 — Stop asks for the cancel; only the terminal event brings
   * Run back. */
  it('stops the active run, returning to Run only when the terminal lands', async () => {
    useRunStore.setState({ running: true, runId: 'run-1' });
    const runCancel = vi.fn(() => Promise.resolve({ ok: true as const, data: { runId: 'run-1' } }));
    window.conductor.runCancel = runCancel;
    render(<Toolbar />);

    await userEvent.click(screen.getByRole('button', { name: 'Stop' }));

    expect(runCancel).toHaveBeenCalledWith('run-1');
    expect(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();

    act(() => {
      useRunStore.getState().applyEvent({
        ok: true,
        data: { type: 'finished', runId: 'run-1', outcome: 'canceled', message: null },
      });
    });

    expect(screen.getByRole('button', { name: 'Run' })).toBeInTheDocument();
  });
});

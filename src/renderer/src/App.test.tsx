import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { resetDeviceStore, useDeviceStore } from './stores/device.store';
import { resetFlowStore, useFlowStore } from './stores/flow.store';
import { resetRunStore, useRunStore } from './stores/run.store';
import { resetUiStore, useUiStore } from './stores/ui.store';
import { resizeElement } from './test-setup';

const ui = () => useUiStore.getState();

/** Sizes the window frame, which is what the breakpoints read. */
function sizeWindow(width: number): void {
  act(() => {
    resizeElement(screen.getByTestId('window-frame'), { width, height: 820 });
  });
}

beforeEach(() => {
  localStorage.clear();
  resetUiStore();
  resetDeviceStore();
  resetFlowStore();
  resetRunStore();
  delete document.documentElement.dataset.theme;
});

describe('App', () => {
  /** Criterion 53. */
  it('renders the four regions of the window', () => {
    render(<App />);

    expect(screen.getByRole('toolbar', { name: 'Window' })).toBeInTheDocument();
    sizeWindow(1440);
    expect(screen.getByRole('region', { name: 'Flows' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Editor' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Device' })).toBeInTheDocument();
  });

  /** Criterion 4. */
  describe('theme', () => {
    it('marks the document as light by default', () => {
      render(<App />);

      expect(document.documentElement.dataset.theme).toBe('aurora');
    });

    it('marks the document as dark while dark is selected', async () => {
      render(<App />);

      await userEvent.click(screen.getByRole('button', { name: 'Dark appearance' }));

      expect(document.documentElement.dataset.theme).toBe('aurora-dark');
    });

    it('applies a persisted dark choice on start', () => {
      useUiStore.setState({ dark: true });
      render(<App />);

      expect(document.documentElement.dataset.theme).toBe('aurora-dark');
    });
  });

  /** Criteria 2 and 44–45. */
  describe('panes', () => {
    it('shows the sidebar at a wide window', () => {
      render(<App />);

      sizeWindow(1440);

      expect(screen.getByRole('region', { name: 'Flows' })).toBeInTheDocument();
      expect(screen.getByTestId('panes')).toHaveAttribute('data-sidebar', 'true');
    });

    it('hides the sidebar at a narrow window', () => {
      render(<App />);

      sizeWindow(1000);

      expect(screen.queryByRole('region', { name: 'Flows' })).not.toBeInTheDocument();
      expect(screen.getByTestId('panes')).not.toHaveAttribute('data-sidebar');
    });

    it('keeps the editor and the device at every width', () => {
      render(<App />);

      sizeWindow(960);

      expect(screen.getByRole('region', { name: 'Editor' })).toBeInTheDocument();
      expect(screen.getByRole('region', { name: 'Device' })).toBeInTheDocument();
    });

    it('lets the toolbar toggle beat the breakpoint', async () => {
      render(<App />);
      sizeWindow(1000);

      await userEvent.click(screen.getByRole('button', { name: 'Toggle sidebar' }));

      expect(screen.getByRole('region', { name: 'Flows' })).toBeInTheDocument();
    });

    it('separates the panes with hairlines', () => {
      render(<App />);
      sizeWindow(1440);

      expect(screen.getAllByTestId('pane-hairline')).toHaveLength(2);
    });

    it('drops the sidebar hairline with the sidebar', () => {
      render(<App />);
      sizeWindow(1000);

      expect(screen.getAllByTestId('pane-hairline')).toHaveLength(1);
    });
  });

  /** Criteria 47–48, mounted once by the shell. */
  describe('window shortcuts', () => {
    it('toggles the sidebar on ⌘B', async () => {
      render(<App />);
      sizeWindow(1440);

      await userEvent.keyboard('{Meta>}b{/Meta}');

      expect(screen.queryByRole('region', { name: 'Flows' })).not.toBeInTheDocument();
    });

    it('flips the lower panel on ⌘J', async () => {
      render(<App />);

      await userEvent.keyboard('{Meta>}j{/Meta}');

      expect(screen.getByRole('tab', { name: 'Run' })).toHaveAttribute('aria-selected', 'true');
    });

    it('clears the sidebar search on Escape', async () => {
      render(<App />);
      sizeWindow(1440);
      await userEvent.type(screen.getByRole('searchbox', { name: 'Search flows' }), 'zzz');

      await userEvent.keyboard('{Escape}');

      expect(ui().query).toBe('');
    });
  });

  /** Criterion 54 — Tab reaches every control, in the order they are drawn.
   * With a device connected — answered by the channel, because mounting the
   * window refreshes the list: the Run button is rightly disabled without one
   * (run criterion 17), and a disabled control is not a Tab stop. */
  it('walks the window in visual order', async () => {
    const snapshot = {
      devices: [{ id: 'R9QYC01EMXL', model: 'SM-A075M', state: 'device' as const }],
      selectedId: 'R9QYC01EMXL',
      properties: null,
    };
    window.conductor.deviceList = () => Promise.resolve({ ok: true, data: snapshot });
    useDeviceStore.getState().applySnapshot({ ok: true, data: snapshot });
    render(<App />);
    sizeWindow(1440);

    const reached: string[] = [];
    for (let step = 0; step < 8; step += 1) {
      await userEvent.tab();
      const active = document.activeElement;
      reached.push(active?.getAttribute('aria-label') ?? active?.textContent ?? '');
    }

    // Toolbar left to right, then the sidebar, then its first row.
    expect(reached.slice(0, 5)).toEqual([
      'Toggle sidebar',
      'staging',
      'Run',
      'Dark appearance',
      'New flow',
    ]);
    expect(reached[5]).toBe('Search flows');
  });

  /** Criterion 12 of the shell spec, fed by the real run now (run criterion
   * 24): settled parsed steps over the open flow's own command count. */
  describe('progress line', () => {
    it('is absent while nothing is running', () => {
      render(<App />);

      expect(screen.queryByTestId('run-progress')).not.toBeInTheDocument();
    });

    it('starts empty when a run has reported nothing yet', () => {
      useRunStore.setState({ running: true });
      render(<App />);

      expect(screen.getByTestId('run-progress')).toHaveStyle({ width: '0%' });
    });

    it('spans the pane row as steps settle against the flow’s command count', () => {
      useRunStore.setState({
        running: true,
        steps: [
          { id: 'a', label: 'Launch app', status: 'pass', duration: '0:01' },
          { id: 'b', label: 'Tap on', status: 'running' },
        ],
      });
      render(<App />);

      // One settled step of the open flow's one command: the line is full. The
      // still-running step is progress-in-flight, not progress made.
      expect(screen.getByTestId('run-progress')).toHaveStyle({ width: '100%' });
    });

    /** The denominator is the open flow's, live — a step the menu appended
     * mid-edit widens the run it starts, not the fixture it replaced. */
    it('measures against the flow store’s current text', () => {
      useFlowStore.getState().appendStep('- tapOn: "Entrar"');
      useRunStore.setState({
        running: true,
        steps: [{ id: 'a', label: 'Launch app', status: 'pass', duration: '0:01' }],
      });
      render(<App />);

      expect(screen.getByTestId('run-progress')).toHaveStyle({ width: '50%' });
    });

    /** Run criterion 24 — cleared when the run ends, not left full. */
    it('clears when the run ends', () => {
      useRunStore.setState({
        running: false,
        outcome: 'failed',
        steps: [{ id: 'a', label: 'Launch app', status: 'pass', duration: '0:01' }],
      });
      render(<App />);

      expect(screen.queryByTestId('run-progress')).not.toBeInTheDocument();
    });
  });
});

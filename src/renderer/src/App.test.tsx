import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
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

  /** Criterion 54 — Tab reaches every control, in the order they are drawn. */
  it('walks the window in visual order', async () => {
    render(<App />);
    sizeWindow(1440);

    const reached: string[] = [];
    for (let step = 0; step < 8; step += 1) {
      await userEvent.tab();
      const active = document.activeElement;
      reached.push(active?.getAttribute('aria-label') ?? active?.textContent ?? '');
    }

    // Toolbar left to right, then the sidebar, then its first row.
    expect(reached.slice(0, 6)).toEqual([
      'Toggle sidebar',
      'staging',
      'Run',
      'Send changes2',
      'Dark appearance',
      'New flow',
    ]);
    expect(reached[6]).toBe('Search flows');
  });

  /**
   * aurora-rehue-toolbar-publish criterion 9 — the sheet mounts on the WINDOW,
   * so its scrim covers the toolbar too, and Escape reaches it through the
   * window's own shortcut hook.
   */
  describe('the send sheet', () => {
    it('opens over the window from the toolbar Send control', async () => {
      render(<App />);

      await userEvent.click(screen.getByRole('button', { name: /^Send changes/ }));

      expect(screen.getByRole('dialog', { name: 'Send 2 changes' })).toBeInTheDocument();
    });

    it('closes on Escape without touching the phase', async () => {
      render(<App />);
      await userEvent.click(screen.getByRole('button', { name: /^Send changes/ }));

      await userEvent.keyboard('{Escape}');

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(ui().sendPhase).toBe('idle');
    });
  });

  /** Criterion 12 — the run's progress reads as a line under the toolbar. */
  describe('progress line', () => {
    it('is absent while nothing is running', () => {
      render(<App />);

      expect(screen.queryByTestId('run-progress')).not.toBeInTheDocument();
    });

    it('starts empty when a run has reported nothing yet', () => {
      useUiStore.setState({ running: true, steps: [] });
      render(<App />);

      expect(screen.getByTestId('run-progress')).toHaveStyle({ width: '0%' });
    });

    it('spans the top of the pane row while running', () => {
      useUiStore.setState({
        running: true,
        steps: [
          { id: 'a', label: 'Launch app', status: 'pass', duration: '0:01' },
          { id: 'b', label: 'Tap on', status: 'running' },
        ],
      });
      render(<App />);

      // Two of the fixture flow's one command have reported, so the line is full.
      expect(screen.getByTestId('run-progress')).toHaveStyle({ width: '100%' });
    });
  });
});

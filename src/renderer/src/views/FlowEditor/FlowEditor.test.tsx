import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ASSISTANT_STATUS_LINE, RUN_STATUS_LINE } from '../../fixtures/flows';
import { resetUiStore, useUiStore } from '../../stores/ui.store';
import { FlowEditor } from './FlowEditor';

const ui = () => useUiStore.getState();

const lineOf = (n: number) => screen.getByTestId(`yaml-line-${n}`);

beforeEach(() => {
  resetUiStore();
});

/** Criteria 22–30. */
describe('FlowEditor', () => {
  it('is a region a screen reader can find by name', () => {
    render(<FlowEditor />);

    expect(screen.getByRole('region', { name: 'Editor' })).toBeInTheDocument();
  });

  /** Criterion 23. */
  describe('tab strip', () => {
    it('renders one tab per open document, then the new-tab button', () => {
      render(<FlowEditor />);
      act(() => {
        ui().openFlow('f-login');
      });

      const strip = screen.getByTestId('tab-strip');
      const names = within(strip)
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label') ?? button.textContent);

      // login.yaml is the active document, so it is the one showing a close button.
      expect(names).toEqual(['teste.yaml', 'login.yaml', 'Close tab', 'New tab']);
    });

    it('marks the document with unsaved changes', () => {
      render(<FlowEditor />);

      expect(screen.getByTestId('tab-f-teste')).toHaveAttribute('data-dirty', 'true');
    });

    it('makes a tab the active document when it is selected', async () => {
      render(<FlowEditor />);
      act(() => {
        ui().openFlow('f-login');
      });

      await userEvent.click(screen.getByRole('button', { name: 'teste.yaml' }));

      expect(ui().activeTabId).toBe('f-teste');
      expect(screen.getByTestId('tab-f-teste')).toHaveAttribute('data-active', 'true');
    });

    it('closes a tab', async () => {
      render(<FlowEditor />);
      act(() => {
        ui().openFlow('f-login');
      });
      const tab = screen.getByTestId('tab-f-login');

      await userEvent.click(within(tab).getByRole('button', { name: 'Close tab' }));

      expect(screen.queryByTestId('tab-f-login')).not.toBeInTheDocument();
    });

    // Criterion 25: an empty working area has nothing to show.
    it('refuses to close the last remaining tab', async () => {
      render(<FlowEditor />);
      const tab = screen.getByTestId('tab-f-teste');

      await userEvent.click(within(tab).getByRole('button', { name: 'Close tab' }));

      expect(screen.getByTestId('tab-f-teste')).toBeInTheDocument();
    });

    it('shows the close button only on the active or hovered tab', async () => {
      render(<FlowEditor />);
      act(() => {
        ui().openFlow('f-login');
      });
      const idle = screen.getByTestId('tab-f-teste');
      expect(within(idle).queryByRole('button', { name: 'Close tab' })).not.toBeInTheDocument();

      await userEvent.hover(idle);

      expect(within(idle).getByRole('button', { name: 'Close tab' })).toBeInTheDocument();
    });

    it('opens a new document', async () => {
      render(<FlowEditor />);

      await userEvent.click(screen.getByRole('button', { name: 'New tab' }));

      expect(ui().tabs).toHaveLength(2);
    });

    it('labels the strip with the language of the document', () => {
      render(<FlowEditor />);

      expect(within(screen.getByTestId('tab-strip')).getByText('YAML')).toBeInTheDocument();
    });
  });

  /** Criteria 26–28. */
  describe('YAML body', () => {
    it('numbers every line, plus the empty one after the flow', () => {
      render(<FlowEditor />);

      // The fixture flow is four lines long.
      expect(screen.getByTestId('yaml-gutter-1')).toHaveTextContent('1');
      expect(screen.getByTestId('yaml-gutter-5')).toHaveTextContent('5');
      expect(screen.queryByTestId('yaml-gutter-6')).not.toBeInTheDocument();
    });

    it('colours each span by what the tokenizer read it as', () => {
      render(<FlowEditor />);

      const kinds = within(lineOf(1))
        .getAllByTestId('yaml-token')
        .map((span) => span.getAttribute('data-token'));

      expect(kinds).toEqual(['anchor', 'punct', 'string']);
      expect(within(lineOf(1)).getByText('appId')).toHaveAttribute('data-token', 'anchor');
    });

    it('puts the caret on the last line of the flow', () => {
      render(<FlowEditor />);

      expect(within(lineOf(4)).getByTestId('caret')).toBeInTheDocument();
      expect(within(lineOf(5)).queryByTestId('caret')).not.toBeInTheDocument();
      expect(lineOf(4)).toHaveAttribute('data-line', 'active');
    });

    /** Criterion 27 — error beats AI, and both beat the active line. */
    it('washes a line the assistant wrote', () => {
      useUiStore.setState({ aiLines: [3] });
      render(<FlowEditor />);

      expect(lineOf(3)).toHaveAttribute('data-line', 'ai');
    });

    it('washes a line Maestro reported as failing', () => {
      useUiStore.setState({ errorLines: [2] });
      render(<FlowEditor />);

      expect(lineOf(2)).toHaveAttribute('data-line', 'error');
    });

    it('lets an error line win over an AI line', () => {
      useUiStore.setState({ aiLines: [3], errorLines: [3] });
      render(<FlowEditor />);

      expect(lineOf(3)).toHaveAttribute('data-line', 'error');
    });

    it('lets an AI line win over the active line', () => {
      useUiStore.setState({ aiLines: [4] });
      render(<FlowEditor />);

      expect(lineOf(4)).toHaveAttribute('data-line', 'ai');
      // The caret still marks where the flow ends.
      expect(within(lineOf(4)).getByTestId('caret')).toBeInTheDocument();
    });
  });

  /** Criteria 29–30. */
  describe('lower panel', () => {
    it('offers Run and Assistant as a segmented control over the panel', () => {
      render(<FlowEditor />);

      expect(screen.getByRole('tablist', { name: 'Lower panel' })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Assistant' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('tabpanel')).toHaveAttribute('id', 'lower-panel');
    });

    it('starts on the assistant thread', () => {
      render(<FlowEditor />);

      expect(within(screen.getByRole('tabpanel')).getByText(/Right-click anything/)).toBeVisible();
      expect(screen.getByText(ASSISTANT_STATUS_LINE)).toBeInTheDocument();
    });

    it('swaps to the run report when the Run segment is activated', async () => {
      render(<FlowEditor />);

      await userEvent.click(screen.getByRole('tab', { name: 'Run' }));

      expect(
        within(screen.getByRole('tabpanel')).getByText(/every step reports here/),
      ).toBeVisible();
      expect(screen.getByText(RUN_STATUS_LINE)).toBeInTheDocument();
    });

    it('follows ⌘J, which flips the same state', () => {
      render(<FlowEditor />);

      act(() => {
        ui().toggleLowerPanel();
      });

      expect(screen.getByRole('tab', { name: 'Run' })).toHaveAttribute('aria-selected', 'true');
    });

    it('badges the Run segment while a run is in flight', () => {
      useUiStore.setState({ running: true });
      render(<FlowEditor />);

      expect(screen.getByRole('tab', { name: 'Run' })).toHaveAttribute('data-badge', 'true');
    });
  });

  it('carries the composer on its footer', () => {
    render(<FlowEditor />);

    expect(screen.getByPlaceholderText('Ask Conductor to write a step…')).toBeInTheDocument();
  });
});

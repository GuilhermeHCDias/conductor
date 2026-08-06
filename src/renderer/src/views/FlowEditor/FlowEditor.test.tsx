import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASSISTANT_STATUS_LINE, RUN_STATUS_LINE } from '../../fixtures/flows';
import { resetFlowStore, useFlowStore } from '../../stores/flow.store';
import { resetRunStore, useRunStore } from '../../stores/run.store';
import { resetUiStore, useUiStore } from '../../stores/ui.store';
import { FlowEditor } from './FlowEditor';

const ui = () => useUiStore.getState();
const flow = () => useFlowStore.getState();

const lineOf = (n: number) => screen.getByTestId(`yaml-line-${n}`);

beforeEach(() => {
  resetUiStore();
  resetFlowStore();
  resetRunStore();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** Criteria 22–30. */
describe('FlowEditor', () => {
  it('is a region a screen reader can find by name', () => {
    render(<FlowEditor />);

    expect(screen.getByRole('region', { name: 'Editor' })).toBeInTheDocument();
  });

  /** Criteria 23 and 24. */
  describe('document bar', () => {
    it('names the open document', () => {
      render(<FlowEditor />);

      expect(
        within(screen.getByTestId('document-bar')).getByText('teste.yaml'),
      ).toBeInTheDocument();
    });

    it('swaps to the flow the sidebar opened, keeping nothing of the last one', () => {
      render(<FlowEditor />);

      act(() => {
        ui().openFlow('f-login');
      });

      const bar = screen.getByTestId('document-bar');
      expect(within(bar).getByText('login.yaml')).toBeInTheDocument();
      expect(within(bar).queryByText('teste.yaml')).not.toBeInTheDocument();
    });

    /** Inspect criterion 39 — the dirty mark follows the flow's own text now,
     * not a fixture flag: clean until something is actually appended. */
    it('opens clean until a step is appended', () => {
      render(<FlowEditor />);

      expect(screen.getByTestId('document-bar')).not.toHaveAttribute('data-dirty');
    });

    it('marks the document once a step is appended', () => {
      render(<FlowEditor />);

      act(() => {
        flow().appendStep('- waitForAnimationToEnd');
      });

      expect(screen.getByTestId('document-bar')).toHaveAttribute('data-dirty', 'true');
    });

    // Criterion 23: the sidebar is the only place a document is opened or started.
    it('carries no tab chrome of its own', () => {
      render(<FlowEditor />);

      expect(within(screen.getByTestId('document-bar')).queryAllByRole('button')).toEqual([]);
    });

    it('labels the bar with the language of the document', () => {
      render(<FlowEditor />);

      expect(within(screen.getByTestId('document-bar')).getByText('YAML')).toBeInTheDocument();
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

    /** Inspect criterion 36 — the body renders the store's text, so a step the
     * menu appended is on screen the moment it lands. */
    it('renders the lines a menu command appended', () => {
      render(<FlowEditor />);

      act(() => {
        flow().appendStep('- tapOn:\n    text: "Entrar"');
      });

      expect(lineOf(5)).toHaveTextContent('- tapOn:');
      expect(lineOf(6)).toHaveTextContent('text: "Entrar"');
      expect(within(lineOf(6)).getByTestId('caret')).toBeInTheDocument();
    });

    /** Inspect criterion 39 — the editor reveals what was just written. jsdom
     * has no scrollIntoView, so one is installed for exactly this test. */
    it('scrolls the new lines into view when a step is appended', () => {
      const reveal = vi.fn();
      window.HTMLElement.prototype.scrollIntoView = reveal;
      try {
        render(<FlowEditor />);
        expect(reveal).not.toHaveBeenCalled();

        act(() => {
          flow().appendStep('- waitForAnimationToEnd');
        });

        expect(reveal).toHaveBeenCalled();
      } finally {
        Reflect.deleteProperty(window.HTMLElement.prototype, 'scrollIntoView');
      }
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
      useRunStore.setState({ running: true });
      render(<FlowEditor />);

      expect(screen.getByRole('tab', { name: 'Run' })).toHaveAttribute('data-badge', 'true');
    });
  });

  it('carries the composer on its footer', () => {
    render(<FlowEditor />);

    expect(screen.getByPlaceholderText('Ask Conductor to write a step…')).toBeInTheDocument();
  });
});

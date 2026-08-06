import { act, fireEvent, render, screen, within } from '@testing-library/react';
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
const editor = () => screen.getByRole('textbox', { name: 'Flow YAML' }) as HTMLTextAreaElement;

/** Puts the caret at `index` and lets the select handler read it. */
function placeCaret(index: number): void {
  const box = editor();
  box.focus();
  box.setSelectionRange(index, index);
  fireEvent.select(box);
}

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

    /** Amended by editability: the caret is the textarea's own, so the wash
     * that used to sit on the last line waits for focus instead. */
    it('shows no active line until the editor takes focus', () => {
      render(<FlowEditor />);

      expect(lineOf(4)).not.toHaveAttribute('data-line');
      expect(lineOf(5)).not.toHaveAttribute('data-line');
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
      expect(editor()).toHaveValue(flow().yaml);
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
      useUiStore.setState({ aiLines: [1] });
      render(<FlowEditor />);

      act(() => {
        placeCaret(0);
      });

      expect(lineOf(1)).toHaveAttribute('data-line', 'ai');
    });
  });

  /** The body is a real editor: the coloured lines sit under a transparent
   * textarea, so typing, deleting and inserting land in the flow store. */
  describe('editing', () => {
    it('offers the flow text as a labelled textbox', () => {
      render(<FlowEditor />);

      expect(editor()).toHaveValue(flow().yaml);
    });

    it('lands a typed character in the store and marks the flow dirty', async () => {
      render(<FlowEditor />);
      const before = flow().yaml;

      await userEvent.type(editor(), 'x');

      expect(flow().yaml).toBe(`${before}x`);
      expect(flow().dirty).toBe(true);
      expect(screen.getByTestId('document-bar')).toHaveAttribute('data-dirty', 'true');
    });

    it('deletes down to nothing without falling over', async () => {
      render(<FlowEditor />);

      await userEvent.clear(editor());

      expect(flow().yaml).toBe('');
      expect(screen.getByTestId('yaml-gutter-1')).toBeInTheDocument();
    });

    it('renders what was typed, syntax-coloured, as it lands', async () => {
      render(<FlowEditor />);
      await userEvent.clear(editor());

      await userEvent.type(editor(), 'appId: novo');

      expect(within(lineOf(1)).getByText('appId')).toHaveAttribute('data-token', 'anchor');
    });

    /** The user's own keystrokes never yank the view — the reveal-scroll is
     * for blocks that arrive from outside the editor (inspect criterion 39). */
    it('does not scroll on a keystroke', async () => {
      const reveal = vi.fn();
      window.HTMLElement.prototype.scrollIntoView = reveal;
      try {
        render(<FlowEditor />);

        await userEvent.type(editor(), 'x');

        expect(reveal).not.toHaveBeenCalled();
      } finally {
        Reflect.deleteProperty(window.HTMLElement.prototype, 'scrollIntoView');
      }
    });

    it('washes the line under the caret while the editor is focused', () => {
      render(<FlowEditor />);

      act(() => {
        placeCaret(0);
      });

      expect(lineOf(1)).toHaveAttribute('data-line', 'active');
      expect(lineOf(4)).not.toHaveAttribute('data-line');
    });

    it('moves the wash with the caret', () => {
      render(<FlowEditor />);

      act(() => {
        placeCaret(0);
      });
      act(() => {
        placeCaret(flow().yaml.indexOf('launchApp'));
      });

      expect(lineOf(1)).not.toHaveAttribute('data-line');
      expect(lineOf(3)).toHaveAttribute('data-line', 'active');
    });

    it('drops the wash when the editor loses focus', () => {
      render(<FlowEditor />);

      act(() => {
        placeCaret(0);
      });
      act(() => {
        fireEvent.blur(editor());
      });

      expect(lineOf(1)).not.toHaveAttribute('data-line');
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

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RUN_STATUS_LINE } from '../../fixtures/flows';
import { DEFAULT_SPLIT, MIN_PANE, STEP_SPLIT } from '../../lib/editor-split';
import { resetAiStore, useAiStore } from '../../stores/ai.store';
import { resetFlowStore, useFlowStore } from '../../stores/flow.store';
import { resetRunStore, useRunStore } from '../../stores/run.store';
import { EDITOR_SPLIT_KEY, resetUiStore, useUiStore } from '../../stores/ui.store';
import { FlowEditor } from './FlowEditor';

const ui = () => useUiStore.getState();
const flow = () => useFlowStore.getState();

/** Four lines, like the flow the editor used to seed from the fixture. */
const FLOW_YAML = 'appId: com.example.app\n---\n- launchApp:\n    clearState: true\n';

/** The editor edits the open flow; the sidebar is what opens one. */
function openSeed(path = 'teste.yaml', yaml: string = FLOW_YAML): void {
  useFlowStore.setState({ openPath: path, yaml });
}

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
  // The editor split persists, so a test that drags one leaks into the next
  // unless the storage behind it is cleared first.
  localStorage.clear();
  resetUiStore();
  resetFlowStore();
  resetRunStore();
  resetAiStore();
  openSeed();
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

  /** Criteria 23 and 24 of the layout, and criterion 8 of this spec. */
  describe('document bar', () => {
    it('names the open flow from its identity', () => {
      render(<FlowEditor />);

      expect(
        within(screen.getByTestId('document-bar')).getByText('teste.yaml'),
      ).toBeInTheDocument();
    });

    it('swaps to the flow the sidebar opened, keeping nothing of the last one', () => {
      render(<FlowEditor />);

      act(() => {
        openSeed('checkout/login.yaml');
      });

      const bar = screen.getByTestId('document-bar');
      expect(within(bar).getByText('login.yaml')).toBeInTheDocument();
      expect(within(bar).queryByText('teste.yaml')).not.toBeInTheDocument();
    });

    it('goes quiet when nothing is open', () => {
      act(() => {
        useFlowStore.setState({ openPath: null, yaml: '' });
      });
      render(<FlowEditor />);

      expect(within(screen.getByTestId('document-bar')).getByText('—')).toBeInTheDocument();
    });

    /** Criterion 8 — the dot is the save state: pending or in flight. */
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

    /** Criterion 8 — once the write lands, the dot leaves. */
    it('drops the mark when the save lands', async () => {
      vi.useFakeTimers();
      window.conductor.flowSave = vi.fn((path: string) =>
        Promise.resolve({ ok: true as const, data: { path } }),
      );
      render(<FlowEditor />);

      act(() => {
        flow().appendStep('- waitForAnimationToEnd');
      });
      expect(screen.getByTestId('document-bar')).toHaveAttribute('data-dirty', 'true');

      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(screen.getByTestId('document-bar')).not.toHaveAttribute('data-dirty');
      vi.useRealTimers();
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

    /** Criterion 27 — error beats AI, and both beat the active line. The AI
     * wash now comes from the ai store, computed by `diff-lines` when the
     * assistant's edit lands (`useAiEvents`); the editor only paints it. */
    it('washes a line the assistant wrote', () => {
      useAiStore.getState().setWash('teste.yaml', [3]);
      render(<FlowEditor />);

      expect(lineOf(3)).toHaveAttribute('data-line', 'ai');
    });

    it('paints no wash that belongs to another flow', () => {
      useAiStore.getState().setWash('outro.yaml', [3]);
      render(<FlowEditor />);

      expect(lineOf(3)).not.toHaveAttribute('data-line', 'ai');
    });

    it('washes a line Maestro reported as failing', () => {
      useUiStore.setState({ errorLines: [2] });
      render(<FlowEditor />);

      expect(lineOf(2)).toHaveAttribute('data-line', 'error');
    });

    it('lets an error line win over an AI line', () => {
      useAiStore.getState().setWash('teste.yaml', [3]);
      useUiStore.setState({ errorLines: [3] });
      render(<FlowEditor />);

      expect(lineOf(3)).toHaveAttribute('data-line', 'error');
    });

    it('lets an AI line win over the active line', () => {
      useAiStore.getState().setWash('teste.yaml', [1]);
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

  /**
   * Criteria 28–34 — the wiring, not the rules: the pure `yaml-indent` module
   * owns the decision (its own suite proves it), and the editor routes the
   * edit through `document.execCommand` so the platform's undo stack carries
   * it (criterion 33). jsdom implements no `execCommand`, so it is mocked and
   * the contract is what gets asserted.
   */
  describe('real-time indentation', () => {
    beforeEach(() => {
      document.execCommand = vi.fn(() => true);
    });

    afterEach(() => {
      Reflect.deleteProperty(document, 'execCommand');
    });

    it('pads to the next multiple of 2 on Tab, through the platform edit path', () => {
      render(<FlowEditor />);
      act(() => {
        placeCaret(0);
      });

      const notPrevented = fireEvent.keyDown(editor(), { key: 'Tab' });

      expect(notPrevented).toBe(false);
      expect(document.execCommand).toHaveBeenCalledExactlyOnceWith('insertText', false, '  ');
    });

    /** Criterion 29 — Enter after `- launchApp:` opens the block at 4. */
    it('breaks with the block indent after a colon', () => {
      render(<FlowEditor />);
      const caret = FLOW_YAML.indexOf('\n    clearState');
      act(() => {
        placeCaret(caret);
      });

      const notPrevented = fireEvent.keyDown(editor(), { key: 'Enter' });

      expect(notPrevented).toBe(false);
      expect(document.execCommand).toHaveBeenCalledExactlyOnceWith('insertText', false, '\n    ');
    });

    /** Criterion 32 — Backspace inside the indent retreats through a real
     * deletion, so ⌘Z gets it back. */
    it('dedents on Backspace as a platform deletion', () => {
      render(<FlowEditor />);
      const caret = FLOW_YAML.indexOf('clearState');
      act(() => {
        placeCaret(caret);
      });

      const notPrevented = fireEvent.keyDown(editor(), { key: 'Backspace' });

      expect(notPrevented).toBe(false);
      expect(document.execCommand).toHaveBeenCalledExactlyOnceWith('delete');
      expect(editor().selectionStart).toBe(caret - 2);
    });

    it('dedents the line on Shift+Tab', () => {
      render(<FlowEditor />);
      const caret = FLOW_YAML.indexOf('clearState');
      act(() => {
        placeCaret(caret);
      });

      fireEvent.keyDown(editor(), { key: 'Tab', shiftKey: true });

      expect(document.execCommand).toHaveBeenCalledExactlyOnceWith(
        'insertText',
        false,
        '  clearState: true',
      );
    });

    /** Enter that opens no block still keeps the platform path untouched
     * where the rule says "not handled" — a plain letter, for instance. */
    it('leaves other keys to the platform', () => {
      render(<FlowEditor />);
      act(() => {
        placeCaret(0);
      });

      const notPrevented = fireEvent.keyDown(editor(), { key: 'a' });

      expect(notPrevented).toBe(true);
      expect(document.execCommand).not.toHaveBeenCalled();
    });

    /** Criterion 34 — while an IME composition is active, nothing intercepts. */
    it('intercepts nothing while composing', () => {
      render(<FlowEditor />);
      act(() => {
        placeCaret(0);
      });

      const notPrevented = fireEvent.keyDown(editor(), { key: 'Tab', isComposing: true });

      expect(notPrevented).toBe(true);
      expect(document.execCommand).not.toHaveBeenCalled();
    });
  });

  /**
   * Criteria 5–7 of the adherence spec — the editor column's empty state,
   * composed as the kit's `CEditorColumn` composes it: one glyph, one
   * caption, one action.
   */
  describe('with no flow open', () => {
    beforeEach(() => {
      useFlowStore.setState({ openPath: null, yaml: '' });
    });

    /** Criterion 5 — the kit's caption, in one sentence. */
    it('states what to do next in the kit’s words', () => {
      render(<FlowEditor />);

      expect(
        screen.getByText('No flow open. Pick one in the sidebar, or create the first one.'),
      ).toBeInTheDocument();
    });

    /**
     * Criterion 5 resolved: the glyph is 20, not the 18 the criterion floated
     * — 20 is both the kit's own value and the `md` step of the app's
     * `EmptyState`. Pinned because it is a decision, not an accident.
     */
    it('draws the file glyph at the kit’s 20', () => {
      render(<FlowEditor />);

      const glyph = screen.getByTestId('editor-empty').querySelector('svg');

      expect(glyph).toHaveAttribute('width', '20');
      expect(glyph).toHaveAttribute('height', '20');
    });

    /** Criterion 6 — an empty state is not a file: no body, no gutter, no
     * caret. */
    it('draws no editor behind it', () => {
      render(<FlowEditor />);

      expect(screen.queryByRole('textbox', { name: 'Flow YAML' })).not.toBeInTheDocument();
      expect(screen.queryByTestId('yaml-gutter-1')).not.toBeInTheDocument();
      expect(screen.queryByTestId('yaml-line-1')).not.toBeInTheDocument();
    });

    /** Criterion 7 — the same store action the sidebar's own button calls. */
    it('starts a new flow through the sidebar’s own action', async () => {
      render(<FlowEditor />);

      await userEvent.click(screen.getByRole('button', { name: 'New flow' }));

      expect(flow().draft).toMatchObject({ kind: 'flow', folder: '' });
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

      expect(
        within(screen.getByRole('tabpanel')).getByText(/tell me what the test should do/i),
      ).toBeVisible();
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

    expect(screen.getByPlaceholderText('Ask Conductor to write a test…')).toBeInTheDocument();
  });

  /**
   * Criterion 25 — the status line carries the assistant's state in product
   * language: empty while it is idle and ready, the blocking reason while it
   * is not. No cost, no token count, no budget, anywhere (§6.4 as amended).
   */
  describe('the assistant status line', () => {
    it('stays empty while the assistant is ready', () => {
      useAiStore.setState({ availability: { ready: true } });
      render(<FlowEditor />);

      expect(screen.getByTestId('panel-status')).toHaveTextContent('');
    });

    it('names the missing repository', () => {
      useAiStore.setState({
        availability: { ready: false, code: 'ai/no-repo', message: 'Connect a project.' },
      });
      render(<FlowEditor />);

      expect(screen.getByTestId('panel-status')).toHaveTextContent('No repository connected');
    });

    it('names the missing Claude Code', () => {
      useAiStore.setState({
        availability: { ready: false, code: 'ai/claude-missing', message: 'Install it.' },
      });
      render(<FlowEditor />);

      expect(screen.getByTestId('panel-status')).toHaveTextContent('Claude Code not installed');
    });

    it('keeps the run status line on the run tab', async () => {
      render(<FlowEditor />);

      await userEvent.click(screen.getByRole('tab', { name: 'Run' }));

      expect(screen.getByTestId('panel-status')).toHaveTextContent(RUN_STATUS_LINE);
    });
  });

  /** Criterion 25 — the "new conversation" affordance, wired to `ai:reset`,
   * disabled while a turn streams. */
  describe('new conversation', () => {
    it('asks main to reset when clicked', async () => {
      const aiReset = vi.fn(() => Promise.resolve({ ok: true as const, data: { turnId: null } }));
      window.conductor.aiReset = aiReset;
      render(<FlowEditor />);

      await userEvent.click(screen.getByRole('button', { name: 'New conversation' }));

      expect(aiReset).toHaveBeenCalledOnce();
    });

    it('is disabled while a turn streams', () => {
      useAiStore.setState({ activeTurnId: 'turn-1' });
      render(<FlowEditor />);

      expect(screen.getByRole('button', { name: 'New conversation' })).toBeDisabled();
    });

    it('leaves the run tab without it', async () => {
      render(<FlowEditor />);

      await userEvent.click(screen.getByRole('tab', { name: 'Run' }));

      expect(screen.queryByRole('button', { name: 'New conversation' })).not.toBeInTheDocument();
    });
  });
});

/**
 * The column's two flexible rows are the person's to size (their ask, 2026-09-04):
 * a YAML flow that runs past the fold and a conversation squeezed under it are
 * the same window, and only they know which they are reading. The divider is a
 * real separator — draggable, focusable, and arrow-driven — and what it lands
 * on outlives the window.
 */
describe('the editor split', () => {
  const handle = () => screen.getByRole('separator', { name: 'Resize the editor' });

  /** jsdom lays nothing out, so the band is stubbed: the YAML body above and
   * the lower panel below, 400px each, starting at y=100. */
  function measure(bodyHeight = 400, lowerHeight = 400, bandTop = 100): void {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const rect = (top: number, height: number) =>
        ({
          top,
          height,
          bottom: top + height,
          left: 0,
          right: 0,
          width: 800,
          x: 0,
          y: top,
        }) as DOMRect;
      if (this.dataset.testid === 'editor-body') {
        return rect(bandTop, bodyHeight);
      }
      if (this.dataset.testid === 'editor-lower') {
        return rect(bandTop + bodyHeight, lowerHeight);
      }
      return rect(0, 0);
    });
  }

  it('sizes both rows from the stored split', () => {
    useUiStore.setState({ editorSplit: 0.6 });
    render(<FlowEditor />);

    const column = screen.getByRole('region', { name: 'Editor' });
    expect(column.style.getPropertyValue('--editor-top')).toBe('0.6fr');
    expect(column.style.getPropertyValue('--editor-bottom')).toBe('0.4fr');
  });

  it('reports the split it is showing', () => {
    render(<FlowEditor />);

    expect(handle()).toHaveAttribute('aria-valuenow', String(Math.round(DEFAULT_SPLIT * 100)));
    expect(handle()).toHaveAttribute('aria-orientation', 'horizontal');
  });

  /** The boundary follows the cursor: dropped at 500 in a band running 100 to
   * 900, the YAML takes exactly half. */
  it('follows the pointer as it is dragged', () => {
    measure();
    render(<FlowEditor />);

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 420 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 500 });

    expect(ui().editorSplit).toBeCloseTo(0.5);
  });

  /** Storage is synchronous and the pointer moves at mouse rate: the drag only
   * moves the boundary, and where it is dropped is what outlives the window. */
  it('persists the split on the drop, not on every move', () => {
    measure();
    render(<FlowEditor />);

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 420 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 500 });
    expect(localStorage.getItem(EDITOR_SPLIT_KEY)).toBeNull();

    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 500 });
    expect(Number(localStorage.getItem(EDITOR_SPLIT_KEY))).toBeCloseTo(0.5);
  });

  it('ignores a pointer that never went down on it', () => {
    measure();
    render(<FlowEditor />);

    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 700 });

    expect(ui().editorSplit).toBe(DEFAULT_SPLIT);
  });

  it('stops following once the pointer is released', () => {
    measure();
    render(<FlowEditor />);

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 420 });
    fireEvent.pointerUp(handle(), { pointerId: 1, clientY: 500 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 800 });

    expect(ui().editorSplit).toBe(DEFAULT_SPLIT);
  });

  /** Criterion 9's rule for every control in this window: it is reachable
   * without a mouse. */
  it('moves on the arrow keys', async () => {
    measure();
    render(<FlowEditor />);
    handle().focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(ui().editorSplit).toBeCloseTo(DEFAULT_SPLIT + STEP_SPLIT);

    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(ui().editorSplit).toBeCloseTo(DEFAULT_SPLIT - STEP_SPLIT);
  });

  /** The separator pattern's other keys: Home and End go to either limit,
   * Enter is the keyboard's double click. */
  it('jumps to either limit on Home and End, and resets on Enter', async () => {
    measure();
    render(<FlowEditor />);
    handle().focus();

    await userEvent.keyboard('{End}');
    expect(ui().editorSplit).toBeCloseTo(1 - MIN_PANE / 800);

    await userEvent.keyboard('{Home}');
    expect(ui().editorSplit).toBeCloseTo(MIN_PANE / 800);

    await userEvent.keyboard('{Enter}');
    expect(ui().editorSplit).toBe(DEFAULT_SPLIT);
  });

  /** Neither pane can be dragged out of existence. */
  it('keeps a pane on both sides of the divider', () => {
    measure();
    render(<FlowEditor />);

    fireEvent.pointerDown(handle(), { pointerId: 1, clientY: 420 });
    fireEvent.pointerMove(handle(), { pointerId: 1, clientY: 4000 });

    expect(ui().editorSplit).toBeCloseTo(1 - MIN_PANE / 800);
  });

  it('puts the column back to its own proportions on a double click', () => {
    measure();
    useUiStore.setState({ editorSplit: 0.8 });
    render(<FlowEditor />);

    fireEvent.doubleClick(handle());

    expect(ui().editorSplit).toBe(DEFAULT_SPLIT);
  });
});

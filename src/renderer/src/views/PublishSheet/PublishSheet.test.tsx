import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { type ChangedFlow, resetUiStore, useUiStore } from '../../stores/ui.store';
import { PublishSheet } from './PublishSheet';

const ui = () => useUiStore.getState();

/** The markup `<Icon name={name}/>` draws, for proving which glyph a row shows. */
function glyphMarkup(name: IconName): string {
  const { container, unmount } = render(<Icon name={name} />);
  const markup = container.querySelector('svg')?.innerHTML ?? '';
  unmount();
  return markup;
}

/** One of each kind, so a test can exercise every row treatment at once. */
const EVERY_KIND: readonly ChangedFlow[] = [
  { id: 'f-busca', name: 'busca-produto.yaml', folder: 'compra', change: 'new' },
  { id: 'f-teste', name: 'teste.yaml', change: 'edited' },
  { id: 'f-retirada', name: 'retirada-loja.yaml', folder: 'compra', change: 'deleted' },
];

beforeEach(() => {
  localStorage.clear();
  resetUiStore();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Criteria 9–18 of aurora-rehue-toolbar-publish — §8.5's ephemeral sheet. */
describe('PublishSheet', () => {
  it('renders nothing while the sheet is closed', () => {
    render(<PublishSheet />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  /** Criterion 9 — a modal dialog, named by its title. */
  it('opens as a modal dialog over a scrim', () => {
    useUiStore.setState({ sendOpen: true });
    render(<PublishSheet />);

    const dialog = screen.getByRole('dialog', { name: 'Send 2 changes' });

    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByTestId('sheet-scrim')).toBeInTheDocument();
  });

  /** Criterion 10 — before sending, the sheet speaks about the live list. */
  describe('while there are changes to send', () => {
    it('titles itself with the count and explains where the work goes', () => {
      useUiStore.setState({ sendOpen: true });
      render(<PublishSheet />);

      expect(screen.getByRole('heading', { name: 'Send 2 changes' })).toBeInTheDocument();
      expect(
        screen.getByText(
          'Your work is already saved on this Mac. Sending puts it in front of Marina, who adds it to the shared project.',
        ),
      ).toBeInTheDocument();
    });

    it('speaks in the singular for a single change', () => {
      useUiStore.setState({
        sendOpen: true,
        changes: [{ id: 'f-teste', name: 'teste.yaml', change: 'edited' }],
      });
      render(<PublishSheet />);

      expect(screen.getByRole('heading', { name: 'Send 1 change' })).toBeInTheDocument();
    });

    it('lists the live unsent changes', () => {
      useUiStore.setState({ sendOpen: true });
      render(<PublishSheet />);

      expect(screen.getByText('teste.yaml')).toBeInTheDocument();
      expect(screen.getByText('busca-produto.yaml')).toBeInTheDocument();
    });
  });

  /** Criterion 11 — under review, the sheet speaks about the frozen batch. */
  describe('while the batch waits for review', () => {
    beforeEach(() => {
      useUiStore.setState({
        sendOpen: true,
        sendPhase: 'review',
        sentChanges: [{ id: 'f-teste', name: 'teste.yaml', change: 'edited' }],
        changes: [{ id: 'f-busca', name: 'busca-produto.yaml', folder: 'compra', change: 'new' }],
      });
    });

    it('reads as waiting, with the reviewer keeping the door open', () => {
      render(<PublishSheet />);

      expect(screen.getByRole('heading', { name: 'Waiting for review' })).toBeInTheDocument();
      expect(
        screen.getByText(
          'Marina will look at these and put them in the shared project. You can keep working — new changes join the same review.',
        ),
      ).toBeInTheDocument();
    });

    it('lists the frozen batch, not the live unsent list', () => {
      render(<PublishSheet />);

      expect(screen.getByText('teste.yaml')).toBeInTheDocument();
      expect(screen.queryByText('busca-produto.yaml')).not.toBeInTheDocument();
    });
  });

  /** Criterion 12 — each change: glyph, file name, folder path, verb. */
  it('draws every kind of change with its glyph, path and verb', () => {
    useUiStore.setState({ sendOpen: true, changes: EVERY_KIND });
    render(<PublishSheet />);

    // The glyph is the kind's own — plus for new, pencil for edited, trash-2
    // for deleted — proven against what Icon itself draws for those names.
    for (const [kind, icon] of [
      ['new', 'plus'],
      ['edited', 'pencil'],
      ['deleted', 'trash-2'],
    ] as const) {
      expect(screen.getByTestId(`change-glyph-${kind}`).innerHTML).toBe(glyphMarkup(icon));
    }
    expect(screen.getByText('Added')).toBeInTheDocument();
    expect(screen.getByText('Changed')).toBeInTheDocument();
    expect(screen.getByText('Deleted')).toBeInTheDocument();
    // Two of the seeded flows live in compra/; teste.yaml sits at the root.
    expect(screen.getAllByText('conductor/compra/')).toHaveLength(2);
  });

  /** Criterion 13 — the optional note, gone once the batch is sent. */
  describe('the note', () => {
    it('is an optional labelled field with the reference placeholder', () => {
      useUiStore.setState({ sendOpen: true });
      render(<PublishSheet />);

      const note = screen.getByRole('textbox', { name: 'What changed?' });

      expect(note).toHaveAttribute('placeholder', 'Fixed the checkout test after the button moved');
      expect(screen.getByText('Optional — it helps the reviewer.')).toBeInTheDocument();
    });

    it('is not offered while the batch waits for review', () => {
      useUiStore.setState({ sendOpen: true, sendPhase: 'review' });
      render(<PublishSheet />);

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    });

    it('is discarded when the sheet closes', async () => {
      useUiStore.setState({ sendOpen: true });
      render(<PublishSheet />);
      await userEvent.type(
        screen.getByRole('textbox', { name: 'What changed?' }),
        'moved a button',
      );

      await userEvent.click(screen.getByRole('button', { name: 'Not yet' }));
      act(() => {
        ui().openSend();
      });

      expect(screen.getByRole('textbox', { name: 'What changed?' })).toHaveValue('');
    });
  });

  /** Criterion 14 — the footer: where the work lives, and the two actions. */
  describe('the footer', () => {
    it('anchors the sheet to conductor/', () => {
      useUiStore.setState({ sendOpen: true });
      render(<PublishSheet />);

      expect(
        within(screen.getByTestId('sheet-footer')).getByText('conductor/'),
      ).toBeInTheDocument();
    });

    it('offers Not yet beside Send for review before sending', () => {
      useUiStore.setState({ sendOpen: true });
      render(<PublishSheet />);

      expect(screen.getByRole('button', { name: 'Not yet' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Send for review' })).toBeInTheDocument();
    });

    it('closes without sending on Not yet', async () => {
      useUiStore.setState({ sendOpen: true });
      render(<PublishSheet />);

      await userEvent.click(screen.getByRole('button', { name: 'Not yet' }));

      expect(ui().sendOpen).toBe(false);
      expect(ui().sendPhase).toBe('idle');
    });

    it('shows a disabled Sending button while the send is in flight', () => {
      useUiStore.setState({ sendOpen: true, sendPhase: 'sending' });
      render(<PublishSheet />);

      expect(screen.getByRole('button', { name: 'Sending' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Not yet' })).toBeDisabled();
      expect(screen.queryByRole('button', { name: 'Send for review' })).not.toBeInTheDocument();
    });

    it('offers View on GitHub beside Done once sent', () => {
      useUiStore.setState({ sendOpen: true, sendPhase: 'review' });
      render(<PublishSheet />);

      expect(screen.getByRole('button', { name: 'View on GitHub' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
    });

    it('closes on Done', async () => {
      useUiStore.setState({ sendOpen: true, sendPhase: 'review' });
      render(<PublishSheet />);

      await userEvent.click(screen.getByRole('button', { name: 'Done' }));

      expect(ui().sendOpen).toBe(false);
      expect(ui().sendPhase).toBe('review');
    });
  });

  /**
   * Criterion 15 — the send transition, watched from the sheet. `fireEvent`
   * rather than `userEvent`, because the clock is faked and user-event's own
   * waits would sit on it; what this test proves is the transition, not the
   * click.
   */
  it('walks send → sending → review in front of the person', () => {
    vi.useFakeTimers();
    useUiStore.setState({ sendOpen: true });
    render(<PublishSheet />);

    fireEvent.click(screen.getByRole('button', { name: 'Send for review' }));
    expect(ui().sendPhase).toBe('sending');
    expect(screen.getByRole('button', { name: 'Sending' })).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByRole('heading', { name: 'Waiting for review' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Done' })).toBeInTheDocument();
  });

  /**
   * Criterion 16 — mid-send the sheet locks: no note, no close, no backdrop.
   * (Escape is the window's key and is proven in useWindowShortcuts.test.ts.)
   */
  describe('while sending', () => {
    beforeEach(() => {
      useUiStore.setState({ sendOpen: true, sendPhase: 'sending' });
    });

    it('disables the note field', () => {
      render(<PublishSheet />);

      expect(screen.getByRole('textbox', { name: 'What changed?' })).toBeDisabled();
    });

    it('hides the close button', () => {
      render(<PublishSheet />);

      expect(screen.queryByRole('button', { name: 'Close' })).not.toBeInTheDocument();
    });

    it('ignores backdrop clicks', () => {
      render(<PublishSheet />);

      fireEvent.click(screen.getByTestId('sheet-scrim'));

      expect(ui().sendOpen).toBe(true);
    });
  });

  /** Criterion 17 — the backdrop closes the sheet and touches nothing else. */
  it.each(['idle', 'review'] as const)(
    'closes on a backdrop click without changing the %s phase',
    (phase) => {
      useUiStore.setState({ sendOpen: true, sendPhase: phase });
      render(<PublishSheet />);

      fireEvent.click(screen.getByTestId('sheet-scrim'));

      expect(ui().sendOpen).toBe(false);
      expect(ui().sendPhase).toBe(phase);
    },
  );

  it('does not close when the dialog itself is clicked', async () => {
    useUiStore.setState({ sendOpen: true });
    render(<PublishSheet />);

    await userEvent.click(screen.getByRole('heading', { name: 'Send 2 changes' }));

    expect(ui().sendOpen).toBe(true);
  });

  /** Criterion 18 — every control answers to its name. */
  it('names the close button for the screen reader', () => {
    useUiStore.setState({ sendOpen: true });
    render(<PublishSheet />);

    expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});

import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { FLOWS } from '../../fixtures/flows';
import { resetUiStore, useUiStore } from '../../stores/ui.store';
import { FlowList } from './FlowList';

const ui = () => useUiStore.getState();

const rows = () => screen.getAllByRole('listitem');
const rowNames = () => rows().map((row) => within(row).getByRole('button').textContent);

beforeEach(() => {
  resetUiStore();
});

/** Criteria 14–21. */
describe('FlowList', () => {
  it('is a region a screen reader can find by name', () => {
    render(<FlowList />);

    expect(screen.getByRole('region', { name: 'Flows' })).toBeInTheDocument();
  });

  it('heads the panel with the folder and how much of it is failing', () => {
    render(<FlowList />);

    expect(screen.getByText('Flows')).toBeInTheDocument();
    // Two of the seven fixture flows last came back failing. The count the
    // header carries is the folder Conductor writes to, not the flow total:
    // once the tree has subfolders, a total says nothing about what is on
    // screen, and `conductor/` says where every one of these files lives.
    expect(screen.getByText('conductor/ · 2 failing')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New flow' })).toBeInTheDocument();
  });

  it('renders every flow in the suite', () => {
    render(<FlowList />);

    expect(rows()).toHaveLength(FLOWS.length);
  });

  it('renders a row as a name over its step count and duration', () => {
    render(<FlowList />);

    const row = screen.getByRole('button', { name: /pedidos-pendentes\.yaml/ });

    expect(row).toHaveTextContent('pedidos-pendentes.yaml');
    expect(row).toHaveTextContent('11 steps · 0:38');
  });

  it('says so when a flow has never run', () => {
    render(<FlowList />);

    expect(screen.getByRole('button', { name: /busca-produto\.yaml/ })).toHaveTextContent(
      '5 steps · never run',
    );
  });

  it('colours each row dot by its last result', () => {
    render(<FlowList />);

    const dotOf = (name: string) =>
      within(screen.getByRole('button', { name: new RegExp(name) }))
        .getByTestId('flow-dot')
        .getAttribute('data-state');

    expect(dotOf('teste')).toBe('fail');
    expect(dotOf('login')).toBe('pass');
    expect(dotOf('busca-produto')).toBe('never');
  });

  // Criterion 17: an AppKit selection, never a tint.
  it('marks exactly the active document as the selected row', () => {
    render(<FlowList />);

    const selected = rows().filter((row) => row.getAttribute('data-selected') === 'true');

    expect(selected).toHaveLength(1);
    expect(selected[0]).toHaveTextContent('teste.yaml');
  });

  /** Criterion 24 — the row replaces the open document rather than adding one. */
  it('opens a flow when its row is activated', async () => {
    render(<FlowList />);

    await userEvent.click(screen.getByRole('button', { name: /checkout\.yaml/ }));

    expect(ui().document).toEqual({ id: 'f-checkout', label: 'checkout.yaml' });
    expect(rows().filter((row) => row.getAttribute('data-selected') === 'true')).toHaveLength(1);
    expect(
      rows().filter((row) => row.getAttribute('data-selected') === 'true')[0],
    ).toHaveTextContent('checkout.yaml');
  });

  /** Criterion 25 — the sidebar is the only place a document is started. */
  it('opens a new empty document when the new-flow button is activated', async () => {
    render(<FlowList />);

    await userEvent.click(screen.getByRole('button', { name: 'New flow' }));

    expect(ui().document).toEqual({ id: 'f-new-1', label: 'novo-1.yaml' });
  });

  // A brand-new document is not in the suite, so no row can claim it.
  it('selects no row while a new document is open', async () => {
    render(<FlowList />);

    await userEvent.click(screen.getByRole('button', { name: 'New flow' }));

    expect(rows().filter((row) => row.getAttribute('data-selected') === 'true')).toEqual([]);
  });

  /** Criterion 18. */
  it('shows the sparkles glyph on an AI-authored row that is at rest', () => {
    render(<FlowList />);

    const row = screen.getByRole('button', { name: /retirada-loja\.yaml/ }).closest('li');

    expect(within(row as HTMLElement).getByTestId('ai-authored')).toBeInTheDocument();
    expect(
      within(row as HTMLElement).queryByRole('button', { name: 'Flow actions' }),
    ).not.toBeInTheDocument();
  });

  it('shows nothing on a hand-written row that is at rest', () => {
    render(<FlowList />);

    const row = screen.getByRole('button', { name: /login\.yaml/ }).closest('li');

    expect(within(row as HTMLElement).queryByTestId('ai-authored')).not.toBeInTheDocument();
    expect(
      within(row as HTMLElement).queryByRole('button', { name: 'Flow actions' }),
    ).not.toBeInTheDocument();
  });

  it('reveals the overflow button on hover, in place of the sparkles', async () => {
    render(<FlowList />);
    const row = screen
      .getByRole('button', { name: /retirada-loja\.yaml/ })
      .closest('li') as HTMLElement;

    await userEvent.hover(row);

    expect(within(row).getByRole('button', { name: 'Flow actions' })).toBeInTheDocument();
    expect(within(row).queryByTestId('ai-authored')).not.toBeInTheDocument();
  });

  it('hides the overflow button again once the pointer leaves', async () => {
    render(<FlowList />);
    const row = screen.getByRole('button', { name: /login\.yaml/ }).closest('li') as HTMLElement;

    await userEvent.hover(row);
    await userEvent.unhover(row);

    expect(within(row).queryByRole('button', { name: 'Flow actions' })).not.toBeInTheDocument();
  });

  // The selected row keeps its actions: it is the row people act on most.
  it('keeps the overflow button on the selected row', () => {
    render(<FlowList />);
    const row = screen.getByRole('button', { name: /teste\.yaml/ }).closest('li') as HTMLElement;

    expect(within(row).getByRole('button', { name: 'Flow actions' })).toBeInTheDocument();
  });

  // Criterion 54: a keyboard user has to be able to reach the same actions.
  it('reveals the overflow button when the row takes focus', async () => {
    render(<FlowList />);
    const row = screen.getByRole('button', { name: /login\.yaml/ }).closest('li') as HTMLElement;

    await userEvent.click(within(row).getByRole('button', { name: /login\.yaml/ }));

    expect(within(row).getByRole('button', { name: 'Flow actions' })).toBeInTheDocument();
  });

  /** Criteria 19–20. */
  describe('search', () => {
    it('filters rows by a case-insensitive substring of the file name', async () => {
      render(<FlowList />);

      await userEvent.type(screen.getByRole('searchbox', { name: 'Search flows' }), 'CHECK');

      expect(rowNames()).toEqual([expect.stringContaining('checkout.yaml')]);
    });

    it('matches anywhere in the name, not just at the start', async () => {
      render(<FlowList />);

      await userEvent.type(screen.getByRole('searchbox', { name: 'Search flows' }), 'produto');

      expect(rowNames()).toEqual([expect.stringContaining('busca-produto.yaml')]);
    });

    it('says so when nothing matches', async () => {
      render(<FlowList />);

      await userEvent.type(screen.getByRole('searchbox', { name: 'Search flows' }), 'zzz');

      expect(screen.getByText('Nothing matches “zzz”.')).toBeInTheDocument();
      expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    });

    it('shows every flow again once the query is cleared', async () => {
      render(<FlowList />);
      await userEvent.type(screen.getByRole('searchbox', { name: 'Search flows' }), 'zzz');

      act(() => {
        ui().clearQuery();
      });

      expect(rows()).toHaveLength(FLOWS.length);
    });
  });

  it('offers the persistent actions on a bottom bar', () => {
    render(<FlowList />);

    expect(screen.getByRole('button', { name: 'Run whole suite' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });
});

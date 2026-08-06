import { hashText } from '@shared/hash';
import type { FlowMeta } from '@shared/types';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDeviceStore, useDeviceStore } from '../../stores/device.store';
import { resetFlowStore, useFlowStore } from '../../stores/flow.store';
import { resetRunStore } from '../../stores/run.store';
import { resetUiStore, useUiStore } from '../../stores/ui.store';
import { FlowList } from './FlowList';

/**
 * The sidebar as the mock draws it (criteria 11–27, 35–37): the folder tree,
 * inline drafts, context menus, the confirmation dialog, search flattening,
 * and the empty and error states. The stores are real; `window.conductor` is
 * the only seam.
 */

const FLOW = 'appId: com.test.app\n---\n- launchApp:\n    clearState: true\n';

function meta(path: string, commandCount = 2): FlowMeta {
  const slash = path.lastIndexOf('/');
  return {
    path,
    name: slash === -1 ? path : path.slice(slash + 1),
    folder: slash === -1 ? '' : path.slice(0, slash),
    commandCount,
    hash: hashText(FLOW),
  };
}

function seedIndex(paths: readonly string[], folders: readonly string[] = []): void {
  useFlowStore.setState({
    index: { flows: paths.map((path) => meta(path)), folders: [...folders] },
    indexError: null,
  });
}

const flow = () => useFlowStore.getState();

beforeEach(() => {
  resetUiStore();
  resetFlowStore();
  resetRunStore();
  resetDeviceStore();
});

describe('the header', () => {
  /** Criterion 37 — a truthful subtitle: the workspace and its count. */
  it('counts the flows instead of inventing failures', () => {
    seedIndex(['a.yaml', 'checkout/pix.yml']);
    render(<FlowList />);

    expect(screen.getByText('conductor/ · 2 flows')).toBeInTheDocument();
  });

  it('speaks singular for one flow', () => {
    seedIndex(['a.yaml']);
    render(<FlowList />);

    expect(screen.getByText('conductor/ · 1 flow')).toBeInTheDocument();
  });

  /** Criterion 16 — the header "+" offers both creations, with shortcuts. */
  it('opens the new-flow-or-folder menu from the plus', async () => {
    seedIndex([]);
    render(<FlowList />);

    await userEvent.click(screen.getByRole('button', { name: 'New flow or folder' }));

    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /New flow/ })).toHaveTextContent('⌘N');
    expect(within(menu).getByRole('menuitem', { name: /New folder/ })).toHaveTextContent('⇧⌘N');

    await userEvent.click(within(menu).getByRole('menuitem', { name: /New flow/ }));
    expect(flow().draft).toMatchObject({ kind: 'flow', folder: '', renaming: null });
  });
});

describe('the tree', () => {
  /** Criterion 11 — folder rows first, then root files; files inside a
   * folder render one level deeper; nested directories are compact rows. */
  it('renders folders with counts, then loose flows', () => {
    seedIndex(
      ['login.yaml', 'checkout/pix.yml', 'checkout/card.yml', 'a/b/deep.yaml'],
      ['checkout', 'a', 'a/b'],
    );
    render(<FlowList />);

    const rows = screen.getAllByRole('listitem');
    const labels = rows.map((row) => within(row).getAllByRole('button')[0]?.textContent);
    expect(labels[0]).toBe('a');
    // `a` holds only a subdirectory, so its own affordance follows it.
    expect(labels[1]).toBe('Empty — add a flow');
    expect(labels[2]).toBe('a/b');
    expect(labels[3]).toContain('deep.yaml');
    expect(labels[4]).toBe('checkout');
    expect(labels[5]).toContain('card.yml');
    expect(labels[6]).toContain('pix.yml');
    expect(labels[7]).toContain('login.yaml');

    expect(screen.getByRole('button', { name: /pix\.yml/ }).closest('li')).toHaveAttribute(
      'data-depth',
      '1',
    );
    expect(screen.getByRole('button', { name: /login\.yaml/ }).closest('li')).toHaveAttribute(
      'data-depth',
      '0',
    );
  });

  it('shows each folder’s flow count', () => {
    seedIndex(['checkout/pix.yml', 'checkout/card.yml'], ['checkout']);
    render(<FlowList />);

    expect(screen.getByText('2', { selector: '[data-testid="folder-count"]' })).toBeInTheDocument();
  });

  /** Criterion 12 — the chevron collapses and expands, per session. */
  it('collapses and expands a folder', async () => {
    seedIndex(['checkout/pix.yml'], ['checkout']);
    render(<FlowList />);

    expect(screen.getByRole('button', { name: /pix\.yml/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^checkout/ }));
    expect(screen.queryByRole('button', { name: /pix\.yml/ })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /^checkout/ }));
    expect(screen.getByRole('button', { name: /pix\.yml/ })).toBeInTheDocument();
  });

  /** Criterion 13 — an empty folder stays visible with its affordance. */
  it('offers "Empty — add a flow" inside an empty folder', async () => {
    seedIndex([], ['drafts']);
    render(<FlowList />);

    await userEvent.click(screen.getByRole('button', { name: 'Empty — add a flow' }));

    expect(flow().draft).toMatchObject({ kind: 'flow', folder: 'drafts' });
  });

  /** Criterion 15 — the open flow's row is the selected one, by path. */
  it('selects the open flow and opens another on click', async () => {
    seedIndex(['a.yaml', 'b.yaml']);
    useFlowStore.setState({ openPath: 'a.yaml' });
    const read = vi.fn(() => Promise.resolve({ ok: true as const, data: { yaml: FLOW } }));
    window.conductor.flowRead = read;
    render(<FlowList />);

    expect(screen.getByRole('button', { name: /a\.yaml/ }).closest('li')).toHaveAttribute(
      'data-selected',
      'true',
    );

    await userEvent.click(screen.getByRole('button', { name: /b\.yaml/ }));
    expect(read).toHaveBeenCalledWith('b.yaml');
  });

  /** Criterion 37 — every dot is `never` until run history persists. */
  it('renders run dots as never', () => {
    seedIndex(['a.yaml']);
    render(<FlowList />);

    expect(screen.getByTestId('flow-dot')).toHaveAttribute('data-state', 'never');
  });
});

describe('search', () => {
  /** Criterion 14 — the tree flattens to matches; folder rows disappear. */
  it('flattens matches while the query is live', () => {
    seedIndex(['login.yaml', 'checkout/pix.yml'], ['checkout']);
    useUiStore.setState({ query: 'checkout' });
    render(<FlowList />);

    expect(screen.getByRole('button', { name: /pix\.yml/ }).closest('li')).toHaveAttribute(
      'data-depth',
      '0',
    );
    expect(screen.queryByTestId('folder-count')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /login\.yaml/ })).not.toBeInTheDocument();
  });

  it('says when nothing matches', () => {
    seedIndex(['login.yaml']);
    useUiStore.setState({ query: 'zzz' });
    render(<FlowList />);

    expect(screen.getByText('Nothing matches “zzz”.')).toBeInTheDocument();
  });
});

describe('the draft row', () => {
  /** Criteria 16–17 — one editable row in place; Enter commits. */
  it('commits a typed name on Enter', async () => {
    seedIndex([]);
    const create = vi.fn(() => Promise.resolve({ ok: true as const, data: { path: 'pix.yaml' } }));
    window.conductor.flowCreate = create;
    window.conductor.flowRead = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { yaml: FLOW } }),
    );
    render(<FlowList />);
    act(() => {
      flow().startDraft('flow', '');
    });

    await userEvent.keyboard('pix{Enter}');

    expect(create).toHaveBeenCalledExactlyOnceWith('', 'pix');
  });

  it('cancels on Escape', async () => {
    seedIndex([]);
    render(<FlowList />);
    act(() => {
      flow().startDraft('flow', '');
    });

    await userEvent.keyboard('{Escape}');

    expect(flow().draft).toBeNull();
  });

  /** Criterion 17 — the inline error sits under the field, editing goes on. */
  it('shows the collision message under the field', () => {
    seedIndex([]);
    render(<FlowList />);
    act(() => {
      useFlowStore.setState({
        draft: {
          kind: 'flow',
          folder: '',
          renaming: null,
          value: 'pix',
          error: '“pix.yaml” already exists in this folder.',
        },
      });
    });

    expect(screen.getByText('“pix.yaml” already exists in this folder.')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Flow name' })).toBeInTheDocument();
  });

  /** Criterion 21 — renaming swaps the row for the draft, prefilled. */
  it('prefills a rename with the current name', () => {
    seedIndex(['checkout/pix.yml'], ['checkout']);
    render(<FlowList />);
    act(() => {
      flow().startRename('flow', 'checkout/pix.yml');
    });

    expect(screen.getByRole('textbox', { name: 'Flow name' })).toHaveValue('pix.yml');
    expect(screen.queryByRole('button', { name: /pix\.yml/ })).not.toBeInTheDocument();
  });
});

describe('the context menus', () => {
  /** Criterion 25 — the flow row's menu, exactly, with Run now gated. */
  it('offers the flow commands, Run now disabled with no device', async () => {
    seedIndex(['pix.yaml']);
    render(<FlowList />);

    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /pix\.yaml/ }),
    });

    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Open in editor',
      'Rename…',
      'Duplicate',
      'New flow here',
      'Run now',
      'Delete flow',
    ]);
    expect(within(menu).getByRole('menuitem', { name: 'Run now' })).toBeDisabled();
  });

  /** Criterion 25 — Run now reads the saved file and starts the run. */
  it('runs the saved flow through run:start', async () => {
    seedIndex(['pix.yaml']);
    useDeviceStore.setState({ pickedId: 'device-1' });
    window.conductor.flowRead = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { yaml: FLOW } }),
    );
    const runStart = vi.fn(() => Promise.resolve({ ok: true as const, data: { runId: 'run-1' } }));
    window.conductor.runStart = runStart;
    render(<FlowList />);

    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /pix\.yaml/ }),
    });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Run now' }));

    await vi.waitFor(() => {
      expect(runStart).toHaveBeenCalledExactlyOnceWith('device-1', FLOW);
    });
    expect(useUiStore.getState().lowerPanel).toBe('run');
  });

  /** Criterion 26 — the folder row's menu. */
  it('offers the folder commands under the folder title', async () => {
    seedIndex(['checkout/pix.yml'], ['checkout']);
    render(<FlowList />);

    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /^checkout/ }),
    });

    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('checkout/')).toBeInTheDocument();
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['New flow here', 'Rename folder…', 'Delete folder']);
  });

  it('starts the draft in the clicked row’s folder', async () => {
    seedIndex(['checkout/pix.yml'], ['checkout']);
    render(<FlowList />);

    await userEvent.pointer({
      keys: '[MouseRight]',
      target: screen.getByRole('button', { name: /pix\.yml/ }),
    });
    await userEvent.click(screen.getByRole('menuitem', { name: 'New flow here' }));

    expect(flow().draft).toMatchObject({ kind: 'flow', folder: 'checkout' });
  });
});

describe('the delete confirmation', () => {
  /** Criterion 23 — names the target as conductor/<path>, destructive verb. */
  it('confirms a flow delete and performs it', async () => {
    seedIndex(['checkout/pix.yml'], ['checkout']);
    const remove = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { path: 'checkout/pix.yml' } }),
    );
    window.conductor.flowDelete = remove;
    render(<FlowList />);
    act(() => {
      flow().askDelete('flow', 'checkout/pix.yml');
    });

    expect(screen.getByText('Delete “pix.yml”?')).toBeInTheDocument();
    expect(
      screen.getByText('The flow is removed from conductor/. This cannot be undone here.'),
    ).toBeInTheDocument();
    expect(screen.getByText('conductor/checkout/pix.yml')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /Delete flow/ }));
    expect(remove).toHaveBeenCalledExactlyOnceWith('checkout/pix.yml');
  });

  /** Criterion 23 — a folder says how many flows go with it, listing up to
   * four and folding the rest into "+N more". */
  it('lists what goes with a folder, up to four', () => {
    seedIndex(
      [
        'checkout/a.yml',
        'checkout/b.yml',
        'checkout/c.yml',
        'checkout/d.yml',
        'checkout/e.yml',
        'checkout/nested/f.yml',
      ],
      ['checkout', 'checkout/nested'],
    );
    render(<FlowList />);
    act(() => {
      flow().askDelete('folder', 'checkout');
    });

    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Delete “checkout”?')).toBeInTheDocument();
    expect(
      dialog.getByText(
        'The folder and the 6 flows in it are removed from conductor/. This cannot be undone here.',
      ),
    ).toBeInTheDocument();
    expect(dialog.getByText('conductor/checkout/')).toBeInTheDocument();
    expect(dialog.getByText('a.yml')).toBeInTheDocument();
    expect(dialog.getByText('d.yml')).toBeInTheDocument();
    expect(dialog.queryByText('e.yml')).not.toBeInTheDocument();
    expect(dialog.getByText('+2 more')).toBeInTheDocument();
  });

  it('cancels without deleting', async () => {
    seedIndex(['a.yaml']);
    const remove = vi.fn();
    window.conductor.flowDelete = remove;
    render(<FlowList />);
    act(() => {
      flow().askDelete('flow', 'a.yaml');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(remove).not.toHaveBeenCalled();
    expect(flow().confirm).toBeNull();
  });
});

describe('the empty and error states', () => {
  /** Criterion 35 — a first run has no flows and says what to do next. */
  it('shows the empty state with a New flow action', async () => {
    seedIndex([]);
    render(<FlowList />);

    expect(screen.getByText('No flows yet')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'New flow' }));
    expect(flow().draft).toMatchObject({ kind: 'flow', folder: '' });
  });

  /** Criterion 36 — never a silent empty tree: the message and a retry. */
  it('shows the workspace error with a retry', async () => {
    useFlowStore.setState({
      indexError: {
        code: 'flow/workspace-unavailable',
        message: 'The flows folder could not be opened.',
      },
    });
    const list = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { flows: [], folders: [] } }),
    );
    window.conductor.flowList = list;
    render(<FlowList />);

    expect(screen.getByText('The flows folder could not be opened.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(list).toHaveBeenCalledTimes(1);
  });
});

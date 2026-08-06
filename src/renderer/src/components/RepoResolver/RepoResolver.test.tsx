import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { RepoResolver, type RepoResolverProps } from './RepoResolver';

/**
 * The shared resolver body, driven purely by props — the connect window and
 * the add sheet mount this same component, so what is proven here holds on
 * both surfaces.
 */

const RESOLVED = {
  url: 'https://github.com/loja-verde/pnp-fast-mode',
  org: 'loja-verde',
  name: 'pnp-fast-mode',
  appName: 'PnP Fast Mode',
  appId: { android: 'com.lojaverde.pnp', ios: 'com.lojaverde.pnp' },
  branch: 'develop',
  flowCount: 4,
};

function resolver(overrides: Partial<RepoResolverProps> = {}): RepoResolverProps {
  return {
    url: '',
    phase: 'idle',
    step: 0,
    found: null,
    error: null,
    onUrlChange: vi.fn(),
    onSubmit: vi.fn(),
    onPaste: vi.fn(),
    onCopyCommand: vi.fn(),
    ...overrides,
  };
}

describe('the field', () => {
  it('takes the address and submits on Enter', async () => {
    const props = resolver({ url: 'github.com/o/a' });
    render(<RepoResolver {...props} />);

    await userEvent.type(screen.getByPlaceholderText('github.com/org/app'), 'x');
    expect(props.onUrlChange).toHaveBeenCalledWith('github.com/o/ax');

    await userEvent.type(screen.getByRole('textbox', { name: 'Repository address' }), '{Enter}');
    expect(props.onSubmit).toHaveBeenCalled();
  });

  /** The empty field offers Paste; a filled one offers Clear (CRepo.jsx). */
  it('offers Paste while empty and Clear once filled', async () => {
    const empty = resolver();
    const { rerender } = render(<RepoResolver {...empty} />);

    await userEvent.click(screen.getByRole('button', { name: 'Paste' }));
    expect(empty.onPaste).toHaveBeenCalled();

    const filled = resolver({ url: 'github.com/o/a' });
    rerender(<RepoResolver {...filled} />);
    expect(screen.queryByRole('button', { name: 'Paste' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(filled.onUrlChange).toHaveBeenCalledWith('');
  });

  it('disables Connect on an empty address and while resolving', () => {
    const { rerender } = render(<RepoResolver {...resolver()} />);
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();

    rerender(<RepoResolver {...resolver({ url: 'github.com/o/a' })} />);
    expect(screen.getByRole('button', { name: 'Connect' })).toBeEnabled();

    rerender(<RepoResolver {...resolver({ url: 'github.com/o/a', phase: 'resolving' })} />);
    expect(screen.getByRole('button', { name: 'Connect' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Repository address' })).toBeDisabled();
  });

  it('focuses the field when asked to', () => {
    render(<RepoResolver {...resolver({ autoFocus: true })} />);

    expect(screen.getByRole('textbox', { name: 'Repository address' })).toHaveFocus();
  });
});

describe('the steps', () => {
  /** The kit's three stages, verbatim — real work, not choreography. */
  it('names the three real stages while resolving', () => {
    render(<RepoResolver {...resolver({ url: 'x', phase: 'resolving', step: 1 })} />);

    expect(screen.getByText('Reading the repository')).toBeInTheDocument();
    expect(screen.getByText('Finding the app module')).toBeInTheDocument();
    expect(screen.getByText('Looking for conductor/')).toBeInTheDocument();
  });

  /** `step` counts completed stages: behind it done, at it live, past it
   * waiting — the visible half of the real-stages criterion. */
  it('marks done, active and pending from the completed count', () => {
    render(<RepoResolver {...resolver({ url: 'x', phase: 'resolving', step: 1 })} />);

    expect(screen.getByText('Reading the repository')).toHaveAttribute('data-state', 'done');
    expect(screen.getByText('Finding the app module')).toHaveAttribute('data-state', 'active');
    expect(screen.getByText('Looking for conductor/')).toHaveAttribute('data-state', 'pending');
  });
});

describe('the found card', () => {
  it('shows org/name, app, bundle, branch and the flow count', () => {
    render(<RepoResolver {...resolver({ url: 'x', phase: 'found', found: RESOLVED })} />);

    expect(screen.getByText('loja-verde/pnp-fast-mode')).toBeInTheDocument();
    expect(screen.getByText('PnP Fast Mode')).toBeInTheDocument();
    expect(screen.getByText('com.lojaverde.pnp')).toBeInTheDocument();
    expect(screen.getByText('develop')).toBeInTheDocument();
    expect(screen.getByText('4 flows')).toBeInTheDocument();
  });

  /** Zero flows is a normal state with the kit's own note, never an error. */
  it('shows the empty state with the first-flow note', () => {
    render(
      <RepoResolver
        {...resolver({ url: 'x', phase: 'found', found: { ...RESOLVED, flowCount: 0 } })}
      />,
    );

    expect(screen.getByText('empty for now')).toBeInTheDocument();
    expect(
      screen.getByText('Conductor creates conductor/ with your first flow.'),
    ).toBeInTheDocument();
  });
});

describe('the error surface', () => {
  const ERROR = {
    title: 'Conductor cannot read this repository',
    body: 'gh could not reach loja-verde/pnp-fast-mode. Sign in with an account that has access, then try again.',
    command: 'gh auth login',
  };

  it('shows the title, the body and the command well', () => {
    render(<RepoResolver {...resolver({ url: 'x', phase: 'error', error: ERROR })} />);

    expect(screen.getByRole('alert')).toHaveTextContent(ERROR.title);
    expect(screen.getByRole('alert')).toHaveTextContent(ERROR.body);
    expect(screen.getByText('gh auth login')).toBeInTheDocument();
  });

  it('copies the command through the callback', async () => {
    const props = resolver({ url: 'x', phase: 'error', error: ERROR });
    render(<RepoResolver {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Copy command' }));

    expect(props.onCopyCommand).toHaveBeenCalledExactlyOnceWith('gh auth login');
  });

  /** "Try again" re-runs the same resolution (the kit wires it to submit). */
  it('retries through onSubmit', async () => {
    const props = resolver({ url: 'x', phase: 'error', error: ERROR });
    render(<RepoResolver {...props} />);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(props.onSubmit).toHaveBeenCalled();
  });

  /** No command, no retry: running nothing changes nothing (kit gating). */
  it('offers no retry and no well without a command', () => {
    render(
      <RepoResolver
        {...resolver({
          url: 'x',
          phase: 'error',
          error: { title: 'That is not a repository address', body: 'Paste…', command: null },
        })}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Copy command' })).not.toBeInTheDocument();
  });
});

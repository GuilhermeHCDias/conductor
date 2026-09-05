import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SignInCard } from './SignInCard';

/**
 * The GitHub sign-in card (managed-tools criteria 40, 43): props in,
 * callbacks out, one moment at a time — the offer, the code, the account,
 * the failure. It knows no store.
 */

function handlers() {
  return { onSignIn: vi.fn(), onOpen: vi.fn(), onCancel: vi.fn() };
}

describe('SignInCard', () => {
  it('offers Sign in with GitHub, and never a way to skip it', async () => {
    const h = handlers();
    render(<SignInCard failedMessage={null} running={null} signedInAs={null} {...h} />);

    expect(screen.getByRole('heading', { name: 'Sign in to GitHub' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Skip for now' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Sign in with GitHub' }));

    expect(h.onSignIn).toHaveBeenCalledOnce();
  });

  it('shows the code with Copy, the URL line, Open GitHub and Cancel', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });
    const h = handlers();
    render(
      <SignInCard failedMessage={null} running={{ code: '1234-ABCD' }} signedInAs={null} {...h} />,
    );

    expect(screen.getByTestId('login-code')).toHaveTextContent('1234-ABCD');
    expect(screen.getByText(/Enter it at github.com\/login\/device/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copy code' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open GitHub' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(writeText).toHaveBeenCalledExactlyOnceWith('1234-ABCD');
    expect(h.onOpen).toHaveBeenCalledOnce();
    expect(h.onCancel).toHaveBeenCalledOnce();
  });

  it('waits for the code with Cancel alone, then reads Signed in as the account', () => {
    const h = handlers();
    const { unmount } = render(
      <SignInCard failedMessage={null} running={{ code: null }} signedInAs={null} {...h} />,
    );
    expect(screen.queryByTestId('login-code')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    unmount();

    render(<SignInCard failedMessage={null} running={null} signedInAs="octocat" {...h} />);
    expect(screen.getByText('Signed in as octocat')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the failure sentence and Try again', async () => {
    const h = handlers();
    render(
      <SignInCard
        failedMessage="GitHub sign-in didn't finish."
        running={null}
        signedInAs={null}
        {...h}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent("GitHub sign-in didn't finish.");
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(h.onSignIn).toHaveBeenCalledOnce();
  });
});

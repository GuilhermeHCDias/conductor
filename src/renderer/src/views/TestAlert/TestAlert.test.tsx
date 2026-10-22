import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TestAlert } from './TestAlert';

/** The alert's stylesheet as text, for the rules jsdom cannot render. */
const cssSource = (): string =>
  readFileSync(resolve('src/renderer/src/views/TestAlert/TestAlert.module.css'), 'utf8');

/** Criteria 2–5 of the Teste probe. */
describe('TestAlert', () => {
  /** C2 — the alert reads TESTEI. */
  it('shows TESTEI', () => {
    render(<TestAlert onDismiss={() => {}} />);

    expect(screen.getByText('TESTEI')).toBeInTheDocument();
  });

  /** C5 — an alertdialog with an accessible name. */
  it('is an alertdialog with an accessible name', () => {
    render(<TestAlert onDismiss={() => {}} />);

    const dialog = screen.getByRole('alertdialog', { name: 'TESTEI' });

    expect(dialog).toBeInTheDocument();
  });

  /** C5 — focus moves to the dismiss control when the alert opens. */
  it('moves focus to its dismiss control on open', () => {
    render(<TestAlert onDismiss={() => {}} />);

    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
  });

  /** C3 — the scrim covers the window and blocks clicks behind it. */
  it('renders a scrim that dismisses on click', async () => {
    const onDismiss = vi.fn();
    render(<TestAlert onDismiss={onDismiss} />);

    await userEvent.click(screen.getByTestId('test-alert-scrim'));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  /**
   * C5 — the focus moves to the dismiss control, so its ring must show. The
   * ring cannot be rendered in jsdom, so this pins the rule: it is `:focus`,
   * not `:focus-visible`, which a programmatic focus after a mouse click skips.
   */
  it('draws a focus ring on the dismiss control whenever it has focus', () => {
    const styles = cssSource();
    expect(styles).toMatch(/\.dismiss:focus\s*\{[^}]*box-shadow:\s*var\(--glow-accent\)/);
  });

  /** C4 — the close control dismisses. */
  it('dismisses from its close control', async () => {
    const onDismiss = vi.fn();
    render(<TestAlert onDismiss={onDismiss} />);

    await userEvent.click(screen.getByRole('button', { name: 'Fechar' }));

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  /** C4 — Escape dismisses. */
  it('dismisses on Escape', async () => {
    const onDismiss = vi.fn();
    render(<TestAlert onDismiss={onDismiss} />);

    await userEvent.keyboard('{Escape}');

    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  /** The Escape that closes the alert must not reach the window's shortcuts, which would clear the flow search. */
  it('keeps Escape from reaching the window listeners', async () => {
    const onWindowKey = vi.fn();
    window.addEventListener('keydown', onWindowKey);
    render(<TestAlert onDismiss={() => {}} />);

    await userEvent.keyboard('{Escape}');

    window.removeEventListener('keydown', onWindowKey);
    expect(onWindowKey).not.toHaveBeenCalled();
  });

  /** C5 — the alert is modal, so Tab keeps focus on its dismiss control. */
  it('keeps Tab focus inside the alert', async () => {
    render(<TestAlert onDismiss={() => {}} />);

    await userEvent.tab();

    expect(screen.getByRole('button', { name: 'Fechar' })).toHaveFocus();
  });
});

import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { type RunStep, resetRunStore, useRunStore } from '../../stores/run.store';
import { RunPanel } from './RunPanel';

/**
 * Run criteria 19–23: the live step list, the streaming log, the outcome —
 * and the empty state only while no run has ever happened. Everything renders
 * from `run.store`; the ui.store fixtures stopped feeding this panel.
 */

const STEPS: readonly RunStep[] = [
  {
    id: 'run-1-step-1',
    label: 'Launch app "com.android.settings"',
    status: 'pass',
    duration: '0:02',
  },
  { id: 'run-1-step-2', label: 'Tap on "Entrar"', status: 'fail', duration: '0:11' },
  { id: 'run-1-step-3', label: 'Assert that "Pedidos" is visible', status: 'running' },
];

beforeEach(() => {
  resetRunStore();
});

describe('the empty state', () => {
  /** Criterion 23 — untouched while no run has happened. */
  it('renders while nothing has ever run', () => {
    const { container } = render(<RunPanel />);

    expect(
      screen.getByText('Run the flow and every step reports here as it executes.'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(container.querySelector('svg')).toHaveAttribute('width', '18');
  });

  /** Criterion 22 — a run that died before any step parsed is a report, never
   * the empty-state text over a dead run. */
  it('gives way to the failure when a run died before any step', () => {
    useRunStore.setState({
      outcome: 'error',
      outcomeMessage: 'The Maestro CLI is not installed.',
      logLines: ['Device NOPE was requested, but it is not connected.'],
    });
    render(<RunPanel />);

    expect(
      screen.queryByText('Run the flow and every step reports here as it executes.'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('The Maestro CLI is not installed.')).toBeInTheDocument();
    expect(
      screen.getByText('Device NOPE was requested, but it is not connected.'),
    ).toBeInTheDocument();
  });

  it('gives way the moment a run is live, before any output', () => {
    useRunStore.setState({ running: true, runId: 'run-1' });
    render(<RunPanel />);

    expect(
      screen.queryByText('Run the flow and every step reports here as it executes.'),
    ).not.toBeInTheDocument();
  });
});

/** Criterion 19 — the list grows as Maestro advances, dots first. */
describe('the step list', () => {
  it('renders one row per parsed step', () => {
    useRunStore.setState({ running: true, steps: STEPS });
    render(<RunPanel />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
  });

  it('renders a step as its label and its duration', () => {
    useRunStore.setState({ running: true, steps: STEPS });
    render(<RunPanel />);

    const row = screen.getAllByRole('listitem')[0] as HTMLElement;

    expect(row).toHaveTextContent('Launch app "com.android.settings"');
    expect(row).toHaveTextContent('0:02');
  });

  it('threads a connector through every step', () => {
    useRunStore.setState({ running: true, steps: STEPS });
    render(<RunPanel />);

    for (const row of screen.getAllByRole('listitem')) {
      expect(within(row).getByTestId('step-connector')).toBeInTheDocument();
    }
  });

  it('colours each step dot by its status', () => {
    useRunStore.setState({ running: true, steps: STEPS });
    render(<RunPanel />);

    const states = screen
      .getAllByRole('listitem')
      .map((row) => within(row).getByTestId('step-dot').getAttribute('data-state'));

    expect(states).toEqual(['pass', 'fail', 'running']);
  });

  it('leaves the duration blank on a step still running', () => {
    useRunStore.setState({ running: true, steps: STEPS });
    render(<RunPanel />);

    const running = screen.getAllByRole('listitem')[2] as HTMLElement;

    expect(within(running).getByTestId('step-duration')).toBeEmptyDOMElement();
  });
});

/** Criterion 20 — the raw Maestro log, mono, in order. */
describe('the log', () => {
  it('streams the raw lines in order', () => {
    useRunStore.setState({
      running: true,
      logLines: ['Running on R9QYC01EMXL', ' > Flow happy', 'Launch app "x"... COMPLETED'],
    });
    render(<RunPanel />);

    expect(screen.getByTestId('log-text').textContent).toBe(
      'Running on R9QYC01EMXL\n > Flow happy\nLaunch app "x"... COMPLETED',
    );
    expect(screen.getByRole('log')).toBeInTheDocument();
  });

  /** The cap is visible, never silent (spec constraint). */
  it('says when earlier output was dropped', () => {
    useRunStore.setState({ running: true, logLines: ['newest'], droppedLines: 120 });
    render(<RunPanel />);

    expect(screen.getByText('… earlier output dropped')).toBeInTheDocument();
  });

  it('does not claim a drop that never happened', () => {
    useRunStore.setState({ running: true, logLines: ['all of it'] });
    render(<RunPanel />);

    expect(screen.queryByText('… earlier output dropped')).not.toBeInTheDocument();
  });
});

/** Criterion 21 — the outcome, and the report still readable under it. */
describe('the outcome', () => {
  it.each([
    ['passed', 'Run passed'],
    ['failed', 'Run failed'],
    ['canceled', 'Run canceled'],
    ['error', 'Run error'],
  ] as const)('names a %s run', (outcome, label) => {
    useRunStore.setState({ outcome });
    render(<RunPanel />);

    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('carries the message beside the outcome when there is one', () => {
    useRunStore.setState({ outcome: 'failed', outcomeMessage: 'Maestro exited with code 1.' });
    render(<RunPanel />);

    expect(screen.getByText('Maestro exited with code 1.')).toBeInTheDocument();
  });

  it('shows no outcome while the run is still going', () => {
    useRunStore.setState({ running: true, steps: STEPS });
    render(<RunPanel />);

    expect(screen.queryByText('Run passed')).not.toBeInTheDocument();
    expect(screen.queryByText('Run failed')).not.toBeInTheDocument();
  });

  it('keeps the whole report readable after the run', () => {
    useRunStore.setState({
      outcome: 'failed',
      outcomeMessage: 'Maestro exited with code 1.',
      steps: [STEPS[0] as RunStep],
      logLines: ['Launch app "x"... COMPLETED'],
    });
    render(<RunPanel />);

    expect(screen.getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByText('Run failed')).toBeInTheDocument();
    expect(screen.getByText('Launch app "x"... COMPLETED')).toBeInTheDocument();
  });
});

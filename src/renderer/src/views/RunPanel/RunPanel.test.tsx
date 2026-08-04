import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { RunStep } from '../../fixtures/flows';
import { resetUiStore, useUiStore } from '../../stores/ui.store';
import { RunPanel } from './RunPanel';

const STEPS: readonly RunStep[] = [
  {
    id: 's1',
    label: 'Launch app "com.example.app" with clear state',
    status: 'pass',
    duration: '0:02',
  },
  { id: 's2', label: 'Tap on', status: 'fail', duration: '0:11' },
  { id: 's3', label: 'Assert visible', status: 'running' },
];

beforeEach(() => {
  resetUiStore();
});

/** Criteria 31–32. */
describe('RunPanel', () => {
  it('renders the empty state while nothing has run', () => {
    const { container } = render(<RunPanel />);

    expect(
      screen.getByText('Run the flow and every step reports here as it executes.'),
    ).toBeInTheDocument();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    // Criterion 31 puts an 18px play glyph above the sentence.
    expect(container.querySelector('svg')).toHaveAttribute('width', '18');
  });

  it('renders one row per step once a run has reported', () => {
    useUiStore.setState({ steps: STEPS });
    render(<RunPanel />);

    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(
      screen.queryByText('Run the flow and every step reports here as it executes.'),
    ).not.toBeInTheDocument();
  });

  it('renders a step as its label and its duration', () => {
    useUiStore.setState({ steps: STEPS });
    render(<RunPanel />);

    const row = screen.getAllByRole('listitem')[0] as HTMLElement;

    expect(row).toHaveTextContent('Launch app "com.example.app" with clear state');
    expect(row).toHaveTextContent('0:02');
  });

  // Criterion 32 — the thread that runs the steps together into one sequence.
  it('threads a connector through every step', () => {
    useUiStore.setState({ steps: STEPS });
    render(<RunPanel />);

    for (const row of screen.getAllByRole('listitem')) {
      expect(within(row).getByTestId('step-connector')).toBeInTheDocument();
    }
  });

  it('colours each step dot by its status', () => {
    useUiStore.setState({ steps: STEPS });
    render(<RunPanel />);

    const states = screen
      .getAllByRole('listitem')
      .map((row) => within(row).getByTestId('step-dot').getAttribute('data-state'));

    expect(states).toEqual(['pass', 'fail', 'running']);
  });

  // A step still running has no duration yet; the column stays empty rather
  // than reporting a zero that would read as "finished instantly".
  it('leaves the duration blank on a step still running', () => {
    useUiStore.setState({ steps: STEPS });
    render(<RunPanel />);

    const running = screen.getAllByRole('listitem')[2] as HTMLElement;

    expect(within(running).getByTestId('step-duration')).toBeEmptyDOMElement();
  });
});

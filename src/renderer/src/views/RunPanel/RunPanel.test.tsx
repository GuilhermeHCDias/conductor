import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

/** Recording criteria 23–28 — the failed step's video. */
describe('the recording', () => {
  const FAILED: readonly RunStep[] = [
    { id: 'run-1-step-1', label: 'Launch app "x"', status: 'pass', duration: '0:02' },
    { id: 'run-1-step-2', label: 'Tap on "Entrar"', status: 'fail', duration: '0:11' },
  ];
  const SAVED = {
    status: 'saved',
    fileName: 'login-2026-09-02-143015.mp4',
    fromSeconds: 72,
  } as const;

  /** Criterion 23 — while the video is on its way, the failed row says so in
   * the action's place, and offers nothing to click. */
  it('shows the saving state on the failed row while the video is on its way', () => {
    useRunStore.setState({ outcome: 'failed', steps: FAILED, recording: { status: 'saving' } });
    render(<RunPanel />);

    const failed = screen.getAllByRole('listitem')[1] as HTMLElement;
    expect(within(failed).getByText('Saving video…')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /** Criterion 24 — the action on the failed row, with the play glyph and
   * the caption saying where in the video that step begins. */
  it('offers Open video on the failed row, captioned with where the step begins', () => {
    useRunStore.setState({ outcome: 'failed', steps: FAILED, recording: SAVED });
    render(<RunPanel />);

    const failed = screen.getAllByRole('listitem')[1] as HTMLElement;
    const action = within(failed).getByRole('button', { name: 'Open video' });
    expect(action).toBeEnabled();
    expect(action.querySelector('svg path')).toBeInTheDocument();
    expect(within(failed).getByText('from 1:12')).toBeInTheDocument();
    expect(within(failed).getByText('0:11')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  /** Criterion 23 — "the failed step" is the last row whose status is fail. */
  it('puts the action on the last failed step', () => {
    useRunStore.setState({
      outcome: 'failed',
      steps: [
        { id: 'run-1-step-1', label: 'Tap on "a"', status: 'fail', duration: '0:01' },
        { id: 'run-1-step-2', label: 'Tap on "b"', status: 'fail', duration: '0:02' },
      ],
      recording: SAVED,
    });
    render(<RunPanel />);

    const rows = screen.getAllByRole('listitem') as HTMLElement[];
    expect(
      within(rows[1] as HTMLElement).getByRole('button', { name: 'Open video' }),
    ).toBeVisible();
    expect(within(rows[0] as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
  });

  /** A failed run whose every parsed step passed — Maestro died between
   * steps, or failed after the last one — still keeps its video; the action
   * anchors on the last row, so the video is never saved and unreachable. */
  it('anchors the action on the last step when no step reads as failed', () => {
    useRunStore.setState({
      outcome: 'error',
      steps: [
        { id: 'run-1-step-1', label: 'Launch app "x"', status: 'pass', duration: '0:02' },
        { id: 'run-1-step-2', label: 'Tap on "Entrar"', status: 'pass', duration: '0:01' },
      ],
      recording: { ...SAVED, fromSeconds: null },
    });
    render(<RunPanel />);

    const rows = screen.getAllByRole('listitem') as HTMLElement[];
    expect(
      within(rows[1] as HTMLElement).getByRole('button', { name: 'Open video' }),
    ).toBeVisible();
    expect(within(rows[0] as HTMLElement).queryByRole('button')).not.toBeInTheDocument();
  });

  /** Criterion 24 — no caption when the offset is unknown: the recorder had
   * stopped, or no step failed on record. */
  it('omits the caption when the offset is unknown', () => {
    useRunStore.setState({
      outcome: 'failed',
      steps: FAILED,
      recording: { ...SAVED, fromSeconds: null },
    });
    render(<RunPanel />);

    expect(screen.getByRole('button', { name: 'Open video' })).toBeInTheDocument();
    expect(screen.queryByText(/^from /)).not.toBeInTheDocument();
  });

  /** Criterion 25 — activating the action goes through the store, which
   * asks main by the run's id and nothing else. */
  it('opens the video through the store on activation', async () => {
    const runOpenRecording = vi.fn(() =>
      Promise.resolve({ ok: true as const, data: { runId: 'run-1' } }),
    );
    window.conductor.runOpenRecording = runOpenRecording;
    useRunStore.setState({ runId: 'run-1', outcome: 'failed', steps: FAILED, recording: SAVED });
    render(<RunPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Open video' }));

    expect(runOpenRecording).toHaveBeenCalledExactlyOnceWith('run-1');
  });

  /** Criterion 25 — a refusal shows in the outcome bar's message area. */
  it('shows a refusal beneath the outcome', async () => {
    window.conductor.runOpenRecording = vi.fn(() =>
      Promise.resolve({
        ok: false as const,
        error: {
          code: 'run/recording-missing',
          message: 'The video is no longer in your Movies folder.',
        },
      }),
    );
    useRunStore.setState({ runId: 'run-1', outcome: 'failed', steps: FAILED, recording: SAVED });
    render(<RunPanel />);

    await userEvent.click(screen.getByRole('button', { name: 'Open video' }));

    expect(
      within(screen.getByTestId('run-outcome')).getByText(
        'The video is no longer in your Movies folder.',
      ),
    ).toBeInTheDocument();
  });

  /** Criterion 26 — a video that could not be saved is a note beneath the
   * outcome label, and no row carries an action. */
  it('shows a failed save beneath the outcome, with no action on any row', () => {
    useRunStore.setState({
      outcome: 'failed',
      outcomeMessage: 'Maestro exited with code 1.',
      steps: FAILED,
      recording: null,
      recordingNote: "The recording couldn't be saved to your Movies folder: EACCES.",
    });
    render(<RunPanel />);

    const bar = screen.getByTestId('run-outcome');
    expect(within(bar).getByText('Run failed')).toBeInTheDocument();
    expect(within(bar).getByText('Maestro exited with code 1.')).toBeInTheDocument();
    expect(
      within(bar).getByText("The recording couldn't be saved to your Movies folder: EACCES."),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByText('Saving video…')).not.toBeInTheDocument();
  });

  /** Criterion 27 — nothing about a video after a pass or a cancel. */
  it.each(['passed', 'canceled'] as const)('says nothing about a video after a %s run', (o) => {
    useRunStore.setState({ outcome: o, steps: [STEPS[0] as RunStep] });
    render(<RunPanel />);

    expect(screen.queryByText(/video/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  /** Criterion 27 — and nothing while nothing has run. */
  it('says nothing about a video while nothing has ever run', () => {
    render(<RunPanel />);

    expect(screen.queryByText(/video/i)).not.toBeInTheDocument();
  });

  /** Criterion 28 — the action stays readable after the run, with the rest
   * of the report; it is the next start that clears it (a store rule). */
  it('keeps the action readable with the rest of the report', () => {
    useRunStore.setState({
      running: false,
      outcome: 'failed',
      steps: FAILED,
      logLines: ['Tap on "Entrar"... FAILED'],
      recording: SAVED,
    });
    render(<RunPanel />);

    expect(screen.getByRole('button', { name: 'Open video' })).toBeInTheDocument();
    expect(screen.getByText('Tap on "Entrar"... FAILED')).toBeInTheDocument();
    expect(screen.getByText('Run failed')).toBeInTheDocument();
  });
});

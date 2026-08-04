import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SegmentedControl } from './SegmentedControl';

const OPTIONS = [
  { id: 'run', label: 'Run' },
  { id: 'assistant', label: 'Assistant' },
] as const;

function renderControl(value: 'run' | 'assistant', onChange = vi.fn()) {
  render(
    <SegmentedControl
      controls="lower-panel"
      label="Lower panel"
      onChange={onChange}
      options={OPTIONS}
      value={value}
    />,
  );
  return onChange;
}

/** Criterion 52 — exposed as tabs in a tablist, consistently. */
describe('SegmentedControl', () => {
  it('is a labelled tablist of tabs', () => {
    renderControl('assistant');

    expect(screen.getByRole('tablist', { name: 'Lower panel' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('marks exactly the selected segment as selected', () => {
    renderControl('assistant');

    expect(screen.getByRole('tab', { name: 'Assistant' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Run' })).toHaveAttribute('aria-selected', 'false');
  });

  it('points every segment at the panel it swaps', () => {
    renderControl('run');

    for (const tab of screen.getAllByRole('tab')) {
      expect(tab).toHaveAttribute('aria-controls', 'lower-panel');
    }
  });

  it('calls back with the segment that was activated', async () => {
    const onChange = renderControl('assistant');

    await userEvent.click(screen.getByRole('tab', { name: 'Run' }));

    expect(onChange).toHaveBeenCalledWith('run');
  });

  // Criterion 54: every control is reachable by Tab in visual order, so this
  // deliberately does not use a roving tabindex.
  it('leaves every segment reachable by Tab', async () => {
    renderControl('assistant');

    await userEvent.tab();
    expect(screen.getByRole('tab', { name: 'Run' })).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole('tab', { name: 'Assistant' })).toHaveFocus();
  });

  it('shows a badge on a segment that asks for one', () => {
    render(
      <SegmentedControl
        controls="lower-panel"
        label="Lower panel"
        onChange={vi.fn()}
        options={[
          { id: 'run', label: 'Run', badge: true },
          { id: 'assistant', label: 'Assistant' },
        ]}
        value="assistant"
      />,
    );

    expect(screen.getByRole('tab', { name: 'Run' })).toHaveAttribute('data-badge', 'true');
    expect(screen.getByRole('tab', { name: 'Assistant' })).not.toHaveAttribute('data-badge');
  });
});

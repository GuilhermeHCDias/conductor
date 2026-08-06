import { describe, expect, it } from 'vitest';
import { FLOW_YAML } from '../fixtures/flows';
import { resetFlowStore, useFlowStore } from './flow.store';

/**
 * The open flow's text, in memory — the landing place for an appended step
 * while the real editor is another spec's. The one hard rule is criterion 38:
 * appending is strictly additive, existing bytes untouched, because this file
 * eventually goes through code review (§12 rule 7's spirit).
 */

const store = () => useFlowStore.getState();

const STEP = '- tapOn:\n    text: "Entrar"';

describe('the open flow', () => {
  it('seeds from the fixture flow, clean', () => {
    resetFlowStore();

    expect(store().yaml).toBe(FLOW_YAML);
    expect(store().dirty).toBe(false);
    expect(store().revision).toBe(0);
  });

  /** Every test file opens on the clear-state init, so a run always starts
   * from zero — no state left over from whatever ran before it. */
  it('opens the seed with the clear-state init as its first step', () => {
    expect(FLOW_YAML).toMatch(/^appId: [^\n]+\n---\n- launchApp:\n {4}clearState: true\n/);
  });

  it('returns to the seed when a new flow starts, keeping nothing of the last one', () => {
    resetFlowStore();
    store().appendStep(STEP);

    store().startNew();

    expect(store().yaml).toBe(FLOW_YAML);
    expect(store().dirty).toBe(false);
    expect(store().revision).toBe(0);
  });

  it('replaces the text wholesale when the user edits, marking it dirty', () => {
    resetFlowStore();

    store().edit('appId: com.google.android.calendar\n');

    expect(store().yaml).toBe('appId: com.google.android.calendar\n');
    expect(store().dirty).toBe(true);
  });

  /** The reveal-scroll follows the revision, and the revision counts blocks
   * that arrive from outside the editor — the user's own keystrokes must not
   * yank the view to the end of the file. */
  it('leaves the revision alone on an edit', () => {
    resetFlowStore();

    store().edit('- launchApp\n');

    expect(store().revision).toBe(0);
  });

  /** Criterion 38 — one block appended at the end, a trailing newline, and
   * every existing byte exactly where it was. */
  it('appends one step block leaving the existing bytes identical', () => {
    resetFlowStore();

    store().appendStep(STEP);

    expect(store().yaml).toBe(`${FLOW_YAML}${STEP}\n`);
    expect(store().yaml.startsWith(FLOW_YAML)).toBe(true);
  });

  it('separates steps with exactly one newline when the text lacks one', () => {
    resetFlowStore();
    useFlowStore.setState({ yaml: '- launchApp' });

    store().appendStep(STEP);

    expect(store().yaml).toBe(`- launchApp\n${STEP}\n`);
  });

  /** Criterion 39 — the document bar shows dirty, and the editor watches the
   * revision to reveal the new lines. */
  it('marks the flow dirty and advances the revision per append', () => {
    resetFlowStore();

    store().appendStep(STEP);
    store().appendStep('- waitForAnimationToEnd');

    expect(store().dirty).toBe(true);
    expect(store().revision).toBe(2);
    expect(store().yaml.endsWith('- waitForAnimationToEnd\n')).toBe(true);
  });

  it('resets to the seed', () => {
    store().appendStep(STEP);
    resetFlowStore();

    expect(store().yaml).toBe(FLOW_YAML);
    expect(store().dirty).toBe(false);
  });
});

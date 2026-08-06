import type { TreeNode } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { elementLabel } from './element-label';

/**
 * Criterion 14: the highlight and the menu title name the element the way the
 * design system does — `Kind · "text"` — with the kind from the class name's
 * last segment and the text taken **literally** from the tree, falling back to
 * content-desc, then resource-id. Never transcribed from pixels.
 */

const node = (over: Partial<TreeNode> = {}): TreeNode => ({
  bounds: null,
  className: null,
  text: null,
  resourceId: null,
  contentDescription: null,
  hintText: null,
  scrollable: null,
  clickable: null,
  enabled: null,
  focused: null,
  selected: null,
  checked: null,
  children: [],
  ...over,
});

describe('the element label', () => {
  it('names the kind from the class name last segment and quotes the text', () => {
    expect(elementLabel(node({ className: 'android.widget.TextView', text: 'Entrar' }))).toBe(
      'TextView · "Entrar"',
    );
  });

  it('falls back to content-desc when there is no text', () => {
    expect(
      elementLabel(node({ className: 'android.widget.Button', contentDescription: 'Back' })),
    ).toBe('Button · "Back"');
  });

  it('falls back to the resource-id when there is no text at all', () => {
    expect(
      elementLabel(node({ className: 'android.view.View', resourceId: 'app:id/spinner' })),
    ).toBe('View · "app:id/spinner"');
  });

  it('names the bare kind when nothing identifies the element', () => {
    expect(elementLabel(node({ className: 'android.widget.FrameLayout' }))).toBe('FrameLayout');
  });

  it('names an element with no class at all', () => {
    expect(elementLabel(node({ text: 'Entrar' }))).toBe('View · "Entrar"');
  });

  /** The text is the tree's own string, verbatim — a label is still §12
   * rule 4 territory. */
  it('copies the text literally, specials included', () => {
    expect(elementLabel(node({ className: 'a.T', text: 'Total: R$ 10,00' }))).toBe(
      'T · "Total: R$ 10,00"',
    );
  });
});

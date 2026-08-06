import { describe, expect, it } from 'vitest';
import { type EditorState, type IndentEdit, indentEdit } from './yaml-indent';

/**
 * The whole indentation decision, criteria 28–32. Cases are written as marked
 * strings: `‸` is the caret, and a pair of `‸` is a selection. The table
 * states each rule as before → after, which is exactly how the criteria read.
 */

/** Parses `appId:‸` into text + selection. */
function at(spec: string): EditorState {
  const first = spec.indexOf('‸');
  if (first === -1) {
    throw new Error(`The spec "${spec}" carries no caret marker.`);
  }
  const second = spec.indexOf('‸', first + 1);
  const text = spec.replaceAll('‸', '');
  return second === -1
    ? { text, selectionStart: first, selectionEnd: first }
    : { text, selectionStart: first, selectionEnd: second - 1 };
}

/** Applies an edit and renders the outcome back in marker notation. */
function applied(state: EditorState, edit: IndentEdit | null): string | null {
  if (edit === null) {
    return null;
  }
  const text = state.text.slice(0, edit.start) + edit.insert + state.text.slice(edit.end);
  if (edit.selectionStart === edit.selectionEnd) {
    return `${text.slice(0, edit.selectionStart)}‸${text.slice(edit.selectionStart)}`;
  }
  return `${text.slice(0, edit.selectionStart)}‸${text.slice(
    edit.selectionStart,
    edit.selectionEnd,
  )}‸${text.slice(edit.selectionEnd)}`;
}

describe('Enter', () => {
  /** Criterion 29 — after a line whose content ends with `:`, the new line
   * indents to the first content column (indent, then a leading `- `,
   * skipped) plus 2. */
  it.each([
    ['appId:‸', 'appId:\n  ‸'],
    ['- tapOn:‸', '- tapOn:\n    ‸'],
    ['    visible:‸', '    visible:\n      ‸'],
    ['appId: x\n- tapOn:‸', 'appId: x\n- tapOn:\n    ‸'],
    // Trailing whitespace does not hide the colon: the *content* ends with it.
    ['- tapOn:  ‸', '- tapOn:  \n    ‸'],
  ])('opens a block after a colon: %j', (before, after) => {
    expect(applied(at(before), indentEdit(at(before), { key: 'Enter' }))).toBe(after);
  });

  /** Criterion 29 — text after the caret moves to the new line, indented. */
  it('carries the rest of the line onto the new one', () => {
    const before = at('- tapOn:‸ "Pagar"');

    expect(applied(before, indentEdit(before, { key: 'Enter' }))).toBe('- tapOn:\n    ‸ "Pagar"');
  });

  /** Criterion 30 — any other line: the new line keeps the current line's
   * leading indent; a whitespace-only line keeps its own. */
  it.each([
    ['- tapOn: "Pagar"‸', '- tapOn: "Pagar"\n‸'],
    ['    text: "x"‸', '    text: "x"\n    ‸'],
    ['      ‸', '      \n      ‸'],
    ['appId: x‸\n- launchApp:', 'appId: x\n‸\n- launchApp:'],
  ])('keeps the indent elsewhere: %j', (before, after) => {
    expect(applied(at(before), indentEdit(at(before), { key: 'Enter' }))).toBe(after);
  });

  it('replaces a selection with the break', () => {
    const before = at('- tapOn:‸ "Pa‸gar"');

    expect(applied(before, indentEdit(before, { key: 'Enter' }))).toBe('- tapOn:\n    ‸gar"');
  });
});

describe('Tab', () => {
  /** Criterion 31 — a caret advances to the next multiple of 2. */
  it.each([
    ['‸launchApp', '  ‸launchApp'],
    [' ‸launchApp', '  ‸launchApp'],
    ['ab‸', 'ab  ‸'],
    ['abc‸', 'abc ‸'],
    ['appId: x\n  ‸', 'appId: x\n    ‸'],
  ])('pads to the next multiple of 2: %j', (before, after) => {
    expect(applied(at(before), indentEdit(at(before), { key: 'Tab', shift: false }))).toBe(after);
  });

  /** Criterion 31 — a selection indents every touched line by 2, and stays
   * covering the same lines. */
  it('indents every selected line', () => {
    const before = at('a‸b\ncd\ne‸f');

    expect(applied(before, indentEdit(before, { key: 'Tab', shift: false }))).toBe(
      '  a‸b\n  cd\n  e‸f',
    );
  });

  it('keeps a column-zero anchor at column zero', () => {
    const before = at('‸ab\ncd‸');

    expect(applied(before, indentEdit(before, { key: 'Tab', shift: false }))).toBe('‸  ab\n  cd‸');
  });

  /** A selection ending at column 0 does not touch that line — it only
   * reaches up to it. */
  it('leaves a line the selection only touches at column zero alone', () => {
    const before = at('‸ab\n‸cd');

    expect(applied(before, indentEdit(before, { key: 'Tab', shift: false }))).toBe('‸  ab\n‸cd');
  });

  it('indents a single-line selection as a line', () => {
    const before = at('a‸bc‸d');

    expect(applied(before, indentEdit(before, { key: 'Tab', shift: false }))).toBe('  a‸bc‸d');
  });
});

describe('Shift+Tab', () => {
  /** Criterion 31 — up to 2 leading spaces leave the current line. */
  it.each([
    ['    ab‸', '  ab‸'],
    ['  ‸ab', '‸ab'],
    [' ab‸', 'ab‸'],
    ['x\n    y‸', 'x\n  y‸'],
  ])('dedents the current line: %j', (before, after) => {
    expect(applied(at(before), indentEdit(at(before), { key: 'Tab', shift: true }))).toBe(after);
  });

  it('dedents every selected line by what it can give', () => {
    const before = at('  a‸b\n    cd\nef‸');

    expect(applied(before, indentEdit(before, { key: 'Tab', shift: true }))).toBe('a‸b\n  cd\nef‸');
  });

  /** Nothing to remove is not an edit — no empty undo step. */
  it('does nothing when no line has leading spaces', () => {
    const before = at('ab‸\ncd');

    expect(indentEdit(before, { key: 'Tab', shift: true })).toBeNull();
  });
});

describe('Backspace', () => {
  /** Criterion 32 — with only whitespace left of the caret, the indent
   * retreats to the previous multiple of 2. */
  it.each([
    ['    ‸ab', '  ‸ab'],
    ['   ‸ab', '  ‸ab'],
    [' ‸ab', '‸ab'],
    ['x\n  ‸y', 'x\n‸y'],
  ])('retreats to the previous multiple of 2: %j', (before, after) => {
    expect(applied(at(before), indentEdit(at(before), { key: 'Backspace' }))).toBe(after);
  });

  /** Anything else is the platform's backspace, untouched. */
  it.each([
    ['ab ‸', 'text left of the caret'],
    ['‸ab', 'column zero'],
    ['  a‸b‸', 'a selection'],
  ])('leaves %j to the platform (%s)', (before) => {
    expect(indentEdit(at(before), { key: 'Backspace' })).toBeNull();
  });
});

/**
 * Real-time YAML indentation, criteria 28–32: the whole decision, pure. The
 * editor hands over its text, selection and key; what comes back is one
 * contiguous replacement plus the selection after it — or `null`, meaning the
 * platform's own behaviour is the right one. Applying the edit through the
 * platform's edit path (criterion 33) is the editor's job, not this module's.
 */

export type EditorState = {
  readonly text: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
};

export type EditorKey =
  | { readonly key: 'Enter' }
  | { readonly key: 'Tab'; readonly shift: boolean }
  | { readonly key: 'Backspace' };

/** Replace `[start, end)` with `insert`, then place the selection. */
export type IndentEdit = {
  readonly start: number;
  readonly end: number;
  readonly insert: string;
  readonly selectionStart: number;
  readonly selectionEnd: number;
};

export function indentEdit(state: EditorState, key: EditorKey): IndentEdit | null {
  switch (key.key) {
    case 'Enter':
      return breakLine(state);
    case 'Tab':
      return key.shift ? dedent(state) : indent(state);
    case 'Backspace':
      return retreat(state);
  }
}

/**
 * Criteria 29–30. The line is read up to the caret — that is the line the
 * break ends — and what follows the caret moves down, already indented. A
 * content that ends with `:` opens a block: the new line lands at the first
 * content column (indent, plus a leading `- ` skipped) plus 2, which is what
 * makes `- tapOn:` continue at 4 and `appId:` at 2.
 */
function breakLine(state: EditorState): IndentEdit {
  const lineStart = lineStartAt(state.text, state.selectionStart);
  const head = state.text.slice(lineStart, state.selectionStart);
  const leading = leadingSpaces(head);
  const content = head.trimEnd();

  let width: number;
  if (content !== '' && content.endsWith(':')) {
    const afterIndent = head.slice(leading);
    width = leading + (afterIndent.startsWith('- ') ? 2 : 0) + 2;
  } else {
    width = leading;
  }

  const insert = `\n${' '.repeat(width)}`;
  const caret = state.selectionStart + insert.length;
  return {
    start: state.selectionStart,
    end: state.selectionEnd,
    insert,
    selectionStart: caret,
    selectionEnd: caret,
  };
}

/**
 * Criterion 31, forward. A caret pads itself to the next multiple of 2; any
 * selection indents every line it touches by 2 and still covers them after —
 * an anchor sitting at column 0 stays at column 0, so a whole-line selection
 * remains one.
 */
function indent(state: EditorState): IndentEdit {
  if (state.selectionStart === state.selectionEnd) {
    const column = state.selectionStart - lineStartAt(state.text, state.selectionStart);
    const insert = ' '.repeat(2 - (column % 2));
    const caret = state.selectionStart + insert.length;
    return {
      start: state.selectionStart,
      end: state.selectionEnd,
      insert,
      selectionStart: caret,
      selectionEnd: caret,
    };
  }

  const block = touchedBlock(state);
  const insert = block.lines.map((line) => `  ${line}`).join('\n');
  return {
    start: block.start,
    end: block.end,
    insert,
    selectionStart:
      state.selectionStart === block.start ? state.selectionStart : state.selectionStart + 2,
    selectionEnd: state.selectionEnd + 2 * block.lines.length,
  };
}

/**
 * Criterion 31, backward. Every touched line gives up to 2 leading spaces —
 * the current line alone when there is no selection — and doing nothing is
 * `null`, never an empty undo step.
 */
function dedent(state: EditorState): IndentEdit | null {
  const block = touchedBlock(state);
  const removals = block.lines.map((line) => Math.min(2, leadingSpaces(line)));
  const total = removals.reduce((sum, removed) => sum + removed, 0);
  if (total === 0) {
    return null;
  }

  const insert = block.lines.map((line, index) => line.slice(removals[index])).join('\n');
  const startColumn = state.selectionStart - lineStartAt(state.text, state.selectionStart);
  const endLine = lineIndexWithin(block, state.selectionEnd);
  const endColumn = state.selectionEnd - lineStartAt(state.text, state.selectionEnd);
  const removedBeforeEnd =
    endLine === null
      ? total
      : sum(removals.slice(0, endLine)) + Math.min(removals[endLine] ?? 0, endColumn);

  return {
    start: block.start,
    end: block.end,
    insert,
    selectionStart: state.selectionStart - Math.min(removals[0] ?? 0, startColumn),
    selectionEnd: state.selectionEnd - removedBeforeEnd,
  };
}

/**
 * Criterion 32. Only whitespace left of the caret, caret past column 0: the
 * indent retreats to the previous multiple of 2. Everything else — content to
 * the left, a selection — is the platform's backspace.
 */
function retreat(state: EditorState): IndentEdit | null {
  if (state.selectionStart !== state.selectionEnd) {
    return null;
  }
  const lineStart = lineStartAt(state.text, state.selectionStart);
  const column = state.selectionStart - lineStart;
  if (column === 0 || state.text.slice(lineStart, state.selectionStart).trim() !== '') {
    return null;
  }
  const removed = column % 2 === 0 ? 2 : 1;
  const caret = state.selectionStart - removed;
  return {
    start: caret,
    end: state.selectionStart,
    insert: '',
    selectionStart: caret,
    selectionEnd: caret,
  };
}

// ── the geometry ─────────────────────────────────────────────────────────────

function lineStartAt(text: string, index: number): number {
  return text.lastIndexOf('\n', index - 1) + 1;
}

function leadingSpaces(line: string): number {
  let count = 0;
  while (count < line.length && line[count] === ' ') {
    count += 1;
  }
  return count;
}

type Block = {
  /** The block's bounds in the original text — whole lines, newline at the
   * end excluded. */
  readonly start: number;
  readonly end: number;
  readonly lines: readonly string[];
  readonly lineStarts: readonly number[];
};

/**
 * The lines an edit touches: from the line holding the selection start to the
 * line holding its end — except that an end resting at column 0 only reaches
 * *up to* its line, and leaves it alone.
 */
function touchedBlock(state: EditorState): Block {
  const start = lineStartAt(state.text, state.selectionStart);
  const last =
    state.selectionEnd > state.selectionStart &&
    lineStartAt(state.text, state.selectionEnd) === state.selectionEnd
      ? state.selectionEnd - 1
      : state.selectionEnd;
  const lastLineStart = lineStartAt(state.text, last);
  const newline = state.text.indexOf('\n', lastLineStart);
  const end = newline === -1 ? state.text.length : newline;
  const lines = state.text.slice(start, end).split('\n');

  const lineStarts: number[] = [];
  let cursor = start;
  for (const line of lines) {
    lineStarts.push(cursor);
    cursor += line.length + 1;
  }
  return { start, end, lines, lineStarts };
}

/** Which block line holds `position` — `null` when it sits past the block. */
function lineIndexWithin(block: Block, position: number): number | null {
  for (let index = block.lineStarts.length - 1; index >= 0; index -= 1) {
    const lineStart = block.lineStarts[index] ?? 0;
    if (position >= lineStart) {
      return position <= lineStart + (block.lines[index]?.length ?? 0) ? index : null;
    }
  }
  return null;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

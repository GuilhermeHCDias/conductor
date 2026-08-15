/**
 * The pure line diff behind the editor's `ai` wash (criterion 27): which
 * 1-based lines of `after` are new or changed against `before`. An LCS over
 * lines rather than a prefix/suffix trim, so two surgical edits far apart
 * wash as two lines — not as the whole span between them, which is exactly
 * the difference a reviewer's eye needs.
 *
 * Lines are counted the way the editor counts them (`YamlBody`): one
 * trailing newline is the end of the last line, not an extra empty one.
 */

/** Past this, the quadratic table stops being free; a change that big is a
 * rewrite, and washing everything is the honest rendering of a rewrite. */
const LCS_LINE_LIMIT = 1_500;

export function diffLines(before: string, after: string): number[] {
  if (before === after) {
    return [];
  }
  const beforeLines = split(before);
  const afterLines = split(after);
  if (before === '') {
    return afterLines.map((_line, index) => index + 1);
  }

  if (beforeLines.length > LCS_LINE_LIMIT || afterLines.length > LCS_LINE_LIMIT) {
    return coarseDiff(beforeLines, afterLines);
  }

  // Classic LCS table over lines; an `after` line that is not part of the
  // common subsequence is new or changed.
  const rows = beforeLines.length;
  const columns = afterLines.length;
  const table: Uint32Array = new Uint32Array((rows + 1) * (columns + 1));
  const at = (row: number, column: number): number => row * (columns + 1) + column;
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      table[at(row, column)] =
        beforeLines[row] === afterLines[column]
          ? (table[at(row + 1, column + 1)] ?? 0) + 1
          : Math.max(table[at(row + 1, column)] ?? 0, table[at(row, column + 1)] ?? 0);
    }
  }

  const changed: number[] = [];
  let row = 0;
  let column = 0;
  while (row < rows && column < columns) {
    if (beforeLines[row] === afterLines[column]) {
      row += 1;
      column += 1;
    } else if ((table[at(row + 1, column)] ?? 0) >= (table[at(row, column + 1)] ?? 0)) {
      row += 1;
    } else {
      changed.push(column + 1);
      column += 1;
    }
  }
  for (; column < columns; column += 1) {
    changed.push(column + 1);
  }
  return changed;
}

/** The editor's own split: one trailing newline closes the last line. */
function split(text: string): string[] {
  return text.replace(/\n$/, '').split('\n');
}

/** The fallback past the LCS bound: trim the common prefix and suffix, wash
 * the middle whole. */
function coarseDiff(beforeLines: string[], afterLines: string[]): number[] {
  let prefix = 0;
  while (
    prefix < beforeLines.length &&
    prefix < afterLines.length &&
    beforeLines[prefix] === afterLines[prefix]
  ) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < beforeLines.length - prefix &&
    suffix < afterLines.length - prefix &&
    beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]
  ) {
    suffix += 1;
  }
  const changed: number[] = [];
  for (let line = prefix + 1; line <= afterLines.length - suffix; line += 1) {
    changed.push(line);
  }
  return changed;
}

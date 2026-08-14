import { describe, expect, it } from 'vitest';
import { diffLines } from './diff-lines';

/**
 * The pure line diff behind the editor's `ai` wash (criterion 27): which
 * 1-based lines of `after` are new or changed against `before`. Line
 * numbering follows the editor's own split — one trailing newline is not a
 * line — so a wash never points one row off.
 */

describe('diffLines', () => {
  it('marks nothing when nothing changed', () => {
    expect(diffLines('a\nb\nc\n', 'a\nb\nc\n')).toEqual([]);
  });

  it('treats a trailing newline like the editor does', () => {
    expect(diffLines('a\nb', 'a\nb\n')).toEqual([]);
  });

  it('marks an appended line', () => {
    expect(diffLines('- launchApp\n', '- launchApp\n- tapOn: "Entrar"\n')).toEqual([2]);
  });

  it('marks a changed line and only it', () => {
    expect(diffLines('a\nb\nc\n', 'a\nB\nc\n')).toEqual([2]);
  });

  /** The surgical case (evaluation 30c): two edits far apart wash as two
   * lines, not as the whole span between them. */
  it('marks two separated edits without washing the span between', () => {
    const before = 'l1\nl2\nl3\nl4\nl5\nl6\n';
    const after = 'l1\nL2\nl3\nl4\nL5\nl6\n';

    expect(diffLines(before, after)).toEqual([2, 5]);
  });

  it('marks only the inserted line when later lines merely shift', () => {
    expect(diffLines('a\nb\nc\n', 'a\nb\nx\nc\n')).toEqual([3]);
  });

  it('marks nothing on a pure deletion — there is no new line to wash', () => {
    expect(diffLines('a\nb\nc\n', 'a\nc\n')).toEqual([]);
  });

  it('marks every line when the previous text was empty', () => {
    expect(diffLines('', 'appId: com.x\n---\n- launchApp\n')).toEqual([1, 2, 3]);
  });

  it('keeps repeated lines straight', () => {
    const before = '- back\n- back\n';
    const after = '- back\n- tapOn: "Pix"\n- back\n';

    expect(diffLines(before, after)).toEqual([2]);
  });

  it('answers ascending line numbers', () => {
    const marked = diffLines('x\n', 'a\nx\nb\nc\n');

    expect(marked).toEqual([...marked].sort((left, right) => left - right));
  });
});

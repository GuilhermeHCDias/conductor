import { describe, expect, it } from 'vitest';
import { COMMAND_GROUPS, commandStep, inputTextSteps, TAP_FAMILY } from './command-templates';

/**
 * The YAML each menu command appends, ported from the design system's
 * `SNIPPETS` and grown by the two commands the spec adds. Every string here is
 * written into a file a human reviews (§12.7), so the shapes are pinned
 * byte-for-byte.
 */

describe('the menu vocabulary', () => {
  /** Criterion 24 — the exact groups, labels and YAML keywords, in order.
   * Maestro has no command-enumeration API, so this list is the contract. */
  it('offers the four groups with their exact commands', () => {
    expect(COMMAND_GROUPS).toEqual([
      {
        label: 'Interact',
        commands: [
          'tapOn',
          'doubleTapOn',
          'longPressOn',
          'inputText',
          'scrollUntilVisible',
          'eraseText',
        ],
      },
      { label: 'Assert', commands: ['assertVisible', 'assertNotVisible'] },
      { label: 'Wait', commands: ['waitForAnimationToEnd', 'extendedWaitUntil'] },
      { label: 'App', commands: ['takeScreenshot', 'copyTextFrom'] },
    ]);
  });

  /** Criteria 40 and 42 — exactly these three also drive the device. */
  it('names the tap family and nothing else as executing', () => {
    expect(TAP_FAMILY).toEqual(['tapOn', 'doubleTapOn', 'longPressOn']);
  });
});

describe('a selector command', () => {
  /** Criterion 37 — `- <cmd>:` with the selector indented under it, the way
   * the design system's SNIPPETS write it. */
  it.each([
    'tapOn',
    'doubleTapOn',
    'longPressOn',
    'assertVisible',
    'assertNotVisible',
    'copyTextFrom',
  ] as const)('renders %s with the selector nested', (command) => {
    expect(commandStep(command, 'text: "Entrar"')).toBe(`- ${command}:\n    text: "Entrar"`);
  });

  /** A multi-line fragment keeps its own relative indentation — `index:` sits
   * beside `text:`, not under it. */
  it('indents every line of a multi-line fragment', () => {
    expect(commandStep('tapOn', 'text: "Item"\nindex: 1')).toBe(
      '- tapOn:\n    text: "Item"\n    index: 1',
    );
  });

  it('nests a relational fragment one level deeper than its direction', () => {
    expect(commandStep('tapOn', 'below:\n  text: "Nome"')).toBe(
      '- tapOn:\n    below:\n      text: "Nome"',
    );
  });
});

describe('the structured commands', () => {
  /** Criterion 37 — `visible:` wraps the selector, and the timeout is the DS
   * mock's 10000. */
  it('renders extendedWaitUntil with visible and the timeout', () => {
    expect(commandStep('extendedWaitUntil', 'id: "app:id/done"')).toBe(
      '- extendedWaitUntil:\n    visible:\n      id: "app:id/done"\n    timeout: 10000',
    );
  });

  it('renders scrollUntilVisible with the element wrapper', () => {
    expect(commandStep('scrollUntilVisible', 'text: "Fim"')).toBe(
      '- scrollUntilVisible:\n    element:\n      text: "Fim"',
    );
  });

  it.each(['waitForAnimationToEnd', 'takeScreenshot', 'eraseText'] as const)(
    'renders %s bare',
    (command) => {
      expect(commandStep(command, 'text: "ignored"')).toBe(`- ${command}`);
    },
  );
});

describe('the inputText pair', () => {
  /** Criterion 37/41 — the step is born complete: the focusing tap and the
   * filled text, as one block. */
  it('renders the focusing tap and the filled text', () => {
    expect(inputTextSteps('id: "app:id/search"', 'red shoes')).toBe(
      '- tapOn:\n    id: "app:id/search"\n- inputText: "red shoes"',
    );
  });

  /** Criterion 41 — the text is YAML-escaped: quotes and backslashes survive
   * the double-quoted scalar. */
  it('escapes quotes and backslashes in the text', () => {
    expect(inputTextSteps('id: "app:id/q"', 'say "hi" \\ bye')).toBe(
      '- tapOn:\n    id: "app:id/q"\n- inputText: "say \\"hi\\" \\\\ bye"',
    );
  });
});

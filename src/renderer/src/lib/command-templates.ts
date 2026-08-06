/**
 * The YAML step each menu command appends, ported from the design system's
 * `SNIPPETS` (`ui_kits/conductor-c-aurora/data.jsx`) and grown by
 * `scrollUntilVisible` and `eraseText`. Maestro exposes no command-enumeration
 * API, so this vocabulary is pinned in code from Maestro's documented
 * commands — the labels are the YAML keywords, verbatim, which is also why the
 * menu renders them mono (DS rule).
 *
 * Pure string assembly over an already-synthesised selector fragment: the
 * escaping and the uniqueness proof happened in main (`SelectorSynth`), and
 * nothing here re-derives either.
 */

export type MenuCommand =
  | 'tapOn'
  | 'doubleTapOn'
  | 'longPressOn'
  | 'inputText'
  | 'scrollUntilVisible'
  | 'eraseText'
  | 'assertVisible'
  | 'assertNotVisible'
  | 'waitForAnimationToEnd'
  | 'extendedWaitUntil'
  | 'takeScreenshot'
  | 'copyTextFrom';

export type CommandGroup = {
  readonly label: string;
  readonly commands: readonly MenuCommand[];
};

/** Criterion 24 — the menu's exact groups, in the DS order. */
export const COMMAND_GROUPS: readonly CommandGroup[] = [
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
];

/** Criteria 40 and 42: these three also perform their gesture on the device;
 * everything else inserts and executes nothing. */
export const TAP_FAMILY = ['tapOn', 'doubleTapOn', 'longPressOn'] as const;

/** The commands whose step is `- <cmd>:` over the selector, unwrapped. */
const SELECTOR_COMMANDS = new Set<MenuCommand>([
  'tapOn',
  'doubleTapOn',
  'longPressOn',
  'assertVisible',
  'assertNotVisible',
  'copyTextFrom',
]);

/** Appended with no argument at all — a name for `takeScreenshot` is product
 * thinking that belongs to the editor spec. */
const BARE_COMMANDS = new Set<MenuCommand>([
  'waitForAnimationToEnd',
  'takeScreenshot',
  'eraseText',
]);

/**
 * Criterion 37. One step block, ready for `flow.store`'s append — no leading
 * or trailing newline; the store owns the joining. `inputText` is not built
 * here: its step needs the typed text, which is `inputTextSteps`' business.
 */
export function commandStep(command: Exclude<MenuCommand, 'inputText'>, selector: string): string {
  if (BARE_COMMANDS.has(command)) {
    return `- ${command}`;
  }
  if (command === 'extendedWaitUntil') {
    return `- extendedWaitUntil:\n    visible:\n${indent(selector, 6)}\n    timeout: 10000`;
  }
  if (command === 'scrollUntilVisible') {
    return `- scrollUntilVisible:\n    element:\n${indent(selector, 6)}`;
  }
  if (SELECTOR_COMMANDS.has(command)) {
    return `- ${command}:\n${indent(selector, 4)}`;
  }
  // The union is exhausted above; a new command must pick its shape here.
  throw new Error(`No template for the ${command} command.`);
}

/**
 * Criterion 41 — the pair, born complete: the focusing tap and the filled
 * text. The text is YAML-escaped for the double-quoted scalar; the selector
 * arrived escaped from main.
 */
export function inputTextSteps(selector: string, text: string): string {
  return `- tapOn:\n${indent(selector, 4)}\n- inputText: ${quote(text)}`;
}

/** Every line of the fragment moved under the command, its own relative
 * indentation kept — `index:` sits beside `text:`, an anchor under its
 * direction. */
function indent(fragment: string, spaces: number): string {
  const prefix = ' '.repeat(spaces);
  return fragment
    .split('\n')
    .map((line) => `${prefix}${line}`)
    .join('\n');
}

/** YAML double-quoted style — the one style whose escapes are exactly `\` and
 * `"` for the text a person can type into a single-line field. */
function quote(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

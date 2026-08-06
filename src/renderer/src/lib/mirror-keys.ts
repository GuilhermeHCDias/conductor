import type { MirrorInput, MirrorKey } from '@shared/ipc';

/**
 * Which keystrokes belong to the device and which belong to Conductor
 * (criteria 11–13). Pure, and stated as data rather than as a chain of
 * conditions inside a handler: the precedence is the whole of the logic, and it
 * is the sort of thing that rots quietly in JSX.
 */

/** The keystroke, narrowed to what the decision needs. A `KeyboardEvent` is one
 * of these; so is a plain object in a test. */
export type KeyStroke = {
  /** `KeyboardEvent.key` — already through the person's own keyboard layout. */
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
};

/**
 * Criterion 12. `KeyboardEvent.key` names on the left, the wire's names on the
 * right — Android's own numbers are main's business and never travel here.
 */
const NAMED: Readonly<Record<string, MirrorKey>> = {
  Backspace: 'backspace',
  Enter: 'enter',
  Tab: 'tab',
  Escape: 'escape',
  Delete: 'delete',
  ArrowUp: 'arrow-up',
  ArrowDown: 'arrow-down',
  ArrowLeft: 'arrow-left',
  ArrowRight: 'arrow-right',
};

/**
 * The input this keystroke is, or `null` when it is not the device's to have.
 * `null` is also the signal not to swallow the event: the caller preventing the
 * browser's default handling is the same decision as claiming the key.
 */
export function mirrorKeyInput(stroke: KeyStroke): MirrorInput | null {
  // ⚠️ Criterion 13. A modifier held means the keystroke is a command to
  // Conductor or to the OS — Cmd-Q, Cmd-W, Cmd-R. Claiming those would take
  // quitting the app away from the person while the mirror has focus, and the
  // device has no use for them anyway.
  if (stroke.ctrlKey || stroke.metaKey || stroke.altKey) {
    return null;
  }

  const named = NAMED[stroke.key];
  if (named !== undefined) {
    return { type: 'key', key: named };
  }

  // Criterion 11. One character is a character; anything longer is a name —
  // 'Shift', 'F1', 'Dead' — and belongs to whoever else wants it. The layout has
  // already been applied, so what arrives is what the person meant to type.
  if (stroke.key.length === 1) {
    return { type: 'text', text: stroke.key };
  }

  return null;
}

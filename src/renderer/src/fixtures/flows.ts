/**
 * The layout shell's remaining fixtures. Ported from the design system's
 * `ui_kits/conductor-c-aurora/data.jsx` so the screenshots stay usable as a
 * review reference.
 *
 * Everything here is a fixture and is meant to look like one. When real state
 * arrives, these constants are replaced by domain stores and this file is
 * deleted — which is why no component defines its own sample data. The device
 * went first (`stores/device.store.ts`, fed by adb); the flows went with the
 * local workspace spec (`stores/flow.store.ts`, fed by `flow:*`). What is
 * left belongs to the AI panel and the status lines, and leaves with their
 * own specs.
 *
 * Content belonging to the app under test stays in the team's own Portuguese.
 */

export type ChatTurn = {
  readonly id: string;
  readonly role: 'assistant' | 'user';
  readonly body: string;
  readonly code?: string;
};

/** Lines the assistant wrote, and lines Maestro reported as failing. */
export const AI_LINES: readonly number[] = [];
export const ERROR_LINES: readonly number[] = [];

export const THREAD: readonly ChatTurn[] = [
  {
    id: 'hello',
    role: 'assistant',
    body: "Right-click anything on the device and I'll write the step. Or just tell me what the test should do.",
  },
];

export const SUGGESTIONS: readonly string[] = [
  'Open the first pending order',
  'Assert both order cards are visible',
  'Screenshot after checkout',
];

export const ENVIRONMENT = 'staging';

/** What the segmented control reports on its right-hand side, per panel. */
export const RUN_STATUS_LINE = 'adb · logcat attached';
export const ASSISTANT_STATUS_LINE = 'Conductor 1.4';

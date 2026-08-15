/**
 * The layout shell's remaining fixtures. Ported from the design system's
 * `ui_kits/conductor-c-aurora/data.jsx` so the screenshots stay usable as a
 * review reference.
 *
 * Everything here is a fixture and is meant to look like one. When real state
 * arrives, these constants are replaced by domain stores and this file is
 * deleted — which is why no component defines its own sample data. The device
 * went first (`stores/device.store.ts`, fed by adb); the flows went with the
 * local workspace spec (`stores/flow.store.ts`, fed by `flow:*`); the AI
 * thread, its suggestions and its status line left with the assistant spec
 * (`stores/ai.store.ts`, fed by `ai:*`). What is left belongs to the run
 * domain's error surface and the toolbar's environment tag, and leaves with
 * their own specs.
 *
 * Content belonging to the app under test stays in the team's own Portuguese.
 */

/** Lines Maestro reported as failing. */
export const ERROR_LINES: readonly number[] = [];

export const ENVIRONMENT = 'staging';

/** What the segmented control reports on its right-hand side for the run
 * panel. The assistant's side is real state now (`ai.store` availability). */
export const RUN_STATUS_LINE = 'adb · logcat attached';

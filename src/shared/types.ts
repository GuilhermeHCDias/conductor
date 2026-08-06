/**
 * Types both sides share that are not an IPC payload. `shared/ipc.ts` derives
 * its types from Zod schemas because they cross the bridge and must be
 * validated; these describe the device's screen, and the renderer's hit-test
 * (§5.5) will read the same shape main parsed.
 *
 * No `node:` imports and no DOM, like everything else under `shared/`.
 */

/**
 * `[x1,y1][x2,y2]`, as `bounds` reports it — kept in the wire's own coordinates
 * rather than as `{ x, y, width, height }`, because everything downstream
 * derives from these four and nothing re-derives them.
 *
 * ⚠️ The unit is the platform's, not ours: Android reports physical pixels, iOS
 * logical points (§5.2). Nothing here assumes either — the scale is calibrated
 * against the screenshot's own width, one spec from now.
 */
export type Bounds = {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
};

/**
 * One element of the device's view hierarchy, as Conductor holds it.
 *
 * `null` means **not reported** and never a substituted default (§5.2). It is
 * load-bearing: a selector synthesised from an invented `false` would look
 * right in our UI and fail in `maestro test`, which §5.1 names as the worst
 * failure mode this product has.
 *
 * The booleans are the tree's *top-level* fields, which is what Maestro's own
 * code reads — never the string copies that also appear inside `attributes`
 * in the raw format (§5.2).
 */
export type TreeNode = {
  /** `null` when the element reported none. A real capture's root does. */
  readonly bounds: Bounds | null;
  readonly className: string | null;
  readonly text: string | null;
  /** `resource-id` — the `testID` of a React Native app, when it has one. */
  readonly resourceId: string | null;
  /** `content-desc` on Android. §5.3: it becomes `text:` in a selector, never
   * a key of its own. */
  readonly contentDescription: string | null;
  readonly hintText: string | null;
  readonly scrollable: boolean | null;
  readonly clickable: boolean | null;
  readonly enabled: boolean | null;
  readonly focused: boolean | null;
  readonly selected: boolean | null;
  readonly checked: boolean | null;
  readonly children: readonly TreeNode[];
};

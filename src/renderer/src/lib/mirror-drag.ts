import type { MirrorTouch } from '@shared/ipc';
import {
  type MirrorClick,
  type MirrorPoint,
  mirrorPoint,
  mirrorPointClamped,
} from './mirror-point';

/**
 * The live drag, one phase at a time: the finger lands where the press did,
 * follows the pointer while the button is down, and lifts where it releases.
 * Nothing waits for the release — the device is driven while the hand moves,
 * which is what makes the mirror answer the way the glass would. The device
 * applies its own touch slop and its own timings to what arrives, so a still
 * press is its tap, a held one its long press and a travelled one its scroll:
 * the decisions this module used to make are Android's again.
 *
 * Pure, and with no access to the DOM: the view reads the canvas's own box at
 * the moment of each event and passes the numbers in. It composes
 * `mirror-point.ts` rather than redoing its arithmetic — the scale math lives
 * in one file, and this one only decides which of its two policies each phase
 * answers to, and what a phase may refuse.
 */

/** The press. Strict, and the only phase that may refuse a place: the bezel
 * and the bay's gutter are the app, not the phone, and no drag starts there. */
export function dragStart(sample: MirrorClick): MirrorTouch | null {
  const point = mirrorPoint(sample);
  return point === null ? null : phase('down', point, sample);
}

/**
 * A sample of the travel. Clamped — a finger cannot leave the glass mid-drag —
 * and silent when it lands on the device pixel the finger already occupies:
 * the wire needs no duplicate, and at any scale a CSS pixel of jitter is a
 * fraction of a device one.
 */
export function dragMove(sample: MirrorClick, last: MirrorPoint): MirrorTouch | null {
  const point = mirrorPointClamped(sample);
  if (point === null || (point.x === last.x && point.y === last.y)) {
    return null;
  }
  return phase('move', point, sample);
}

/**
 * The release — the one phase that must always answer. A DOWN is already on
 * the device, and refusing the UP would leave the app under test holding a
 * press nobody is making. If nothing is drawn any more — the bay collapsed
 * mid-drag — the finger lifts from wherever it last stood.
 */
export function dragEnd(sample: MirrorClick, last: MirrorPoint): MirrorTouch {
  return phase('up', mirrorPointClamped(sample) ?? last, sample);
}

function phase(
  action: MirrorTouch['action'],
  point: MirrorPoint,
  sample: MirrorClick,
): MirrorTouch {
  return {
    type: 'touch',
    action,
    x: point.x,
    y: point.y,
    // ⚠️ The size travels with every phase: scrcpy drops a touch that names
    // any size but the video's current one, and after a rotation this side
    // holds the only fresh one.
    screenWidth: sample.streamWidth,
    screenHeight: sample.streamHeight,
  };
}

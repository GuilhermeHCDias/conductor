import type { AppIdentity, Device, DeviceProperties } from '@shared/ipc';

/**
 * Where the mirror is. It lives here rather than in the store because the two
 * functions below are what read it, and `lib` may not import from `stores` —
 * the renderer's import ladder only runs one way.
 *
 * `unsupported` is not a failure of this device: it is a renderer with no
 * `VideoDecoder` at all, and the next action is a different one (criterion 43).
 */
export type MirrorStatus = 'idle' | 'starting' | 'streaming' | 'failed' | 'unsupported';

/**
 * Which one thing the inspector is saying (criterion 38). Pure, and separate
 * from the view, because "exactly one state per condition" is a rule about
 * precedence — and precedence is the sort of thing that rots quietly inside a
 * chain of ternaries in JSX.
 */

export type InspectorState =
  /** No adb, or an adb that refused. Both name what to fix, in the message. */
  | 'adb-unavailable'
  | 'no-device'
  | 'unauthorized'
  | 'choose-device'
  | 'app-missing'
  /** This renderer has no `VideoDecoder` (criterion 43). */
  | 'unsupported'
  | 'mirror-failed'
  /** The bezel holds the canvas. Whether a frame has landed yet is the mirror's
   * own business, not a different thing to say. */
  | 'ready';

export type InspectorInput = {
  readonly devices: readonly Device[];
  readonly selectedId: string | null;
  readonly deviceError: { readonly code: string } | null;
  readonly appIdentity: AppIdentity | null;
  readonly mirrorStatus: MirrorStatus;
};

/**
 * Device conditions first — they are what the person can act on right now —
 * then the app, then the mirror. The order is the point: an unauthorized phone
 * and a mirror that could not start are both true at once, and the first one is
 * the reason for the second.
 */
export function inspectorState(input: InspectorInput): InspectorState {
  if (input.deviceError !== null) {
    return 'adb-unavailable';
  }
  if (input.devices.length === 0) {
    return 'no-device';
  }

  if (input.selectedId === null) {
    if (input.devices.some((device) => device.state === 'unauthorized')) {
      return 'unauthorized';
    }
    if (input.devices.filter((device) => device.state === 'device').length > 1) {
      return 'choose-device';
    }
    // Everything attached is offline: there is nothing here to talk to, and the
    // next action is the same one as for an empty bench.
    return 'no-device';
  }

  if (input.appIdentity !== null && !input.appIdentity.installed) {
    return 'app-missing';
  }

  if (input.mirrorStatus === 'unsupported') {
    return 'unsupported';
  }
  if (input.mirrorStatus === 'failed') {
    return 'mirror-failed';
  }

  return 'ready';
}

/**
 * What the header's dot reports (criterion 39): the real device, and the real
 * session on it. Green over a bezel that never filled would be the panel lying
 * about itself, so only a stream that is actually arriving counts as connected.
 *
 * The values are the `StatusDot` states it feeds, spelled out here rather than
 * imported — a `lib` module reaching up into `components` would invert the
 * renderer's import ladder.
 */
export type HeaderDot = 'connected' | 'idle' | 'fail' | 'offline';

export function headerDot(device: Device | null, mirrorStatus: MirrorStatus): HeaderDot {
  if (device === null || device.state !== 'device') {
    return 'offline';
  }
  if (mirrorStatus === 'streaming') {
    return 'connected';
  }
  if (mirrorStatus === 'failed' || mirrorStatus === 'unsupported') {
    return 'fail';
  }
  return 'idle';
}

/** The selected device, or `null`. Selection is main's, so this only looks up. */
export function selectedDevice(
  devices: readonly Device[],
  selectedId: string | null,
): Device | null {
  return devices.find((device) => device.id === selectedId) ?? null;
}

/**
 * Which device the header names. Usually the selected one — but a single
 * unauthorized phone is selected by nobody and is still the device the person
 * is holding, and a header reading "No device" over a panel explaining the RSA
 * prompt would contradict itself (criterion 27).
 */
export function headerDevice(devices: readonly Device[], selectedId: string | null): Device | null {
  return (
    selectedDevice(devices, selectedId) ?? (devices.length === 1 ? (devices[0] ?? null) : null)
  );
}

/**
 * What the header names the device. The model is what a person recognises; the
 * serial is what identifies it. Nothing is invented — a device that reported no
 * model is shown by its id (criterion 27).
 */
export function deviceLabel(device: Device | null, properties: DeviceProperties | null): string {
  if (device === null) {
    return 'No device';
  }
  return properties?.model ?? device.model ?? device.id;
}

/**
 * Criterion 13, as one line: the app id, the version when it is known, and
 * which of the four states it is in. `foreground: null` is "not reported", so
 * it says "running" rather than claiming the app is behind something.
 */
export function appIdentityLine(identity: AppIdentity | null): string | null {
  if (identity === null) {
    return null;
  }
  if (!identity.installed) {
    return `${identity.appId} · not installed`;
  }

  const version = identity.versionName === null ? '' : ` ${identity.versionName}`;
  const state = !identity.running
    ? 'not running'
    : identity.foreground === true
      ? 'foreground'
      : identity.foreground === false
        ? 'background'
        : 'running';

  return `${identity.appId}${version} · ${state}`;
}

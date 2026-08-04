import type { AppIdentity, Device } from '@shared/ipc';
import { describe, expect, it } from 'vitest';
import {
  appIdentityLine,
  deviceLabel,
  headerDevice,
  inspectorState,
  selectedDevice,
} from './device-state';

const PHONE: Device = { id: 'R9QYC01EMXL', model: 'SM_G991B', state: 'device' };
const SECOND: Device = { id: 'emulator-5554', model: 'sdk_gphone64', state: 'device' };
const UNAUTHORIZED: Device = { id: '9A271FFAZ005LN', model: null, state: 'unauthorized' };
const OFFLINE: Device = { id: '0123456789ABCDEF', model: null, state: 'offline' };

const INSTALLED: AppIdentity = {
  appId: 'com.vtex.pnp',
  installed: true,
  versionName: '4.0.2',
  running: true,
  foreground: true,
};

const base = {
  devices: [PHONE],
  selectedId: PHONE.id,
  deviceError: null,
  appIdentity: INSTALLED,
  viewerError: null,
};

/** Criterion 26 — one state per condition, and the precedence between them. */
describe('inspectorState', () => {
  it('is ready when a device is selected and the app is installed', () => {
    expect(inspectorState(base)).toBe('ready');
  });

  it('reports adb before anything else', () => {
    expect(inspectorState({ ...base, deviceError: { code: 'device/adb-not-found' } })).toBe(
      'adb-unavailable',
    );
  });

  // An adb that ran and refused is the same empty state; which one it was is
  // in the message main sent, not in the shape of the panel.
  it('treats an adb that refused the same way', () => {
    expect(inspectorState({ ...base, deviceError: { code: 'device/adb-failed' } })).toBe(
      'adb-unavailable',
    );
  });

  it('reports an empty bench', () => {
    expect(inspectorState({ ...base, devices: [], selectedId: null })).toBe('no-device');
  });

  /** The first screen a first-time user sees. */
  it('reports an unauthorized device as its own state', () => {
    expect(inspectorState({ ...base, devices: [UNAUTHORIZED], selectedId: null })).toBe(
      'unauthorized',
    );
  });

  it('asks the person to pick when two devices are usable', () => {
    expect(inspectorState({ ...base, devices: [PHONE, SECOND], selectedId: null })).toBe(
      'choose-device',
    );
  });

  // Something is attached, but there is nothing to talk to — the next action is
  // the same as for an empty bench, so it is the same state.
  it('reads an offline-only bench as no device', () => {
    expect(inspectorState({ ...base, devices: [OFFLINE], selectedId: null })).toBe('no-device');
  });

  it('names the unauthorized device even when an offline one is attached too', () => {
    expect(inspectorState({ ...base, devices: [OFFLINE, UNAUTHORIZED], selectedId: null })).toBe(
      'unauthorized',
    );
  });

  it('reports an app that is not installed', () => {
    expect(inspectorState({ ...base, appIdentity: { ...INSTALLED, installed: false } })).toBe(
      'app-missing',
    );
  });

  // The app identity arrives one round-trip after the device does. Until it
  // has, the panel must not claim the app is missing.
  it('does not claim the app is missing before it has been read', () => {
    expect(inspectorState({ ...base, appIdentity: null })).toBe('ready');
  });

  it('reports a missing Maestro under its own state', () => {
    expect(inspectorState({ ...base, viewerError: { code: 'viewer/maestro-not-found' } })).toBe(
      'maestro-missing',
    );
  });

  it.each([
    'viewer/start-failed',
    'viewer/handshake-timeout',
    'viewer/tool-missing',
    'viewer/call-failed',
    'viewer/untrusted-url',
  ])('reports %s as a failed viewer', (code) => {
    expect(inspectorState({ ...base, viewerError: { code } })).toBe('viewer-failed');
  });

  // A phone that was never authorized is a more useful thing to say than a
  // Maestro that was never installed: it is the one the person is holding.
  it('names the device problem before the viewer one', () => {
    expect(
      inspectorState({
        ...base,
        devices: [UNAUTHORIZED],
        selectedId: null,
        viewerError: { code: 'viewer/maestro-not-found' },
      }),
    ).toBe('unauthorized');
  });
});

describe('deviceLabel', () => {
  it('prefers the model the device reported about itself', () => {
    expect(
      deviceLabel(PHONE, { model: 'SM-G991B', release: null, size: null, density: null }),
    ).toBe('SM-G991B');
  });

  it('falls back to the model adb listed', () => {
    expect(deviceLabel(PHONE, null)).toBe('SM_G991B');
  });

  // Never an invented name: the serial is what is actually known.
  it('falls back to the id when no model was reported', () => {
    expect(deviceLabel(UNAUTHORIZED, null)).toBe(UNAUTHORIZED.id);
  });

  it('says so when there is no device', () => {
    expect(deviceLabel(null, null)).toBe('No device');
  });
});

/** Criterion 27 — the header names what is there, not what was chosen. */
describe('headerDevice', () => {
  it('is the selected device when there is one', () => {
    expect(headerDevice([PHONE, SECOND], SECOND.id)).toBe(SECOND);
  });

  // A header reading "No device" over a panel explaining the RSA prompt would
  // contradict itself: the phone is right there, it is just not authorized.
  it('names a lone unselected device anyway', () => {
    expect(headerDevice([UNAUTHORIZED], null)).toBe(UNAUTHORIZED);
  });

  it('names none when the person still has to pick', () => {
    expect(headerDevice([PHONE, SECOND], null)).toBeNull();
  });

  it('names none when nothing is attached', () => {
    expect(headerDevice([], null)).toBeNull();
  });
});

describe('selectedDevice', () => {
  it('finds the selected device', () => {
    expect(selectedDevice([PHONE, SECOND], SECOND.id)).toBe(SECOND);
  });

  it('is null when nothing is selected', () => {
    expect(selectedDevice([PHONE], null)).toBeNull();
  });

  it('is null when the selection names a device that is gone', () => {
    expect(selectedDevice([PHONE], 'unplugged')).toBeNull();
  });
});

/** Criterion 13 — one line telling the four states apart. */
describe('appIdentityLine', () => {
  it('reads nothing before the app has been identified', () => {
    expect(appIdentityLine(null)).toBeNull();
  });

  it('distinguishes not installed', () => {
    expect(appIdentityLine({ ...INSTALLED, installed: false, versionName: null })).toBe(
      'com.vtex.pnp · not installed',
    );
  });

  it('distinguishes installed but not running', () => {
    expect(appIdentityLine({ ...INSTALLED, running: false, foreground: false })).toBe(
      'com.vtex.pnp 4.0.2 · not running',
    );
  });

  it('distinguishes running in the background', () => {
    expect(appIdentityLine({ ...INSTALLED, foreground: false })).toBe(
      'com.vtex.pnp 4.0.2 · background',
    );
  });

  it('distinguishes foreground', () => {
    expect(appIdentityLine(INSTALLED)).toBe('com.vtex.pnp 4.0.2 · foreground');
  });

  /** `null` is "not reported" — the line must not claim the app is behind
   * something the device never told us about (.context.md §5.2). */
  it('says running, not background, when foreground was not reported', () => {
    expect(appIdentityLine({ ...INSTALLED, foreground: null })).toBe(
      'com.vtex.pnp 4.0.2 · running',
    );
  });

  it('omits a version it does not have', () => {
    expect(appIdentityLine({ ...INSTALLED, versionName: null })).toBe('com.vtex.pnp · foreground');
  });
});

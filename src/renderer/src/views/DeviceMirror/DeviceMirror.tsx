import type { JSX } from 'react';
import { IconButton } from '../../components/IconButton/IconButton';
import { StatusDot } from '../../components/StatusDot/StatusDot';
import { useDeviceStream } from '../../hooks/useDeviceStream';
import { useElementSize, useElementWidth } from '../../hooks/useElementWidth';
import { deviceHeaderLayout } from '../../lib/breakpoints';
import {
  appIdentityLine,
  deviceLabel,
  headerDevice,
  type InspectorState,
  inspectorState,
} from '../../lib/device-state';
import { fitMirror } from '../../lib/mirror-fit';
import { selectSelectedId, useDeviceStore } from '../../stores/device.store';
import { selectMirrorWidth, useUiStore } from '../../stores/ui.store';
import styles from './DeviceMirror.module.css';

/** The gutter the mirror bay adds either side of the phone (criterion 35). */
const BAY_PADDING = 40;

/**
 * The device inspector: what is really plugged in, what the app under test is
 * doing on it, and a control that opens the screen in Maestro's own Viewer.
 *
 * The panel never fills with a picture, and the copy has to say so — the screen
 * is somewhere else on purpose (criterion 25). What stays from the layout shell
 * is the phone as an object: its bezel, its shadow and its own fixed palette,
 * because a real device does not repaint itself when Conductor switches to
 * light mode.
 */
export function DeviceMirror(): JSX.Element {
  useDeviceStream();

  const mirrorWidth = useUiStore(selectMirrorWidth);
  // Criterion 30: one field per subscription. The list is re-enumerated every
  // two seconds, and a selector returning a fresh object would re-render the
  // whole panel on every tick of it.
  const devices = useDeviceStore((state) => state.devices);
  const selectedId = useDeviceStore(selectSelectedId);
  const properties = useDeviceStore((state) => state.properties);
  const deviceError = useDeviceStore((state) => state.deviceError);
  const appIdentity = useDeviceStore((state) => state.appIdentity);
  const viewerOpening = useDeviceStore((state) => state.viewerOpening);
  const viewerError = useDeviceStore((state) => state.viewerError);
  const openViewer = useDeviceStore((state) => state.openViewer);
  const refresh = useDeviceStore((state) => state.refresh);
  const pick = useDeviceStore((state) => state.pick);

  const [headerRef, headerWidth] = useElementWidth(mirrorWidth);
  const [bayRef, bay] = useElementSize({ width: 0, height: 0 });

  const header = deviceHeaderLayout(headerWidth);
  const fit = fitMirror({ bayWidth: bay.width, bayHeight: bay.height, maxWidth: mirrorWidth });

  const device = headerDevice(devices, selectedId);
  const state = inspectorState({ devices, selectedId, deviceError, appIdentity, viewerError });
  const identity = appIdentityLine(appIdentity);
  const copy = stateCopy(state, {
    deviceMessage: deviceError?.message ?? '',
    viewerMessage: viewerError?.message ?? '',
    appId: appIdentity?.appId ?? '',
  });

  return (
    <section
      aria-label="Device"
      className={styles.panel}
      style={{ width: mirrorWidth + BAY_PADDING }}
    >
      <header className={styles.header} data-testid="device-header" ref={headerRef}>
        {header.label ? <span className={styles.caps}>Device</span> : null}
        <span className={styles.device}>
          {/* Criterion 27 — the dot reports the device, not a fixture. */}
          <StatusDot size="md" state={device?.state === 'device' ? 'connected' : 'offline'} />
          <span className={styles.serial}>{deviceLabel(device, properties)}</span>
        </span>
        {/* Criterion 28: the first thing to go as the panel narrows, and the
            serial beside it is the last — it truncates instead. */}
        {header.identity && identity !== null ? (
          <span className={styles.identity}>{identity}</span>
        ) : null}
        <span className={styles.spacer} />
        {header.tools ? (
          <IconButton icon="refresh-cw" label="Refresh" onClick={() => void refresh()} size="sm" />
        ) : null}
        {/* Inspect is the mode the whole window is in, so it never degrades. */}
        <IconButton icon="crosshair" label="Inspect" selected size="sm" />
      </header>

      <div className={styles.bayPad}>
        <div className={styles.bay} data-testid="mirror-bay" ref={bayRef}>
          {/* Reserves the footprint the scaled phone occupies, so the bay never
              overflows its column (criterion 40). */}
          <div
            className={styles.footprint}
            data-testid="phone-footprint"
            style={{ width: fit.outerWidth, height: fit.outerHeight }}
          >
            {/* Criterion 39: fitted by scale alone — the phone is an object of a
                fixed size, and this panel is not a reflow of one. */}
            <div
              className={styles.phone}
              data-testid="phone"
              style={{
                width: fit.width,
                height: fit.height,
                transform: `scale(${fit.scale})`,
              }}
            >
              {/* Criterion 24: no drawn status bar and no drawn nav bar. The
                  screen is not here, so nothing pretends it is about to be. */}
              <div className={styles.display}>
                <div className={styles.state} data-state={state} data-testid="device-state">
                  <p className={styles.stateTitle}>{copy.title}</p>
                  <p className={styles.stateBody}>{copy.body}</p>

                  {state === 'choose-device' ? (
                    <ul aria-label="Attached devices" className={styles.devices}>
                      {devices
                        .filter((candidate) => candidate.state === 'device')
                        .map((candidate) => (
                          <li key={candidate.id}>
                            <button
                              className={styles.deviceChoice}
                              onClick={() => {
                                pick(candidate.id);
                              }}
                              type="button"
                            >
                              {candidate.model ?? candidate.id}
                            </button>
                          </li>
                        ))}
                    </ul>
                  ) : null}

                  {/* Criterion 25 — the label says where the screen appears, and
                      criterion 29 disables it until there is a device to show. */}
                  <button
                    className={styles.viewer}
                    disabled={selectedId === null || viewerOpening}
                    onClick={() => void openViewer()}
                    type="button"
                  >
                    {viewerOpening ? 'Starting Maestro…' : 'Open screen in browser'}
                  </button>
                  <p className={styles.viewerNote}>
                    {viewerOpening
                      ? 'The first open starts Maestro, which takes a moment.'
                      : "Maestro's own Viewer, in a browser tab."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * Criterion 26 — one state, one thing said, one next action. The two failure
 * states read the message main sent rather than inventing their own: main is
 * the only layer that knows whether adb was missing or merely refused.
 */
function stateCopy(
  state: InspectorState,
  detail: { deviceMessage: string; viewerMessage: string; appId: string },
): { title: string; body: string } {
  switch (state) {
    case 'adb-unavailable':
      return { title: 'adb is not available', body: detail.deviceMessage };
    case 'no-device':
      return {
        title: 'No device connected',
        body: 'Plug an Android phone in over USB, with USB debugging turned on.',
      };
    case 'unauthorized':
      return {
        title: 'Device not authorized',
        body: 'Accept the USB debugging prompt on the phone. It shows up here once you do.',
      };
    case 'choose-device':
      return {
        title: 'More than one device',
        body: 'Pick the one to work with.',
      };
    case 'app-missing':
      return {
        title: `${detail.appId} is not installed`,
        body: 'Install the app on this device before running a flow against it.',
      };
    case 'maestro-missing':
      return { title: 'Maestro is not installed', body: detail.viewerMessage };
    case 'viewer-failed':
      return { title: 'The Viewer did not open', body: detail.viewerMessage };
    default:
      return {
        title: 'Ready',
        body: 'The screen opens in your browser, not in this panel.',
      };
  }
}

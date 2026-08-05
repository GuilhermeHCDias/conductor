import { type JSX, type KeyboardEvent, type PointerEvent, useRef } from 'react';
import { IconButton } from '../../components/IconButton/IconButton';
import { StatusDot } from '../../components/StatusDot/StatusDot';
import { useDeviceStream } from '../../hooks/useDeviceStream';
import { useElementSize, useElementWidth } from '../../hooks/useElementWidth';
import { useMirrorStream } from '../../hooks/useMirrorStream';
import { deviceHeaderLayout } from '../../lib/breakpoints';
import {
  appIdentityLine,
  deviceLabel,
  headerDevice,
  headerDot,
  type InspectorState,
  inspectorState,
} from '../../lib/device-state';
import { fitMirror } from '../../lib/mirror-fit';
import { mirrorKeyInput } from '../../lib/mirror-keys';
import { mirrorPoint } from '../../lib/mirror-point';
import {
  selectMirrorControl,
  selectMirrorControlError,
  selectMirrorError,
  selectMirrorHeight,
  selectMirrorStatus,
  selectMirrorWidth,
  selectSelectedId,
  useDeviceStore,
} from '../../stores/device.store';
import { selectMirrorWidth as selectBayWidth, useUiStore } from '../../stores/ui.store';
import styles from './DeviceMirror.module.css';

/** The gutter the mirror bay adds either side of the phone. */
const BAY_PADDING = 40;

/**
 * The device inspector: a live picture of the phone, and what the app under test
 * is doing on it.
 *
 * The bezel holds the device's own framebuffer now — H.264 over adb, decoded
 * here with WebCodecs (criterion 37). What stays from the layout shell is the
 * phone as an object: its bezel, its shadow and its own fixed palette, because a
 * real device does not repaint itself when Conductor switches to light mode.
 *
 * The mirror subscription is mounted here rather than in `App.tsx` (criterion
 * 41): it fires ~30 times a second, and it must stop when this panel does.
 */
export function DeviceMirror(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);

  useDeviceStream();
  useMirrorStream(canvas);

  const bayWidth = useUiStore(selectBayWidth);
  // Criterion 42: one field per subscription. Frames arrive continuously, and a
  // selector returning a fresh object would turn each of them into a re-render
  // of the whole window.
  const devices = useDeviceStore((state) => state.devices);
  const selectedId = useDeviceStore(selectSelectedId);
  const properties = useDeviceStore((state) => state.properties);
  const deviceError = useDeviceStore((state) => state.deviceError);
  const appIdentity = useDeviceStore((state) => state.appIdentity);
  const mirrorStatus = useDeviceStore(selectMirrorStatus);
  const mirrorWidth = useDeviceStore(selectMirrorWidth);
  const mirrorHeight = useDeviceStore(selectMirrorHeight);
  const mirrorError = useDeviceStore(selectMirrorError);
  const mirrorControl = useDeviceStore(selectMirrorControl);
  const mirrorControlError = useDeviceStore(selectMirrorControlError);
  const viewerOpening = useDeviceStore((state) => state.viewerOpening);
  const viewerError = useDeviceStore((state) => state.viewerError);
  const openViewer = useDeviceStore((state) => state.openViewer);
  const refresh = useDeviceStore((state) => state.refresh);
  const pick = useDeviceStore((state) => state.pick);
  const sendInput = useDeviceStore((state) => state.sendInput);

  const [headerRef, headerWidth] = useElementWidth(bayWidth);
  const [bayRef, bay] = useElementSize({ width: 0, height: 0 });

  const header = deviceHeaderLayout(headerWidth);
  // Criterion 33: the phone's logical size is the stream's own, and only the
  // scale changes. Before a stream lands, the placeholder phone keeps the bezel
  // from collapsing.
  const fit = fitMirror({
    bayWidth: bay.width,
    bayHeight: bay.height,
    maxWidth: bayWidth,
    deviceWidth: mirrorWidth ?? undefined,
    deviceHeight: mirrorHeight ?? undefined,
  });

  const device = headerDevice(devices, selectedId);
  const state = inspectorState({ devices, selectedId, deviceError, appIdentity, mirrorStatus });

  /**
   * Criterion 15. Control has no target unless a stream is actually up *and* the
   * session came with a channel to reach it on — a mirror that is starting, has
   * failed, or arrived without control is a picture and nothing more.
   */
  const drivable =
    mirrorStatus === 'streaming' && mirrorControl && mirrorWidth !== null && mirrorHeight !== null;

  /**
   * Criteria 6–9. A click becomes a device pixel, or nothing at all.
   *
   * `getBoundingClientRect` is read here rather than in `lib/`: it is the one
   * fact only the DOM has, and reading it at the moment of the click is what
   * makes the answer right during a rotation — the box follows the fit, and the
   * fit follows the stream.
   */
  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    // Criterion 10: the click is what gives the mirror the keyboard, and that
    // happens whether or not the click itself lands on the picture.
    event.currentTarget.focus();
    if (!drivable) {
      return;
    }

    const box = event.currentTarget.getBoundingClientRect();
    const point = mirrorPoint({
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
      scale: fit.scale,
      streamWidth: mirrorWidth,
      streamHeight: mirrorHeight,
    });
    // Criterion 8 — outside the drawn picture is the app, not the phone.
    if (point === null) {
      return;
    }

    sendInput({
      type: 'tap',
      x: point.x,
      y: point.y,
      // The size travels with the tap: scrcpy drops a touch that names any size
      // but the video's current one, and after a rotation this is the only side
      // that knows it.
      screenWidth: mirrorWidth,
      screenHeight: mirrorHeight,
    });
  };

  /**
   * Criteria 11–13. `mirrorKeyInput` decides whose key it is; `null` means it is
   * not the device's, and the event is left entirely alone — preventing the
   * default on a shortcut is how a focused mirror would stop the person quitting
   * the app.
   */
  const handleKeyDown = (event: KeyboardEvent<HTMLCanvasElement>): void => {
    if (!drivable) {
      return;
    }
    const input = mirrorKeyInput(event);
    if (input === null) {
      return;
    }
    event.preventDefault();
    sendInput(input);
  };
  const identity = appIdentityLine(appIdentity);
  const copy = stateCopy(state, {
    deviceMessage: deviceError?.message ?? '',
    mirrorMessage: mirrorError?.message ?? '',
    appId: appIdentity?.appId ?? '',
  });

  return (
    <section aria-label="Device" className={styles.panel} style={{ width: bayWidth + BAY_PADDING }}>
      <header className={styles.header} data-testid="device-header" ref={headerRef}>
        {header.label ? <span className={styles.caps}>Device</span> : null}
        <span className={styles.device}>
          {/* Criterion 39 — the real device, and the real session on it. */}
          <StatusDot data-testid="device-dot" size="md" state={headerDot(device, mirrorStatus)} />
          <span className={styles.serial}>{deviceLabel(device, properties)}</span>
        </span>
        {/* Criterion 40: the first thing to go as the panel narrows, and the
            serial beside it is the last — it truncates instead. */}
        {header.identity && identity !== null ? (
          <span className={styles.identity}>{identity}</span>
        ) : null}
        <span className={styles.spacer} />
        {/* Criteria 14–15. The device's own back action, in the same chrome as
            the tools beside it — and gone when there is no session to send it
            to, the way `Refresh` is gone when there is no room for it. */}
        {drivable ? (
          <IconButton
            icon="chevron-left"
            label="Back"
            onClick={() => {
              sendInput({ type: 'back' });
            }}
            size="sm"
          />
        ) : null}
        {header.tools ? (
          <IconButton icon="refresh-cw" label="Refresh" onClick={() => void refresh()} size="sm" />
        ) : null}
        {/* Inspect is the mode the whole window is in, so it never degrades. */}
        <IconButton icon="crosshair" label="Inspect" selected size="sm" />
      </header>

      <div className={styles.bayPad}>
        <div className={styles.bay} data-testid="mirror-bay" ref={bayRef}>
          {/* Reserves the footprint the scaled phone occupies, so the bay never
              overflows its column. */}
          <div
            className={styles.footprint}
            data-testid="phone-footprint"
            style={{ width: fit.outerWidth, height: fit.outerHeight }}
          >
            {/* Criterion 33: fitted by scale alone — the phone is an object of a
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
              <div className={styles.display}>
                {state === 'ready' ? (
                  /* Criterion 33 — the canvas carries the framebuffer's own
                     dimensions. Nothing rewrites them; the parent's transform is
                     the whole of the fitting.

                     Criterion 10 — and it is focusable now, because it is a
                     surface rather than a picture. Named, because a tab stop
                     that announces nothing is a trap: `aria-label` is what makes
                     it findable, and the tab order is what makes the keyboard
                     reach it at all. */
                  <canvas
                    aria-label="Device screen"
                    className={styles.screen}
                    data-testid="mirror-canvas"
                    height={fit.height}
                    onKeyDown={handleKeyDown}
                    onPointerDown={handlePointerDown}
                    ref={canvas}
                    tabIndex={0}
                    width={fit.width}
                  />
                ) : (
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
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Criterion 38 demoted the Viewer when the picture landed here. Tapping
          and typing have now followed it, so the only line left to say about the
          Viewer is that it is still there — the removal of this footer belongs
          to `device-hierarchy-capture`, which owns what happens to the `maestro
          mcp` session behind it. */}
      <footer className={styles.footer}>
        <button
          className={styles.viewer}
          disabled={selectedId === null || viewerOpening}
          onClick={() => void openViewer()}
          type="button"
        >
          {viewerOpening ? 'Starting Maestro…' : 'Open in Maestro Viewer'}
        </button>
        {/* Criterion 16. A control failure is reported here rather than over the
            phone: the picture is still arriving, and covering it would say the
            mirror had stopped when only the tap had. */}
        {viewerError !== null ? (
          <p className={styles.footerNote}>{viewerError.message}</p>
        ) : mirrorControlError !== null ? (
          <p className={styles.footerNote}>{mirrorControlError.message}</p>
        ) : (
          <p className={styles.footerNote}>The full view hierarchy still lives there.</p>
        )}
      </footer>
    </section>
  );
}

/**
 * Criterion 38 — one state, one thing said, one next action. The two failure
 * states read the message main sent rather than inventing their own: main is
 * the only layer that knows whether adb was missing or merely refused, or what
 * the device said when the server would not start.
 */
function stateCopy(
  state: InspectorState,
  detail: { deviceMessage: string; mirrorMessage: string; appId: string },
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
    case 'unsupported':
      return {
        title: 'This build cannot show the screen',
        body: 'The mirror needs WebCodecs, which this renderer does not have.',
      };
    case 'mirror-failed':
      return { title: 'The mirror stopped', body: detail.mirrorMessage };
    default:
      return { title: '', body: '' };
  }
}

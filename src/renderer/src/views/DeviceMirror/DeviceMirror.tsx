import type { JSX } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { IconButton } from '../../components/IconButton/IconButton';
import { StatusDot } from '../../components/StatusDot/StatusDot';
import { DEVICE } from '../../fixtures/flows';
import { useElementSize, useElementWidth } from '../../hooks/useElementWidth';
import { deviceHeaderLayout } from '../../lib/breakpoints';
import { fitMirror } from '../../lib/mirror-fit';
import { selectMirrorWidth, useUiStore } from '../../stores/ui.store';
import styles from './DeviceMirror.module.css';

/** The gutter the mirror bay adds either side of the phone (criterion 35). */
const BAY_PADDING = 40;

/**
 * The device inspector (criteria 35–43): a header that degrades in priority
 * order over a bay holding the phone.
 *
 * The phone is the one physical object in the window. It keeps its own drop
 * shadow and its own fixed chrome — a real device does not repaint itself when
 * Conductor switches to light mode.
 */
export function DeviceMirror(): JSX.Element {
  const mirrorWidth = useUiStore(selectMirrorWidth);
  const running = useUiStore((state) => state.running);
  const [headerRef, headerWidth] = useElementWidth(mirrorWidth);
  const [bayRef, bay] = useElementSize({ width: 0, height: 0 });

  const header = deviceHeaderLayout(headerWidth);
  const fit = fitMirror({ bayWidth: bay.width, bayHeight: bay.height, maxWidth: mirrorWidth });

  return (
    <section
      aria-label="Device"
      className={styles.panel}
      style={{ width: mirrorWidth + BAY_PADDING }}
    >
      <header className={styles.header} data-testid="device-header" ref={headerRef}>
        {header.label ? <span className={styles.caps}>Device</span> : null}
        <span className={styles.device}>
          <StatusDot size="md" state={running ? 'running' : DEVICE.state} />
          <span className={styles.serial}>{DEVICE.serial}</span>
        </span>
        <span className={styles.spacer} />
        {header.tools ? (
          <>
            <IconButton icon="refresh-cw" label="Reload mirror" size="sm" />
            <IconButton icon="camera" label="Screenshot" size="sm" />
          </>
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
            {/* Criterion 39: fitted by scale alone — the logical size is fixed,
                because a mirror shows the device's pixels, not a reflow. */}
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
                <div className={styles.statusBar}>
                  <span>12:29</span>
                  <span className={styles.statusIcons}>
                    <Icon name="wifi" size={11} />
                    <Icon name="battery-medium" size={13} />
                  </span>
                </div>

                {/* Empty on purpose: this spec has no adb and no frames. */}
                <div className={styles.screen}>
                  <p className={styles.screenTitle}>No device connected</p>
                  <p className={styles.screenBody}>
                    Conductor talks to Android over adb. Plug in a phone or start an emulator.
                  </p>
                </div>

                <div className={styles.navBar}>
                  <Icon name="chevron-left" size={15} />
                  <span className={styles.navCircle} />
                  <span className={styles.navSquare} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

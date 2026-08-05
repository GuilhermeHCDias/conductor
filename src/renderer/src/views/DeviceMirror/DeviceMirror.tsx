import type { MirrorInput } from '@shared/ipc';
import type { TreeNode } from '@shared/types';
import {
  type JSX,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu/ContextMenu';
import { Dialog } from '../../components/Dialog/Dialog';
import { ACTION_ICONS } from '../../components/Icon/Icon';
import { IconButton } from '../../components/IconButton/IconButton';
import { StatusDot } from '../../components/StatusDot/StatusDot';
import { useDeviceStream } from '../../hooks/useDeviceStream';
import { useElementSize, useElementWidth } from '../../hooks/useElementWidth';
import { useInspectSnapshot } from '../../hooks/useInspectSnapshot';
import { useMirrorStream } from '../../hooks/useMirrorStream';
import { deviceHeaderLayout } from '../../lib/breakpoints';
import {
  COMMAND_GROUPS,
  commandStep,
  inputTextSteps,
  type MenuCommand,
} from '../../lib/command-templates';
import {
  appIdentityLine,
  deviceLabel,
  headerDevice,
  headerDot,
  type InspectorState,
  inspectorState,
} from '../../lib/device-state';
import { elementLabel } from '../../lib/element-label';
import {
  hitTest,
  nodeAt,
  nodeStreamCenter,
  nodeStreamRect,
  pointToHierarchy,
  retargetToParent,
  type SnapshotGeometry,
} from '../../lib/hit-test';
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
import { useFlowStore } from '../../stores/flow.store';
import {
  selectCaptureError,
  selectCapturing,
  selectDialog,
  selectHoveredPath,
  selectMenu,
  selectSnapshot,
  selectSynthError,
  useInspectStore,
} from '../../stores/inspect.store';
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
 * 41): it fires ~60 times a second, and it must stop when this panel does.
 *
 * The Viewer control that used to sit under the bay is gone (criterion 23). It
 * survived the mirror spec because it still offered *interaction*; the
 * `maestro mcp` child behind it answers `inspect_screen` now, nothing in the
 * app opens a viewer URL, and interaction arrived on the mirror itself with the
 * control-socket spec.
 */
export function DeviceMirror(): JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);

  useDeviceStream();
  useMirrorStream(canvas);
  useInspectSnapshot();

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
  const refresh = useDeviceStore((state) => state.refresh);
  const pick = useDeviceStore((state) => state.pick);
  const sendInput = useDeviceStore((state) => state.sendInput);

  const snapshot = useInspectStore(selectSnapshot);
  const capturing = useInspectStore(selectCapturing);
  const captureError = useInspectStore(selectCaptureError);
  const hoveredPath = useInspectStore(selectHoveredPath);
  const menu = useInspectStore(selectMenu);
  const synthError = useInspectStore(selectSynthError);
  const dialog = useInspectStore(selectDialog);
  const hover = useInspectStore((state) => state.hover);
  const openMenu = useInspectStore((state) => state.openMenu);
  const closeMenu = useInspectStore((state) => state.closeMenu);
  const openDialog = useInspectStore((state) => state.openDialog);
  const closeDialog = useInspectStore((state) => state.closeDialog);
  const refreshSnapshot = useInspectStore((state) => state.refresh);
  const appendStep = useFlowStore((state) => state.appendStep);

  /** Criterion 11 — Alt retargets the hover to the parent while held. */
  const [altHeld, setAltHeld] = useState(false);
  /** Where the pointer last was, in canvas CSS px — so an Alt press with the
   * pointer still re-aims the hover without waiting for a move. */
  const lastPointer = useRef<{ offsetX: number; offsetY: number } | null>(null);

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
   * Criterion 46's precondition, gathered once: the whole coordinate chain,
   * live only while a stream *and* a snapshot are up. Inspection deliberately
   * does not require control (criterion 44) — hovering and the menu keep
   * working over a picture that cannot be driven.
   */
  const inspectGeometry = useMemo<SnapshotGeometry | null>(
    () =>
      mirrorStatus === 'streaming' &&
      snapshot !== null &&
      mirrorWidth !== null &&
      mirrorHeight !== null
        ? {
            fitScale: fit.scale,
            streamWidth: mirrorWidth,
            streamHeight: mirrorHeight,
            screenshotWidth: snapshot.screenshotWidth,
            screenshotHeight: snapshot.screenshotHeight,
            scale: snapshot.scale,
          }
        : null,
    [mirrorStatus, snapshot, mirrorWidth, mirrorHeight, fit.scale],
  );
  const inspecting = inspectGeometry !== null;
  /** Criterion 26 — while the menu or the prompt is open, the mirror takes no
   * pointer and no keyboard. */
  const suppressed = menu !== null || dialog !== null;

  /** The §5.5 hover: hit-test locally, zero IPC (criterion 46). */
  const aim = useCallback(
    (offsetX: number, offsetY: number, parent: boolean): void => {
      if (inspectGeometry === null || snapshot === null) {
        return;
      }
      const point = pointToHierarchy(offsetX, offsetY, inspectGeometry);
      const hit = point === null ? null : hitTest(snapshot.tree, point);
      hover(hit !== null && parent ? retargetToParent(snapshot.tree, hit) : hit);
    },
    [inspectGeometry, snapshot, hover],
  );

  // Alt tracked at the window: the canvas holds focus only after a click, and
  // the retarget must work mid-hover. Releasing returns to the node itself.
  useEffect(() => {
    if (!inspecting) {
      return;
    }
    const track = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Alt') {
        setAltHeld(event.type === 'keydown');
      }
    };
    window.addEventListener('keydown', track);
    window.addEventListener('keyup', track);
    return () => {
      window.removeEventListener('keydown', track);
      window.removeEventListener('keyup', track);
      setAltHeld(false);
    };
  }, [inspecting]);

  // Re-aim the standing pointer when Alt toggles — and when a fresh snapshot
  // rebuilds `aim`: the capture nulled the hover, and the pointer is still
  // over an element of the new tree.
  useEffect(() => {
    const standing = lastPointer.current;
    if (standing !== null) {
      aim(standing.offsetX, standing.offsetY, altHeld);
    }
  }, [altHeld, aim]);

  /**
   * Criteria 6–9. A click becomes a device pixel, or nothing at all.
   *
   * `getBoundingClientRect` is read here rather than in `lib/`: it is the one
   * fact only the DOM has, and reading it at the moment of the click is what
   * makes the answer right during a rotation — the box follows the fit, and the
   * fit follows the stream.
   */
  const handlePointerDown = (event: PointerEvent<HTMLCanvasElement>): void => {
    // Criterion 26 — the menu owns the pointer while it is open.
    if (suppressed) {
      return;
    }
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
    if (suppressed || !drivable) {
      return;
    }
    const input = mirrorKeyInput(event);
    if (input === null) {
      return;
    }
    event.preventDefault();
    sendInput(input);
  };

  /** §5.5's fast half: hover hit-tests locally against the frozen snapshot —
   * zero IPC and zero process work per mousemove (criterion 46). */
  const handlePointerMove = (event: PointerEvent<HTMLCanvasElement>): void => {
    if (suppressed || !inspecting) {
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    const offsetX = event.clientX - box.left;
    const offsetY = event.clientY - box.top;
    lastPointer.current = { offsetX, offsetY };
    aim(offsetX, offsetY, altHeld);
  };

  /** Criterion 15 — off the canvas, the highlight goes. */
  const handlePointerLeave = (): void => {
    lastPointer.current = null;
    hover(null);
  };

  /**
   * Criterion 23 — the right-click asks main to synthesise and opens the menu.
   * The store waits out any capture in flight and re-hits this same point
   * against the fresh tree (criterion 29), so the raw offsets travel, not the
   * hovered path.
   */
  const handleContextMenu = (event: MouseEvent<HTMLCanvasElement>): void => {
    event.preventDefault();
    if (suppressed || inspectGeometry === null || selectedId === null) {
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    void openMenu({
      deviceId: selectedId,
      clientX: event.clientX,
      clientY: event.clientY,
      offsetX: event.clientX - box.left,
      offsetY: event.clientY - box.top,
      fitScale: fit.scale,
      streamWidth: inspectGeometry.streamWidth,
      streamHeight: inspectGeometry.streamHeight,
      altParent: altHeld,
    });
  };

  /** The element a menu or dialog is about — resolved from the same tree the
   * path was hit in. */
  const nodeFor = (path: readonly number[] | null): TreeNode | null =>
    path === null || snapshot === null ? null : nodeAt(snapshot.tree, path);

  /** Criterion 40 — the gesture lands at the element's centre, in stream
   * coordinates, through the same ordered queue as every input. */
  const executeAt = (node: TreeNode | null, type: 'tap' | 'double-tap' | 'long-press'): void => {
    if (node?.bounds == null || inspectGeometry === null) {
      return;
    }
    const centre = nodeStreamCenter(node.bounds, inspectGeometry);
    if (centre === null) {
      return;
    }
    const input: MirrorInput = {
      type,
      x: centre.x,
      y: centre.y,
      screenWidth: inspectGeometry.streamWidth,
      screenHeight: inspectGeometry.streamHeight,
    };
    sendInput(input);
  };

  const GESTURES = { tapOn: 'tap', doubleTapOn: 'double-tap', longPressOn: 'long-press' } as const;

  /**
   * Criteria 37, 40–42. The step is the artifact and the gesture a convenience
   * (criterion 43): the append always happens first, and `sendInput` already
   * refuses quietly when there is no control channel (criterion 44).
   */
  const handleCommand = (id: string): void => {
    if (menu === null) {
      return;
    }
    const command = id as MenuCommand;
    if (command === 'inputText') {
      // Criterion 41 — the step needs the text; the dialog collects it.
      openDialog();
      return;
    }
    appendStep(commandStep(command, menu.selector.selector));
    if (command in GESTURES) {
      executeAt(nodeFor(menu.path), GESTURES[command as keyof typeof GESTURES]);
    }
    closeMenu();
  };

  /** Criterion 41 — the pair is born complete, the focusing tap goes out, and
   * the text rides the socket's existing ordered queue behind it. */
  const handleInputText = (text: string): void => {
    if (dialog === null) {
      return;
    }
    appendStep(inputTextSteps(dialog.selector.selector, text));
    executeAt(nodeFor(dialog.path), 'tap');
    sendInput({ type: 'text', text });
    closeDialog();
  };
  const identity = appIdentityLine(appIdentity);
  const copy = stateCopy(state, {
    deviceMessage: deviceError?.message ?? '',
    mirrorMessage: mirrorError?.message ?? '',
    appId: appIdentity?.appId ?? '',
  });

  const hoveredNode = nodeFor(hoveredPath);
  const highlight =
    hoveredNode !== null && hoveredNode.bounds !== null && inspectGeometry !== null
      ? nodeStreamRect(hoveredNode.bounds, inspectGeometry)
      : null;
  const menuNode = nodeFor(menu?.path ?? null);
  const dialogNode = nodeFor(dialog?.path ?? null);

  return (
    <section
      aria-label="Device"
      className={styles.panel}
      // Criterion 25 — the browser's own context menu never appears anywhere
      // on the mirror; ours opens from the canvas handler alone.
      onContextMenu={(event) => {
        event.preventDefault();
      }}
      style={{ width: bayWidth + BAY_PADDING }}
    >
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
        {/* Criterion 21 — the snapshot's manual refresh, beside the mode it
            serves. Present whenever there is a stream to photograph. */}
        {mirrorStatus === 'streaming' && selectedId !== null ? (
          <IconButton
            icon="rotate-cw"
            label="Refresh snapshot"
            onClick={() => {
              refreshSnapshot(selectedId);
            }}
            size="sm"
          />
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
                  <>
                    <canvas
                      aria-label="Device screen"
                      className={styles.screen}
                      data-inspect={inspecting ? 'true' : undefined}
                      data-testid="mirror-canvas"
                      height={fit.height}
                      onContextMenu={handleContextMenu}
                      onKeyDown={handleKeyDown}
                      onPointerDown={handlePointerDown}
                      onPointerLeave={handlePointerLeave}
                      onPointerMove={handlePointerMove}
                      ref={canvas}
                      tabIndex={0}
                      width={fit.width}
                    />
                    {/* Criteria 13–14 — the DS highlight, positioned in the
                        canvas's own pre-transform space (stream px): the
                        phone's transform scales it with the picture. The label
                        is the tree's, literally — never read off pixels. */}
                    {highlight !== null && hoveredNode !== null ? (
                      <div
                        className={styles.highlight}
                        data-testid="inspect-highlight"
                        style={{
                          left: highlight.x,
                          top: highlight.y,
                          width: highlight.width,
                          height: highlight.height,
                        }}
                      >
                        <span className={styles.highlightLabel}>{elementLabel(hoveredNode)}</span>
                      </div>
                    ) : null}
                    {/* Criterion 16 — a recapture in flight is shown, not
                        hidden: hover keeps answering from the previous
                        snapshot until the new one lands. */}
                    {capturing ? (
                      <span className={styles.staleChip} data-testid="stale-chip">
                        Updating…
                      </span>
                    ) : null}
                  </>
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

      {/* Criterion 16 of the control-socket spec, which reported this from
          inside the Viewer footer. That footer is gone (criterion 23), but the
          reason it reported here has not changed: the picture is still
          arriving, and saying so over the phone would claim the mirror had
          stopped when only the tap had. So the note outlives its container, and
          appears only when there is something to say. */}
      {mirrorControlError !== null ? (
        <p className={styles.controlNote}>{mirrorControlError.message}</p>
      ) : null}

      {/* Criterion 17 — a capture that failed says so beside the picture,
          which it never touches, and offers the retry. */}
      {captureError !== null ? (
        <p className={styles.controlNote}>
          {`The screen could not be inspected. ${captureError.message} `}
          {selectedId !== null ? (
            <button
              className={styles.noteAction}
              onClick={() => {
                refreshSnapshot(selectedId);
              }}
              type="button"
            >
              Retry
            </button>
          ) : null}
        </p>
      ) : null}

      {/* Criterion 28 — synthesis refused: no menu opened, nothing written,
          and the reason said out loud. */}
      {synthError !== null ? <p className={styles.controlNote}>{synthError.message}</p> : null}

      {menu !== null ? (
        <ContextMenu
          items={MENU_ITEMS}
          onClose={closeMenu}
          onSelect={handleCommand}
          title={menuNode === null ? undefined : elementLabel(menuNode)}
          warning={menu.selector.fragile ? FRAGILE_WARNING : undefined}
          x={menu.x}
          y={menu.y}
        />
      ) : null}

      {dialog !== null ? (
        <InputTextDialog
          label={dialogNode === null ? null : elementLabel(dialogNode)}
          onCancel={closeDialog}
          onConfirm={handleInputText}
        />
      ) : null}
    </section>
  );
}

/** Criterion 24 — the four groups with the exact YAML keywords, mono, each
 * under its DS glyph. Static, so the menu never rebuilds it. */
const MENU_ITEMS: readonly ContextMenuItem[] = COMMAND_GROUPS.flatMap((group, index) => [
  ...(index > 0 ? [{ type: 'separator' } as const] : []),
  { type: 'label', label: group.label } as const,
  ...group.commands.map(
    (command) =>
      ({
        type: 'command',
        id: command,
        label: command,
        icon: ACTION_ICONS[command],
        mono: true,
      }) as const,
  ),
]);

/** Criterion 27 — §5.4 makes warning about a `point:` selector mandatory. */
const FRAGILE_WARNING = 'Position-based selector — this step is fragile.';

/**
 * Criterion 41 — the `inputText` prompt. The step is born complete: no empty
 * confirm, Cancel writes and executes nothing.
 */
function InputTextDialog({
  label,
  onCancel,
  onConfirm,
}: {
  readonly label: string | null;
  readonly onCancel: () => void;
  readonly onConfirm: (text: string) => void;
}): JSX.Element {
  const [text, setText] = useState('');
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
  }, []);

  return (
    <Dialog
      footer={
        <>
          <button className={styles.dialogGhost} onClick={onCancel} type="button">
            Cancel
          </button>
          <button
            className={styles.dialogPrimary}
            disabled={text === ''}
            onClick={() => {
              onConfirm(text);
            }}
            type="button"
          >
            Insert
          </button>
        </>
      }
      icon="text-cursor-input"
      onClose={onCancel}
      subtitle={label === null ? undefined : `Types into ${label}.`}
      title="Input text"
    >
      <input
        aria-label="Text to type"
        className={styles.dialogInput}
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && text !== '') {
            onConfirm(text);
          }
        }}
        ref={input}
        value={text}
      />
    </Dialog>
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

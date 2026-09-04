import { type JSX, type PointerEvent, useState } from 'react';
import styles from './ResizeHandle.module.css';

/**
 * The divider between two panes, as a real separator: draggable with the
 * pointer, focusable, and movable on the arrow keys — a splitter the keyboard
 * cannot reach is a size only mouse users get to choose.
 *
 * Presentational, like everything in `components/`: it owns the gesture's
 * mechanics — the capture that keeps a drag alive once the pointer leaves the
 * few pixels it started on — and reports where the pointer is. What that means
 * in the layout is the view's arithmetic, not this file's.
 */
export type ResizeHandleProps = {
  readonly label: string;
  /** 0–1, for `aria-valuenow` — what a screen reader reads off the divider. */
  readonly value: number;
  /** Where the pointer is now, in client coordinates. */
  readonly onDrag: (pointerY: number) => void;
  /** The pointer let go — where the drag left the divider is final now. */
  readonly onDragEnd: () => void;
  /** Home and End: all the way to the top pane's limit, or the bottom's. */
  readonly onJump: (edge: 'start' | 'end') => void;
  /** One arrow press: -1 towards the top pane, 1 towards the bottom one. */
  readonly onStep: (direction: -1 | 1) => void;
  /** Double click, or Enter — the way back to the layout's own proportions. */
  readonly onReset: () => void;
};

export function ResizeHandle({
  label,
  value,
  onDrag,
  onDragEnd,
  onStep,
  onJump,
  onReset,
}: ResizeHandleProps): JSX.Element {
  const [dragging, setDragging] = useState(false);

  const start = (event: PointerEvent<HTMLHRElement>): void => {
    // Without the capture the drag dies the moment the pointer leaves the
    // hairline, which is immediately. jsdom implements neither call.
    event.currentTarget.setPointerCapture?.(event.pointerId);
    setDragging(true);
  };

  const end = (event: PointerEvent<HTMLHRElement>): void => {
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    if (dragging) {
      setDragging(false);
      onDragEnd();
    }
  };

  return (
    <hr
      aria-label={label}
      aria-orientation="horizontal"
      aria-valuemax={100}
      aria-valuemin={0}
      aria-valuenow={Math.round(value * 100)}
      className={styles.handle}
      data-dragging={dragging ? 'true' : undefined}
      data-testid="resize-handle"
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        // The window scrolls on the arrows, Home and End otherwise, which is
        // the opposite of what someone aiming a divider asked for.
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          event.preventDefault();
          onStep(event.key === 'ArrowUp' ? -1 : 1);
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          onJump(event.key === 'Home' ? 'start' : 'end');
        } else if (event.key === 'Enter') {
          onReset();
        }
      }}
      onLostPointerCapture={() => {
        if (dragging) {
          setDragging(false);
          onDragEnd();
        }
      }}
      onPointerCancel={end}
      onPointerDown={start}
      onPointerMove={(event) => {
        if (dragging) {
          onDrag(event.clientY);
        }
      }}
      onPointerUp={end}
      tabIndex={0}
    />
  );
}

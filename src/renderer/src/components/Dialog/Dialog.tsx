import { type JSX, type ReactNode, useEffect, useId } from 'react';
import { Icon, type IconName } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import styles from './Dialog.module.css';

/**
 * The modal layer, ported from the design system's `surface/Dialog`. Dialogs
 * blur heavier than any other layer — that is how depth is read. Rendered
 * means open; the backdrop, Escape and the close control all leave through
 * `onClose`, and the footer carries whatever actions the caller composes.
 */

export type DialogProps = {
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: IconName;
  readonly onClose: () => void;
  readonly children?: ReactNode;
  readonly footer?: ReactNode;
};

export function Dialog({
  title,
  subtitle,
  icon,
  onClose,
  children,
  footer,
}: DialogProps): JSX.Element {
  const titleId = useId();

  // Window-wide, because the dialog is modal: Escape must work wherever focus
  // happens to be, not only when it sits inside the panel.
  useEffect(() => {
    const handleKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  return (
    <div className={styles.backdrop}>
      {/* Its own element under the panel rather than a handler on the layer,
          so a click inside the dialog can never read as a dismissal. */}
      <button
        aria-label="Dismiss"
        className={styles.scrim}
        data-testid="dialog-backdrop"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <div aria-labelledby={titleId} aria-modal="true" className={styles.panel} role="dialog">
        <div className={styles.header}>
          {icon !== undefined ? (
            <span className={styles.badge}>
              <Icon name={icon} size={16} />
            </span>
          ) : null}
          <div className={styles.heading}>
            <h2 className={styles.title} id={titleId}>
              {title}
            </h2>
            {subtitle !== undefined ? <p className={styles.subtitle}>{subtitle}</p> : null}
          </div>
          <IconButton icon="x" label="Close" onClick={onClose} size="sm" />
        </div>
        {children !== undefined && children !== null ? (
          <div className={styles.body}>{children}</div>
        ) : null}
        {footer !== undefined && footer !== null ? (
          <div className={styles.footer}>{footer}</div>
        ) : null}
      </div>
    </div>
  );
}

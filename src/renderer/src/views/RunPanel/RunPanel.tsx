import type { JSX } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { StatusDot } from '../../components/StatusDot/StatusDot';
import { useUiStore } from '../../stores/ui.store';
import styles from './RunPanel.module.css';

/**
 * The run report (criteria 31–32). Nothing in this spec produces a step, so the
 * fixture list is empty and the empty state is what the window opens on.
 */
export function RunPanel(): JSX.Element {
  const steps = useUiStore((state) => state.steps);

  if (steps.length === 0) {
    return (
      <div className={styles.empty}>
        <Icon className={styles.emptyGlyph} name="play" size={18} />
        <p className={styles.emptyText}>Run the flow and every step reports here as it executes.</p>
      </div>
    );
  }

  return (
    <ol className={styles.steps}>
      {steps.map((step) => (
        <li className={styles.step} key={step.id}>
          <span aria-hidden="true" className={styles.connector} data-testid="step-connector" />
          <span className={styles.dotWell}>
            <StatusDot
              className={styles.dot}
              data-testid="step-dot"
              size={step.status === 'running' ? 'lg' : 'sm'}
              state={step.status}
            />
          </span>
          <span className={styles.label}>{step.label}</span>
          <span className={styles.duration} data-testid="step-duration">
            {step.duration}
          </span>
        </li>
      ))}
    </ol>
  );
}

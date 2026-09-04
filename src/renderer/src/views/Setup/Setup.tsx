import type { JSX } from 'react';
import icon from '../../../../../build/icon.png';
import { Icon } from '../../components/Icon/Icon';
import { useDoctorStore } from '../../stores/doctor.store';
import styles from './Setup.module.css';

/**
 * The first-run installer (doctor criteria 14, 19, 21–24), the kit's
 * `CDoctorInstaller`: the whole 520 × 360 window while Conductor puts its
 * own Maestro on the machine. One bar, one step label, a percentage, and no
 * log — the person did not ask for this and cannot help with it. Every
 * number here arrived as a `doctor:install-event` (criterion 22); the view
 * holds no timer. The mark is the real Conductor icon, as Connect's is.
 */
export function Setup(): JSX.Element {
  const reason = useDoctorStore((state) => state.setup.reason);
  const version = useDoctorStore((state) => state.version);
  const install = useDoctorStore((state) => state.install);
  const installed = useDoctorStore((state) => state.installed);
  const installMaestro = useDoctorStore((state) => state.installMaestro);
  const skipSetup = useDoctorStore((state) => state.skipSetup);

  const failed = install !== null && 'failed' in install ? install.failed : null;
  const progress = install !== null && 'pct' in install ? install : null;
  const done = installed !== null && progress === null && failed === null;
  const pct = done ? 100 : Math.round(progress?.pct ?? 0);
  const update = reason === 'update';

  return (
    <section aria-label="Setup" className={styles.setup}>
      {/* The traffic lights sit over this strip; it is what drags the window. */}
      <div aria-hidden="true" className={styles.drag} data-testid="setup-drag" />
      <div className={styles.body}>
        <img alt="" className={styles.mark} data-testid="setup-mark" src={icon} />
        <h1 className={styles.title}>{update ? 'Updating Maestro' : 'Setting up Conductor'}</h1>
        <p className={styles.copy}>
          {update
            ? `Conductor's test runner is moving to ${version}. This happens once.`
            : 'Installing Maestro, the runner behind every test. This happens once.'}
        </p>

        <div
          aria-label="Installing Maestro"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={pct}
          className={styles.track}
          data-done={done ? 'true' : undefined}
          role="progressbar"
        >
          <div className={styles.fill} style={{ width: `${pct}%` }} />
        </div>

        {failed === null ? (
          <div className={styles.line}>
            {done ? (
              <Icon className={styles.check} data-testid="setup-check" name="check" size={13} />
            ) : null}
            <span className={styles.step} data-done={done ? 'true' : undefined}>
              {done ? `maestro ${installed?.version} is ready` : (progress?.step ?? '')}
            </span>
            <span className={styles.pct}>{pct}%</span>
          </div>
        ) : (
          <>
            {/* Criterion 23 — the sentence, never the raw cause; that lives on
                the doctor sheet's maestro row. */}
            <p className={styles.failure} role="alert">
              {failed.message}
            </p>
            <div className={styles.actions}>
              <button
                className={styles.ghost}
                onClick={() => {
                  void skipSetup();
                }}
                type="button"
              >
                Continue without Maestro
              </button>
              <button
                className={styles.primary}
                onClick={() => {
                  void installMaestro();
                }}
                type="button"
              >
                Try again
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

import type { Response } from '@shared/ipc';
import { type JSX, useEffect, useState } from 'react';
import styles from './App.module.css';

type AppInfo = Response<'app:info'>;
type AppConfig = Response<'config:get'>;

type Shell =
  | { status: 'loading' }
  | { status: 'failed'; message: string }
  | { status: 'ready'; info: AppInfo; config: AppConfig };

function factsOf(info: AppInfo, config: AppConfig): ReadonlyArray<readonly [string, string]> {
  return [
    ['App under test', config.APP_ID],
    ['Flows directory', config.FLOWS_DIR],
    ['Base branch', config.REPO_BASE_BRANCH],
    ['Conductor', info.appVersion],
    ['Electron', info.electronVersion],
    ['Chromium', info.chromeVersion],
    ['Node', info.nodeVersion],
    ['Platform', info.platform],
  ];
}

/** Placeholder shell. It exists to prove the renderer → preload → main → back
 * round-trip works; the §9.2 views replace it, each with its own spec. */
export function App(): JSX.Element {
  const [shell, setShell] = useState<Shell>({ status: 'loading' });

  useEffect(() => {
    let active = true;

    void (async () => {
      try {
        const [info, config] = await Promise.all([
          window.conductor.appInfo(),
          window.conductor.configGet(),
        ]);
        if (!active) {
          return;
        }
        if (!info.ok) {
          setShell({ status: 'failed', message: info.error.message });
          return;
        }
        if (!config.ok) {
          setShell({ status: 'failed', message: config.error.message });
          return;
        }
        setShell({ status: 'ready', info: info.data, config: config.data });
      } catch (error) {
        // A failure that is not a `Result`: the bridge itself is missing or the
        // invoke rejected. Proving the round-trip is this shell's whole job, so
        // it has to say so rather than sit on "Loading…" forever.
        if (active) {
          setShell({
            status: 'failed',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    })();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <h1 className={styles.title}>Conductor</h1>
        <p className={styles.tagline}>Maestro flows, authored by anyone.</p>
      </header>

      {shell.status === 'loading' && <p className={styles.status}>Loading…</p>}

      {shell.status === 'failed' && (
        <p className={styles.error} role="alert">
          {shell.message}
        </p>
      )}

      {shell.status === 'ready' && (
        <dl className={styles.facts}>
          {factsOf(shell.info, shell.config).map(([label, value]) => (
            <div className={styles.fact} key={label}>
              <dt className={styles.factLabel}>{label}</dt>
              <dd className={styles.factValue}>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}

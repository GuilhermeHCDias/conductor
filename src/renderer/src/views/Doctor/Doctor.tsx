import type { DoctorRow, DoctorRowStatus } from '@shared/ipc';
import type { JSX } from 'react';
import { Dialog } from '../../components/Dialog/Dialog';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { checkedAtLabel } from '../../lib/checked-at';
import { selectInstallable, splitRows, useDoctorStore } from '../../stores/doctor.store';
import styles from './Doctor.module.css';

/**
 * The diagnostic sheet (doctor criteria 25–32), the kit's `CDoctorSheetB`
 * over the app's `Dialog` so the scrim covers the toolbar: the verdict
 * first, then one table ordered by who has to act — Needs you above Ready —
 * and one line of ownership under it. It reports and steps back: the one
 * per-row action is Install on the maestro row, because that is the one
 * thing Conductor does itself. Detail lines are machine register on purpose
 * — the exact string the CLI printed — and nothing here says Git (§12.24).
 */

/** The kit's glyph per state. */
const STATES: Record<DoctorRowStatus, IconName> = {
  ok: 'circle-check',
  warn: 'circle-alert',
  fail: 'circle-x',
};

const FOOTNOTE =
  'Maestro is the only one Conductor installs and updates by itself. The rest live on your machine, and signing in is always yours to do.';

/** One stable "no rows" — a fresh array per select would re-render forever. */
const NO_ROWS: readonly DoctorRow[] = [];

export function Doctor(): JSX.Element | null {
  const sheetOpen = useDoctorStore((state) => state.sheetOpen);
  const checkedAt = useDoctorStore((state) => state.report?.checkedAt ?? null);
  const issues = useDoctorStore((state) => state.report?.issues ?? 0);
  const checking = useDoctorStore((state) => state.checking);
  // The rows reference is main's — stable between reports — and the split
  // is eight rows, cheaper than a memo (criterion 28).
  const rows = useDoctorStore((state) => state.report?.rows ?? NO_ROWS);
  const installable = useDoctorStore(selectInstallable);
  const install = useDoctorStore((state) => state.install);
  const closeSheet = useDoctorStore((state) => state.closeSheet);
  const check = useDoctorStore((state) => state.check);
  const installMaestro = useDoctorStore((state) => state.installMaestro);

  if (!sheetOpen) {
    return null;
  }

  const installing = install !== null && 'pct' in install ? install : null;
  const { needsYou, ready } = splitRows(rows);

  return (
    <Dialog
      aside={checkedAtLabel(checkedAt)}
      footer={
        <>
          <button
            className={styles.ghost}
            disabled={checking}
            onClick={() => {
              void check();
            }}
            type="button"
          >
            <Icon name="refresh-cw" size={13} />
            Check again
          </button>
          <button className={styles.primary} onClick={closeSheet} type="button">
            Done
          </button>
        </>
      }
      onClose={closeSheet}
      title="Doctor"
      width={560}
    >
      {/* Criterion 27 — the verdict, before the evidence. */}
      <div
        className={styles.verdict}
        data-testid="doctor-verdict"
        data-verdict={issues === 0 ? 'ready' : 'issues'}
      >
        <Icon
          className={styles.verdictGlyph}
          name={issues === 0 ? 'circle-check' : 'triangle-alert'}
          size={19}
        />
        <span className={styles.verdictText}>
          <span className={styles.verdictTitle}>
            {issues === 0
              ? 'Everything is ready'
              : issues === 1
                ? '1 thing needs you'
                : `${issues} things need you`}
          </span>
          <span className={styles.verdictBody}>
            {issues === 0
              ? 'Conductor has what it needs on this Mac.'
              : 'Conductor runs without them, and cannot install or sign in on your behalf.'}
          </span>
        </span>
      </div>

      {/* Criterion 28 — one table, Needs you above Ready. */}
      <div className={styles.table}>
        {needsYou.length > 0 ? (
          <Section label="Needs you">
            {needsYou.map((row) => (
              <Row
                full
                installable={installable && row.id === 'maestro'}
                installing={row.id === 'maestro' ? installing : null}
                key={row.id}
                onInstall={() => {
                  void installMaestro();
                }}
                row={row}
              />
            ))}
          </Section>
        ) : null}
        <Section label="Ready">
          {ready.map((row) => (
            <Row installable={false} installing={null} key={row.id} row={row} />
          ))}
        </Section>
      </div>
      {/* Criterion 29. */}
      <p className={styles.footnote}>{FOOTNOTE}</p>
    </Dialog>
  );
}

function Section({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}): JSX.Element {
  return (
    <>
      <div aria-hidden="true" className={styles.sectionLabel}>
        {label}
      </div>
      <ul aria-label={label} className={styles.rows}>
        {children}
      </ul>
    </>
  );
}

/**
 * One row: glyph, name, the mono line — the full `detail` where a person
 * has to read it, the `short` where nothing is wrong — and one word of state.
 * The maestro row alone may carry Install (criterion 31), and reads
 * Installing with the step and percentage while the pipeline runs.
 */
function Row({
  row,
  full = false,
  installable,
  installing,
  onInstall,
}: {
  readonly row: DoctorRow;
  readonly full?: boolean;
  readonly installable: boolean;
  readonly installing: { readonly pct: number; readonly step: string } | null;
  readonly onInstall?: () => void;
}): JSX.Element {
  const label = installing === null ? row.label : 'Installing';
  const mono =
    installing === null
      ? full
        ? row.detail
        : row.short
      : `${installing.step} · ${Math.round(installing.pct)}%`;
  return (
    <li aria-label={row.name} className={styles.row} data-row={row.id} data-status={row.status}>
      <Icon className={styles.glyph} name={STATES[row.status]} size={15} />
      <span className={styles.text}>
        <span className={styles.name}>{row.name}</span>
        <span className={styles.mono}>{mono}</span>
      </span>
      <span className={styles.label}>{label}</span>
      {installable && installing === null ? (
        <button className={styles.install} onClick={onInstall} type="button">
          Install
        </button>
      ) : null}
    </li>
  );
}

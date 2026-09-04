import type { DoctorRow, DoctorRowStatus, ToolId } from '@shared/ipc';
import type { JSX } from 'react';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { Dialog } from '../../components/Dialog/Dialog';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { SignInCard } from '../../components/SignInCard/SignInCard';
import { checkedAtLabel } from '../../lib/checked-at';
import {
  installableTools,
  selectSignInPending,
  splitRows,
  useDoctorStore,
} from '../../stores/doctor.store';
import styles from './Doctor.module.css';

/**
 * The diagnostic sheet (doctor criteria 25–32, managed-tools 42–45), the
 * kit's `CDoctorSheetB` over the app's `Dialog` so the scrim covers the
 * toolbar: the verdict first, then one table ordered by who has to act —
 * Needs you above Ready — and one line of ownership under it. It reports
 * and steps back, with two kinds of action: Install on the four rows
 * Conductor can install itself, and Sign in on the GitHub row, which runs
 * gh's own device flow in a card under the row. Detail lines are machine
 * register on purpose — the exact string the CLI printed — and nothing here
 * says Git (§12.24).
 */

/** The kit's glyph per state. */
const STATES: Record<DoctorRowStatus, IconName> = {
  ok: 'circle-check',
  warn: 'circle-alert',
  fail: 'circle-x',
};

/** Criterion 44. */
const FOOTNOTE =
  'Conductor installs Maestro, the JDK, the GitHub CLI and platform-tools by itself. Signing in to GitHub happens in your browser and stays yours.';

/** One stable "no rows" — a fresh array per select would re-render forever. */
const NO_ROWS: readonly DoctorRow[] = [];

const MANAGED = new Set<string>(['java', 'maestro', 'gh', 'adb']);

export function Doctor(): JSX.Element | null {
  const sheetOpen = useDoctorStore((state) => state.sheetOpen);
  const checkedAt = useDoctorStore((state) => state.report?.checkedAt ?? null);
  const issues = useDoctorStore((state) => state.report?.issues ?? 0);
  const checking = useDoctorStore((state) => state.checking);
  // The rows reference is main's — stable between reports — and the split
  // is eight rows, cheaper than a memo (criterion 28).
  const rows = useDoctorStore((state) => state.report?.rows ?? NO_ROWS);
  const install = useDoctorStore((state) => state.install);
  const login = useDoctorStore((state) => state.login);
  const signedInAs = useDoctorStore((state) => state.signedInAs);
  const termsAccepted = useDoctorStore((state) => state.androidTermsAccepted);
  const signInPending = useDoctorStore(selectSignInPending);
  const closeSheet = useDoctorStore((state) => state.closeSheet);
  const check = useDoctorStore((state) => state.check);
  const installTools = useDoctorStore((state) => state.installTools);
  const setAndroidTerms = useDoctorStore((state) => state.setAndroidTerms);
  const signIn = useDoctorStore((state) => state.signIn);
  const signInCancel = useDoctorStore((state) => state.signInCancel);
  const openLoginUrl = useDoctorStore((state) => state.openLoginUrl);
  const overridden = useDoctorStore((state) => state.overridden);

  if (!sheetOpen) {
    return null;
  }

  const installing = install !== null && 'pct' in install ? install : null;
  const { needsYou, ready } = splitRows(rows);
  // Pure over what was selected, not a selector: it returns a fresh set.
  const installable = installableTools({
    report: rows.length === 0 ? null : { rows, checkedAt: 0, issues },
    install,
    overridden,
  });
  // Criterion 43 — the card lives under the GitHub row while the sign-in
  // runs, failed, or just landed.
  const signInCard =
    login !== null || (signedInAs !== null && !signInPending) ? (
      <SignInCard
        failedMessage={login !== null && 'failed' in login ? login.failed.message : null}
        onCancel={() => {
          void signInCancel();
        }}
        onOpen={() => {
          void openLoginUrl();
        }}
        onSignIn={() => {
          void signIn();
        }}
        running={login !== null && 'code' in login ? { code: login.code } : null}
        signedInAs={signedInAs}
      />
    ) : null;

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
            {needsYou.map((row) => {
              const tool = MANAGED.has(row.id) ? (row.id as ToolId) : null;
              return (
                <Row
                  action={
                    tool !== null && installable.has(tool)
                      ? {
                          kind: 'install',
                          terms: tool === 'adb' ? termsAccepted : null,
                          onTerms: setAndroidTerms,
                          onInstall: () => {
                            void installTools([tool]);
                          },
                        }
                      : row.id === 'github-auth' && signInPending && login === null
                        ? {
                            kind: 'sign-in',
                            onSignIn: () => {
                              void signIn();
                            },
                          }
                        : null
                  }
                  card={row.id === 'github-auth' ? signInCard : null}
                  full
                  installing={tool !== null && installing?.tool === tool ? installing : null}
                  key={row.id}
                  row={row}
                />
              );
            })}
          </Section>
        ) : null}
        <Section label="Ready">
          {ready.map((row) => (
            <Row
              action={null}
              card={row.id === 'github-auth' ? signInCard : null}
              installing={null}
              key={row.id}
              row={row}
            />
          ))}
        </Section>
      </div>
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

type RowAction =
  | {
      readonly kind: 'install';
      /** The adb row asks for the terms first (criterion 42); null elsewhere. */
      readonly terms: boolean | null;
      readonly onTerms: (accepted: boolean) => void;
      readonly onInstall: () => void;
    }
  | { readonly kind: 'sign-in'; readonly onSignIn: () => void };

/**
 * One row: glyph, name, the mono line — the full `detail` where a person
 * has to read it, the `short` where nothing is wrong — and one word of
 * state. A managed row may carry Install (criterion 42) and reads
 * Installing with the step (and the percentage, when there is one) while
 * the pipeline runs; the GitHub row may carry Sign in (criterion 43).
 */
function Row({
  row,
  full = false,
  action,
  installing,
  card,
}: {
  readonly row: DoctorRow;
  readonly full?: boolean;
  readonly action: RowAction | null;
  readonly installing: { readonly pct: number | null; readonly step: string } | null;
  readonly card: React.ReactNode;
}): JSX.Element {
  const label = installing === null ? row.label : 'Installing';
  const mono =
    installing === null
      ? full
        ? row.detail
        : row.short
      : installing.pct === null
        ? installing.step
        : `${installing.step} · ${Math.round(installing.pct)}%`;
  return (
    <li aria-label={row.name} className={styles.row} data-row={row.id} data-status={row.status}>
      <Icon className={styles.glyph} name={STATES[row.status]} size={15} />
      <span className={styles.text}>
        <span className={styles.name}>{row.name}</span>
        <span className={styles.mono}>{mono}</span>
      </span>
      <span className={styles.label}>{label}</span>
      {action !== null && installing === null ? (
        action.kind === 'install' ? (
          <button
            className={styles.install}
            disabled={action.terms === false}
            onClick={action.onInstall}
            type="button"
          >
            Install
          </button>
        ) : (
          <button className={styles.install} onClick={action.onSignIn} type="button">
            Sign in
          </button>
        )
      ) : null}
      {action?.kind === 'install' && action.terms !== null && installing === null ? (
        <div className={styles.terms}>
          <Checkbox
            checked={action.terms}
            label="I accept the Android SDK Platform-Tools terms"
            onChange={action.onTerms}
          />
        </div>
      ) : null}
      {card !== null ? <div className={styles.card}>{card}</div> : null}
    </li>
  );
}

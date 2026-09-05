import type { ToolId } from '@shared/ipc';
import type { JSX } from 'react';
import icon from '../../../../../build/icon.png';
import { Checkbox } from '../../components/Checkbox/Checkbox';
import { Icon, type IconName } from '../../components/Icon/Icon';
import { SignInCard } from '../../components/SignInCard/SignInCard';
import { type SetupGlyph, type SetupRowModel, setupRows } from '../../lib/setup-rows';
import { selectSignInPending, useDoctorStore } from '../../stores/doctor.store';
import styles from './Setup.module.css';

/**
 * The first-run installer (managed-tools criteria 34–41), the kit's
 * `CDoctorInstallerB`: the whole 520 × 480 window while Conductor puts the
 * four tools on the machine and walks the person through GitHub's sign-in.
 * One screen, three moments — the plan and its one click, the rows moving
 * one at a time, the sign-in card — and no log: the person did not ask for
 * this and cannot help with it. Every pct, step, code and outcome here
 * arrived as a push (criterion 41); the view holds no timer. The mark is the
 * real Conductor icon, as Connect's is.
 */

const COPY =
  "Conductor needs a few tools to run tests on this Mac. It installs what's missing — no password needed.";
/** Criterion 32 — every tool is there; the sign-in alone opened the window. */
const SIGN_IN_COPY = 'Everything is installed. One last step: sign in to GitHub.';

const GLYPHS: Record<SetupGlyph, IconName> = {
  present: 'circle-check',
  install: 'circle-dashed',
  alert: 'circle-alert',
  fail: 'circle-x',
  active: 'loader-circle',
};

export function Setup(): JSX.Element {
  const reason = useDoctorStore((state) => state.setup.reason);
  const plan = useDoctorStore((state) => state.setup.plan);
  const version = useDoctorStore((state) => state.version);
  const report = useDoctorStore((state) => state.report);
  const install = useDoctorStore((state) => state.install);
  const outcomes = useDoctorStore((state) => state.outcomes.byTool);
  const login = useDoctorStore((state) => state.login);
  const signedInAs = useDoctorStore((state) => state.signedInAs);
  const termsAccepted = useDoctorStore((state) => state.androidTermsAccepted);
  const signInPending = useDoctorStore(selectSignInPending);
  const setAndroidTerms = useDoctorStore((state) => state.setAndroidTerms);
  const openAndroidTerms = useDoctorStore((state) => state.openAndroidTerms);
  const installTools = useDoctorStore((state) => state.installTools);
  const signIn = useDoctorStore((state) => state.signIn);
  const signInCancel = useDoctorStore((state) => state.signInCancel);
  const openLoginUrl = useDoctorStore((state) => state.openLoginUrl);

  const rows = setupRows({ plan, install, outcomes, report, termsAccepted });
  const running = install !== null && 'pct' in install;
  const settled = install !== null && 'failed' in install;
  const failed: ToolId[] = settled
    ? rows.filter((row) => install.failed[row.id] !== undefined).map((row) => row.id)
    : [];
  // Criterion 32 — nothing left to install (the tools landed with nothing
  // failed, or every one was there and the sign-in alone opened the window),
  // gh is there and the sign-in is not: the card, before the app. The
  // sign-in is mandatory; the card has no way past it.
  const nothingLeft = settled
    ? failed.length === 0
    : (plan?.tools.every((tool) => tool.state === 'present') ?? false);
  const signInStep =
    (!running && nothingLeft && (signInPending || signedInAs !== null)) || login !== null;
  const planScreen = !running && !settled && !signInStep && plan !== null;
  const termsLine = planScreen && plan.androidTermsRequired;

  return (
    <section aria-label="Setup" className={styles.setup}>
      {/* The traffic lights sit over this strip; it is what drags the window. */}
      <div aria-hidden="true" className={styles.drag} data-testid="setup-drag" />
      <div className={styles.body}>
        <header className={styles.header}>
          <img alt="" className={styles.mark} data-testid="setup-mark" src={icon} />
          <div className={styles.heading}>
            <h1 className={styles.title}>
              {reason === 'update' ? 'Updating Maestro' : 'Setting up Conductor'}
            </h1>
            <p className={styles.copy}>
              {reason === 'update'
                ? `Conductor's test runner is moving to ${version}. This happens once.`
                : reason === 'sign-in'
                  ? SIGN_IN_COPY
                  : COPY}
            </p>
          </div>
        </header>

        <ul aria-label="Tools" className={styles.rows}>
          {rows.map((row) => (
            <ToolRow key={row.id} row={row} />
          ))}
        </ul>

        {signInStep ? (
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
        ) : (
          <>
            {plan !== null && !running ? (
              <p className={styles.method}>{methodLine(plan.homebrew, plan.profile)}</p>
            ) : null}
            {termsLine ? (
              <div className={styles.terms}>
                <Checkbox
                  checked={termsAccepted}
                  label="I accept the Android SDK Platform-Tools terms"
                  onChange={setAndroidTerms}
                />
                <button
                  className={styles.link}
                  onClick={() => {
                    void openAndroidTerms();
                  }}
                  type="button"
                >
                  Read the terms
                </button>
              </div>
            ) : null}
          </>
        )}

        {planScreen ? (
          <div className={styles.actions}>
            {/* Criterion 38 — the one button: the four tools are mandatory,
                and adb waits on its terms. */}
            <button
              className={styles.primary}
              disabled={termsLine && !termsAccepted}
              onClick={() => {
                void installTools();
              }}
              type="button"
            >
              Install
            </button>
          </div>
        ) : null}
        {settled && failed.length > 0 && login === null ? (
          <div className={styles.actions}>
            <button
              className={styles.primary}
              onClick={() => {
                void installTools(failed);
              }}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Criterion 36 — where the tools come from, in one line. */
function methodLine(homebrew: string | null, profile: string | null): string {
  const method =
    homebrew === null
      ? "Homebrew isn't installed, so Conductor downloads everything into ~/.conductor and adds it to your PATH."
      : `Homebrew found at ${homebrew} — GitHub CLI and platform-tools install through it. The JDK downloads from Azul.`;
  return profile === null ? `${method} Add ~/.conductor/bin to your PATH by hand.` : method;
}

/** One row (criteria 35, 39): glyph, name, the mono state — and under the
 * active row, the kit's 4 px bar with the step line. */
function ToolRow({ row }: { readonly row: SetupRowModel }): JSX.Element {
  return (
    <li aria-label={row.name} className={styles.row} data-glyph={row.glyph} data-tool={row.id}>
      <Icon className={styles.glyph} name={GLYPHS[row.glyph]} size={15} />
      <span className={styles.rowBody}>
        <span className={styles.rowLine}>
          <span className={styles.name}>{row.name}</span>
          {row.bar === null ? <span className={styles.mono}>{row.mono}</span> : null}
        </span>
        {row.bar !== null ? (
          <>
            <div
              aria-label={row.name}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={row.bar.pct === null ? undefined : Math.round(row.bar.pct)}
              className={styles.track}
              data-indeterminate={row.bar.pct === null ? 'true' : undefined}
              role="progressbar"
            >
              <div
                className={styles.fill}
                style={row.bar.pct === null ? undefined : { width: `${row.bar.pct}%` }}
              />
            </div>
            <span className={styles.step}>{row.mono}</span>
          </>
        ) : null}
      </span>
    </li>
  );
}

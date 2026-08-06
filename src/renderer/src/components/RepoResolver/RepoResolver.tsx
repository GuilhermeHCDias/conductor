import type { ResolvedRepo } from '@shared/ipc';
import { type JSX, type KeyboardEvent, useEffect, useRef } from 'react';
import type { RepoErrorSurface } from '../../lib/repo-errors';
import { flowCountLabel, platformLabel, primaryBundleId } from '../../lib/repo-labels';
import { Icon } from '../Icon/Icon';
import { IconButton } from '../IconButton/IconButton';
import { Tooltip } from '../Tooltip/Tooltip';
import styles from './RepoResolver.module.css';

/**
 * The resolver body, shared verbatim between the first-run connect window
 * and the add-repository sheet (CRepo.jsx): the address field, the three
 * real progress steps, the found card and the error surface. Presentational
 * only — the phases arrive as props and every intent leaves as a callback;
 * the store owns what they mean.
 */

/** The kit's three stages, verbatim — and they are real: clone, read
 * app.json, scan conductor/ (spec: no simulated timers). */
const RESOLVE_STEPS = [
  'Reading the repository',
  'Finding the app module',
  'Looking for conductor/',
];

export type ResolverPhase = 'idle' | 'resolving' | 'found' | 'error';

export type RepoResolverProps = {
  readonly url: string;
  readonly phase: ResolverPhase;
  /** How many steps completed (0–3). */
  readonly step: number;
  readonly found: ResolvedRepo | null;
  readonly error: RepoErrorSurface | null;
  readonly autoFocus?: boolean;
  readonly onUrlChange: (url: string) => void;
  readonly onSubmit: () => void;
  readonly onPaste: () => void;
  readonly onCopyCommand: (command: string) => void;
};

export function RepoResolver({
  url,
  phase,
  step,
  found,
  error,
  autoFocus,
  onUrlChange,
  onSubmit,
  onPaste,
  onCopyCommand,
}: RepoResolverProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = phase === 'resolving';

  useEffect(() => {
    if (autoFocus === true) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className={styles.resolver}>
      <div className={styles.fieldRow}>
        <div className={styles.field} data-invalid={phase === 'error' ? 'true' : undefined}>
          <Icon className={styles.fieldGlyph} name="git-branch" size={14} />
          <input
            aria-label="Repository address"
            autoCapitalize="off"
            autoCorrect="off"
            className={styles.input}
            disabled={busy}
            onChange={(event) => {
              onUrlChange(event.target.value);
            }}
            onKeyDown={onKeyDown}
            placeholder="github.com/org/app"
            ref={inputRef}
            spellCheck={false}
            value={url}
          />
          {url === '' ? (
            <button className={styles.paste} onClick={onPaste} type="button">
              <Icon className={styles.pasteGlyph} name="clipboard" size={11} />
              Paste
            </button>
          ) : (
            <IconButton
              icon="x"
              label="Clear"
              onClick={() => {
                onUrlChange('');
              }}
              size="sm"
            />
          )}
        </div>
        <button
          className={styles.connect}
          disabled={url.trim() === '' || busy}
          onClick={onSubmit}
          type="button"
        >
          {busy ? <Icon className={styles.spin} name="loader-circle" size={13} /> : null}
          Connect
        </button>
      </div>

      {phase === 'resolving' ? <Steps step={step} /> : null}
      {phase === 'found' && found !== null ? <FoundCard repo={found} /> : null}
      {phase === 'error' && error !== null ? (
        <ErrorCard error={error} onCopyCommand={onCopyCommand} onRetry={onSubmit} />
      ) : null}
    </div>
  );
}

type StepsProps = { readonly step: number };

/** Done wears the pass check, the live stage spins, the rest wait as dots —
 * each advancing only when its real work finished. */
function Steps({ step }: StepsProps): JSX.Element {
  return (
    <div className={styles.steps}>
      {RESOLVE_STEPS.map((label, index) => {
        const state = step > index ? 'done' : step === index ? 'active' : 'pending';
        return (
          <span className={styles.stepRow} data-state={state} key={label}>
            {state === 'done' ? (
              <Icon className={styles.stepDone} name="check" size={13} />
            ) : state === 'active' ? (
              <Icon
                className={`${styles.stepActive} ${styles.spin}`}
                name="loader-circle"
                size={13}
              />
            ) : (
              <span className={styles.stepDot} />
            )}
            {label}
          </span>
        );
      })}
    </div>
  );
}

type FoundCardProps = { readonly repo: ResolvedRepo };

/** What was read, in the order it matters: the app that will launch, the
 * branch, the folder. The bundle id is shown because it is the thing the
 * person would otherwise have had to find (CRepo.jsx). */
function FoundCard({ repo }: FoundCardProps): JSX.Element {
  const bundle = primaryBundleId(repo.appId);
  return (
    <div className={styles.found} data-testid="repo-found">
      <div className={styles.foundHeader}>
        <Icon className={styles.foundCheck} name="circle-check" size={15} />
        <span className={styles.foundName}>
          {repo.org}/{repo.name}
        </span>
        <span className={styles.foundPlatform}>{platformLabel(repo.appId)}</span>
      </div>
      <div className={styles.foundRows}>
        <span className={styles.foundRow}>
          <Icon className={styles.rowGlyph} name="package" size={13} />
          <span className={styles.rowLabel}>App</span>
          <span className={styles.rowValue}>{repo.appName}</span>
          {bundle !== null ? <span className={styles.rowNote}>{bundle}</span> : null}
        </span>
        <span className={styles.foundRow}>
          <Icon className={styles.rowGlyph} name="git-branch" size={13} />
          <span className={styles.rowLabel}>Branch</span>
          <span className={styles.rowValue}>{repo.branch ?? '—'}</span>
        </span>
        <span className={styles.foundRow}>
          <Icon className={styles.rowGlyph} name="folder" size={13} />
          <span className={styles.rowLabel}>conductor/</span>
          <span className={styles.rowValue} data-quiet={repo.flowCount === 0 ? 'true' : undefined}>
            {flowCountLabel(repo.flowCount)}
          </span>
        </span>
      </div>
      {repo.flowCount === 0 ? (
        <p className={styles.foundNote}>Conductor creates conductor/ with your first flow.</p>
      ) : null}
    </div>
  );
}

type ErrorCardProps = {
  readonly error: RepoErrorSurface;
  readonly onCopyCommand: (command: string) => void;
  readonly onRetry: () => void;
};

/** The kit's error surface: what went wrong in the terms the developer will
 * act on — the command, verbatim, with a working Copy — and a retry only
 * when running that command could change the answer. */
function ErrorCard({ error, onCopyCommand, onRetry }: ErrorCardProps): JSX.Element {
  const command = error.command;
  return (
    <div className={styles.error} role="alert">
      <span className={styles.errorHead}>
        <Icon className={styles.errorGlyph} name="circle-x" size={15} />
        <span className={styles.errorText}>
          <span className={styles.errorTitle}>{error.title}</span>
          <span className={styles.errorBody}>{error.body}</span>
        </span>
      </span>
      {command !== null ? (
        <span className={styles.commandWell}>
          <span className={styles.prompt}>$</span>
          <span className={styles.command}>{command}</span>
          <Tooltip content="Copy">
            <IconButton
              icon="copy"
              label="Copy command"
              onClick={() => {
                onCopyCommand(command);
              }}
              size="sm"
            />
          </Tooltip>
        </span>
      ) : null}
      {command !== null ? (
        <span className={styles.retryRow}>
          <button className={styles.retry} onClick={onRetry} type="button">
            <Icon name="refresh-cw" size={12} />
            Try again
          </button>
        </span>
      ) : null}
    </div>
  );
}

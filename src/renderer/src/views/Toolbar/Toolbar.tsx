import type { JSX } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { IconButton } from '../../components/IconButton/IconButton';
import { Tooltip } from '../../components/Tooltip/Tooltip';
import { ENVIRONMENT, FLOW_YAML, SENT_AT } from '../../fixtures/flows';
import { countCommands } from '../../lib/yaml-tokens';
import { selectSidebarVisible, selectUnsentChanges, useUiStore } from '../../stores/ui.store';
import styles from './Toolbar.module.css';

const COMMAND_COUNT = countCommands(FLOW_YAML);

/**
 * §8.5's Send control — three states, one slot, where the Save button used to
 * be. Nothing to send: a quiet, non-alarming confirmation, and not a control.
 * Changes waiting: a filled accent button, because sending is the one thing on
 * the screen the person came to do after editing. Already sent: a neutral
 * pill, not amber — waiting for a colleague is normal, not a warning.
 */
function SendControl(): JSX.Element {
  const phase = useUiStore((state) => state.sendPhase);
  const count = useUiStore((state) => selectUnsentChanges(state).length);
  const openSend = useUiStore((state) => state.openSend);

  if (phase === 'review') {
    return (
      <Tooltip content={`Waiting for review · sent ${SENT_AT}`}>
        <button className={styles.sendReview} onClick={openSend} type="button">
          <Icon className={styles.sendReviewGlyph} name="clock" size={13} />
          Waiting for review
          {count > 0 ? <span className={styles.sendPlus}>+{count}</span> : null}
        </button>
      </Tooltip>
    );
  }

  if (count === 0) {
    return (
      <span className={styles.sendIdle}>
        <Icon className={styles.sendIdleGlyph} name="check" size={13} />
        Everything sent
      </span>
    );
  }

  return (
    <Tooltip
      content={count === 1 ? 'Send 1 change to the team' : `Send ${count} changes to the team`}
    >
      <button className={styles.send} onClick={openSend} type="button">
        <Icon name="send" size={13} />
        Send changes
        <span className={styles.sendCount}>{count}</span>
      </button>
    </Tooltip>
  );
}

/**
 * The unified macOS toolbar (criteria 10–13). The traffic lights are the OS's
 * own — `titleBarStyle: 'hiddenInset'` — so this reserves the space they land
 * in rather than drawing them.
 *
 * Run renders but does nothing: this spec has no Maestro to start. There is no
 * Save beside it — saving is not an act the person performs (§8.2), so the
 * subtitle reports the file's state instead of offering a button for it.
 */
export function Toolbar(): JSX.Element {
  const dark = useUiStore((state) => state.dark);
  const running = useUiStore((state) => state.running);
  const toggleAppearance = useUiStore((state) => state.toggleAppearance);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const sidebarVisible = useUiStore(selectSidebarVisible);
  const title = useUiStore((state) => state.document.label);

  return (
    <div className={styles.toolbar} role="toolbar" aria-label="Window">
      {/* The OS draws the lights here; nothing of ours may sit underneath them. */}
      <span aria-hidden="true" className={styles.trafficLightInset} />

      <Tooltip content={sidebarVisible ? 'Hide sidebar' : 'Show sidebar'} shortcut="⌘B">
        <IconButton
          icon="panel-left"
          label="Toggle sidebar"
          onClick={toggleSidebar}
          selected={sidebarVisible}
        />
      </Tooltip>

      {/* macOS document title: the name plus a quiet subtitle, left of centre. */}
      <span className={styles.document}>
        <span className={styles.title}>{title}</span>
        <span className={styles.subtitle}>
          {COMMAND_COUNT} {COMMAND_COUNT === 1 ? 'command' : 'commands'} ·{' '}
          {running ? 'running' : 'saved on this Mac'}
        </span>
      </span>

      <span className={styles.spacer} />

      <button className={styles.environment} type="button">
        <Icon name="variable" size={12} />
        {ENVIRONMENT}
        <Icon name="chevron-down" size={12} />
      </button>

      <button className={styles.run} data-running={running ? 'true' : undefined} type="button">
        <Icon name={running ? 'circle-stop' : 'play'} size={13} />
        {running ? 'Stop' : 'Run'}
      </button>

      <span aria-hidden="true" className={styles.separator} />

      <SendControl />

      <Tooltip content={dark ? 'Light appearance' : 'Dark appearance'}>
        <IconButton
          icon={dark ? 'sun' : 'moon'}
          label={dark ? 'Light appearance' : 'Dark appearance'}
          onClick={toggleAppearance}
        />
      </Tooltip>
    </div>
  );
}

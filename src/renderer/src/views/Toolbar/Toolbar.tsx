import type { JSX } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { IconButton } from '../../components/IconButton/IconButton';
import { Tooltip } from '../../components/Tooltip/Tooltip';
import { ENVIRONMENT } from '../../fixtures/flows';
import { countCommands } from '../../lib/yaml-tokens';
import { selectSelectedId, useDeviceStore } from '../../stores/device.store';
import { selectOpenName, selectYaml, useFlowStore } from '../../stores/flow.store';
import { selectRunning, useRunStore } from '../../stores/run.store';
import { selectSidebarVisible, useUiStore } from '../../stores/ui.store';
import styles from './Toolbar.module.css';

/**
 * The unified macOS toolbar (criteria 10–13). The traffic lights are the OS's
 * own — `titleBarStyle: 'hiddenInset'` — so this reserves the space they land
 * in rather than drawing them.
 *
 * Run runs (run criteria 15–18): the open flow's current in-memory text —
 * dirty state included, what you see is what runs — on the selected device.
 * There is no Save beside it — saving is not an act the person performs
 * (§8.2, §8.5), so the subtitle reports the file's state instead of offering a
 * button for it.
 */
export function Toolbar(): JSX.Element {
  const dark = useUiStore((state) => state.dark);
  const running = useRunStore(selectRunning);
  const start = useRunStore((state) => state.start);
  const cancel = useRunStore((state) => state.cancel);
  const deviceId = useDeviceStore(selectSelectedId);
  const yaml = useFlowStore(selectYaml);
  const setLowerPanel = useUiStore((state) => state.setLowerPanel);
  const toggleAppearance = useUiStore((state) => state.toggleAppearance);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const sidebarVisible = useUiStore(selectSidebarVisible);
  const openName = useFlowStore(selectOpenName);

  // The count is the open flow's own, not a fixture's: a step the command menu
  // appends moves it the moment it lands.
  const commandCount = countCommands(yaml);

  // Criterion 17. While running the button is Stop, and Stop is always live —
  // a device that dropped mid-run must not lock the person out of canceling.
  const runDisabled = !running && (deviceId === null || yaml.trim() === '');

  const onRunClick = (): void => {
    if (running) {
      void cancel();
      return;
    }
    if (deviceId === null) {
      return;
    }
    void start(deviceId, yaml);
    // Criterion 18 — the report lands in the Run tab, so the click goes
    // there: progress if the run starts, the failure if it refuses (22).
    setLowerPanel('run');
  };

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
        <span className={styles.title}>{openName ?? 'No flow open'}</span>
        <span className={styles.subtitle}>
          {openName === null
            ? '—'
            : `${commandCount} ${commandCount === 1 ? 'command' : 'commands'} · ${
                running ? 'running' : 'saved on this Mac'
              }`}
        </span>
      </span>

      <span className={styles.spacer} />

      <button className={styles.environment} type="button">
        <Icon name="variable" size={12} />
        {ENVIRONMENT}
        <Icon name="chevron-down" size={12} />
      </button>

      <button
        className={styles.run}
        data-running={running ? 'true' : undefined}
        disabled={runDisabled}
        onClick={onRunClick}
        type="button"
      >
        <Icon name={running ? 'circle-stop' : 'play'} size={13} />
        {running ? 'Stop' : 'Run'}
      </button>

      <span aria-hidden="true" className={styles.separator} />

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

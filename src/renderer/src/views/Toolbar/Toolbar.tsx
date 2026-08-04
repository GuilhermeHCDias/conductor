import type { JSX } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { IconButton } from '../../components/IconButton/IconButton';
import { Tooltip } from '../../components/Tooltip/Tooltip';
import { ENVIRONMENT, FLOW_YAML } from '../../fixtures/flows';
import { countCommands } from '../../lib/yaml-tokens';
import { selectSidebarVisible, useUiStore } from '../../stores/ui.store';
import styles from './Toolbar.module.css';

const COMMAND_COUNT = countCommands(FLOW_YAML);

/**
 * The unified macOS toolbar (criteria 10–13). The traffic lights are the OS's
 * own — `titleBarStyle: 'hiddenInset'` — so this reserves the space they land
 * in rather than drawing them.
 *
 * Run and Save render but do nothing: this spec has no Maestro to start and no
 * file to write.
 */
export function Toolbar(): JSX.Element {
  const dark = useUiStore((state) => state.dark);
  const running = useUiStore((state) => state.running);
  const toggleAppearance = useUiStore((state) => state.toggleAppearance);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const sidebarVisible = useUiStore(selectSidebarVisible);
  const title = useUiStore(
    (state) => state.tabs.find((tab) => tab.id === state.activeTabId)?.label ?? 'Conductor',
  );

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
        <span className={styles.subtitle}>{COMMAND_COUNT} commands · saved to suite</span>
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

      <Tooltip content={dark ? 'Light appearance' : 'Dark appearance'}>
        <IconButton
          icon={dark ? 'sun' : 'moon'}
          label={dark ? 'Light appearance' : 'Dark appearance'}
          onClick={toggleAppearance}
        />
      </Tooltip>

      <Tooltip content="Save flow" shortcut="⌘S">
        <IconButton icon="download" label="Save flow" />
      </Tooltip>
    </div>
  );
}

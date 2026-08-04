import { type JSX, useState } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { IconButton } from '../../components/IconButton/IconButton';
import { StatusDot } from '../../components/StatusDot/StatusDot';
import { FLOWS, type Flow } from '../../fixtures/flows';
import { useUiStore } from '../../stores/ui.store';
import styles from './FlowList.module.css';

type FlowRowProps = {
  readonly flow: Flow;
  readonly selected: boolean;
  readonly onOpen: (id: string) => void;
};

/**
 * One flow. The overflow button replaces the AI mark while the row is hovered,
 * focused or selected (criterion 18) — a row at rest stays quiet.
 *
 * Hover is React state rather than a `:hover` rule because the two glyphs
 * occupy one slot: CSS could hide one but not swap them.
 */
function FlowRow({ flow, selected, onOpen }: FlowRowProps): JSX.Element {
  const [engaged, setEngaged] = useState(false);
  const active = engaged || selected;

  return (
    <li
      className={styles.row}
      data-selected={selected ? 'true' : undefined}
      onBlur={() => {
        setEngaged(false);
      }}
      onFocus={() => {
        setEngaged(true);
      }}
      onMouseEnter={() => {
        setEngaged(true);
      }}
      onMouseLeave={() => {
        setEngaged(false);
      }}
    >
      <button
        className={styles.open}
        onClick={() => {
          onOpen(flow.id);
        }}
        type="button"
      >
        <StatusDot data-testid="flow-dot" state={flow.lastResult} />
        <span className={styles.labels}>
          <span className={styles.name}>{flow.name}</span>
          <span className={styles.meta}>
            {flow.steps} steps · {flow.duration ?? 'never run'}
          </span>
        </span>
      </button>
      {active ? (
        <IconButton className={styles.actions} icon="ellipsis" label="Flow actions" size="sm" />
      ) : flow.aiAuthored === true ? (
        <Icon className={styles.aiMark} data-testid="ai-authored" name="sparkles" size={12} />
      ) : null}
    </li>
  );
}

/**
 * The Flows sidebar (criteria 14–21): header, search, the suite, and a bottom
 * action bar — macOS puts persistent actions on a bar, not on a floating pill.
 */
export function FlowList(): JSX.Element {
  const query = useUiStore((state) => state.query);
  const setQuery = useUiStore((state) => state.setQuery);
  const openFlow = useUiStore((state) => state.openFlow);
  const activeTabId = useUiStore((state) => state.activeTabId);

  const needle = query.trim().toLowerCase();
  const shown =
    needle === '' ? FLOWS : FLOWS.filter((flow) => flow.name.toLowerCase().includes(needle));
  const failing = FLOWS.filter((flow) => flow.lastResult === 'fail').length;

  return (
    <section aria-label="Flows" className={styles.panel}>
      <header className={styles.header}>
        <span className={styles.caps}>Flows</span>
        <span className={styles.count}>
          {FLOWS.length} · {failing} failing
        </span>
        <span className={styles.spacer} />
        <IconButton icon="plus" label="New flow" size="sm" />
      </header>

      <div className={styles.searchRow}>
        <div className={styles.searchField}>
          <Icon className={styles.searchIcon} name="search" size={13} />
          <input
            aria-label="Search flows"
            className={styles.searchInput}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
            placeholder="Search"
            type="search"
            value={query}
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <p className={styles.empty}>Nothing matches “{query}”.</p>
      ) : (
        <ul className={`${styles.rows} a-scroll`}>
          {shown.map((flow) => (
            <FlowRow
              flow={flow}
              key={flow.id}
              onOpen={openFlow}
              selected={flow.id === activeTabId}
            />
          ))}
        </ul>
      )}

      <div className={styles.bottomBar}>
        <button className={styles.suiteRun} type="button">
          <Icon name="play" size={12} />
          Run whole suite
        </button>
        <IconButton icon="settings" label="Settings" size="sm" />
      </div>
    </section>
  );
}

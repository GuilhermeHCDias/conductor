import { type JSX, useState } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { IconButton } from '../../components/IconButton/IconButton';
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import { ASSISTANT_STATUS_LINE, FLOW_YAML, RUN_STATUS_LINE, type Tab } from '../../fixtures/flows';
import { tokenizeYamlLine } from '../../lib/yaml-tokens';
import { useUiStore } from '../../stores/ui.store';
import { AIPanel } from '../AIPanel/AIPanel';
import { Composer } from '../Composer/Composer';
import { RunPanel } from '../RunPanel/RunPanel';
import styles from './FlowEditor.module.css';

/** The one panel the segmented control swaps, named once. */
const PANEL_ID = 'lower-panel';

type DocumentTabProps = {
  readonly tab: Tab;
  readonly active: boolean;
  readonly onSelect: (id: string) => void;
  readonly onClose: (id: string) => void;
};

/**
 * A document tab, macOS style: the active one is filled and lifted by a
 * hairline rather than by a shadow. Its close button appears while the tab is
 * active, hovered or focused (criterion 23) — a tab at rest is just a name.
 */
function DocumentTab({ tab, active, onSelect, onClose }: DocumentTabProps): JSX.Element {
  const [engaged, setEngaged] = useState(false);

  return (
    <li
      className={styles.tab}
      data-active={active ? 'true' : undefined}
      data-dirty={tab.dirty === true ? 'true' : undefined}
      data-testid={`tab-${tab.id}`}
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
        className={styles.tabOpen}
        onClick={() => {
          onSelect(tab.id);
        }}
        type="button"
      >
        <Icon className={styles.tabGlyph} name="file-code" size={12} />
        <span className={styles.tabLabel}>{tab.label}</span>
        {tab.dirty === true ? <span aria-hidden="true" className={styles.dirty} /> : null}
      </button>
      {active || engaged ? (
        <IconButton
          icon="x"
          label="Close tab"
          onClick={() => {
            onClose(tab.id);
          }}
          size="sm"
        />
      ) : null}
    </li>
  );
}

type YamlLineProps = {
  readonly text: string;
  readonly number: number;
  readonly gutterWidth: string;
  /** `error` · `ai` · `active`, in that order of precedence (criterion 27). */
  readonly wash: 'error' | 'ai' | 'active' | undefined;
  readonly caret: boolean;
};

/** One numbered, syntax-coloured line. */
function YamlLine({ text, number, gutterWidth, wash, caret }: YamlLineProps): JSX.Element {
  // Spans are keyed by where they start in the line rather than by their
  // position in the array: a character offset survives re-tokenizing.
  let offset = 0;
  const spans = tokenizeYamlLine(text).map((token) => {
    const key = `${offset}:${token.kind}`;
    offset += token.text.length;
    return { key, token };
  });

  return (
    <div className={styles.line} data-line={wash} data-testid={`yaml-line-${number}`}>
      <span
        className={styles.gutter}
        data-testid={`yaml-gutter-${number}`}
        style={{ width: gutterWidth }}
      >
        {number}
      </span>
      <span className={styles.code}>
        {spans.map(({ key, token }) => (
          <span className={styles.token} data-testid="yaml-token" data-token={token.kind} key={key}>
            {token.text}
          </span>
        ))}
        {caret ? <span aria-hidden="true" className={styles.caret} data-testid="caret" /> : null}
      </span>
    </div>
  );
}

/**
 * The YAML body (criteria 26–28). Read-only and syntax-coloured: CodeMirror
 * belongs to the FlowEditor spec, not to the shell.
 *
 * One trailing empty line is rendered past the end of the flow, which is where
 * the next command would go.
 */
function YamlBody(): JSX.Element {
  const aiLines = useUiStore((state) => state.aiLines);
  const errorLines = useUiStore((state) => state.errorLines);

  const lines = FLOW_YAML.replace(/\n$/, '').split('\n');
  const total = lines.length + 1;
  const activeLine = lines.length;
  const gutterWidth = `${String(total).length}ch`;

  return (
    <div className={styles.yaml}>
      {Array.from({ length: total }, (_unused, index) => {
        const number = index + 1;
        // Criterion 27: an error line wins over an AI line, and both win over
        // the active line.
        const wash = errorLines.includes(number)
          ? 'error'
          : aiLines.includes(number)
            ? 'ai'
            : number === activeLine
              ? 'active'
              : undefined;

        return (
          <YamlLine
            caret={number === activeLine}
            gutterWidth={gutterWidth}
            key={number}
            number={number}
            text={lines[index] ?? ''}
            wash={wash}
          />
        );
      })}
    </div>
  );
}

/**
 * The working area (criteria 22–30): document tabs over the flow, a segmented
 * control over the run report or the assistant thread, and the composer on a
 * hairline-topped footer.
 */
export function FlowEditor(): JSX.Element {
  const tabs = useUiStore((state) => state.tabs);
  const activeTabId = useUiStore((state) => state.activeTabId);
  const selectTab = useUiStore((state) => state.selectTab);
  const closeTab = useUiStore((state) => state.closeTab);
  const newTab = useUiStore((state) => state.newTab);
  const lowerPanel = useUiStore((state) => state.lowerPanel);
  const setLowerPanel = useUiStore((state) => state.setLowerPanel);
  const running = useUiStore((state) => state.running);

  return (
    <section aria-label="Editor" className={styles.column}>
      <div className={styles.tabStrip} data-testid="tab-strip">
        <div className={styles.tabs}>
          <ul className={styles.tabList}>
            {tabs.map((tab) => (
              <DocumentTab
                active={tab.id === activeTabId}
                key={tab.id}
                onClose={closeTab}
                onSelect={selectTab}
                tab={tab}
              />
            ))}
          </ul>
          <IconButton icon="plus" label="New tab" onClick={newTab} size="sm" />
        </div>
        <span className={styles.spacer} />
        <span className={styles.language}>YAML</span>
      </div>

      <div className={`${styles.body} a-scroll`}>
        <YamlBody />
      </div>

      <div className={styles.subTabs}>
        <SegmentedControl
          controls={PANEL_ID}
          label="Lower panel"
          onChange={(id) => {
            if (id === 'run' || id === 'assistant') {
              setLowerPanel(id);
            }
          }}
          options={[
            { id: 'run', label: 'Run', badge: running },
            { id: 'assistant', label: 'Assistant' },
          ]}
          value={lowerPanel}
        />
        <span className={styles.spacer} />
        <span className={styles.status}>
          {lowerPanel === 'run' ? RUN_STATUS_LINE : ASSISTANT_STATUS_LINE}
        </span>
      </div>

      <div
        aria-labelledby={`${PANEL_ID}-tab-${lowerPanel}`}
        className={`${styles.lower} a-scroll`}
        id={PANEL_ID}
        role="tabpanel"
      >
        {lowerPanel === 'run' ? <RunPanel /> : <AIPanel />}
      </div>

      <Composer />
    </section>
  );
}

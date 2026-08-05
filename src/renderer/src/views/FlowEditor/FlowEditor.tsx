import { type JSX, useEffect, useRef } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import { ASSISTANT_STATUS_LINE, RUN_STATUS_LINE } from '../../fixtures/flows';
import { tokenizeYamlLine } from '../../lib/yaml-tokens';
import { selectDirty, selectRevision, selectYaml, useFlowStore } from '../../stores/flow.store';
import { useUiStore } from '../../stores/ui.store';
import { AIPanel } from '../AIPanel/AIPanel';
import { Composer } from '../Composer/Composer';
import { RunPanel } from '../RunPanel/RunPanel';
import styles from './FlowEditor.module.css';

/** The one panel the segmented control swaps, named once. */
const PANEL_ID = 'lower-panel';

/**
 * What the working area is showing, named (criterion 23). There is no tab
 * chrome and no button here: the sidebar lists every flow and is the only place
 * one is opened or started, so a strip beside it would be a staler second copy
 * of that list.
 */
function DocumentBar(): JSX.Element {
  // Not `document`: shadowing the DOM global inside a component is a trap for
  // whoever next reaches for `document.querySelector` in here.
  const flowDocument = useUiStore((state) => state.document);
  // Inspect criterion 39: the mark follows the flow's own text — dirty is what
  // the append made true, not what a fixture said.
  const dirty = useFlowStore(selectDirty);

  return (
    <div
      className={styles.documentBar}
      data-dirty={dirty ? 'true' : undefined}
      data-testid="document-bar"
    >
      <Icon className={styles.documentGlyph} name="file-code" size={12} />
      <span className={styles.documentName}>{flowDocument.label}</span>
      {dirty ? <span aria-hidden="true" className={styles.dirty} /> : null}
      <span className={styles.spacer} />
      <span className={styles.language}>YAML</span>
    </div>
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
 * belongs to the FlowEditor spec, not to the shell. The text is the flow
 * store's — the fixture constant is no longer read here (inspect criterion
 * 36), so a step the command menu appends is on screen the moment it lands.
 *
 * One trailing empty line is rendered past the end of the flow, which is where
 * the next command would go.
 */
function YamlBody(): JSX.Element {
  const aiLines = useUiStore((state) => state.aiLines);
  const errorLines = useUiStore((state) => state.errorLines);
  const yaml = useFlowStore(selectYaml);
  const revision = useFlowStore(selectRevision);
  const end = useRef<HTMLDivElement>(null);

  // Inspect criterion 39 — reveal what was just written. Guarded on the
  // revision, not the text: only an append scrolls, never a mount.
  useEffect(() => {
    if (revision > 0) {
      end.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [revision]);

  const lines = yaml.replace(/\n$/, '').split('\n');
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
      <div aria-hidden="true" ref={end} />
    </div>
  );
}

/**
 * The working area (criteria 22–30): the open document named over the flow, a
 * segmented control over the run report or the assistant thread, and the
 * composer on a hairline-topped footer.
 */
export function FlowEditor(): JSX.Element {
  const lowerPanel = useUiStore((state) => state.lowerPanel);
  const setLowerPanel = useUiStore((state) => state.setLowerPanel);
  const running = useUiStore((state) => state.running);

  return (
    <section aria-label="Editor" className={styles.column}>
      <DocumentBar />

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

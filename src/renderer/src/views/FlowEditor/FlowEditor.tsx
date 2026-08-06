import { type JSX, useEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon/Icon';
import { SegmentedControl } from '../../components/SegmentedControl/SegmentedControl';
import { ASSISTANT_STATUS_LINE, RUN_STATUS_LINE } from '../../fixtures/flows';
import { tokenizeYamlLine } from '../../lib/yaml-tokens';
import { selectDirty, selectRevision, selectYaml, useFlowStore } from '../../stores/flow.store';
import { selectRunning, useRunStore } from '../../stores/run.store';
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
};

/** One numbered, syntax-coloured line. */
function YamlLine({ text, number, gutterWidth, wash }: YamlLineProps): JSX.Element {
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
      </span>
    </div>
  );
}

/**
 * The YAML body (criteria 26–28), editable: the numbered, syntax-coloured
 * lines are an underlay, and a transparent textarea laid exactly over them
 * holds the real text — typing, deleting, selection, IME and undo are the
 * platform's own, and every keystroke lands in the flow store (inspect
 * criterion 36: the store's text is the one truth). The two layers agree
 * glyph for glyph because the textarea inherits the underlay's metrics and
 * clears the gutter column with its own left padding.
 *
 * The caret is the native one, painted by `--editor-caret`; the active-line
 * wash follows it while the editor is focused and leaves with it, which is
 * also what marks focus (criterion 28, amended by editability).
 *
 * One trailing empty line is rendered past the end of the flow, which is where
 * the next command would go.
 */
function YamlBody(): JSX.Element {
  const aiLines = useUiStore((state) => state.aiLines);
  const errorLines = useUiStore((state) => state.errorLines);
  const yaml = useFlowStore(selectYaml);
  const revision = useFlowStore(selectRevision);
  const edit = useFlowStore((state) => state.edit);
  const end = useRef<HTMLDivElement>(null);
  // 1-based line under the real caret, or null while the editor is blurred.
  const [caretLine, setCaretLine] = useState<number | null>(null);

  // Inspect criterion 39 — reveal what was just written. Guarded on the
  // revision, not the text: only a block arriving from outside the editor
  // scrolls — never a mount, never the user's own keystroke (`edit` leaves
  // the revision alone).
  useEffect(() => {
    if (revision > 0) {
      end.current?.scrollIntoView?.({ block: 'nearest' });
    }
  }, [revision]);

  const lines = yaml.replace(/\n$/, '').split('\n');
  const total = lines.length + 1;
  const gutterWidth = `${String(total).length}ch`;

  const syncCaret = (box: HTMLTextAreaElement): void => {
    setCaretLine(box.value.slice(0, box.selectionStart).split('\n').length);
  };

  return (
    <div className={styles.yaml} style={{ '--gutter-w': gutterWidth }}>
      {Array.from({ length: total }, (_unused, index) => {
        const number = index + 1;
        // Criterion 27: an error line wins over an AI line, and both win over
        // the line under the caret.
        const wash = errorLines.includes(number)
          ? 'error'
          : aiLines.includes(number)
            ? 'ai'
            : number === caretLine
              ? 'active'
              : undefined;

        return (
          <YamlLine
            gutterWidth={gutterWidth}
            key={number}
            number={number}
            text={lines[index] ?? ''}
            wash={wash}
          />
        );
      })}
      <textarea
        aria-label="Flow YAML"
        autoCapitalize="off"
        autoCorrect="off"
        className={styles.editorInput}
        onBlur={() => {
          setCaretLine(null);
        }}
        onChange={(event) => {
          edit(event.currentTarget.value);
          syncCaret(event.currentTarget);
        }}
        onFocus={(event) => {
          syncCaret(event.currentTarget);
        }}
        onSelect={(event) => {
          syncCaret(event.currentTarget);
        }}
        spellCheck={false}
        value={yaml}
      />
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
  const running = useRunStore(selectRunning);

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

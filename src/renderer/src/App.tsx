import { type JSX, useEffect, useLayoutEffect } from 'react';
import styles from './App.module.css';
import { FLOW_YAML } from './fixtures/flows';
import { useElementWidth } from './hooks/useElementWidth';
import { useWindowShortcuts } from './hooks/useWindowShortcuts';
import { countCommands } from './lib/yaml-tokens';
import { selectSidebarVisible, useUiStore } from './stores/ui.store';
import { DeviceMirror } from './views/DeviceMirror/DeviceMirror';
import { FlowEditor } from './views/FlowEditor/FlowEditor';
import { FlowList } from './views/FlowList/FlowList';
import { PublishSheet } from './views/PublishSheet/PublishSheet';
import { Toolbar } from './views/Toolbar/Toolbar';

/** The window opens at this width; the frame corrects it on first measure. */
const INITIAL_WIDTH = 1280;

/**
 * One macOS window on a quiet desktop: a unified toolbar over three adjacent
 * panes divided by hairlines (criteria 1–4). The window owns the single blur;
 * nothing inside it floats, and no region declares a `backdrop-filter` of its
 * own — nesting frost inside frost is the design system's biggest failure mode.
 *
 * This shell arranges views and mounts the window-wide subscriptions. It holds
 * no business logic, and nothing in this tree calls `window.conductor`.
 */
export function App(): JSX.Element {
  const dark = useUiStore((state) => state.dark);
  const running = useUiStore((state) => state.running);
  const reported = useUiStore((state) => state.steps.length);
  const setWindowWidth = useUiStore((state) => state.setWindowWidth);
  const sidebarVisible = useUiStore(selectSidebarVisible);
  const [frameRef, frameWidth] = useElementWidth(INITIAL_WIDTH);

  useWindowShortcuts();

  // A layout effect, not a plain one: the appearance has to be on the document
  // before the first paint, or the window flashes light and then goes dark
  // (criterion 6).
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? 'aurora-dark' : 'aurora';
  }, [dark]);

  useEffect(() => {
    setWindowWidth(frameWidth);
  }, [frameWidth, setWindowWidth]);

  const total = Math.max(countCommands(FLOW_YAML), 1);
  const progress = Math.min(100, Math.round((reported / total) * 100));

  return (
    <div className={styles.desktop} data-testid="window-frame" ref={frameRef}>
      <div aria-hidden="true" className={styles.wash} />

      <div className={styles.window}>
        <Toolbar />

        <div
          className={styles.panes}
          data-sidebar={sidebarVisible ? 'true' : undefined}
          data-testid="panes"
        >
          {running ? (
            <div
              className={styles.progress}
              data-testid="run-progress"
              style={{ width: `${progress}%` }}
            />
          ) : null}

          {sidebarVisible ? (
            <>
              <FlowList />
              <span aria-hidden="true" className={styles.hairline} data-testid="pane-hairline" />
            </>
          ) : null}

          <FlowEditor />
          <span aria-hidden="true" className={styles.hairline} data-testid="pane-hairline" />
          <DeviceMirror />
        </div>

        {/* Sheets mount on the WINDOW, not on the panes: the scrim has to
            cover the toolbar too, or the controls it blocks stay clickable
            and the panel centres off-window. */}
        <PublishSheet />
      </div>
    </div>
  );
}

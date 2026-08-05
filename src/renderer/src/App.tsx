import { type JSX, useEffect, useLayoutEffect } from 'react';
import styles from './App.module.css';
import { useElementWidth } from './hooks/useElementWidth';
import { useRunEvents } from './hooks/useRunEvents';
import { useWindowShortcuts } from './hooks/useWindowShortcuts';
import { countCommands } from './lib/yaml-tokens';
import { selectYaml, useFlowStore } from './stores/flow.store';
import { selectRunning, selectSettledStepCount, useRunStore } from './stores/run.store';
import { selectSidebarVisible, useUiStore } from './stores/ui.store';
import { DeviceMirror } from './views/DeviceMirror/DeviceMirror';
import { FlowEditor } from './views/FlowEditor/FlowEditor';
import { FlowList } from './views/FlowList/FlowList';
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
  // Run criterion 24 — the real run, over the open flow's own command count.
  const running = useRunStore(selectRunning);
  const settled = useRunStore(selectSettledStepCount);
  const yaml = useFlowStore(selectYaml);
  const setWindowWidth = useUiStore((state) => state.setWindowWidth);
  const sidebarVisible = useUiStore(selectSidebarVisible);
  const [frameRef, frameWidth] = useElementWidth(INITIAL_WIDTH);

  useWindowShortcuts();
  // App-wide, not view-scoped: the run outlives whichever lower tab is open.
  useRunEvents();

  // A layout effect, not a plain one: the appearance has to be on the document
  // before the first paint, or the window flashes light and then goes dark
  // (criterion 6).
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? 'aurora-dark' : 'aurora';
  }, [dark]);

  useEffect(() => {
    setWindowWidth(frameWidth);
  }, [frameWidth, setWindowWidth]);

  const total = Math.max(countCommands(yaml), 1);
  const progress = Math.min(100, Math.round((settled / total) * 100));

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
      </div>
    </div>
  );
}

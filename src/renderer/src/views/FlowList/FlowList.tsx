import type { FlowMeta } from '@shared/types';
import { Fragment, type JSX, useEffect, useRef, useState } from 'react';
import { ContextMenu, type ContextMenuItem } from '../../components/ContextMenu/ContextMenu';
import { Dialog } from '../../components/Dialog/Dialog';
import { EmptyState } from '../../components/EmptyState/EmptyState';
import { Icon } from '../../components/Icon/Icon';
import { IconButton } from '../../components/IconButton/IconButton';
import { StatusDot } from '../../components/StatusDot/StatusDot';
import { flowTree } from '../../lib/flow-tree';
import { selectSelectedId, useDeviceStore } from '../../stores/device.store';
import {
  type FlowDraft,
  type FlowItemKind,
  selectCollapsed,
  selectConfirm,
  selectDraft,
  selectIndex,
  selectIndexError,
  selectMenu,
  selectOpenPath,
  useFlowStore,
} from '../../stores/flow.store';
import { selectRunning, useRunStore } from '../../stores/run.store';
import { useUiStore } from '../../stores/ui.store';
import styles from './FlowList.module.css';

/** The mock's row metrics: 14px per level; rows base at 9, drafts at 7 —
 * the draft's 1px border eats the difference. */
const INDENT_PER_LEVEL = 14;
const ROW_BASE_PADDING = 9;
const DRAFT_BASE_PADDING = 7;

/** `.menu` in ContextMenu.module.css — the header "+" anchors right-aligned. */
const MENU_WIDTH = 232;

function parentOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash === -1 ? '' : path.slice(0, slash);
}

function nameOf(path: string): string {
  return path.split('/').at(-1) ?? path;
}

type FlowRowProps = {
  readonly flow: FlowMeta;
  readonly depth: 0 | 1;
  readonly selected: boolean;
  readonly onOpen: (path: string) => void;
  readonly onMenu: (path: string, x: number, y: number) => void;
};

/**
 * One flow (criterion 11). The dot is `never` until a future spec persists
 * run history (criterion 37); the ellipsis appears while the row is engaged.
 */
function FlowRow({ flow, depth, selected, onOpen, onMenu }: FlowRowProps): JSX.Element {
  const [engaged, setEngaged] = useState(false);

  return (
    <li
      className={styles.row}
      data-depth={depth}
      data-selected={selected ? 'true' : undefined}
      onBlur={() => {
        setEngaged(false);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(flow.path, event.clientX, event.clientY);
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
          onOpen(flow.path);
        }}
        style={{ paddingLeft: ROW_BASE_PADDING + depth * INDENT_PER_LEVEL }}
        type="button"
      >
        <StatusDot data-testid="flow-dot" state="never" />
        <span className={styles.labels}>
          <span className={styles.name}>{flow.name}</span>
          <span className={styles.meta}>{flow.commandCount} steps · never run</span>
        </span>
      </button>
      {engaged || selected ? (
        <IconButton
          className={styles.actions}
          icon="ellipsis"
          label="Flow actions"
          onClick={(event) => {
            event.stopPropagation();
            const rect = event.currentTarget.getBoundingClientRect();
            onMenu(flow.path, Math.round(rect.left), Math.round(rect.bottom + 4));
          }}
          size="sm"
        />
      ) : null}
    </li>
  );
}

type FolderRowProps = {
  readonly path: string;
  readonly count: number;
  readonly open: boolean;
  readonly onToggle: (path: string) => void;
  readonly onNewFlow: (path: string) => void;
  readonly onMenu: (path: string, x: number, y: number) => void;
};

/**
 * One folder (criterion 11): chevron, name — the relative path, so a deeper
 * directory reads `a/b` — and a trailing cell that shows the count at rest
 * and the "+" and ellipsis while engaged.
 */
function FolderRow({
  path,
  count,
  open,
  onToggle,
  onNewFlow,
  onMenu,
}: FolderRowProps): JSX.Element {
  const [engaged, setEngaged] = useState(false);

  return (
    <li
      className={styles.folderRow}
      onBlur={() => {
        setEngaged(false);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(path, event.clientX, event.clientY);
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
        className={styles.folderToggle}
        onClick={() => {
          onToggle(path);
        }}
        type="button"
      >
        <span className={styles.chevron} data-open={open ? 'true' : undefined}>
          <Icon name="chevron-right" size={12} />
        </span>
        <Icon className={styles.folderGlyph} name={open ? 'folder-open' : 'folder'} size={13} />
        <span className={styles.folderName}>{path}</span>
      </button>
      <span className={styles.folderTrail}>
        {engaged ? (
          <>
            <IconButton
              icon="plus"
              label={`New flow in ${path}`}
              onClick={(event) => {
                event.stopPropagation();
                onNewFlow(path);
              }}
              size="sm"
            />
            <IconButton
              icon="ellipsis"
              label="Folder actions"
              onClick={(event) => {
                event.stopPropagation();
                const rect = event.currentTarget.getBoundingClientRect();
                onMenu(path, Math.round(rect.left), Math.round(rect.bottom + 4));
              }}
              size="sm"
            />
          </>
        ) : (
          <span className={styles.folderCount} data-testid="folder-count">
            {count}
          </span>
        )}
      </span>
    </li>
  );
}

type DraftRowProps = {
  readonly draft: FlowDraft;
  readonly depth: 0 | 1;
  readonly onChange: (value: string) => void;
  readonly onCommit: () => void;
  readonly onCancel: () => void;
};

/**
 * Creating and renaming are the same interaction (criterion 16, Finder's
 * rule): the row becomes a field in place, the name pre-selected, Return
 * commits, Escape abandons, clicking away commits. A collision keeps the
 * field open with the reason under it (criterion 17).
 */
function DraftRow({ draft, depth, onChange, onCommit, onCancel }: DraftRowProps): JSX.Element {
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  return (
    <div className={styles.draft}>
      <div
        className={styles.draftField}
        data-error={draft.error !== null ? 'true' : undefined}
        style={{ paddingLeft: DRAFT_BASE_PADDING + depth * INDENT_PER_LEVEL }}
      >
        <Icon
          className={styles.draftGlyph}
          name={draft.kind === 'folder' ? 'folder' : 'file-code'}
          size={13}
        />
        <input
          aria-label={draft.kind === 'folder' ? 'Folder name' : 'Flow name'}
          className={styles.draftInput}
          onBlur={onCommit}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              onCommit();
            } else if (event.key === 'Escape') {
              // The window's own Escape must not also fire — cancelling the
              // draft is this key's whole job here.
              event.preventDefault();
              event.stopPropagation();
              onCancel();
            }
          }}
          placeholder={draft.kind === 'folder' ? 'folder name' : 'nome-do-fluxo'}
          ref={input}
          spellCheck={false}
          value={draft.value}
        />
      </div>
      {draft.error !== null ? (
        <p className={styles.draftError} style={{ paddingLeft: 8 + depth * INDENT_PER_LEVEL }}>
          {draft.error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The delete confirmation (criterion 23): it names the target as
 * `conductor/<path>`, says what else goes with it, and puts the destructive
 * verb on the button — never "OK".
 */
function DeleteConfirm(): JSX.Element | null {
  const confirm = useFlowStore(selectConfirm);
  const index = useFlowStore(selectIndex);
  const cancelDelete = useFlowStore((state) => state.cancelDelete);
  const confirmDelete = useFlowStore((state) => state.confirmDelete);

  if (confirm === null) {
    return null;
  }

  const folder = confirm.kind === 'folder';
  const inside = folder
    ? (index?.flows ?? []).filter(
        (flow) =>
          flow.folder === confirm.identity || flow.folder.startsWith(`${confirm.identity}/`),
      )
    : [];
  const title = folder ? nameOf(confirm.identity) : nameOf(confirm.identity);
  const subtitle = folder
    ? inside.length > 0
      ? `The folder and the ${inside.length} flow${inside.length === 1 ? '' : 's'} in it are removed from conductor/. This cannot be undone here.`
      : 'The folder is removed from conductor/. This cannot be undone here.'
    : 'The flow is removed from conductor/. This cannot be undone here.';

  return (
    <Dialog
      footer={
        <>
          <button className={styles.dialogGhost} onClick={cancelDelete} type="button">
            Cancel
          </button>
          <button
            className={styles.dialogDanger}
            onClick={() => {
              void confirmDelete();
            }}
            type="button"
          >
            <Icon name="trash-2" size={12} />
            {folder ? 'Delete folder' : 'Delete flow'}
          </button>
        </>
      }
      icon="trash-2"
      onClose={cancelDelete}
      subtitle={subtitle}
      title={`Delete “${title}”?`}
    >
      <div className={styles.dialogWell}>
        <div className={styles.dialogTarget}>
          <Icon name={folder ? 'folder' : 'file-code'} size={13} />
          <span className={styles.dialogTargetName}>
            conductor/{confirm.identity}
            {folder ? '/' : ''}
          </span>
        </div>
        {inside.length > 0 ? (
          <div className={styles.dialogList}>
            {inside.slice(0, 4).map((flow) => (
              <span key={flow.path}>{flow.name}</span>
            ))}
            {inside.length > 4 ? (
              <span className={styles.dialogMore}>+{inside.length - 4} more</span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * The Flows sidebar as the mock's tree (criteria 11–27, 35–37): header with
 * the truthful count and the "+" menu, search that flattens, the folder tree
 * with inline drafts, both context menus, the delete confirmation, and the
 * empty and error states.
 */
export function FlowList(): JSX.Element {
  const query = useUiStore((state) => state.query);
  const setQuery = useUiStore((state) => state.setQuery);
  const setLowerPanel = useUiStore((state) => state.setLowerPanel);

  const index = useFlowStore(selectIndex);
  const indexError = useFlowStore(selectIndexError);
  const openPath = useFlowStore(selectOpenPath);
  const collapsed = useFlowStore(selectCollapsed);
  const draft = useFlowStore(selectDraft);
  const menu = useFlowStore(selectMenu);
  const refresh = useFlowStore((state) => state.refresh);
  const openFlow = useFlowStore((state) => state.openFlow);
  const readFlow = useFlowStore((state) => state.readFlow);
  const flushSave = useFlowStore((state) => state.flushSave);
  const toggleFolder = useFlowStore((state) => state.toggleFolder);
  const startDraft = useFlowStore((state) => state.startDraft);
  const startRename = useFlowStore((state) => state.startRename);
  const setDraftValue = useFlowStore((state) => state.setDraftValue);
  const cancelDraft = useFlowStore((state) => state.cancelDraft);
  const commitDraft = useFlowStore((state) => state.commitDraft);
  const duplicateFlow = useFlowStore((state) => state.duplicateFlow);
  const openMenu = useFlowStore((state) => state.openMenu);
  const closeMenu = useFlowStore((state) => state.closeMenu);
  const askDelete = useFlowStore((state) => state.askDelete);

  const deviceId = useDeviceStore(selectSelectedId);
  const running = useRunStore(selectRunning);
  const startRun = useRunStore((state) => state.start);

  const [plusMenu, setPlusMenu] = useState<{ x: number; y: number } | null>(null);

  const flowCount = index?.flows.length ?? 0;
  const tree = flowTree(index ?? { flows: [], folders: [] }, query);
  const collapsedSet = new Set(collapsed);

  const rowMenu = (kind: FlowItemKind) => (identity: string, x: number, y: number) => {
    openMenu({ kind, identity, x, y });
  };

  /** Criterion 25 — reads the saved file and starts it on the selected
   * device; the flush first makes "saved" mean "what you see". */
  const runNow = (path: string): void => {
    closeMenu();
    if (deviceId === null || running) {
      return;
    }
    void (async () => {
      await flushSave();
      const yaml = await readFlow(path);
      if (yaml === null || yaml.trim() === '') {
        return;
      }
      setLowerPanel('run');
      await startRun(deviceId, yaml);
    })();
  };

  const onFlowMenuSelect = (id: string): void => {
    const path = menu?.identity ?? '';
    switch (id) {
      case 'open':
        closeMenu();
        void openFlow(path);
        break;
      case 'rename':
        startRename('flow', path);
        break;
      case 'duplicate':
        void duplicateFlow(path);
        break;
      case 'new':
        startDraft('flow', parentOf(path));
        break;
      case 'run':
        runNow(path);
        break;
      case 'delete':
        askDelete('flow', path);
        break;
      default:
        break;
    }
  };

  const onFolderMenuSelect = (id: string): void => {
    const folder = menu?.identity ?? '';
    switch (id) {
      case 'new':
        startDraft('flow', folder);
        break;
      case 'rename':
        startRename('folder', folder);
        break;
      case 'delete':
        askDelete('folder', folder);
        break;
      default:
        break;
    }
  };

  /** Criterion 25's menu, in the mock's order and grouping. */
  const flowMenuItems: readonly ContextMenuItem[] = [
    { type: 'command', id: 'open', label: 'Open in editor', icon: 'file-code' },
    { type: 'command', id: 'rename', label: 'Rename…', icon: 'pencil' },
    { type: 'command', id: 'duplicate', label: 'Duplicate', icon: 'copy' },
    { type: 'separator' },
    { type: 'command', id: 'new', label: 'New flow here', icon: 'file-plus' },
    { type: 'separator' },
    {
      type: 'command',
      id: 'run',
      label: 'Run now',
      icon: 'play',
      disabled: deviceId === null || running,
    },
    { type: 'separator' },
    { type: 'command', id: 'delete', label: 'Delete flow', icon: 'trash-2', destructive: true },
  ];

  /** Criterion 26's menu. */
  const folderMenuItems: readonly ContextMenuItem[] = [
    { type: 'command', id: 'new', label: 'New flow here', icon: 'file-code' },
    { type: 'command', id: 'rename', label: 'Rename folder…', icon: 'pencil' },
    { type: 'separator' },
    { type: 'command', id: 'delete', label: 'Delete folder', icon: 'trash-2', destructive: true },
  ];

  const draftRow = (folder: string, depth: 0 | 1): JSX.Element | null =>
    draft !== null &&
    draft.renaming === null &&
    draft.kind === 'flow' &&
    draft.folder === folder ? (
      <li className={styles.draftItem} data-depth={depth}>
        <DraftRow
          depth={depth}
          draft={draft}
          onCancel={cancelDraft}
          onChange={setDraftValue}
          onCommit={() => {
            void commitDraft();
          }}
        />
      </li>
    ) : null;

  const flowOrRename = (meta: FlowMeta, depth: 0 | 1): JSX.Element =>
    draft !== null && draft.kind === 'flow' && draft.renaming === meta.path ? (
      <li className={styles.draftItem} data-depth={depth} key={meta.path}>
        <DraftRow
          depth={depth}
          draft={draft}
          onCancel={cancelDraft}
          onChange={setDraftValue}
          onCommit={() => {
            void commitDraft();
          }}
        />
      </li>
    ) : (
      <FlowRow
        depth={depth}
        flow={meta}
        key={meta.path}
        onMenu={rowMenu('flow')}
        onOpen={(path) => {
          void openFlow(path);
        }}
        selected={meta.path === openPath}
      />
    );

  const workspaceEmpty =
    index !== null && index.flows.length === 0 && index.folders.length === 0 && draft === null;

  return (
    <section aria-label="Flows" className={styles.panel}>
      <header className={styles.header}>
        <span className={styles.caps}>Flows</span>
        {/* Criterion 37 — the truthful line: the workspace and its count. */}
        <span className={styles.count}>
          conductor/ · {flowCount} {flowCount === 1 ? 'flow' : 'flows'}
        </span>
        <span className={styles.spacer} />
        <IconButton
          icon="plus"
          label="New flow or folder"
          onClick={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setPlusMenu({
              x: Math.round(Math.max(8, rect.right - MENU_WIDTH)),
              y: Math.round(rect.bottom + 5),
            });
          }}
          selected={plusMenu !== null}
          size="sm"
        />
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

      {indexError !== null ? (
        /* Criterion 36 — never a silent empty tree. */
        <EmptyState
          action={
            <button
              className={styles.retry}
              onClick={() => {
                void refresh();
              }}
              type="button"
            >
              Try again
            </button>
          }
          description={indexError.message}
          icon="triangle-alert"
          title="Can’t open your flows"
        />
      ) : workspaceEmpty && query.trim() === '' ? (
        /* Criterion 35 — the first run starts empty and says what to do. */
        <EmptyState
          action={
            <button
              className={styles.primaryAction}
              onClick={() => {
                startDraft('flow', '');
              }}
              type="button"
            >
              <Icon name="plus" size={12} />
              New flow
            </button>
          }
          description="Create a flow and it saves itself here as you edit."
          icon="scroll-text"
          title="No flows yet"
        />
      ) : tree.mode === 'search' && tree.matches.length === 0 ? (
        <p className={styles.empty}>Nothing matches “{query}”.</p>
      ) : (
        <ul className={`${styles.rows} a-scroll`}>
          {tree.mode === 'search' ? (
            tree.matches.map((meta) => flowOrRename(meta, 0))
          ) : (
            <>
              {tree.folders.map((folder) => {
                const open = !collapsedSet.has(folder.path);
                const renamingThis =
                  draft !== null && draft.kind === 'folder' && draft.renaming === folder.path;
                return (
                  <Fragment key={folder.path}>
                    {renamingThis ? (
                      <li className={styles.draftItem} data-depth={0}>
                        <DraftRow
                          depth={0}
                          draft={draft}
                          onCancel={cancelDraft}
                          onChange={setDraftValue}
                          onCommit={() => {
                            void commitDraft();
                          }}
                        />
                      </li>
                    ) : (
                      <FolderRow
                        count={folder.flows.length}
                        onMenu={rowMenu('folder')}
                        onNewFlow={(path) => {
                          startDraft('flow', path);
                        }}
                        onToggle={toggleFolder}
                        open={open}
                        path={folder.path}
                      />
                    )}
                    {open ? (
                      <>
                        {folder.flows.map((meta) => flowOrRename(meta, 1))}
                        {draftRow(folder.path, 1)}
                        {folder.flows.length === 0 &&
                        !(
                          draft !== null &&
                          draft.renaming === null &&
                          draft.folder === folder.path
                        ) ? (
                          /* Criterion 13 — a folder just made must be
                                 visible, and visibly actionable. */
                          <li className={styles.emptyFolderItem}>
                            <button
                              className={styles.emptyFolder}
                              onClick={() => {
                                startDraft('flow', folder.path);
                              }}
                              type="button"
                            >
                              <Icon name="plus" size={11} />
                              Empty — add a flow
                            </button>
                          </li>
                        ) : null}
                      </>
                    ) : null}
                  </Fragment>
                );
              })}
              {tree.loose.map((meta) => flowOrRename(meta, 0))}
              {/* A folder draft always lands at the root (criterion 20). */}
              {draft !== null && draft.renaming === null && draft.kind === 'folder' ? (
                <li className={styles.draftItem} data-depth={0}>
                  <DraftRow
                    depth={0}
                    draft={draft}
                    onCancel={cancelDraft}
                    onChange={setDraftValue}
                    onCommit={() => {
                      void commitDraft();
                    }}
                  />
                </li>
              ) : null}
              {draftRow('', 0)}
            </>
          )}
        </ul>
      )}

      <div className={styles.bottomBar}>
        <button className={styles.suiteRun} type="button">
          <Icon name="play" size={12} />
          Run whole suite
        </button>
        <IconButton icon="settings" label="Settings" size="sm" />
      </div>

      {plusMenu !== null ? (
        /* Criterion 16 — New flow (⌘N) and New folder (⇧⌘N). */
        <ContextMenu
          items={[
            { type: 'command', id: 'flow', label: 'New flow', icon: 'file-code', shortcut: '⌘N' },
            {
              type: 'command',
              id: 'folder',
              label: 'New folder',
              icon: 'folder-plus',
              shortcut: '⇧⌘N',
            },
          ]}
          onClose={() => {
            setPlusMenu(null);
          }}
          onSelect={(id) => {
            setPlusMenu(null);
            startDraft(id === 'folder' ? 'folder' : 'flow', '');
          }}
          x={plusMenu.x}
          y={plusMenu.y}
        />
      ) : null}

      {menu !== null && menu.kind === 'flow' ? (
        <ContextMenu
          items={flowMenuItems}
          onClose={closeMenu}
          onSelect={onFlowMenuSelect}
          x={menu.x}
          y={menu.y}
        />
      ) : null}

      {menu !== null && menu.kind === 'folder' ? (
        <ContextMenu
          items={folderMenuItems}
          onClose={closeMenu}
          onSelect={onFolderMenuSelect}
          title={`${menu.identity}/`}
          x={menu.x}
          y={menu.y}
        />
      ) : null}

      <DeleteConfirm />
    </section>
  );
}

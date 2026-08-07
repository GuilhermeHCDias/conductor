import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { is } from '@electron-toolkit/utils';
import { BrowserWindow } from 'electron';

/**
 * Where the renderer lives: the dev server under `electron-vite dev`, the
 * bundled HTML otherwise. Also the allowlist the IPC sender guard checks
 * against, so the two can never drift apart.
 */
export const RENDERER_URL =
  is.dev && process.env.ELECTRON_RENDERER_URL !== undefined
    ? process.env.ELECTRON_RENDERER_URL
    : pathToFileURL(join(__dirname, '../renderer/index.html')).href;

export function isRendererUrl(url: string): boolean {
  return (
    url === RENDERER_URL ||
    url.startsWith(`${RENDERER_URL}/`) ||
    url.startsWith(`${RENDERER_URL}?`) ||
    url.startsWith(`${RENDERER_URL}#`)
  );
}

// electron-builder reads `build/icon.png` when packaging, but `electron-vite
// dev` never runs that pipeline — the dev window and Dock have to point at
// it themselves.
export const ICON_PATH = join(__dirname, '../../build/icon.png');

/** The workspace geometry, shared by the factory and `presentWorkspace` so
 * the two can never disagree about what "normal size" means. */
const WORKSPACE = { width: 1280, height: 820, minWidth: 960, minHeight: 640 } as const;

/** First run (repo-connect spec): 560 wide per the design, fixed — the
 * connect card is the whole window and has nothing to grow into. */
const CONNECT = { width: 560, height: 520 } as const;

/**
 * The one and only `BrowserWindow` factory — it carries the §9.3 flags.
 * `view` picks the geometry: the small fixed connect window while no repo is
 * active, the workspace otherwise. Same window, same flags, different size.
 */
export function createWindow(view: 'connect' | 'workspace' = 'workspace'): BrowserWindow {
  const bounds =
    view === 'connect'
      ? {
          width: CONNECT.width,
          height: CONNECT.height,
          resizable: false,
          maximizable: false,
          fullscreenable: false,
        }
      : WORKSPACE;
  const mainWindow = new BrowserWindow({
    ...bounds,
    show: false,
    autoHideMenuBar: true,
    icon: ICON_PATH,
    // The Aurora shell is one macOS window: the OS draws the traffic lights,
    // and the renderer's toolbar reserves the 70px they span. Drawing our own
    // would put a frame inside a frame.
    titleBarStyle: 'hiddenInset',
    // 18px in from the window edge, and centred in the 52px toolbar: the
    // renderer paints that toolbar at the very top of the window, so these
    // land inside it and clear of the 70px it holds open for them.
    trafficLightPosition: { x: 18, y: 20 },
    vibrancy: 'under-window',
    // Vibrancy only renders through a transparent window background. The
    // renderer paints `--bg-window` and the wash over it, so nothing shows
    // through in practice — but an opaque colour here would disable the
    // material outright, and would flash the wrong theme on resize.
    backgroundColor: '#00000000',
    title: 'Conductor',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // §9.3: nothing opens a second window, and the renderer never leaves its
  // own origin. A link that wants a browser is an IPC method, not an escape.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  // Electron checklist item 4, the companion to the sender check in ipc/handle.ts:
  // a local placeholder UI has no use for camera, microphone, geolocation or
  // notifications, and the default session would otherwise grant some of them.
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, grant) => {
    grant(false);
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isRendererUrl(url)) {
      event.preventDefault();
    }
  });

  void mainWindow.loadURL(RENDERER_URL);

  return mainWindow;
}

/**
 * The first repo just became active: the same window grows into the
 * workspace — one BrowserWindow, resized and recentred, never a second one
 * (repo-connect spec). Ordering matters: minimum and resizability first, or
 * `setSize` would be clamped by the connect window's fixed bounds.
 */
export function presentWorkspace(window: BrowserWindow): void {
  if (window.isDestroyed()) {
    return;
  }
  window.setMinimumSize(WORKSPACE.minWidth, WORKSPACE.minHeight);
  window.setResizable(true);
  window.setMaximizable(true);
  window.setFullScreenable(true);
  window.setSize(WORKSPACE.width, WORKSPACE.height);
  window.center();
}

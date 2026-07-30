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

/** The one and only `BrowserWindow` factory — it carries the §9.3 flags. */
export function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0f131b',
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

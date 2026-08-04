import { homedir } from 'node:os';
import { optimizer } from '@electron-toolkit/utils';
import { CONFIG } from '@shared/config';
import { PUSH_CHANNELS, type PushChannel, type PushPayload } from '@shared/ipc';
import { app, BrowserWindow, shell } from 'electron';
import { registerAppIpc } from './ipc/app';
import { registerDeviceIpc } from './ipc/device';
import { registerViewerIpc } from './ipc/viewer';
import { AdbBridge } from './maestro/AdbBridge';
import { LocalGateway } from './maestro/LocalGateway';
import { isExecutable } from './process/executable';
import { run, spawnStreaming } from './process/run';
import { DeviceService } from './services/device.service';
import { ViewerService } from './services/viewer.service';
import { createWindow } from './window';

/**
 * The composition root: it owns the service registry, registers the IPC
 * handlers and creates the window. Services are constructed here and nowhere
 * else — a class you cannot instantiate in a test with fakes is shaped wrong.
 */

/** Anything holding a process, session or watcher implements this and is
 * pushed here, so `before-quit` leaves no orphaned JVM, `claude` session or
 * chokidar watcher behind. */
interface Service {
  dispose: () => void | Promise<void>;
}

const services: Service[] = [];

function disposeServices(): Promise<unknown> {
  return Promise.allSettled(services.map((service) => service.dispose()));
}

/** The push half of the contract. Every window of ours gets it; a window that
 * is gone is not an error, it is just no longer listening. */
function broadcast<C extends PushChannel>(channel: C, payload: PushPayload<C>): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  }
}

// Two Conductors would fight over the repo clone and the on-device driver
// (.context.md §4.3.6), so the second instance hands focus back and leaves.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [existing] = BrowserWindow.getAllWindows();
    if (existing === undefined) {
      return;
    }
    if (existing.isMinimized()) {
      existing.restore();
    }
    existing.focus();
  });

  app.on('browser-window-created', (_event, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });

  // `before-quit` does not await a listener, so firing disposal and returning
  // would let the process exit out from under it — the orphaned JVMs and
  // `claude` sessions this registry exists to prevent. Hold the quit open for
  // exactly one pass instead, then let it through. (A service whose `dispose`
  // never settles would stall the quit; that is a bug in the service.)
  let quitting = false;
  app.on('before-quit', (event) => {
    if (quitting) {
      return;
    }
    quitting = true;
    event.preventDefault();
    void disposeServices().finally(() => {
      app.quit();
    });
  });

  void app.whenReady().then(() => {
    // The one place any of this is constructed. Every dependency is passed in,
    // which is what lets each class above be tested with fakes.
    const home = homedir();
    const adb = new AdbBridge({
      run,
      isExecutable,
      env: process.env,
      home,
      configuredPath: CONFIG.ADB_PATH,
    });
    const device = new DeviceService({
      gateway: new LocalGateway(adb),
      appId: CONFIG.APP_ID,
      emit: (payload) => {
        broadcast(PUSH_CHANNELS.deviceChanged, payload);
      },
    });
    const viewer = new ViewerService({
      spawn: spawnStreaming,
      isExecutable,
      env: process.env,
      home,
      configuredPath: CONFIG.MAESTRO_PATH,
      // §9.3: the URL is validated inside the service before it gets here, and
      // the renderer never sees a navigation of its own.
      openExternal: (url) => shell.openExternal(url),
    });
    services.push(device, viewer);

    registerAppIpc();
    registerDeviceIpc({ device });
    registerViewerIpc({ viewer });

    createWindow();
    // Starts after the window exists, so its first push has somewhere to land.
    device.start();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

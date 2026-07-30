import { optimizer } from '@electron-toolkit/utils';
import { app, BrowserWindow } from 'electron';
import { registerAppIpc } from './ipc/app';
import { createWindow } from './window';

/**
 * The composition root: it owns the service registry, registers the IPC
 * handlers and creates the window. Services are constructed here and nowhere
 * else — a class you cannot instantiate in a test with fakes is shaped wrong.
 */

/** Anything holding a process, session or watcher implements this and is
 * pushed here, so `before-quit` leaves no orphaned JVM, `claude` session or
 * chokidar watcher behind. The first entries arrive with `MaestroGateway`. */
interface Service {
  dispose: () => void | Promise<void>;
}

const services: Service[] = [];

function disposeServices(): Promise<unknown> {
  return Promise.allSettled(services.map((service) => service.dispose()));
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
    registerAppIpc();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });
}

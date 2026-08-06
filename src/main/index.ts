import { homedir } from 'node:os';
import { join } from 'node:path';
import { optimizer } from '@electron-toolkit/utils';
import { CONFIG } from '@shared/config';
import { PUSH_CHANNELS, type PushChannel, type PushPayload } from '@shared/ipc';
import { app, BrowserWindow } from 'electron';
import { registerAppIpc } from './ipc/app';
import { registerDeviceIpc } from './ipc/device';
import { registerFlowIpc } from './ipc/flow';
import { registerMaestroIpc } from './ipc/maestro';
import { registerRunIpc } from './ipc/run';
import { AdbBridge } from './maestro/AdbBridge';
import { CliRunner } from './maestro/CliRunner';
import { LocalGateway } from './maestro/LocalGateway';
import { connectLoopback, ScrcpySource, scrcpyJarPath } from './maestro/ScrcpySource';
import { ScreenCapture } from './maestro/ScreenCapture';
import { isExecutable } from './process/executable';
import { run, runBinary, spawnStreaming } from './process/run';
import { DeviceService } from './services/device.service';
import { FlowService } from './services/flow.service';
import { MaestroMcpService } from './services/maestro-mcp.service';
import { RunService } from './services/run.service';
import { SnapshotService } from './services/snapshot.service';
import { createWindow, ICON_PATH } from './window';

/**
 * The composition root: it owns the service registry, registers the IPC
 * handlers and creates the window. Services are constructed here and nowhere
 * else — a class you cannot instantiate in a test with fakes is shaped wrong.
 */

/** Anything holding a process, session or watcher implements this and is
 * pushed here, so `before-quit` leaves no orphaned JVM, `claude` session or
 * filesystem watcher behind. */
interface Service {
  dispose: () => void | Promise<void>;
}

const services: Service[] = [];

function disposeServices(): Promise<unknown> {
  return Promise.allSettled(services.map((service) => service.dispose()));
}

/**
 * Criterion 24. A renderer that reloads or closes is not coming back for its
 * mirror sessions, and the server it left running on the device would outlive
 * the window — an orphan that survives `pkill` and needs `kill -9` by pid, as
 * the spike found out. `did-start-loading` covers the reload (the first load
 * has nothing to stop, so it is harmless there), and `closed` covers the rest.
 *
 * One window, one session, so "this renderer's sessions" and "every session"
 * are the same set — a second mirror at a time is out of scope on purpose.
 */
function watchRenderer(window: BrowserWindow, device: DeviceService): void {
  window.webContents.on('did-start-loading', () => {
    void device.stopMirrors();
  });
  window.on('closed', () => {
    void device.stopMirrors();
  });
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
    // Only `electron-builder` sets the packaged app's Dock icon; a dev run
    // launches the bare Electron binary, so the Dock would otherwise show
    // Electron's own icon instead of ours.
    if (process.platform === 'darwin' && !app.isPackaged) {
      app.dock?.setIcon(ICON_PATH);
    }

    // The one place any of this is constructed. Every dependency is passed in,
    // which is what lets each class above be tested with fakes.
    const home = homedir();
    const adb = new AdbBridge({
      run,
      spawn: spawnStreaming,
      isExecutable,
      env: process.env,
      home,
      configuredPath: CONFIG.ADB_PATH,
    });
    // The jar is ours and pinned: `app.isPackaged` and `process.resourcesPath`
    // are the only two facts `scrcpyJarPath` needs, and this is the only place
    // that knows them. Nothing here joins the path itself.
    const scrcpy = new ScrcpySource({
      adb,
      connect: connectLoopback,
      jarPath: scrcpyJarPath({
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        appPath: app.getAppPath(),
      }),
    });
    // The one persistent `maestro mcp` child, and the source of the view
    // hierarchy: ~180ms per `inspect_screen` on a warm session against ~3.83s
    // for `maestro hierarchy`, which is why it stays up rather than being
    // started per call.
    const mcp = new MaestroMcpService({
      spawn: spawnStreaming,
      isExecutable,
      env: process.env,
      home,
      configuredPath: CONFIG.MAESTRO_PATH,
    });
    // Bytes, and never through Maestro (§10.1 rule 13): `runBinary` rather than
    // `run`, because the latter decodes stdout as UTF-8 and a PNG does not
    // survive it.
    const capture = new ScreenCapture({ adb, run: runBinary });
    // The raw-CLI door (§9.2) — the only maestro-spawner besides the mcp child.
    const cli = new CliRunner({
      spawn: spawnStreaming,
      isExecutable,
      env: process.env,
      home,
      configuredPath: CONFIG.MAESTRO_PATH,
    });
    const gateway = new LocalGateway(adb, scrcpy, mcp, capture, cli);
    const device = new DeviceService({
      gateway,
      appId: CONFIG.APP_ID,
      emit: (payload) => {
        broadcast(PUSH_CHANNELS.deviceChanged, payload);
      },
      emitMirror: (payload) => {
        broadcast(PUSH_CHANNELS.mirrorEvent, payload);
      },
    });
    // Holds no process and no watcher — the MCP child behind `hierarchy()`
    // stays `MaestroMcpService`'s — so it is not in the disposal registry.
    const snapshot = new SnapshotService({ gateway });
    // Owns the live `maestro test` child and §4.3.2's exclusion: it suspends
    // the snapshot path before the CLI spawns and resumes it on settle.
    const runService = new RunService({
      gateway,
      snapshots: snapshot,
      emit: (payload) => {
        broadcast(PUSH_CHANNELS.runEvent, payload);
      },
      runsDir: join(app.getPath('userData'), 'runs'),
    });
    // The local flow workspace (§7): userData/repo is where the publish spec
    // will later put the clone, so user files never move when it arrives. The
    // root is computed here and nowhere else (criterion 1).
    const flowService = new FlowService({
      root: join(app.getPath('userData'), 'repo', CONFIG.FLOWS_DIR),
      appId: CONFIG.APP_ID,
      extensions: CONFIG.FLOW_EXTENSIONS,
      emit: (payload) => {
        broadcast(PUSH_CHANNELS.flowChanged, payload);
      },
    });
    services.push(device, mcp, runService, flowService);

    registerAppIpc();
    registerDeviceIpc({ device });
    registerMaestroIpc({ snapshot });
    registerRunIpc({ run: runService });
    registerFlowIpc({ flow: flowService });

    watchRenderer(createWindow(), device);
    // Starts after the window exists, so its first push has somewhere to land.
    device.start();
    void flowService.start();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        watchRenderer(createWindow(), device);
      }
    });
  });
}

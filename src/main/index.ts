import { homedir } from 'node:os';
import { join } from 'node:path';
import { optimizer } from '@electron-toolkit/utils';
import { CONFIG } from '@shared/config';
import { PUSH_CHANNELS, type PushChannel, type PushPayload } from '@shared/ipc';
import { app, BrowserWindow, shell } from 'electron';
import { registerAiIpc } from './ipc/ai';
import { registerAppIpc } from './ipc/app';
import { registerDeviceIpc } from './ipc/device';
import { registerDoctorIpc } from './ipc/doctor';
import { registerFlowIpc } from './ipc/flow';
import { registerMaestroIpc } from './ipc/maestro';
import { registerPublishIpc } from './ipc/publish';
import { registerRepoIpc } from './ipc/repo';
import { registerRunIpc } from './ipc/run';
import { AdbBridge } from './maestro/AdbBridge';
import { CliRunner } from './maestro/CliRunner';
import { LocalGateway } from './maestro/LocalGateway';
import { resolveMaestro } from './maestro/resolve-maestro';
import { connectLoopback, ScrcpySource, scrcpyJarPath } from './maestro/ScrcpySource';
import { ScreenCapture } from './maestro/ScreenCapture';
import { ScreenRecorder } from './maestro/ScreenRecorder';
import { isExecutable, isFile } from './process/executable';
import { run, runBinary, spawnStreaming } from './process/run';
import { AiService } from './services/ai.service';
import { DeviceService } from './services/device.service';
import { DoctorService } from './services/doctor.service';
import { hiddenTools, hideTools } from './services/doctor-hide';
import { downloadToFile } from './services/download';
import { FlowService } from './services/flow.service';
import { findHomebrew } from './services/homebrew';
import { MaestroMcpService } from './services/maestro-mcp.service';
import { conductorPluginDir, PublishService } from './services/publish.service';
import { RepoService, type RepoWorkspace } from './services/repo.service';
import { resolveClaude } from './services/resolve-claude';
import { resolveGh } from './services/resolve-gh';
import { RunService } from './services/run.service';
import { SnapshotService } from './services/snapshot.service';
import { createWindow, ICON_PATH, presentConnect, presentSetup, presentWorkspace } from './window';

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

  void app.whenReady().then(async () => {
    // Only `electron-builder` sets the packaged app's Dock icon; a dev run
    // launches the bare Electron binary, so the Dock would otherwise show
    // Electron's own icon instead of ours.
    if (process.platform === 'darwin' && !app.isPackaged) {
      app.dock?.setIcon(ICON_PATH);
    }

    // The one place any of this is constructed. Every dependency is passed in,
    // which is what lets each class above be tested with fakes.
    const home = homedir();
    const userData = app.getPath('userData');
    // Doctor criterion 40 — `CONDUCTOR_DOCTOR_HIDE` (dev only) makes named
    // tools absent for every consumer at once: one wrapped probe, walked by
    // every resolver ladder below. Packaged builds ignore the variable.
    const hidden = hiddenTools(process.env, app.isPackaged);
    const probe = hideTools(isExecutable, hidden);
    // Conductor's own pinned Maestro (§10 as amended) — the managed rung of
    // the one `resolveMaestro` ladder. Only this file knows the directory.
    const managedMaestroDir = join(userData, 'maestro');
    // The repo domain (§2.1): the connected list, the active repo and the
    // resolver behind the connect screen. Constructed and loaded first,
    // because the active repo decides the flow workspace root, the device
    // service's app id and the window's opening size. `applyWorkspace` is a
    // hoisted declaration on purpose — the flow service it re-points does
    // not exist yet, and the callback only fires on a connect or switch,
    // long after everything is wired.
    const repoService = new RepoService({
      reposDir: join(app.getPath('userData'), 'repos'),
      stateFile: join(app.getPath('userData'), 'repos.json'),
      flowsDir: CONFIG.FLOWS_DIR,
      extensions: CONFIG.FLOW_EXTENSIONS,
      resolveGh: () =>
        resolveGh({ configuredPath: CONFIG.GH_PATH, env: process.env, home, isExecutable: probe }),
      run,
      emitChanged: (payload) => {
        broadcast(PUSH_CHANNELS.repoChanged, payload);
      },
      emitResolveEvent: (payload) => {
        broadcast(PUSH_CHANNELS.repoResolveEvent, payload);
      },
      onWorkspaceChanged: (workspace) => applyWorkspace(workspace),
    });
    await repoService.start();
    const workspace = repoService.activeWorkspace();

    // While no repo is active the single window is the small connect card;
    // the first confirm grows that same window into the workspace. A switch
    // later re-points the workspace without touching geometry. Before either,
    // on a launch whose managed Maestro is missing or behind the pin, the
    // same window is the installer (doctor criterion 14).
    let connectWindow = false;

    async function applyWorkspace(next: RepoWorkspace | null): Promise<void> {
      await flowService.setWorkspace(next);
      // The publish domain follows the same switch: the control reflects the
      // new repo's own unsent set and review state (criteria 9, 28).
      await publishService.activeRepoChanged();
      // And the assistant's conversation resets implicitly — it is about one
      // repo's flows and one clone's cwd (ai criterion 12).
      aiService.activeRepoChanged();
      if (connectWindow && next !== null) {
        connectWindow = false;
        for (const window of BrowserWindow.getAllWindows()) {
          presentWorkspace(window);
        }
      }
    }

    const openWindow = (): BrowserWindow => {
      connectWindow = repoService.activeWorkspace() === null;
      const setup = doctorService.state().setup.active;
      const window = createWindow(setup ? 'setup' : connectWindow ? 'connect' : 'workspace');
      // Doctor criterion 6 — the first report runs after first paint, never
      // before; and the focus recheck is the "install it in the terminal,
      // come back" loop.
      window.once('show', () => {
        doctorService.windowShown();
      });
      window.on('focus', () => {
        doctorService.windowFocused();
      });
      // Criterion 23 — while the installer runs, the OS close button is the
      // only way out, and it quits: nothing else on macOS would, and a
      // headless Conductor downloading 315 MB is not a state anyone chose.
      window.on('closed', () => {
        if (doctorService.state().setup.active) {
          app.quit();
        }
      });
      return window;
    };

    /** Managed-tools criterion 32 — the first report found gh signed out:
     * the same window goes back to the installer geometry. */
    const presentSetupAgain = (): void => {
      for (const window of BrowserWindow.getAllWindows()) {
        presentSetup(window);
      }
    };

    /** Doctor criterion 16 — setup finished, installed and signed in: the
     * same window becomes the connect card or the workspace. */
    const presentAfterSetup = (): void => {
      connectWindow = repoService.activeWorkspace() === null;
      for (const window of BrowserWindow.getAllWindows()) {
        if (connectWindow) {
          presentConnect(window);
        } else {
          presentWorkspace(window);
        }
      }
    };

    const adb = new AdbBridge({
      run,
      spawn: spawnStreaming,
      isExecutable: probe,
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
      isExecutable: probe,
      isFile,
      env: process.env,
      home,
      configuredPath: CONFIG.MAESTRO_PATH,
      managedDir: managedMaestroDir,
    });
    // Bytes, and never through Maestro (§10.1 rule 13): `runBinary` rather than
    // `run`, because the latter decodes stdout as UTF-8 and a PNG does not
    // survive it.
    const capture = new ScreenCapture({ adb, run: runBinary });
    // The run's video, through the OS like the screenshot (§12 rule 13 as
    // amended): the bridge's streaming shell keeps `screenrecord` up for the
    // length of the run, and `run` carries the stop signal and the cleanup.
    const recorder = new ScreenRecorder({ adb, run });
    // The raw-CLI door (§9.2) — the only maestro-spawner besides the mcp child.
    const cli = new CliRunner({
      spawn: spawnStreaming,
      isExecutable: probe,
      isFile,
      env: process.env,
      home,
      configuredPath: CONFIG.MAESTRO_PATH,
      managedDir: managedMaestroDir,
    });
    const gateway = new LocalGateway(adb, scrcpy, mcp, capture, cli, recorder);
    // The publish domain (§8): owns the send pipeline, the AI note and the
    // publication state — its own file, keyed by repo slug. Git runs as the
    // `git` binary through `run` (§9.1 as amended); `gh` and `claude` resolve
    // the way they do everywhere.
    const publishService = new PublishService({
      stateFile: join(app.getPath('userData'), 'publications.json'),
      jobsDir: join(app.getPath('userData'), 'publish-jobs'),
      pluginDir: conductorPluginDir({
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        appPath: app.getAppPath(),
      }),
      flowsDir: CONFIG.FLOWS_DIR,
      extensions: CONFIG.FLOW_EXTENSIONS,
      baseBranchOverride: CONFIG.REPO_BASE_BRANCH,
      describeModel: CONFIG.AI_DESCRIBE_MODEL,
      describeBudgetUsd: CONFIG.AI_DESCRIBE_BUDGET_USD,
      activeClone: () => repoService.activeClone(),
      resolveGh: () =>
        resolveGh({ configuredPath: CONFIG.GH_PATH, env: process.env, home, isExecutable: probe }),
      resolveClaude: () =>
        resolveClaude({
          configuredPath: CONFIG.CLAUDE_PATH,
          env: process.env,
          home,
          isExecutable: probe,
        }),
      gateway,
      run,
      env: process.env,
      emitChanged: (payload) => {
        broadcast(PUSH_CHANNELS.publishChanged, payload);
      },
      emitEvent: (payload) => {
        broadcast(PUSH_CHANNELS.publishEvent, payload);
      },
      openExternal: (url) => shell.openExternal(url),
    });
    await publishService.start();
    const device = new DeviceService({
      gateway,
      // The active repo's id, live — a switch changes what this answers
      // without reconstructing the service (§12.6).
      appId: () => repoService.activeWorkspace()?.appId ?? null,
      emit: (payload) => {
        broadcast(PUSH_CHANNELS.deviceChanged, payload);
      },
      emitMirror: (payload) => {
        broadcast(PUSH_CHANNELS.mirrorEvent, payload);
      },
    });
    // Holds no process and no watcher — the MCP child behind `hierarchy()`
    // stays `MaestroMcpService`'s — so it is not in the disposal registry.
    // Criterion 16 — an AI turn takes the device itself, so ours lets go: the
    // lease stops this child and the next inspection starts a fresh one.
    const snapshot = new SnapshotService({ gateway, stopMcp: () => mcp.stop() });
    // Owns the live `maestro test` child and §4.3.2's exclusion: it suspends
    // the snapshot path before the CLI spawns and resumes it on settle — and,
    // beside it, the run's recording, kept in the person's Movies folder when
    // the run fails. `openPath` is injected the way `openExternal` is above:
    // the service only ever opens a file it wrote itself.
    const runService = new RunService({
      gateway,
      snapshots: snapshot,
      emit: (payload) => {
        broadcast(PUSH_CHANNELS.runEvent, payload);
      },
      runsDir: join(app.getPath('userData'), 'runs'),
      videosDir: app.getPath('videos'),
      openPath: (path) => shell.openPath(path),
    });
    // The AI window's engine (§6): one `claude -p` child per message, the
    // conversation carried by `--resume`, the device held through the same
    // snapshot lease the run path uses (§4.3.2). Every capability arrives by
    // injection; the service creates nothing itself (§10.1).
    const aiService = new AiService({
      model: CONFIG.AI_MODEL,
      pluginDir: conductorPluginDir({
        packaged: app.isPackaged,
        resourcesPath: process.resourcesPath,
        appPath: app.getAppPath(),
      }),
      flowsDir: CONFIG.FLOWS_DIR,
      activeClone: () => repoService.activeClone(),
      appId: () => repoService.activeWorkspace()?.appId ?? null,
      // The selected device, read fresh — one `adb devices` per send is noise
      // next to the child it precedes.
      device: async () => {
        const snap = await device.snapshot();
        if (!snap.ok || snap.data.selectedId === null) {
          return null;
        }
        return { id: snap.data.selectedId, model: snap.data.properties?.model ?? null };
      },
      resolveClaude: () =>
        resolveClaude({
          configuredPath: CONFIG.CLAUDE_PATH,
          env: process.env,
          home,
          isExecutable: probe,
        }),
      resolveMaestro: () =>
        resolveMaestro({
          configuredPath: CONFIG.MAESTRO_PATH,
          managedDir: managedMaestroDir,
          env: process.env,
          home,
          isExecutable: probe,
          isFile,
        }),
      snapshots: snapshot,
      spawn: spawnStreaming,
      env: process.env,
      emit: (payload) => {
        broadcast(PUSH_CHANNELS.aiEvent, payload);
      },
    });
    // The flow workspace is the active repo's `conductor/` (§2.1, §7) — or
    // nothing at all before the first connect. Confirming or switching a
    // repo re-points it through `applyWorkspace`, never a restart.
    const flowService = new FlowService({
      root: workspace?.root ?? null,
      appId: workspace?.appId ?? null,
      extensions: CONFIG.FLOW_EXTENSIONS,
      emit: (payload) => {
        broadcast(PUSH_CHANNELS.flowChanged, payload);
        // Criterion 9 — every flow change, whoever made it, is the unsent
        // set's recompute trigger; the service debounces it itself.
        publishService.notifyFlowChanged();
      },
    });
    // The environment doctor (§10, managed-tools amendment): installs the
    // JDK, its pinned Maestro, gh and adb — Homebrew or direct download —
    // drives gh's sign-in, reports the rest. It names the binaries and
    // creates nothing — `run`, `spawnStreaming` and Electron's `net` arrive
    // here, by injection.
    const doctorService = new DoctorService({
      managedDir: managedMaestroDir,
      installDir: join(userData, 'maestro-install'),
      toolsInstallDir: join(userData, 'tools-install'),
      pinnedVersion: CONFIG.MAESTRO_VERSION,
      releaseUrl: CONFIG.MAESTRO_RELEASE_URL,
      // Managed-tools criterion 13 — the three direct-download pins.
      pins: {
        ghVersion: CONFIG.GH_VERSION,
        ghReleaseUrl: CONFIG.GH_RELEASE_URL,
        platformToolsVersion: CONFIG.PLATFORM_TOOLS_VERSION,
        platformToolsSha256: CONFIG.PLATFORM_TOOLS_SHA256,
        platformToolsReleaseUrl: CONFIG.PLATFORM_TOOLS_RELEASE_URL,
        zuluVersion: CONFIG.ZULU_VERSION,
        zuluJavaVersion: CONFIG.ZULU_JAVA_VERSION,
        zuluSha256: CONFIG.ZULU_SHA256,
        zuluReleaseUrl: CONFIG.ZULU_RELEASE_URL,
      },
      arch: process.arch,
      maestroOverride: CONFIG.MAESTRO_PATH,
      ghOverride: CONFIG.GH_PATH,
      adbOverride: CONFIG.ADB_PATH,
      env: process.env,
      home,
      // Where macOS keeps installed JDKs — the launch-time file probe for
      // Java (managed-tools criterion 2), the same dirs `java_home` reads.
      jvmRoots: [
        '/Library/Java/JavaVirtualMachines',
        join(home, 'Library', 'Java', 'JavaVirtualMachines'),
      ],
      isExecutable: probe,
      isFile,
      resolveAdb: () => adb.resolve(),
      resolveGh: () =>
        resolveGh({ configuredPath: CONFIG.GH_PATH, env: process.env, home, isExecutable: probe }),
      resolveClaude: () =>
        resolveClaude({
          configuredPath: CONFIG.CLAUDE_PATH,
          env: process.env,
          home,
          isExecutable: probe,
        }),
      // Managed-tools criterion 4 — `brew`, or null; `CONDUCTOR_HOMEBREW=0`
      // is a dev knob, ignored when packaged.
      homebrew: () => findHomebrew({ env: process.env, packaged: app.isPackaged, isExecutable }),
      hidden,
      run,
      spawn: spawnStreaming,
      download: downloadToFile,
      // Criteria 30, 37 — the service picks one of its two literal URLs by
      // id; nothing the renderer sent ever reaches this call.
      openExternal: (url) => {
        // Belt and braces for the Security table's rule: the service picks
        // by id, and the adapter still checks the host it was handed.
        const { host } = new URL(url);
        if (host !== 'github.com' && host !== 'developer.android.com') {
          return Promise.reject(new Error(`Refusing to open ${host}`));
        }
        return shell.openExternal(url);
      },
      emitChanged: (payload) => {
        broadcast(PUSH_CHANNELS.doctorChanged, payload);
      },
      emitInstallEvent: (payload) => {
        broadcast(PUSH_CHANNELS.doctorInstallEvent, payload);
      },
      emitLoginEvent: (payload) => {
        broadcast(PUSH_CHANNELS.doctorLoginEvent, payload);
      },
      onSetupFinished: presentAfterSetup,
      onSetupOpened: presentSetupAgain,
    });
    // Criterion 13 — a file read, before the window exists: its geometry
    // follows this decision.
    doctorService.start();
    services.push(
      device,
      mcp,
      runService,
      flowService,
      repoService,
      publishService,
      aiService,
      doctorService,
    );

    registerAppIpc();
    registerDeviceIpc({ device });
    registerMaestroIpc({ snapshot });
    registerRunIpc({ run: runService });
    registerFlowIpc({ flow: flowService });
    registerRepoIpc({ repo: repoService });
    registerPublishIpc({ publish: publishService });
    registerAiIpc({ ai: aiService });
    registerDoctorIpc({ doctor: doctorService });

    watchRenderer(openWindow(), device);
    // Starts after the window exists, so its first push has somewhere to land.
    device.start();
    void flowService.start();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        watchRenderer(openWindow(), device);
      }
    });
  });
}

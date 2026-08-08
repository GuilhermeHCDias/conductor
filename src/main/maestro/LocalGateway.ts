import type { AppIdentity, Device, DeviceProperties } from '@shared/ipc';
import type { TreeNode } from '@shared/types';
import type { MaestroMcpService } from '../services/maestro-mcp.service';
import type { AdbBridge } from './AdbBridge';
import type { CliRunner } from './CliRunner';
import { parseHierarchy } from './HierarchyParser';
import type {
  FlowRun,
  MaestroGateway,
  MirrorHandlers,
  MirrorSession,
  RunFlowHandlers,
  SyntaxCheck,
} from './MaestroGateway';
import { type ParsedOutput, RunOutputParser } from './RunOutputParser';
import type { ScrcpySource } from './ScrcpySource';
import type { ScreenCapture } from './ScreenCapture';

/**
 * The Gateway against the machine the app is running on. Delegation and nothing
 * else — the parsing, the wire and the traps live in `AdbBridge`,
 * `ScrcpySource`, `ScreenCapture`, `MaestroMcpService`, `CliRunner`,
 * `HierarchyParser` and `RunOutputParser`.
 */
export class LocalGateway implements MaestroGateway {
  private readonly adb: AdbBridge;
  private readonly scrcpy: ScrcpySource;
  private readonly mcp: MaestroMcpService;
  private readonly capture: ScreenCapture;
  private readonly cli: CliRunner;

  constructor(
    adb: AdbBridge,
    scrcpy: ScrcpySource,
    mcp: MaestroMcpService,
    capture: ScreenCapture,
    cli: CliRunner,
  ) {
    this.adb = adb;
    this.scrcpy = scrcpy;
    this.mcp = mcp;
    this.capture = capture;
    this.cli = cli;
  }

  listDevices(): Promise<Device[]> {
    return this.adb.listDevices();
  }

  deviceProperties(deviceId: string): Promise<DeviceProperties> {
    return this.adb.properties(deviceId);
  }

  appIdentity(deviceId: string, appId: string): Promise<AppIdentity> {
    return this.adb.appIdentity(deviceId, appId);
  }

  startMirror(deviceId: string, handlers: MirrorHandlers): Promise<MirrorSession> {
    return this.scrcpy.start(deviceId, handlers);
  }

  /**
   * The one capability here that composes two collaborators, and §9.2 is why:
   * `HierarchyParser` is drawn beside the gateways rather than under this one,
   * because a `RemoteGateway` will fetch the same tree over a different wire and
   * read it with the same pure parser. The session fetches; the parser reads.
   */
  async hierarchy(deviceId: string): Promise<TreeNode> {
    return parseHierarchy(await this.mcp.inspectScreen(deviceId));
  }

  screenshot(deviceId: string): Promise<Buffer> {
    return this.capture.capture(deviceId);
  }

  /**
   * The same composition as `hierarchy`, streamed: `CliRunner` spawns, the
   * pure `RunOutputParser` reads (§9.2 — the runner runs; the parser reads).
   * Two parser instances because the streams interleave arbitrarily — but
   * only stdout's steps count as steps: Maestro prints its step lines there,
   * and letting stderr decorate too would make the decoration racy.
   */
  runFlow(deviceId: string, flowPath: string, handlers: RunFlowHandlers): FlowRun {
    const stdout = new RunOutputParser();
    const stderr = new RunOutputParser();

    const forward = (parsed: ParsedOutput, withSteps: boolean): void => {
      if (withSteps) {
        for (const step of parsed.steps) {
          handlers.onProgress(step);
        }
      }
      if (parsed.lines.length > 0) {
        handlers.onProgress({ type: 'log', lines: parsed.lines });
      }
    };

    const child = this.cli.test(deviceId, flowPath);
    child.onStdout((chunk) => {
      forward(stdout.push(chunk), true);
    });
    child.onStderr((chunk) => {
      forward(stderr.push(chunk), false);
    });
    // `spawnStreaming` reports exit only after both pipes drained, so the
    // flushes below can only ever hold an unterminated final line — and they
    // run before the exit crosses, keeping the terminal event terminal.
    child.onExit((reason) => {
      forward(stdout.flush(), true);
      forward(stderr.flush(), false);
      handlers.onExit(reason);
    });

    return { kill: () => child.kill() };
  }

  /** The gate (§4.2), routed and nothing else — the invocation's flags and
   * deadline are `CliRunner`'s. */
  checkSyntax(flowPath: string): Promise<SyntaxCheck> {
    return this.cli.checkSyntax(flowPath);
  }
}

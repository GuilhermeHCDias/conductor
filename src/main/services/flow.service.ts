import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { hashText } from '@shared/hash';
import { ERROR_CODES, type Result } from '@shared/ipc';
import type { FlowIndex, FlowMeta } from '@shared/types';
import { countCommands, flowBody, flowExtensionOf } from './flow-classify';
import { TreeWatcher } from './TreeWatcher';

/**
 * The flow domain: the workspace on disk (§7), its index, atomic saves
 * (§8.2), file and folder management (§7.2 as amended), and the one
 * `TreeWatcher` behind `flow:changed` (§12.21). What AGENTS.md sketched as
 * `flow-index`, grown to carry the whole domain.
 *
 * Everything here is `node:fs/promises` — the service creates no process, so
 * it needs no Biome exception and no `run.ts`. And every path that arrives
 * from outside is validated by *resolving* it against the root (§9.3):
 * a flow's identity legitimately carries `/` (§7.2), so pattern-matching the
 * string is exactly the wrong check.
 */
export type FlowServiceDeps = {
  /** The workspace root — `userData/repo/conductor`. Injected by the
   * composition root; nothing in here computes it (criterion 1). */
  readonly root: string;
  /** What a new flow's header says — `CONFIG.APP_ID`, injected so the
   * template never exists renderer-side (criterion 19, §2). */
  readonly appId: string;
  /** `CONFIG.FLOW_EXTENSIONS` — what counts as a flow file at all. */
  readonly extensions: readonly string[];
  /** Pushes one fresh index at the window. */
  readonly emit: (payload: Result<FlowIndex>) => void;
  /** The watcher's settle time. Tests shorten it. */
  readonly debounceMs?: number;
  /** Test hook, forwarded to the watcher — see `TreeWatcherOptions`. The app
   * never sets it. */
  readonly usePolling?: boolean;
};

const DEFAULT_DEBOUNCE_MS = 150;

export class FlowService {
  private readonly deps: FlowServiceDeps;
  private watcher: TreeWatcher | null = null;
  private watcherReady: Promise<void> | null = null;
  private debounce: NodeJS.Timeout | null = null;
  private disposed = false;

  constructor(deps: FlowServiceDeps) {
    this.deps = deps;
  }

  /**
   * Criterion 1 — the root exists before the first window asks anything.
   * A failure here is not fatal: `list` re-ensures per call, which is what
   * criterion 36's retry leans on.
   *
   * Resolving means the watcher is actually watching: a watcher only reports
   * what happens *after* it settles, so "started" before `ready` would be a
   * window where an edit changes nothing on screen.
   */
  async start(): Promise<void> {
    try {
      await this.ensureRoot();
      this.ensureWatcher();
      await this.watcherReady;
    } catch (error) {
      // The workspace is unavailable; `list` will answer with its stable
      // code. Logged so the failure leaves a trail in main regardless.
      console.error('The flow workspace failed to start:', error);
    }
  }

  /** The watcher is closed for good: dispose is the end of the service, not
   * a pause (called from `before-quit`). */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (this.debounce !== null) {
      clearTimeout(this.debounce);
      this.debounce = null;
    }
    const watcher = this.watcher;
    this.watcher = null;
    if (watcher !== null) {
      await watcher.close();
    }
  }

  /** Criterion 2 — the index. Also the retry behind criterion 36: asking
   * again re-ensures the root and revives the watcher. */
  async list(): Promise<Result<FlowIndex>> {
    try {
      await this.ensureRoot();
      this.ensureWatcher();
      return { ok: true, data: await this.scan() };
    } catch (error) {
      return unavailable('The flows folder could not be opened.', error);
    }
  }

  async read(path: string): Promise<Result<{ yaml: string }>> {
    const target = await this.resolveInsideRoot(path);
    if (target === null) {
      return refuseOutside(path);
    }
    try {
      return { ok: true, data: { yaml: await readFile(target, 'utf8') } };
    } catch (error) {
      return this.missingOrUnavailable(error, path);
    }
  }

  /** §8.2 — atomic: temp name, then rename, so neither the watcher nor a
   * running `maestro test` ever reads half a YAML. The parent is re-made
   * first: a save racing an external folder delete must still land
   * (criterion 6 — no keystroke is ever lost). */
  async save(path: string, yaml: string): Promise<Result<{ path: string }>> {
    if (!this.hasFlowExtension(path)) {
      return refuse(
        ERROR_CODES.flowInvalidName,
        'Only flows are written here — the name needs .yaml.',
      );
    }
    const target = await this.resolveInsideRoot(path);
    if (target === null) {
      return refuseOutside(path);
    }
    try {
      await mkdir(dirname(target), { recursive: true });
      const partial = `${target}.partial`;
      await writeFile(partial, yaml, 'utf8');
      await rename(partial, target);
      return { ok: true, data: { path: this.toRelative(target) } };
    } catch (error) {
      return unavailable('The flow could not be saved.', error);
    }
  }

  /** Criteria 16–19 — the draft commits: the file exists on disk immediately,
   * carrying the `CONFIG.APP_ID` header, and nothing else. */
  async createFlow(folder: string, name: string): Promise<Result<{ path: string }>> {
    const valid = validName(name);
    if (valid === null) {
      return refuseName(name);
    }
    const fileName = this.withExtension(valid);
    const parent = await this.resolveInsideRoot(folder);
    if (parent === null) {
      return refuseOutside(folder);
    }
    try {
      await mkdir(parent, { recursive: true });
      if (await this.takenIn(parent, fileName)) {
        return refuse(ERROR_CODES.flowNameTaken, `“${fileName}” already exists in this folder.`);
      }
      const target = join(parent, fileName);
      const partial = `${target}.partial`;
      await writeFile(partial, this.template(), 'utf8');
      await rename(partial, target);
      return { ok: true, data: { path: this.toRelative(target) } };
    } catch (error) {
      return unavailable('The flow could not be created.', error);
    }
  }

  /** Criterion 20 — folders are created at the root, visible at once even
   * though Git will not see one until it holds a flow (§7.2). */
  async createFolder(name: string): Promise<Result<{ folder: string }>> {
    const valid = validName(name);
    if (valid === null) {
      return refuseName(name);
    }
    try {
      await this.ensureRoot();
      if (await this.takenIn(this.rootAbsolute(), valid)) {
        return refuse(ERROR_CODES.flowNameTaken, `A folder called “${valid}” already exists.`);
      }
      await mkdir(join(this.rootAbsolute(), valid));
      return { ok: true, data: { folder: valid } };
    } catch (error) {
      return unavailable('The folder could not be created.', error);
    }
  }

  /** Criterion 21 — a rename stays in its parent; the unchanged name is a
   * no-op; a case-only change is a rename of the file itself, not a
   * collision with it. */
  async renameFlow(path: string, name: string): Promise<Result<{ path: string }>> {
    if (!this.hasFlowExtension(path)) {
      return refuse(ERROR_CODES.flowInvalidName, 'Only flows are renamed here.');
    }
    const source = await this.resolveInsideRoot(path);
    if (source === null) {
      return refuseOutside(path);
    }
    const valid = validName(name);
    if (valid === null) {
      return refuseName(name);
    }
    const fileName = this.withExtension(valid);
    if (fileName === basename(source)) {
      return { ok: true, data: { path: this.toRelative(source) } };
    }
    const parent = dirname(source);
    try {
      if (await this.takenIn(parent, fileName, basename(source))) {
        return refuse(ERROR_CODES.flowNameTaken, `“${fileName}” already exists in this folder.`);
      }
      await rename(source, join(parent, fileName));
      return { ok: true, data: { path: this.toRelative(join(parent, fileName)) } };
    } catch (error) {
      return this.missingOrUnavailable(error, path);
    }
  }

  /** The folder twin of `renameFlow` — same parent, so a nested `a/b` renames
   * its last segment and stays under `a`. */
  async renameFolder(folder: string, name: string): Promise<Result<{ folder: string }>> {
    const source = await this.resolveInsideRoot(folder);
    if (source === null || source === this.rootAbsolute()) {
      return refuseOutside(folder);
    }
    const valid = validName(name);
    if (valid === null) {
      return refuseName(name);
    }
    if (valid === basename(source)) {
      return { ok: true, data: { folder: this.toRelative(source) } };
    }
    const parent = dirname(source);
    try {
      // The honest "this is actually a folder" probe (`deleteFolder` reuses
      // the same one): without it, this rename would happily rename a flow
      // past the extension rules and drop it from the index (§7.1).
      await readdir(source);
      if (await this.takenIn(parent, valid, basename(source))) {
        return refuse(ERROR_CODES.flowNameTaken, `A folder called “${valid}” already exists.`);
      }
      await rename(source, join(parent, valid));
      return { ok: true, data: { folder: this.toRelative(join(parent, valid)) } };
    } catch (error) {
      return this.missingOrUnavailable(error, folder);
    }
  }

  /** Criterion 22 — `<name>-copy`, then `-copy-2` and on while taken, keeping
   * the source's own extension. */
  async duplicateFlow(path: string): Promise<Result<{ path: string }>> {
    if (!this.hasFlowExtension(path)) {
      return refuse(ERROR_CODES.flowInvalidName, 'Only flows are duplicated here.');
    }
    const source = await this.resolveInsideRoot(path);
    if (source === null) {
      return refuseOutside(path);
    }
    const name = basename(source);
    const extension = this.flowExtensionOf(name);
    const base = name.slice(0, name.length - extension.length);
    const parent = dirname(source);
    try {
      let candidate = `${base}-copy${extension}`;
      for (let counter = 2; await this.takenIn(parent, candidate); counter += 1) {
        candidate = `${base}-copy-${counter}${extension}`;
      }
      await copyFile(source, join(parent, candidate));
      return { ok: true, data: { path: this.toRelative(join(parent, candidate)) } };
    } catch (error) {
      return this.missingOrUnavailable(error, path);
    }
  }

  /** Criterion 3 rides in the extension check: a single delete only ever
   * removes a flow. */
  async deleteFlow(path: string): Promise<Result<{ path: string }>> {
    if (!this.hasFlowExtension(path)) {
      return refuse(ERROR_CODES.flowInvalidName, 'Only flows are deleted here.');
    }
    const target = await this.resolveInsideRoot(path);
    if (target === null) {
      return refuseOutside(path);
    }
    try {
      await unlink(target);
      return { ok: true, data: { path: this.toRelative(target) } };
    } catch (error) {
      return this.missingOrUnavailable(error, path);
    }
  }

  /** Criterion 23 — recursive, non-flows included: deleting the directory is
   * the one way a non-flow goes (criterion 3). The root itself never does. */
  async deleteFolder(folder: string): Promise<Result<{ folder: string }>> {
    const target = await this.resolveInsideRoot(folder);
    if (target === null || target === this.rootAbsolute()) {
      return refuseOutside(folder);
    }
    try {
      // `rm` with `recursive` would take a file without complaint; reading
      // the directory first is the honest "this folder exists" probe.
      await readdir(target);
      await rm(target, { recursive: true });
      return { ok: true, data: { folder: this.toRelative(target) } };
    } catch (error) {
      return this.missingOrUnavailable(error, folder);
    }
  }

  // ── the index ──────────────────────────────────────────────────────────────

  /** Walks the tree once: every directory (empty included, criterion 13) and
   * every file that both wears a flow extension and carries §7.1's header. */
  private async scan(): Promise<FlowIndex> {
    const flows: FlowMeta[] = [];
    const folders: string[] = [];
    const root = this.rootAbsolute();

    const walk = async (relativeDir: string): Promise<void> => {
      const entries = await readdir(join(root, relativeDir), { withFileTypes: true });
      for (const entry of entries) {
        const relativePath = relativeDir === '' ? entry.name : `${relativeDir}/${entry.name}`;
        if (entry.isDirectory()) {
          folders.push(relativePath);
          await walk(relativePath);
        } else if (entry.isFile() && this.hasFlowExtension(entry.name)) {
          const content = await readFile(join(root, relativePath), 'utf8');
          const body = flowBody(content);
          if (body !== null) {
            flows.push({
              path: relativePath,
              name: entry.name,
              folder: relativeDir,
              commandCount: countCommands(body),
              hash: hashText(content),
            });
          }
        }
      }
    };

    await walk('');
    flows.sort((a, b) => (a.path < b.path ? -1 : 1));
    folders.sort((a, b) => (a < b ? -1 : 1));
    return { flows, folders };
  }

  // ── the watcher ────────────────────────────────────────────────────────────

  /** Criterion 4 — one watcher, every kind of event, debounced into one fresh
   * index per settle. It reports Conductor's own writes exactly like an
   * external editor's (§12.21). */
  private ensureWatcher(): void {
    if (this.disposed || this.watcher !== null) {
      return;
    }
    const watcher = new TreeWatcher({
      path: this.rootAbsolute(),
      ...(this.deps.usePolling === true ? { usePolling: true } : {}),
    });
    watcher.on('change', () => {
      this.scheduleReindex();
    });
    // Without a listener, an emitted 'error' throws in main. The UI hears it
    // as the workspace state it already has a screen for (criterion 36) —
    // and the reference is dropped so `list`'s retry (`ensureWatcher` seeing
    // `null`) actually revives it instead of finding this dead one still
    // sitting in the slot.
    watcher.on('error', (error) => {
      if (this.watcher === watcher) {
        this.watcher = null;
        this.watcherReady = null;
      }
      void watcher.close().catch(() => {});
      if (!this.disposed) {
        this.deps.emit(unavailable('The flows folder could not be watched.', error));
      }
    });
    this.watcher = watcher;
    this.watcherReady = watcher.ready;
  }

  private scheduleReindex(): void {
    if (this.debounce !== null) {
      clearTimeout(this.debounce);
    }
    this.debounce = setTimeout(() => {
      this.debounce = null;
      void this.reindex();
    }, this.deps.debounceMs ?? DEFAULT_DEBOUNCE_MS);
  }

  private async reindex(): Promise<void> {
    if (this.disposed) {
      return;
    }
    let payload: Result<FlowIndex>;
    try {
      await this.ensureRoot();
      payload = { ok: true, data: await this.scan() };
    } catch (error) {
      payload = unavailable('The flows folder could not be read.', error);
    }
    if (!this.disposed) {
      this.deps.emit(payload);
    }
  }

  // ── resolution and names ───────────────────────────────────────────────────

  private rootAbsolute(): string {
    return resolve(this.deps.root);
  }

  private async ensureRoot(): Promise<void> {
    await mkdir(this.rootAbsolute(), { recursive: true });
  }

  /**
   * §9.3, exactly as written: resolve, then require the result under the
   * root — after `..`, absolute paths *and* symlinks. The nearest existing
   * ancestor is realpathed so a link pointing out of the workspace refuses
   * even when its target exists and reads fine.
   */
  private async resolveInsideRoot(relativePath: string): Promise<string | null> {
    const root = this.rootAbsolute();
    const resolved = resolve(root, relativePath);
    if (resolved !== root && !resolved.startsWith(root + sep)) {
      return null;
    }
    try {
      const realRoot = await realpath(root);
      let probe = resolved;
      for (;;) {
        try {
          const real = await realpath(probe);
          if (real !== realRoot && !real.startsWith(realRoot + sep)) {
            return null;
          }
          break;
        } catch {
          const parent = dirname(probe);
          if (parent === probe) {
            return null;
          }
          probe = parent;
        }
      }
    } catch {
      // The root itself is unreadable; the operation will say so in its own
      // terms the moment it touches the disk.
    }
    return resolved;
  }

  private toRelative(absolute: string): string {
    return relative(this.rootAbsolute(), absolute).split(sep).join('/');
  }

  private hasFlowExtension(name: string): boolean {
    return this.flowExtensionOf(name) !== '';
  }

  /** The extension as the file actually wears it — case preserved. */
  private flowExtensionOf(name: string): string {
    return flowExtensionOf(name, this.deps.extensions);
  }

  /** Criterion 18 — type `checkout`, get `checkout.yaml`; a typed extension
   * of either kind, whatever its case, is kept. */
  private withExtension(name: string): string {
    return this.hasFlowExtension(name) ? name : `${name}.yaml`;
  }

  /** Criterion 17 — collisions are case-insensitive: the filesystems under
   * this app mostly are, and a “new” name that only differs by case would
   * land on the old file. `exclude` lets a rename skip its own source. */
  private async takenIn(parent: string, name: string, exclude?: string): Promise<boolean> {
    let entries: string[];
    try {
      entries = await readdir(parent);
    } catch {
      return false;
    }
    const lower = name.toLowerCase();
    const excluded = exclude?.toLowerCase();
    return entries.some(
      (entry) => entry.toLowerCase() === lower && entry.toLowerCase() !== excluded,
    );
  }

  /** Criterion 19's exact bytes, appId injected — never hardcoded (§2). */
  private template(): string {
    return `appId: ${this.deps.appId}\n---\n- launchApp:\n    clearState: true\n`;
  }

  private missingOrUnavailable<T>(error: unknown, path: string): Result<T> {
    if (isMissing(error)) {
      return refuse(ERROR_CODES.flowNotFound, `“${path}” is not in the flows folder any more.`);
    }
    return unavailable('The flows folder could not be read.', error);
  }
}

/**
 * Criterion 5 — a typed name is one path segment: non-empty once trimmed, no
 * separator, and none of the two names the filesystem reserves for walking.
 * Everything subtler is the resolution check's job.
 */
function validName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '' || trimmed === '.' || trimmed === '..') {
    return null;
  }
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return null;
  }
  return trimmed;
}

function refuse(
  code: string,
  message: string,
): { ok: false; error: { code: string; message: string } } {
  return { ok: false, error: { code, message } };
}

function refuseName<T>(name: string): Result<T> {
  const trimmed = name.trim();
  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return refuse(ERROR_CODES.flowInvalidName, 'A name cannot contain “/”.');
  }
  return refuse(ERROR_CODES.flowInvalidName, 'That name will not work here.');
}

function refuseOutside<T>(path: string): Result<T> {
  return refuse(ERROR_CODES.flowInvalidName, `“${path}” points outside the flows folder.`);
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT'
  );
}

/**
 * §8.0 — the person gets the product sentence; the errno goes to main's log,
 * where whoever debugs can still read it. "ENOTDIR" in a sidebar tells the
 * user exactly nothing.
 */
function unavailable<T>(message: string, error: unknown): Result<T> {
  console.error(message, error);
  return refuse(ERROR_CODES.flowWorkspaceUnavailable, message);
}

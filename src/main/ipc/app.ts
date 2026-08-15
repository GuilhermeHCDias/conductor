import { CONFIG } from '@shared/config';
import { CHANNELS, IPC } from '@shared/ipc';
import { app, clipboard } from 'electron';
import { handle } from './handle';

/**
 * `app:info` proves the whole renderer → preload → ipc → main → renderer
 * round-trip; `config:get` is how the sandboxed renderer, which has no
 * `process.env`, receives `CONFIG`. The clipboard pair exists because the
 * sandboxed renderer's permission handler denies `navigator.clipboard` —
 * the read happens on the Paste click, never behind the person's back.
 */
export function registerAppIpc(): void {
  handle(CHANNELS.appInfo, IPC[CHANNELS.appInfo].request, () => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
  }));

  // The declared fields, spelled out — never `CONFIG` wholesale: the response
  // schema is not enforced on the way out, and the config also holds values
  // that are main's business alone (binary paths, and the AI budget, which
  // crosses no channel at all — §6.4 as amended).
  handle(CHANNELS.configGet, IPC[CHANNELS.configGet].request, () => ({
    REPO_BASE_BRANCH: CONFIG.REPO_BASE_BRANCH,
    FLOWS_DIR: CONFIG.FLOWS_DIR,
    FLOW_EXTENSIONS: CONFIG.FLOW_EXTENSIONS,
  }));

  handle(CHANNELS.appReadClipboard, IPC[CHANNELS.appReadClipboard].request, () => ({
    text: clipboard.readText(),
  }));

  handle(CHANNELS.appWriteClipboard, IPC[CHANNELS.appWriteClipboard].request, (text) => {
    clipboard.writeText(text);
    return { text };
  });
}

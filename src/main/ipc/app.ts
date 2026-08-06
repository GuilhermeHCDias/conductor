import { CONFIG } from '@shared/config';
import { CHANNELS, IPC } from '@shared/ipc';
import { app } from 'electron';
import { handle } from './handle';

/**
 * `app:info` proves the whole renderer → preload → ipc → main → renderer
 * round-trip; `config:get` is how the sandboxed renderer, which has no
 * `process.env`, receives `CONFIG`.
 */
export function registerAppIpc(): void {
  handle(CHANNELS.appInfo, IPC[CHANNELS.appInfo].request, () => ({
    appVersion: app.getVersion(),
    electronVersion: process.versions.electron,
    chromeVersion: process.versions.chrome,
    nodeVersion: process.versions.node,
    platform: process.platform,
  }));

  handle(CHANNELS.configGet, IPC[CHANNELS.configGet].request, () => CONFIG);
}

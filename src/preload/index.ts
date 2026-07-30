import { CHANNELS, type ConductorApi } from '@shared/ipc';
import { contextBridge, ipcRenderer } from 'electron';

/**
 * The only bridge. One named function per channel, nothing else exposed — no
 * `ipcRenderer`, no `send`, no `invoke`, no Node primitive. It holds no logic
 * and no state: anything smarter than forwarding belongs in main or the
 * renderer.
 */
const api: ConductorApi = {
  appInfo: () => ipcRenderer.invoke(CHANNELS.appInfo),
  configGet: () => ipcRenderer.invoke(CHANNELS.configGet),
};

contextBridge.exposeInMainWorld('conductor', api);

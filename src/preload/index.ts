import { CHANNELS, type ConductorApi, PUSH_CHANNELS, type PushPayload } from '@shared/ipc';
import { contextBridge, type IpcRendererEvent, ipcRenderer } from 'electron';

/**
 * The only bridge. One named function per channel, nothing else exposed — no
 * `ipcRenderer`, no `send`, no `invoke`, no Node primitive. It holds no logic
 * and no state: anything smarter than forwarding belongs in main or the
 * renderer.
 */
const api: ConductorApi = {
  appInfo: () => ipcRenderer.invoke(CHANNELS.appInfo),
  configGet: () => ipcRenderer.invoke(CHANNELS.configGet),
  deviceList: () => ipcRenderer.invoke(CHANNELS.deviceList),
  deviceAppInfo: (deviceId) => ipcRenderer.invoke(CHANNELS.deviceAppInfo, deviceId),
  mirrorStart: (deviceId) => ipcRenderer.invoke(CHANNELS.mirrorStart, deviceId),
  mirrorStop: (sessionId) => ipcRenderer.invoke(CHANNELS.mirrorStop, sessionId),
  mirrorInput: (sessionId, input) => ipcRenderer.invoke(CHANNELS.mirrorInput, sessionId, input),

  // The event object never crosses: it carries `sender`, and handing the
  // renderer a live `WebContents` handle would undo the bridge.
  onDeviceChanged: (listener) => {
    const forward = (_event: IpcRendererEvent, payload: PushPayload<'device:changed'>): void => {
      listener(payload);
    };
    ipcRenderer.on(PUSH_CHANNELS.deviceChanged, forward);
    return () => {
      ipcRenderer.removeListener(PUSH_CHANNELS.deviceChanged, forward);
    };
  },

  // Same shape, and the unsubscribe matters more here: this one fires ~60 times
  // a second, so a listener that outlives its view leaks at a framerate.
  onMirrorEvent: (listener) => {
    const forward = (_event: IpcRendererEvent, payload: PushPayload<'mirror:event'>): void => {
      listener(payload);
    };
    ipcRenderer.on(PUSH_CHANNELS.mirrorEvent, forward);
    return () => {
      ipcRenderer.removeListener(PUSH_CHANNELS.mirrorEvent, forward);
    };
  },
};

contextBridge.exposeInMainWorld('conductor', api);

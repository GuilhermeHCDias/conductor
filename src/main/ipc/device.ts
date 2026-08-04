import { CHANNELS, IPC } from '@shared/ipc';
import type { DeviceService } from '../services/device.service';
import { handleResult } from './handle';

/**
 * Two invokes and nothing else: validate, call one service method, hand the
 * `Result` back. The push half — `device:changed` — is wired in the
 * composition root, because deciding who receives it is not this file's
 * business.
 */
export function registerDeviceIpc(deps: { readonly device: DeviceService }): void {
  handleResult(CHANNELS.deviceList, IPC[CHANNELS.deviceList].request, () => deps.device.snapshot());

  handleResult(CHANNELS.deviceAppInfo, IPC[CHANNELS.deviceAppInfo].request, (deviceId) =>
    deps.device.appInfo(deviceId),
  );
}

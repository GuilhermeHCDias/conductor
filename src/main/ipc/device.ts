import { CHANNELS, IPC } from '@shared/ipc';
import type { DeviceService } from '../services/device.service';
import { handleResult } from './handle';

/**
 * Four invokes and nothing else: validate, call one service method, hand the
 * `Result` back. The push halves — `device:changed` and `mirror:event` — are
 * wired in the composition root, because deciding who receives them is not this
 * file's business.
 *
 * `mirror:start` is a handler like any other precisely because it does not wait
 * for the stream: the service answers as soon as the device declares its size,
 * and every frame after that arrives on the push channel.
 */
export function registerDeviceIpc(deps: { readonly device: DeviceService }): void {
  handleResult(CHANNELS.deviceList, IPC[CHANNELS.deviceList].request, () => deps.device.snapshot());

  handleResult(CHANNELS.deviceAppInfo, IPC[CHANNELS.deviceAppInfo].request, (deviceId) =>
    deps.device.appInfo(deviceId),
  );

  handleResult(CHANNELS.mirrorStart, IPC[CHANNELS.mirrorStart].request, (deviceId) =>
    deps.device.startMirror(deviceId),
  );

  handleResult(CHANNELS.mirrorStop, IPC[CHANNELS.mirrorStop].request, (sessionId) =>
    deps.device.stopMirror(sessionId),
  );
}

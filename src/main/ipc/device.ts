import { CHANNELS, IPC } from '@shared/ipc';
import type { DeviceService } from '../services/device.service';
import { handleResult } from './handle';

/**
 * Five invokes and nothing else: validate, call one service method, hand the
 * `Result` back. The push halves — `device:changed` and `mirror:event` — are
 * wired in the composition root, because deciding who receives them is not this
 * file's business.
 *
 * `mirror:start` is a handler like any other precisely because it does not wait
 * for the stream: the service answers as soon as the device declares its size,
 * and every frame after that arrives on the push channel.
 *
 * `mirror:input` is the one channel that travels the other way, and it is a
 * handler rather than a push for the same reason `mirror:stop` is — the renderer
 * needs to hear that a tap did not land.
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

  handleResult(CHANNELS.mirrorInput, IPC[CHANNELS.mirrorInput].request, (sessionId, input) =>
    deps.device.sendInput(sessionId, input),
  );
}

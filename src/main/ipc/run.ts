import { CHANNELS, IPC } from '@shared/ipc';
import type { RunService } from '../services/run.service';
import { handleResult } from './handle';

/**
 * Three invokes and nothing else: validate, call one service method, hand the
 * `Result` back. The push half — `run:event` — is wired in the composition
 * root, because deciding who receives it is not this file's business.
 *
 * `run:start` is a handler like any other precisely because it does not wait
 * for the run: the service answers with the id the moment the child is
 * spawned, and everything after that arrives on the push channel. `run:cancel`
 * is its own channel — a device that hangs mid-run must never stand between
 * the person and the Stop button. `run:open-recording` carries the run id and
 * nothing else (recording criterion 17): the video's path is main's alone.
 */
export function registerRunIpc(deps: { readonly run: RunService }): void {
  handleResult(CHANNELS.runStart, IPC[CHANNELS.runStart].request, (deviceId, yaml, flowPath) =>
    deps.run.start(deviceId, yaml, flowPath),
  );

  handleResult(CHANNELS.runCancel, IPC[CHANNELS.runCancel].request, (runId) =>
    deps.run.cancel(runId),
  );

  handleResult(CHANNELS.runOpenRecording, IPC[CHANNELS.runOpenRecording].request, (runId) =>
    deps.run.openRecording(runId),
  );
}

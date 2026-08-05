import { CHANNELS, IPC } from '@shared/ipc';
import type { RunService } from '../services/run.service';
import { handleResult } from './handle';

/**
 * Two invokes and nothing else: validate, call one service method, hand the
 * `Result` back. The push half — `run:event` — is wired in the composition
 * root, because deciding who receives it is not this file's business.
 *
 * `run:start` is a handler like any other precisely because it does not wait
 * for the run: the service answers with the id the moment the child is
 * spawned, and everything after that arrives on the push channel. `run:cancel`
 * is its own channel — a device that hangs mid-run must never stand between
 * the person and the Stop button.
 */
export function registerRunIpc(deps: { readonly run: RunService }): void {
  handleResult(CHANNELS.runStart, IPC[CHANNELS.runStart].request, (deviceId, yaml) =>
    deps.run.start(deviceId, yaml),
  );

  handleResult(CHANNELS.runCancel, IPC[CHANNELS.runCancel].request, (runId) =>
    deps.run.cancel(runId),
  );
}

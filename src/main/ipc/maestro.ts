import { CHANNELS, IPC } from '@shared/ipc';
import type { SnapshotService } from '../services/snapshot.service';
import { handleResult } from './handle';

/**
 * Two invokes and nothing else: validate, call one service method, hand the
 * `Result` back. `maestro:synthesize-selector` is the channel AGENTS.md's
 * worked example names; `maestro:snapshot` joins it in the same domain.
 *
 * Hover never comes through here (criterion 46): the renderer hit-tests
 * locally against the snapshot these channels handed it, and synthesis runs
 * only on right-click.
 */
export function registerMaestroIpc(deps: { readonly snapshot: SnapshotService }): void {
  handleResult(CHANNELS.maestroSnapshot, IPC[CHANNELS.maestroSnapshot].request, (deviceId) =>
    deps.snapshot.capture(deviceId),
  );

  handleResult(
    CHANNELS.maestroSynthesizeSelector,
    IPC[CHANNELS.maestroSynthesizeSelector].request,
    (snapshotId, path) => deps.snapshot.synthesize(snapshotId, path),
  );
}

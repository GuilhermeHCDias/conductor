import { CHANNELS, IPC } from '@shared/ipc';
import type { PublishService } from '../services/publish.service';
import { handleResult } from './handle';

/**
 * Five invokes and nothing else: validate, call one `PublishService` method,
 * hand the `Result` back. The push halves — `publish:changed` and
 * `publish:event` — are wired in the composition root. The renderer's whole
 * contribution to a send is the edited note and the open flow's path
 * (criterion 20); the title, the branch, the URL — everything Git-shaped —
 * exists only main-side (§8.0, criterion 27).
 */
export function registerPublishIpc(deps: { readonly publish: PublishService }): void {
  handleResult(CHANNELS.publishStatus, IPC[CHANNELS.publishStatus].request, () =>
    deps.publish.status(),
  );

  handleResult(CHANNELS.publishDescribe, IPC[CHANNELS.publishDescribe].request, () =>
    deps.publish.describe(),
  );

  handleResult(CHANNELS.publishSend, IPC[CHANNELS.publishSend].request, (note, openFlowPath) =>
    deps.publish.send(note, openFlowPath),
  );

  handleResult(CHANNELS.publishCancel, IPC[CHANNELS.publishCancel].request, (jobId) =>
    deps.publish.cancel(jobId),
  );

  handleResult(CHANNELS.publishOpenPr, IPC[CHANNELS.publishOpenPr].request, () =>
    deps.publish.openPr(),
  );
}

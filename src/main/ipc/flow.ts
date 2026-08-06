import { CHANNELS, IPC } from '@shared/ipc';
import type { FlowService } from '../services/flow.service';
import { handleResult } from './handle';

/**
 * Ten invokes and nothing else: validate, call one `FlowService` method, hand
 * the `Result` back. The push half — `flow:changed` — is wired in the
 * composition root, because deciding who receives it is not this file's
 * business; and it is the watcher that sends it, not these handlers, so an
 * external editor's save and a `flow:save` land on the UI as the same one
 * event (§12.21).
 */
export function registerFlowIpc(deps: { readonly flow: FlowService }): void {
  handleResult(CHANNELS.flowList, IPC[CHANNELS.flowList].request, () => deps.flow.list());

  handleResult(CHANNELS.flowRead, IPC[CHANNELS.flowRead].request, (path) => deps.flow.read(path));

  handleResult(CHANNELS.flowSave, IPC[CHANNELS.flowSave].request, (path, yaml) =>
    deps.flow.save(path, yaml),
  );

  handleResult(CHANNELS.flowCreate, IPC[CHANNELS.flowCreate].request, (folder, name) =>
    deps.flow.createFlow(folder, name),
  );

  handleResult(CHANNELS.flowCreateFolder, IPC[CHANNELS.flowCreateFolder].request, (name) =>
    deps.flow.createFolder(name),
  );

  handleResult(CHANNELS.flowRename, IPC[CHANNELS.flowRename].request, (path, name) =>
    deps.flow.renameFlow(path, name),
  );

  handleResult(CHANNELS.flowRenameFolder, IPC[CHANNELS.flowRenameFolder].request, (folder, name) =>
    deps.flow.renameFolder(folder, name),
  );

  handleResult(CHANNELS.flowDuplicate, IPC[CHANNELS.flowDuplicate].request, (path) =>
    deps.flow.duplicateFlow(path),
  );

  handleResult(CHANNELS.flowDelete, IPC[CHANNELS.flowDelete].request, (path) =>
    deps.flow.deleteFlow(path),
  );

  handleResult(CHANNELS.flowDeleteFolder, IPC[CHANNELS.flowDeleteFolder].request, (folder) =>
    deps.flow.deleteFolder(folder),
  );
}

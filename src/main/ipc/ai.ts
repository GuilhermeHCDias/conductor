import { CHANNELS, IPC } from '@shared/ipc';
import type { AiService } from '../services/ai.service';
import { handleResult } from './handle';

/**
 * Four invokes and nothing else: validate, call one `AiService` method, hand
 * the `Result` back. The push half — `ai:event` — is wired in the composition
 * root. `ai:send` answers with the turn id the moment the child is spawned;
 * the reply streams in as pushes, and `ai:cancel` is its own channel so a
 * child that hangs never stands between the person and Stop (criterion 11).
 */
export function registerAiIpc(deps: { readonly ai: AiService }): void {
  handleResult(CHANNELS.aiSend, IPC[CHANNELS.aiSend].request, (message, openFlowPath) =>
    deps.ai.send(message, openFlowPath),
  );

  handleResult(CHANNELS.aiCancel, IPC[CHANNELS.aiCancel].request, () => deps.ai.cancel());

  handleResult(CHANNELS.aiReset, IPC[CHANNELS.aiReset].request, () => deps.ai.reset());

  handleResult(CHANNELS.aiStatus, IPC[CHANNELS.aiStatus].request, () => deps.ai.status());
}

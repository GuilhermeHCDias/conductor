import { CHANNELS, IPC } from '@shared/ipc';
import type { RepoService } from '../services/repo.service';
import { handleResult } from './handle';

/**
 * Four invokes and nothing else: validate, call one `RepoService` method,
 * hand the `Result` back. The push halves — `repo:changed` and
 * `repo:resolve-event` — are wired in the composition root, because deciding
 * who receives them is not this file's business. The renderer's contribution
 * to a resolve is the raw pasted URL alone (§9.3): slugs and paths are
 * derived main-side, and a switch names only a slug main itself published.
 */
export function registerRepoIpc(deps: { readonly repo: RepoService }): void {
  handleResult(CHANNELS.repoList, IPC[CHANNELS.repoList].request, () => deps.repo.list());

  handleResult(CHANNELS.repoResolve, IPC[CHANNELS.repoResolve].request, (url) =>
    deps.repo.resolve(url),
  );

  handleResult(CHANNELS.repoConnect, IPC[CHANNELS.repoConnect].request, (resolveId) =>
    deps.repo.connect(resolveId),
  );

  handleResult(CHANNELS.repoSwitch, IPC[CHANNELS.repoSwitch].request, (slug) =>
    deps.repo.switch(slug),
  );
}

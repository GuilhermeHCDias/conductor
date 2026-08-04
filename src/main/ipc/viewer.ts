import { CHANNELS, IPC } from '@shared/ipc';
import type { ViewerService } from '../services/viewer.service';
import { handleResult } from './handle';

/**
 * One invoke. The URL never crosses to the renderer as something to navigate
 * to — main opens it (§9.3, criterion 19), and what comes back is the record of
 * what was opened.
 */
export function registerViewerIpc(deps: { readonly viewer: ViewerService }): void {
  handleResult(CHANNELS.viewerOpen, IPC[CHANNELS.viewerOpen].request, () => deps.viewer.open());
}

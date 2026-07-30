import type { ConductorApi } from '@shared/ipc';

/** The one place `window.conductor` is declared. */
declare global {
  interface Window {
    conductor: ConductorApi;
  }
}

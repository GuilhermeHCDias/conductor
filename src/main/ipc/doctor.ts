import { CHANNELS, IPC } from '@shared/ipc';
import type { DoctorService } from '../services/doctor.service';
import { handleResult } from './handle';

/**
 * Four invokes and nothing else: validate, call one `DoctorService` method,
 * hand the `Result` back. The push halves — `doctor:changed` and
 * `doctor:install-event` — are wired in the composition root. None of the
 * four takes an argument (criterion 37): the renderer sends intent, and main
 * decides everything about where Maestro lives and how it gets there.
 */
export function registerDoctorIpc(deps: { readonly doctor: DoctorService }): void {
  handleResult(CHANNELS.doctorStatus, IPC[CHANNELS.doctorStatus].request, () =>
    deps.doctor.status(),
  );

  handleResult(CHANNELS.doctorCheck, IPC[CHANNELS.doctorCheck].request, () => deps.doctor.check());

  handleResult(CHANNELS.doctorInstall, IPC[CHANNELS.doctorInstall].request, () =>
    deps.doctor.install(),
  );

  handleResult(CHANNELS.doctorSkipSetup, IPC[CHANNELS.doctorSkipSetup].request, () =>
    deps.doctor.skipSetup(),
  );
}

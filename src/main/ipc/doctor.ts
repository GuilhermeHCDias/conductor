import { CHANNELS, IPC } from '@shared/ipc';
import type { DoctorService } from '../services/doctor.service';
import { handleResult } from './handle';

/**
 * Eight invokes and nothing else: validate, call one `DoctorService` method,
 * hand the `Result` back. The push halves — `doctor:changed`,
 * `doctor:install-event`, `doctor:login-event` — are wired in the
 * composition root. The renderer sends intent (criterion 37): which tools,
 * a terms decision, a page by id — never a path, a URL or a command; main
 * decides everything about where a tool lives and which URL a name means.
 */
export function registerDoctorIpc(deps: { readonly doctor: DoctorService }): void {
  handleResult(CHANNELS.doctorStatus, IPC[CHANNELS.doctorStatus].request, () =>
    deps.doctor.status(),
  );

  handleResult(CHANNELS.doctorCheck, IPC[CHANNELS.doctorCheck].request, () => deps.doctor.check());

  handleResult(CHANNELS.doctorInstall, IPC[CHANNELS.doctorInstall].request, (request) =>
    deps.doctor.install(request),
  );

  handleResult(CHANNELS.doctorSkipSetup, IPC[CHANNELS.doctorSkipSetup].request, () =>
    deps.doctor.skipSetup(),
  );

  handleResult(CHANNELS.doctorLogin, IPC[CHANNELS.doctorLogin].request, () => deps.doctor.login());

  handleResult(CHANNELS.doctorLoginCancel, IPC[CHANNELS.doctorLoginCancel].request, () =>
    deps.doctor.loginCancel(),
  );

  handleResult(CHANNELS.doctorOpenLoginUrl, IPC[CHANNELS.doctorOpenLoginUrl].request, () =>
    deps.doctor.openLoginUrl(),
  );

  handleResult(CHANNELS.doctorOpenUrl, IPC[CHANNELS.doctorOpenUrl].request, (page) =>
    deps.doctor.openUrl(page.id),
  );
}

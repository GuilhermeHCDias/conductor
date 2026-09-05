import { useEffect } from 'react';
import { useDoctorStore } from '../stores/doctor.store';

/**
 * The app-wide doctor subscription (criterion 38, mounted by `App`): the
 * boot query plus the three pushes — the whole state on `doctor:changed`,
 * install progress on `doctor:install-event`, the sign-in's code and
 * outcome on `doctor:login-event` — written into the store and undone in
 * cleanup. The setup-or-app decision waits on what this loads.
 */
export function useDoctorEvents(): void {
  const init = useDoctorStore((state) => state.init);
  const applyState = useDoctorStore((state) => state.applyState);
  const applyInstallEvent = useDoctorStore((state) => state.applyInstallEvent);
  const applyLoginEvent = useDoctorStore((state) => state.applyLoginEvent);

  useEffect(() => {
    const unsubscribeState = window.conductor.onDoctorChanged(applyState);
    const unsubscribeInstall = window.conductor.onDoctorInstallEvent(applyInstallEvent);
    const unsubscribeLogin = window.conductor.onDoctorLoginEvent(applyLoginEvent);
    void init();
    return () => {
      unsubscribeState();
      unsubscribeInstall();
      unsubscribeLogin();
    };
  }, [init, applyState, applyInstallEvent, applyLoginEvent]);
}

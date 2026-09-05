import type {
  ConductorApi,
  DoctorInstallEvent,
  DoctorLoginEvent,
  DoctorState,
  Result,
} from '@shared/ipc';
import { render } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetDoctorStore, useDoctorStore } from '../stores/doctor.store';
import { useDoctorEvents } from './useDoctorEvents';

/**
 * The app-wide doctor subscription (criterion 38): both channels wired into
 * the store, the boot query fired, and every listener undone in cleanup.
 */

type StateListener = (payload: Result<DoctorState>) => void;
type EventListener = (payload: Result<DoctorInstallEvent>) => void;
type LoginListener = (payload: Result<DoctorLoginEvent>) => void;

let stateListeners: StateListener[];
let eventListeners: EventListener[];
let loginListeners: LoginListener[];
let unsubscribed: number;
let status: ReturnType<typeof vi.fn>;

const STATE: DoctorState = {
  report: null,
  checking: false,
  setup: { active: true, reason: 'first-run', plan: null },
  install: null,
  login: null,
  overridden: [],
  version: '2.10.0',
};

function Host(): null {
  useDoctorEvents();
  return null;
}

beforeEach(() => {
  resetDoctorStore();
  stateListeners = [];
  eventListeners = [];
  loginListeners = [];
  unsubscribed = 0;
  status = vi.fn(() => Promise.resolve({ ok: true, data: STATE }));
  window.conductor = {
    ...window.conductor,
    doctorStatus: status,
    onDoctorChanged: (listener: StateListener) => {
      stateListeners.push(listener);
      return () => {
        unsubscribed += 1;
      };
    },
    onDoctorInstallEvent: (listener: EventListener) => {
      eventListeners.push(listener);
      return () => {
        unsubscribed += 1;
      };
    },
    onDoctorLoginEvent: (listener: LoginListener) => {
      loginListeners.push(listener);
      return () => {
        unsubscribed += 1;
      };
    },
  } as ConductorApi;
});

describe('useDoctorEvents', () => {
  it('subscribes to the three channels and asks for the boot state', () => {
    render(<Host />);

    expect(stateListeners).toHaveLength(1);
    expect(eventListeners).toHaveLength(1);
    expect(loginListeners).toHaveLength(1);
    expect(status).toHaveBeenCalledOnce();
  });

  it('routes a doctor:changed push into the store', () => {
    render(<Host />);

    act(() => {
      stateListeners[0]?.({ ok: true, data: { ...STATE, checking: true } });
    });

    expect(useDoctorStore.getState().checking).toBe(true);
    expect(useDoctorStore.getState().setup).toEqual({
      active: true,
      reason: 'first-run',
      plan: null,
    });
  });

  it('routes a doctor:install-event push into the store', () => {
    render(<Host />);

    act(() => {
      eventListeners[0]?.({
        ok: true,
        data: {
          kind: 'progress',
          installId: 'install-1',
          tool: 'maestro',
          pct: 12,
          step: 'Downloading maestro 2.10.0',
        },
      });
    });

    expect(useDoctorStore.getState().install).toEqual({
      installId: 'install-1',
      tool: 'maestro',
      pct: 12,
      step: 'Downloading maestro 2.10.0',
    });
  });

  it('routes a doctor:login-event push into the store', () => {
    render(<Host />);

    act(() => {
      loginListeners[0]?.({
        ok: true,
        data: {
          kind: 'code',
          loginId: 'login-1',
          code: '1234-ABCD',
          url: 'https://github.com/login/device',
        },
      });
    });

    expect(useDoctorStore.getState().login).toEqual({ loginId: 'login-1', code: '1234-ABCD' });
  });

  it('unsubscribes all three on unmount', () => {
    const { unmount } = render(<Host />);

    unmount();

    expect(unsubscribed).toBe(3);
  });
});

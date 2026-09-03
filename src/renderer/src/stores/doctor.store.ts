import type { DoctorReport, DoctorRow, DoctorState, PushPayload } from '@shared/ipc';
import { create } from 'zustand';

/**
 * The doctor domain, renderer-side (criteria 36, 38): a projection of main's
 * doctor state — the report, whether a check runs, the setup decision, the
 * install in flight — plus the sheet's own open flag and the last install's
 * landing, which the Setup view holds on screen while the window changes.
 * Actions are the only renderer code that calls the `doctor:*` commands;
 * every pct and step the views render arrives through `applyInstallEvent`,
 * never from a timer (criterion 22).
 */

export type DoctorData = {
  /** `doctor:status` answered — the view decision waits on it (criterion 38). */
  readonly loaded: boolean;
  readonly report: DoctorReport | null;
  readonly checking: boolean;
  readonly setup: DoctorState['setup'];
  readonly install: DoctorState['install'];
  readonly maestroOverridden: boolean;
  /** The pin — what the Setup view names before any install event. */
  readonly version: string;
  /** The install that last landed — the ready state of the Setup view. */
  readonly installed: { readonly installId: string; readonly version: string } | null;
  readonly sheetOpen: boolean;
};

export type DoctorActions = {
  init: () => Promise<void>;
  applyState: (payload: PushPayload<'doctor:changed'>) => void;
  applyInstallEvent: (payload: PushPayload<'doctor:install-event'>) => void;
  check: () => Promise<void>;
  /** Named apart from the `install` state it starts, which a push replaces. */
  installMaestro: () => Promise<void>;
  skipSetup: () => Promise<void>;
  openSheet: () => void;
  closeSheet: () => void;
  toggleSheet: () => void;
};

export type DoctorStoreState = DoctorData & DoctorActions;

function createDoctorData(): DoctorData {
  return {
    loaded: false,
    report: null,
    checking: false,
    setup: { active: false, reason: null },
    install: null,
    maestroOverridden: false,
    version: '',
    installed: null,
    sheetOpen: false,
  };
}

export const useDoctorStore = create<DoctorStoreState>((set, get) => ({
  ...createDoctorData(),

  init: async () => {
    const result = await window.conductor.doctorStatus();
    if (!result.ok) {
      // The truth could not be read; loaded still flips so the window shows
      // the app instead of staying blank forever.
      console.error('The doctor state could not be read:', result.error);
      set({ loaded: true });
      return;
    }
    get().applyState(result);
  },

  applyState: (payload) => {
    if (!payload.ok) {
      console.error('The doctor state push failed:', payload.error);
      return;
    }
    const { report, checking, setup, install, maestroOverridden, version } = payload.data;
    set({ loaded: true, report, checking, setup, install, maestroOverridden, version });
  },

  applyInstallEvent: (payload) => {
    if (!payload.ok) {
      console.error('A doctor install event could not be read:', payload.error);
      return;
    }
    const event = payload.data;
    if (event.kind === 'progress') {
      const { installId, pct, step } = event;
      // A new install forgets the previous landing — an update after a
      // first run, or a Try again.
      const installed = get().installed?.installId === installId ? get().installed : null;
      set({ install: { installId, pct, step }, installed });
      return;
    }
    if (event.kind === 'done') {
      set({ install: null, installed: { installId: event.installId, version: event.version } });
      return;
    }
    set({
      install: {
        installId: event.installId,
        failed: { code: event.code, message: event.message, detail: event.detail },
      },
    });
  },

  /** "Check again" — the report lands as a push, whole (criterion 3). */
  check: async () => {
    const result = await window.conductor.doctorCheck();
    if (!result.ok) {
      console.error('The doctor check could not be started:', result.error);
    }
  },

  /** Try again, or the sheet's Install (criteria 23, 31). */
  installMaestro: async () => {
    set({ installed: null });
    const result = await window.conductor.doctorInstall();
    if (!result.ok) {
      console.error('The Maestro install could not be started:', result.error);
    }
  },

  /** "Continue without Maestro" (criterion 18). */
  skipSetup: async () => {
    const result = await window.conductor.doctorSkipSetup();
    if (!result.ok) {
      console.error('Setup could not be skipped:', result.error);
    }
  },

  openSheet: () => {
    set({ sheetOpen: true });
  },

  closeSheet: () => {
    set({ sheetOpen: false });
  },

  /** Criterion 25 — the badge while the sheet is open closes it. */
  toggleSheet: () => {
    set({ sheetOpen: !get().sheetOpen });
  },
}));

/** Restores the blank state. Tests share one module. */
export function resetDoctorStore(): void {
  useDoctorStore.setState(createDoctorData());
}

/** The badge's count — `null` before the first report, when the badge is
 * not mounted at all (criterion 33). */
export function selectIssues(state: DoctorStoreState): number | null {
  return state.report?.issues ?? null;
}

/** Criterion 28 — the rows that need the person, in the report's order. */
export function selectNeedsYou(state: DoctorStoreState): readonly DoctorRow[] {
  return state.report?.rows.filter((row) => row.status !== 'ok') ?? [];
}

export function selectReady(state: DoctorStoreState): readonly DoctorRow[] {
  return state.report?.rows.filter((row) => row.status === 'ok') ?? [];
}

/** Criterion 31 — the one per-row action: the `maestro` row is not ok and
 * no path was configured by hand. */
export function selectInstallable(state: DoctorStoreState): boolean {
  if (state.maestroOverridden) {
    return false;
  }
  const maestro = state.report?.rows.find((row) => row.id === 'maestro');
  return maestro !== undefined && maestro.status !== 'ok';
}

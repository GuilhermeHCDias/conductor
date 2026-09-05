import type {
  DoctorInstallFailure,
  DoctorReport,
  DoctorRow,
  DoctorState,
  PushPayload,
  ToolId,
} from '@shared/ipc';
import { create } from 'zustand';
import type { ToolOutcome } from '../lib/setup-rows';

/**
 * The doctor domain, renderer-side (criteria 36, 38, managed-tools 46): a
 * projection of main's doctor state — the report, whether a check runs,
 * the setup decision with its plan, the install and the sign-in in flight
 * — plus the sheet's own open flag, the Android terms checkbox, the
 * per-tool outcomes of the install on screen and the account a sign-in
 * ended on. Actions are the only renderer code that calls the `doctor:*`
 * commands; every pct, step, code and outcome the views render arrives
 * through the `apply*` actions, never from a timer (criterion 41).
 */

/** The four managed tools, in the order the plan lists them. */
export const TOOL_ORDER: readonly ToolId[] = ['java', 'maestro', 'gh', 'adb'];

const TOOL_IDS: ReadonlySet<string> = new Set<string>(TOOL_ORDER);

/** Narrows a doctor row id to a managed tool — the sheet's Install button
 * exists only for those (criterion 42). */
export function isToolId(id: string): id is ToolId {
  return TOOL_IDS.has(id);
}

export type { ToolOutcome };

export type DoctorData = {
  /** `doctor:status` answered — the view decision waits on it (criterion 38). */
  readonly loaded: boolean;
  readonly report: DoctorReport | null;
  readonly checking: boolean;
  readonly setup: DoctorState['setup'];
  readonly install: DoctorState['install'];
  readonly login: DoctorState['login'];
  /** The tools the person configured a path for — no Install on those. */
  readonly overridden: readonly ToolId[];
  /** The pin — what the Setup view names before any install event. */
  readonly version: string;
  readonly sheetOpen: boolean;
  /** The terms checkbox (criteria 37, 42) — UI state, sent with the install. */
  readonly androidTermsAccepted: boolean;
  /** The outcomes of the install on screen, by tool — from the events, so a
   * settled row reads right while the next tool runs. */
  readonly outcomes: {
    readonly installId: string | null;
    readonly byTool: Partial<Record<ToolId, ToolOutcome>>;
  };
  /** The account the last sign-in ended on — "Signed in as …". */
  readonly signedInAs: string | null;
};

export type DoctorActions = {
  init: () => Promise<void>;
  applyState: (payload: PushPayload<'doctor:changed'>) => void;
  applyInstallEvent: (payload: PushPayload<'doctor:install-event'>) => void;
  applyLoginEvent: (payload: PushPayload<'doctor:login-event'>) => void;
  check: () => Promise<void>;
  /** The tools named, or every tool the plan says to install. Named apart
   * from the `install` state it starts, which a push replaces. */
  installTools: (tools?: readonly ToolId[]) => Promise<void>;
  /** Named apart from the `login` state, as above. */
  signIn: () => Promise<void>;
  signInCancel: () => Promise<void>;
  openLoginUrl: () => Promise<void>;
  openAndroidTerms: () => Promise<void>;
  setAndroidTerms: (accepted: boolean) => void;
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
    setup: { active: false, reason: null, plan: null },
    install: null,
    login: null,
    overridden: [],
    version: '',
    sheetOpen: false,
    androidTermsAccepted: false,
    outcomes: { installId: null, byTool: {} },
    signedInAs: null,
  };
}

/** One refusal logged, never thrown — the store is a projection, and main
 * already said no. */
async function ask(
  what: string,
  call: () => Promise<{ ok: true } | { ok: false; error: unknown }>,
): Promise<void> {
  const result = await call();
  if (!result.ok) {
    console.error(`${what}:`, result.error);
  }
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
    const { report, checking, setup, install, login, overridden, version } = payload.data;
    set({ loaded: true, report, checking, setup, install, login, overridden, version });
  },

  applyInstallEvent: (payload) => {
    if (!payload.ok) {
      console.error('A doctor install event could not be read:', payload.error);
      return;
    }
    const event = payload.data;
    const current = get().outcomes;
    // A new install forgets the previous one's outcomes.
    const outcomes =
      current.installId === event.installId
        ? current
        : { installId: event.installId, byTool: {} as Partial<Record<ToolId, ToolOutcome>> };
    switch (event.kind) {
      case 'progress': {
        const { installId, tool, pct, step } = event;
        set({ install: { installId, tool, pct, step }, outcomes });
        return;
      }
      case 'done':
        set({
          outcomes: {
            ...outcomes,
            byTool: { ...outcomes.byTool, [event.tool]: { kind: 'done', version: event.version } },
          },
        });
        return;
      case 'failed': {
        const { code, message, detail } = event;
        set({
          outcomes: {
            ...outcomes,
            byTool: { ...outcomes.byTool, [event.tool]: { kind: 'failed', code, message, detail } },
          },
        });
        return;
      }
      case 'settled': {
        const failed: Partial<Record<ToolId, DoctorInstallFailure>> = {};
        for (const tool of event.failed) {
          const outcome = outcomes.byTool[tool];
          if (outcome?.kind === 'failed') {
            failed[tool] = { code: outcome.code, message: outcome.message, detail: outcome.detail };
          }
        }
        set({ install: { installId: event.installId, failed }, outcomes });
        return;
      }
    }
  },

  applyLoginEvent: (payload) => {
    if (!payload.ok) {
      console.error('A doctor sign-in event could not be read:', payload.error);
      return;
    }
    const event = payload.data;
    switch (event.kind) {
      case 'code':
        set({ login: { loginId: event.loginId, code: event.code } });
        return;
      case 'done':
        set({ login: null, signedInAs: event.account });
        return;
      case 'failed': {
        const { code, message, detail } = event;
        set({ login: { loginId: event.loginId, failed: { code, message, detail } } });
        return;
      }
      case 'cancelled':
        set({ login: null });
        return;
    }
  },

  /** "Check again" — the report lands as a push, whole (criterion 3). */
  check: async () => {
    await ask('The doctor check could not be started', () => window.conductor.doctorCheck());
  },

  /** Install, Try again, or the sheet's per-row Install (criteria 38, 42). */
  installTools: async (tools) => {
    set({ install: null, outcomes: { installId: null, byTool: {} } });
    const request =
      tools === undefined
        ? { androidTermsAccepted: get().androidTermsAccepted }
        : { tools, androidTermsAccepted: get().androidTermsAccepted };
    await ask('The install could not be started', () => window.conductor.doctorInstall(request));
  },

  signIn: async () => {
    set({ signedInAs: null });
    await ask('The GitHub sign-in could not be started', () => window.conductor.doctorLogin());
  },

  signInCancel: async () => {
    await ask('The GitHub sign-in could not be cancelled', () =>
      window.conductor.doctorLoginCancel(),
    );
  },

  openLoginUrl: async () => {
    await ask('The GitHub page could not be opened', () => window.conductor.doctorOpenLoginUrl());
  },

  openAndroidTerms: async () => {
    await ask('The Android terms could not be opened', () =>
      window.conductor.doctorOpenUrl({ id: 'android-terms' }),
    );
  },

  setAndroidTerms: (accepted) => {
    set({ androidTermsAccepted: accepted });
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

/** Criterion 28 — Needs you above Ready, each in the report's order. Pure
 * over the rows rather than a store selector: it returns fresh arrays, which
 * a `useDoctorStore(selector)` would re-render forever on. */
export function splitRows(rows: readonly DoctorRow[]): {
  readonly needsYou: readonly DoctorRow[];
  readonly ready: readonly DoctorRow[];
} {
  return {
    needsYou: rows.filter((row) => row.status !== 'ok'),
    ready: rows.filter((row) => row.status === 'ok'),
  };
}

/** One stable empty set — a fresh one per select would re-render forever. */
const NO_TOOLS: ReadonlySet<ToolId> = new Set();

/**
 * Criterion 42 — the managed rows that may carry Install: not ok, no path
 * configured for that tool, and no install in flight. Pure over the three
 * fields (call it in the view with what it selected, not as a selector: it
 * returns a fresh set).
 */
export function installableTools(
  state: Pick<DoctorData, 'install' | 'overridden'> & { readonly rows: readonly DoctorRow[] },
): ReadonlySet<ToolId> {
  if (state.rows.length === 0 || (state.install !== null && 'pct' in state.install)) {
    return NO_TOOLS;
  }
  const tools = new Set<ToolId>();
  for (const tool of TOOL_ORDER) {
    if (state.overridden.includes(tool)) {
      continue;
    }
    const row = state.rows.find((entry) => entry.id === tool);
    if (row !== undefined && row.status !== 'ok') {
      tools.add(tool);
    }
  }
  return tools;
}

/** Criteria 32, 43 — the GitHub CLI is there and the sign-in is not. */
export function selectSignInPending(state: DoctorStoreState): boolean {
  const gh = state.report?.rows.find((entry) => entry.id === 'gh');
  const auth = state.report?.rows.find((entry) => entry.id === 'github-auth');
  return gh?.status === 'ok' && auth !== undefined && auth.status !== 'ok';
}

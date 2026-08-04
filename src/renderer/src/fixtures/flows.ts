/**
 * The layout shell's only content. Ported from the design system's
 * `ui_kits/conductor-c-aurora/data.jsx` so the screenshots stay usable as a
 * review reference.
 *
 * Everything here is a fixture and is meant to look like one: nothing in this
 * spec talks to Maestro, to `adb`, to the filesystem or to `window.conductor`.
 * When real state arrives, these constants are replaced by domain stores and
 * this file is deleted — which is why no component defines its own sample data.
 *
 * Content belonging to the app under test stays in the team's own Portuguese.
 */

export type FlowResult = 'pass' | 'fail' | 'never';

export type Flow = {
  readonly id: string;
  readonly name: string;
  readonly steps: number;
  readonly lastResult: FlowResult;
  readonly lastRun?: string;
  readonly duration?: string;
  readonly aiAuthored?: boolean;
};

export type Tab = {
  readonly id: string;
  readonly label: string;
  readonly dirty?: boolean;
};

export type RunStatus = 'pass' | 'fail' | 'running';

export type RunStep = {
  readonly id: string;
  readonly label: string;
  readonly status: RunStatus;
  readonly duration?: string;
};

export type ChatTurn = {
  readonly id: string;
  readonly role: 'assistant' | 'user';
  readonly body: string;
  readonly code?: string;
};

export type DeviceState = 'connected' | 'offline';

export type Device = {
  readonly serial: string;
  readonly state: DeviceState;
};

/** The starting flow, as Maestro would write it. */
export const FLOW_YAML = 'appId: com.example.app\n---\n- launchApp:\n    clearState: true\n';

/**
 * The project's suite. Sorted by last run, most recent first — people come back
 * to what they just broke, not to what is alphabetically first.
 */
export const FLOWS: readonly Flow[] = [
  {
    id: 'f-teste',
    name: 'teste.yaml',
    steps: 4,
    lastResult: 'fail',
    lastRun: 'Jul 28, 12:29 pm',
    duration: '0:04',
  },
  {
    id: 'f-pedidos',
    name: 'pedidos-pendentes.yaml',
    steps: 11,
    lastResult: 'pass',
    lastRun: 'Jul 28, 11:02 am',
    duration: '0:38',
  },
  {
    id: 'f-checkout',
    name: 'checkout.yaml',
    steps: 17,
    lastResult: 'pass',
    lastRun: 'Jul 27, 6:41 pm',
    duration: '1:12',
  },
  {
    id: 'f-separacao',
    name: 'separacao.yaml',
    steps: 9,
    lastResult: 'fail',
    lastRun: 'Jul 27, 6:38 pm',
    duration: '0:21',
  },
  {
    id: 'f-login',
    name: 'login.yaml',
    steps: 6,
    lastResult: 'pass',
    lastRun: 'Jul 27, 9:15 am',
    duration: '0:14',
  },
  {
    id: 'f-retirada',
    name: 'retirada-loja.yaml',
    steps: 8,
    lastResult: 'pass',
    lastRun: 'Jul 25, 4:02 pm',
    duration: '0:26',
    aiAuthored: true,
  },
  {
    id: 'f-busca',
    name: 'busca-produto.yaml',
    steps: 5,
    lastResult: 'never',
    aiAuthored: true,
  },
];

/** One document open, with unsaved changes — the screenshots' starting state. */
export const OPEN_TABS: readonly Tab[] = [{ id: 'f-teste', label: 'teste.yaml', dirty: true }];

export const ACTIVE_TAB_ID = 'f-teste';

/** Lines the assistant wrote, and lines Maestro reported as failing. */
export const AI_LINES: readonly number[] = [];
export const ERROR_LINES: readonly number[] = [];

/** No run has happened, so the run report shows its empty state. */
export const RUNNING = false;
export const RUN_STEPS: readonly RunStep[] = [];

export const THREAD: readonly ChatTurn[] = [
  {
    id: 'hello',
    role: 'assistant',
    body: "Right-click anything on the device and I'll write the step. Or just tell me what the test should do.",
  },
];

export const SUGGESTIONS: readonly string[] = [
  'Open the first pending order',
  'Assert both order cards are visible',
  'Screenshot after checkout',
];

export const DEVICE: Device = { serial: 'R9QYC01EMXL', state: 'connected' };

export const ENVIRONMENT = 'staging';

/** What the segmented control reports on its right-hand side, per panel. */
export const RUN_STATUS_LINE = 'adb · logcat attached';
export const ASSISTANT_STATUS_LINE = 'Conductor 1.4';

/* Fixture data for the Conductor Studio recreation. Content mirrors the reference
   screenshot of the pnp-fast-mode project, in the team's own Portuguese copy. */
const FLOW_START = 'appId: com.example.app\n---\n- launchApp:\n    clearState: true\n';

/* The project's suite. Sorted by last run, most recent first — people come back to what they
   just broke, not to what is alphabetically first. */
const TESTS = [
  {
    id: 'f-teste',
    name: 'teste.yaml',
    steps: 4,
    lastResult: 'fail',
    lastRun: 'Jul 28, 12:29 pm',
    duration: '0:04',
    open: true,
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
  { id: 'f-busca', name: 'busca-produto.yaml', steps: 5, lastResult: 'never', aiAuthored: true },
];

/* The selector the assistant falls back to when nothing is hovered. Neither geometry nor the
   node count is stored here — both are measured from the DOM. */
const A11Y_FALLBACK = {
  id: 'due0',
  kind: 'Text',
  text: 'Preparar até 3:30 PM',
  selector: 'text: "Preparar até 3:30 PM"',
};

const COMMAND_GROUPS = [
  { label: 'Interact', commands: ['tapOn', 'doubleTapOn', 'longPressOn', 'inputText'] },
  { label: 'Assert', commands: ['assertVisible', 'assertNotVisible'] },
  { label: 'Wait', commands: ['waitForAnimationToEnd', 'extendedWaitUntil'] },
  { label: 'App', commands: ['takeScreenshot', 'copyTextFrom'] },
];

const SNIPPETS = {
  tapOn: (n) => '- tapOn:\n    ' + n.selector,
  doubleTapOn: (n) => '- doubleTapOn:\n    ' + n.selector,
  longPressOn: (n) => '- longPressOn:\n    ' + n.selector,
  inputText: (n) => '- tapOn:\n    ' + n.selector + '\n- inputText: ""',
  assertVisible: (n) => '- assertVisible:\n    ' + n.selector,
  assertNotVisible: (n) => '- assertNotVisible:\n    ' + n.selector,
  waitForAnimationToEnd: () => '- waitForAnimationToEnd',
  extendedWaitUntil: (n) =>
    '- extendedWaitUntil:\n    visible:\n      ' + n.selector + '\n    timeout: 10000',
  takeScreenshot: () => '- takeScreenshot: pedidos',
  copyTextFrom: (n) => '- copyTextFrom:\n    ' + n.selector,
};

const STEP_LABELS = {
  launchApp: 'Launch app "com.example.app" with clear state',
  tapOn: 'Tap on',
  doubleTapOn: 'Double tap on',
  longPressOn: 'Long press on',
  assertVisible: 'Assert visible',
  assertNotVisible: 'Assert not visible',
  waitForAnimationToEnd: 'Wait for animation to end',
  extendedWaitUntil: 'Wait until visible',
  takeScreenshot: 'Take screenshot',
  copyTextFrom: 'Copy text from',
  inputText: 'Input text',
};

Object.assign(window, { FLOW_START, TESTS, A11Y_FALLBACK, COMMAND_GROUPS, SNIPPETS, STEP_LABELS });

/* Fixture data for the Conductor Studio recreation. Content mirrors the reference
   screenshot of the pnp-fast-mode project, in the team's own Portuguese copy. */
const FLOW_START = 'appId: com.example.app\n---\n- launchApp:\n    clearState: true\n';

/* The project's suite, as it sits in the repository's conductor/ folder — the only folder
   Conductor ever writes to. Flows can live in subfolders, so each carries the folder it is in
   ("" is the root of conductor/).

   `change` is the local, unsent edit: "new" | "edited" | "deleted". Everything is written to
   disk the moment it is typed, so this field is not "unsaved" — it is "the team has not seen
   this yet". Sorted by last run, most recent first — people come back to what they just broke,
   not to what is alphabetically first. */
const TESTS = [
  { id: "f-teste", name: "teste.yaml", folder: "", steps: 4, lastResult: "fail", lastRun: "Jul 28, 12:29 pm", duration: "0:04", open: true, change: "edited", changeNote: "3 steps changed" },
  { id: "f-pedidos", name: "pedidos-pendentes.yaml", folder: "pedidos", steps: 11, lastResult: "pass", lastRun: "Jul 28, 11:02 am", duration: "0:38" },
  { id: "f-checkout", name: "checkout.yaml", folder: "compra", steps: 17, lastResult: "pass", lastRun: "Jul 27, 6:41 pm", duration: "1:12" },
  { id: "f-separacao", name: "separacao.yaml", folder: "pedidos", steps: 9, lastResult: "fail", lastRun: "Jul 27, 6:38 pm", duration: "0:21" },
  { id: "f-login", name: "login.yaml", folder: "", steps: 6, lastResult: "pass", lastRun: "Jul 27, 9:15 am", duration: "0:14" },
  { id: "f-retirada", name: "retirada-loja.yaml", folder: "compra", steps: 8, lastResult: "pass", lastRun: "Jul 25, 4:02 pm", duration: "0:26", aiAuthored: true },
  { id: "f-busca", name: "busca-produto.yaml", folder: "compra", steps: 5, lastResult: "never", aiAuthored: true, change: "new" },
];

/* Folder order is explicit rather than alphabetical: the team decides what sits at the top. */
const FOLDERS = ["pedidos", "compra"];

/* Who reviews what lands in the shared project. Shown by name, never as a GitHub handle — the
   people using Conductor know Marina, not @mrsantos. */
const REVIEWER = { name: "Marina", role: "reviews test changes" };

/* The selector the assistant falls back to when nothing is hovered. Neither geometry nor the
   node count is stored here — both are measured from the DOM. */
const A11Y_FALLBACK = { id: "due0", kind: "Text", text: "Preparar até 3:30 PM", selector: 'text: "Preparar até 3:30 PM"' };

const COMMAND_GROUPS = [
  { label: "Interact", commands: ["tapOn", "doubleTapOn", "longPressOn", "inputText"] },
  { label: "Assert", commands: ["assertVisible", "assertNotVisible"] },
  { label: "Wait", commands: ["waitForAnimationToEnd", "extendedWaitUntil"] },
  { label: "App", commands: ["takeScreenshot", "copyTextFrom"] },
];

const SNIPPETS = {
  tapOn: (n) => "- tapOn:\n    " + n.selector,
  doubleTapOn: (n) => "- doubleTapOn:\n    " + n.selector,
  longPressOn: (n) => "- longPressOn:\n    " + n.selector,
  inputText: (n) => "- tapOn:\n    " + n.selector + "\n- inputText: \"\"",
  assertVisible: (n) => "- assertVisible:\n    " + n.selector,
  assertNotVisible: (n) => "- assertNotVisible:\n    " + n.selector,
  waitForAnimationToEnd: () => "- waitForAnimationToEnd",
  extendedWaitUntil: (n) => "- extendedWaitUntil:\n    visible:\n      " + n.selector + "\n    timeout: 10000",
  takeScreenshot: () => "- takeScreenshot: pedidos",
  copyTextFrom: (n) => "- copyTextFrom:\n    " + n.selector,
};

const STEP_LABELS = {
  launchApp: 'Launch app "com.example.app" with clear state',
  tapOn: "Tap on",
  doubleTapOn: "Double tap on",
  longPressOn: "Long press on",
  assertVisible: "Assert visible",
  assertNotVisible: "Assert not visible",
  waitForAnimationToEnd: "Wait for animation to end",
  extendedWaitUntil: "Wait until visible",
  takeScreenshot: "Take screenshot",
  copyTextFrom: "Copy text from",
  inputText: "Input text",
};

/* ── Repositories ─────────────────────────────────────────────────────────────────────────
   The repository is the only thing a person configures, and everything else is derived from it:
   `app` and `bundle` are read out of the build files, `folder` is where flows live, and the
   suite below it is what conductor/ contains. Switching repos swaps all of it. */
const ATENDIMENTO_TESTS = [
  { id: "a-chamado", name: "abrir-chamado.yaml", folder: "chat", steps: 9, lastResult: "pass", lastRun: "Aug 4, 10:12 am", duration: "0:31" },
  { id: "a-resposta", name: "resposta-rapida.yaml", folder: "chat", steps: 6, lastResult: "fail", lastRun: "Aug 4, 10:09 am", duration: "0:12" },
  { id: "a-login", name: "login.yaml", folder: "", steps: 5, lastResult: "pass", lastRun: "Aug 1, 5:20 pm", duration: "0:11" },
];

const REPOS = [
  { id: "r-pnp", host: "github.com", org: "loja-verde", name: "pnp-fast-mode", branch: "main", app: "Pedidos", bundle: "com.example.app", platform: "Android", folder: "conductor/", opened: "Now", tests: TESTS, folders: FOLDERS },
  { id: "r-atendimento", host: "github.com", org: "loja-verde", name: "atendimento-app", branch: "main", app: "Atendimento", bundle: "com.lojaverde.atendimento", platform: "Android", folder: "conductor/", opened: "Yesterday", tests: ATENDIMENTO_TESTS, folders: ["chat"] },
  { id: "r-entregador", host: "github.com", org: "loja-verde", name: "entregador", branch: "develop", app: "Entregador", bundle: "com.lojaverde.driver", platform: "Android", folder: "conductor/", opened: "Jul 21", tests: [], folders: [] },
];

/* Repos Conductor recognises when one is pasted for the first time. Anything else still
   resolves — it simply arrives with an empty conductor/. */
const REPO_LIBRARY = REPOS;

Object.assign(window, { FLOW_START, TESTS, FOLDERS, REPOS, REPO_LIBRARY, REVIEWER, A11Y_FALLBACK, COMMAND_GROUPS, SNIPPETS, STEP_LABELS });

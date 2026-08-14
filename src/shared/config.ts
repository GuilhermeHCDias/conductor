// src/shared/config.ts — fonte única do que é de fato constante (.context.md §2).
// `appId`, nome do app e URL do repo NÃO moram aqui: são estado em runtime,
// derivados do repositório ativo que o usuário colou (§2.1, §12.6).
export const CONFIG = {
  /**
   * Override explícito da branch base de um PR. Vazio = usar a branch com que
   * o clone veio, lida do próprio clone na hora de publicar (§8.3, emenda
   * 2026-08-07) — nunca uma constante incondicional.
   */
  REPO_BASE_BRANCH: process.env.CONDUCTOR_BASE_BRANCH ?? '',

  /**
   * Pasta, na raiz do repo, onde vivem os flows — e o único lugar em que o
   * Conductor escreve. Suporta subpastas (.context.md §7.1, §7.2).
   */
  FLOWS_DIR: 'conductor',

  /** Extensões reconhecidas como flow. */
  FLOW_EXTENSIONS: ['.yml', '.yaml'] as const,

  /**
   * Caminho explícito do binário `adb`. Vazio = resolver sozinho, na ordem que
   * o `AdbBridge` documenta. A resolução é comportamento e mora lá; aqui fica
   * só a constante que o usuário pode sobrescrever.
   */
  ADB_PATH: process.env.CONDUCTOR_ADB_PATH ?? '',

  /** Idem para o `maestro`. Vazio = resolver sozinho. */
  MAESTRO_PATH: process.env.CONDUCTOR_MAESTRO_PATH ?? '',

  /** Idem para o `gh`. Vazio = resolver sozinho (`resolve-gh`). */
  GH_PATH: process.env.CONDUCTOR_GH_PATH ?? '',

  /** Idem para o `claude`. Vazio = resolver sozinho (`resolve-claude`). */
  CLAUDE_PATH: process.env.CONDUCTOR_CLAUDE_PATH ?? '',

  /**
   * Sempre o alias `sonnet` (§6.0): aponta para o Sonnet mais recente sem
   * exigir release nosso.
   */
  AI_MODEL: 'sonnet',

  /**
   * Modelo da invocação de describe (§8.4, emenda 2026-08-08): sempre o alias
   * mais rápido, porque a nota precisa cair no campo com a folha ainda aberta.
   * O "sempre Sonnet" da §6.0 vale para a janela de IA (AI_MODEL), não aqui.
   */
  AI_DESCRIBE_MODEL: 'haiku',

  /** Teto de gasto de uma invocação de describe (§8.4): perfil apertado,
   * bem abaixo do teto da conversa do AIPanel. */
  AI_DESCRIBE_BUDGET_USD: 0.25,

  /**
   * Teto de gasto de uma conversa do AIPanel (§6.4). O resto rideia em cada
   * spawn como `--max-budget-usd`; o número morre no `AiService` — não cruza
   * canal, não entra em store, não chega a tela nenhuma (§6.4 como emendada).
   * Um override inválido ou não-positivo cai no padrão.
   */
  AI_BUDGET_USD:
    Number.parseFloat(process.env.CONDUCTOR_AI_BUDGET_USD ?? '') > 0
      ? Number.parseFloat(process.env.CONDUCTOR_AI_BUDGET_USD ?? '')
      : 0.5,
} as const;

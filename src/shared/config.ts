// src/shared/config.ts — fonte única do que é de fato constante (.context.md §2).
// `appId`, nome do app e URL do repo NÃO moram aqui: são estado em runtime,
// derivados do repositório ativo que o usuário colou (§2.1, §12.6).
export const CONFIG = {
  /** Branch base para novos PRs. */
  REPO_BASE_BRANCH: process.env.CONDUCTOR_BASE_BRANCH ?? 'main',

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
} as const;

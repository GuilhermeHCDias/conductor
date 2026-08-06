// src/shared/config.ts — fonte única de verdade
export const CONFIG = {
  /**
   * Package name (Android) / bundle id (iOS) do app sob teste.
   * Google Calendar por enquanto — um app que qualquer device Google já tem,
   * para testar de ponta a ponta até o app real ser definido.
   */
  APP_ID: process.env.CONDUCTOR_APP_ID ?? 'com.google.android.calendar',

  /**
   * Repositório canônico que contém os testes e2e.
   * Vazio enquanto o dono do produto não define (.context.md §2): um
   * placeholder viajaria para dentro de `git clone` como argumento
   * plausível, e é o `DoctorService` quem checa a ausência.
   */
  REPO_URL: process.env.CONDUCTOR_REPO_URL ?? '',

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
} as const;

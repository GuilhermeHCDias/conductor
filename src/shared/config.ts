// src/shared/config.ts — fonte única de verdade
export const CONFIG = {
  /** Package name (Android) / bundle id (iOS) do app sob teste. */
  APP_ID: process.env.CONDUCTOR_APP_ID ?? 'com.vtex.pnp',

  /**
   * Repositório canônico que contém os testes e2e.
   * Vazio enquanto o dono do produto não define (.context.md §2): um
   * placeholder viajaria para dentro de `git clone` como argumento
   * plausível, e é o `DoctorService` quem checa a ausência.
   */
  REPO_URL: process.env.CONDUCTOR_REPO_URL ?? '',

  /** Branch base para novos PRs. */
  REPO_BASE_BRANCH: process.env.CONDUCTOR_BASE_BRANCH ?? 'main',

  /** Pasta, dentro do repo, onde vivem os flows. */
  FLOWS_DIR: '.maestro',

  /** Extensões reconhecidas como flow. */
  FLOW_EXTENSIONS: ['.yml', '.yaml'] as const,
} as const;

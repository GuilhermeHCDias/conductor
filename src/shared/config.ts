// src/shared/config.ts — fonte única do que é de fato constante (.context.md §2).
// `appId`, nome do app e URL do repo NÃO moram aqui: são estado em runtime,
// derivados do repositório ativo que o usuário colou (§2.1, §12.6).

/** Um override numérico vindo do ambiente: só um finito > 0 vale — vazio,
 * lixo, zero, negativo e `Infinity` caem no padrão. */
export function positiveOverride(raw: string | undefined, fallback: number): number {
  const value = Number.parseFloat(raw ?? '');
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

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

  /** Idem para o `maestro`. Vazio = resolver sozinho. Um caminho explícito é
   * decisão da pessoa: o instalador nunca roda com ele definido (doctor). */
  MAESTRO_PATH: process.env.CONDUCTOR_MAESTRO_PATH ?? '',

  /**
   * A versão do Maestro que o Conductor instala e mantém em `userData/maestro`
   * — o terceiro artefato pinado depois do jar do scrcpy e do plugin (§10,
   * emenda do doctor). Toda instalação mira exatamente esta; o marcador
   * gravado ao lado da cópia é comparado com ela a cada lançamento.
   */
  MAESTRO_VERSION: process.env.CONDUCTOR_MAESTRO_VERSION ?? '2.10.0',

  /**
   * Base das releases: `<base>/cli-<versão>/maestro.zip` e o
   * `checksums_sha256.txt` ao lado. O override existe para iterar no
   * instalador offline, contra um `python3 -m http.server` local.
   */
  MAESTRO_RELEASE_URL:
    process.env.CONDUCTOR_MAESTRO_RELEASE_URL ??
    'https://github.com/mobile-dev-inc/maestro/releases/download',

  /** Idem para o `gh`. Vazio = resolver sozinho (`resolve-gh`). */
  GH_PATH: process.env.CONDUCTOR_GH_PATH ?? '',

  /**
   * Os pins das ferramentas que o doctor baixa direto quando não há Homebrew
   * (managed-tools, critério 13): GitHub CLI, Android platform-tools e o
   * Zulu JDK 21. Cada um mira uma versão exata; o marcador ao lado da cópia
   * em `~/.conductor/tools` é comparado com ela. Onde o publisher não
   * publica um arquivo de checksums (Google, Azul), o digest é pinado aqui.
   * Toda base de URL aceita o override `CONDUCTOR_<NOME>` para iterar
   * offline contra um `python3 -m http.server` local (critério 48).
   */
  GH_VERSION: process.env.CONDUCTOR_GH_VERSION ?? '2.100.0',
  GH_RELEASE_URL:
    process.env.CONDUCTOR_GH_RELEASE_URL ?? 'https://github.com/cli/cli/releases/download',
  PLATFORM_TOOLS_VERSION: process.env.CONDUCTOR_PLATFORM_TOOLS_VERSION ?? '37.0.1',
  PLATFORM_TOOLS_SHA256:
    process.env.CONDUCTOR_PLATFORM_TOOLS_SHA256 ??
    'ee39ad5967e95c2a07f04dbcbde96b1a0c916ba376096db5d2f498b7727a5d1d',
  PLATFORM_TOOLS_RELEASE_URL:
    process.env.CONDUCTOR_PLATFORM_TOOLS_RELEASE_URL ?? 'https://dl.google.com/android/repository',
  ZULU_VERSION: process.env.CONDUCTOR_ZULU_VERSION ?? '21.52.203',
  /** A versão do Java dentro desse build do Zulu — o que `java -version` imprime. */
  ZULU_JAVA_VERSION: process.env.CONDUCTOR_ZULU_JAVA_VERSION ?? '21.0.12.1',
  ZULU_SHA256:
    process.env.CONDUCTOR_ZULU_SHA256 ??
    '042093e0895c940a02d68e727bc37b59f3958e58aa1463ec9080845d77af0a45',
  ZULU_RELEASE_URL: process.env.CONDUCTOR_ZULU_RELEASE_URL ?? 'https://cdn.azul.com/zulu/bin',

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
  AI_BUDGET_USD: positiveOverride(process.env.CONDUCTOR_AI_BUDGET_USD, 0.5),
} as const;

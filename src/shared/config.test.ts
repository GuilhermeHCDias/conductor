import { describe, expect, it } from 'vitest';
import { CONFIG, positiveOverride } from './config';

/** O parser dos overrides numéricos de ambiente: só um finito > 0 passa —
 * vazio, lixo, zero, negativo e `Infinity` caem no padrão. */
describe('positiveOverride', () => {
  it('aceita um override finito e positivo', () => {
    expect(positiveOverride('0.75', 0.5)).toBe(0.75);
  });

  it('cai no padrão para tudo que não é um número finito positivo', () => {
    for (const raw of [undefined, '', 'abc', '0', '-0.5', 'Infinity', 'NaN']) {
      expect(positiveOverride(raw, 0.5)).toBe(0.5);
    }
  });
});

describe('CONFIG', () => {
  it('carrega um teto de conversa finito e positivo', () => {
    expect(Number.isFinite(CONFIG.AI_BUDGET_USD)).toBe(true);
    expect(CONFIG.AI_BUDGET_USD).toBeGreaterThan(0);
  });
});

/** Doctor criterion 7 — the Maestro pin and where its release lives are the
 * only two download facts that are constants; everything else derives. */
describe('the managed Maestro', () => {
  it('pins a semantic version', () => {
    expect(CONFIG.MAESTRO_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('points at the official release archive base', () => {
    expect(CONFIG.MAESTRO_RELEASE_URL).toBe(
      'https://github.com/mobile-dev-inc/maestro/releases/download',
    );
  });
});

/** Managed-tools criterion 13 — the direct-download pins beside Maestro's:
 * a version and a base URL each, plus the digest where the publisher ships
 * no checksum file (Google, Azul). */
describe('the managed tools', () => {
  it('pins the GitHub CLI, platform-tools and the Zulu JDK', () => {
    expect(CONFIG.GH_VERSION).toBe('2.100.0');
    expect(CONFIG.PLATFORM_TOOLS_VERSION).toBe('37.0.1');
    expect(CONFIG.PLATFORM_TOOLS_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(CONFIG.ZULU_VERSION).toBe('21.52.203');
    expect(CONFIG.ZULU_JAVA_VERSION).toBe('21.0.12.1');
    expect(CONFIG.ZULU_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('points at each publisher’s own release base', () => {
    expect(CONFIG.GH_RELEASE_URL).toBe('https://github.com/cli/cli/releases/download');
    expect(CONFIG.PLATFORM_TOOLS_RELEASE_URL).toBe('https://dl.google.com/android/repository');
    expect(CONFIG.ZULU_RELEASE_URL).toBe('https://cdn.azul.com/zulu/bin');
  });
});

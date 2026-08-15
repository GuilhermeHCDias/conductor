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

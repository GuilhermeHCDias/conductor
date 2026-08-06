import { describe, expect, it } from 'vitest';
import { counted } from './plural';

describe('counted', () => {
  it('leaves the noun singular for one', () => {
    expect(counted(1, 'change')).toBe('1 change');
  });

  it('pluralises every other count, zero included', () => {
    expect(counted(2, 'change')).toBe('2 changes');
    expect(counted(0, 'change')).toBe('0 changes');
  });

  it('serves any regular noun the chrome needs', () => {
    expect(counted(1, 'command')).toBe('1 command');
    expect(counted(4, 'command')).toBe('4 commands');
  });
});

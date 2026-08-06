import { describe, expect, it } from 'vitest';
import { hashText } from './hash';

/**
 * The index's `hash` (§7), computed on both sides of the bridge: main hashes
 * what it read from disk, the renderer hashes the editor's text, and equality
 * is how criterion 9 tells Conductor's own save from an external edit without
 * a file body ever riding the push.
 */
describe('hashText', () => {
  it('is deterministic', () => {
    expect(hashText('appId: x\n---\n')).toBe(hashText('appId: x\n---\n'));
  });

  /** The FNV-1a offset basis — the empty text pins the algorithm itself, so a
   * quiet reimplementation on one side cannot silently disagree with the
   * other. */
  it('hashes the empty text to the offset basis', () => {
    expect(hashText('')).toBe('811c9dc5');
  });

  it('tells texts apart, whitespace included', () => {
    expect(hashText('appId: x\n---\n')).not.toBe(hashText('appId: x\n---'));
    expect(hashText('a')).not.toBe(hashText('b'));
  });

  it('reads beyond ASCII', () => {
    expect(hashText('appId: café\n')).not.toBe(hashText('appId: cafe\n'));
  });
});

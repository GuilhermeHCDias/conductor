/**
 * FNV-1a, 32-bit, over UTF-16 code units — the flow index's `hash` (§7).
 *
 * Both sides of the bridge compute it: main hashes the text it read from
 * disk, the renderer hashes the editor's text, and equality means "the
 * watcher is reporting our own save" (criterion 9) without a file body ever
 * riding a push. It lives in `shared/` because the renderer has no
 * `node:crypto` — and it needs no strength: this is a change detector, not a
 * signature.
 */
export function hashText(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

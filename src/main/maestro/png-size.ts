/**
 * The pixel size a PNG declares, straight from its IHDR chunk. The screenshot
 * exists to calibrate the hierarchy's scale (§5.2), and its dimensions are the
 * only thing anything reads from it — decoding the picture to learn two
 * integers would drag an image codec into main for nothing.
 *
 * Pure, like `parseBounds`: bytes in, a size or `null` out. `null` rather than
 * a throw because "this is not a PNG" is the caller's condition to name — the
 * snapshot service maps it to `capture/failed`, which is what a screencap that
 * produced nothing usable already means.
 */

/** `\x89PNG\r\n\x1a\n` — the eight bytes every PNG starts with. */
const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;

/** Signature, chunk length, `IHDR`, width and height — all before byte 24. */
const HEADER_BYTES = 24;

const IHDR = 'IHDR';

export type PngSize = {
  readonly width: number;
  readonly height: number;
};

export function parsePngSize(bytes: Uint8Array): PngSize | null {
  if (bytes.length < HEADER_BYTES) {
    return null;
  }
  if (!SIGNATURE.every((expected, index) => bytes[index] === expected)) {
    return null;
  }
  // The spec fixes IHDR as the first chunk, so its type sits at byte 12 and its
  // data at 16. A file that opens with anything else is not one to guess at.
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== IHDR) {
    return null;
  }

  // ⚠️ Offset-aware on purpose: a `Buffer` from adb shares its pool allocation,
  // so byte 16 of this view is not byte 16 of the backing `ArrayBuffer`.
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16);
  const height = view.getUint32(20);
  if (width === 0 || height === 0) {
    return null;
  }
  return { width, height };
}

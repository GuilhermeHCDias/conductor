import { describe, expect, it } from 'vitest';
import { parsePngSize } from './png-size';

/** The 8-byte PNG signature, then the IHDR chunk: length, type, width, height. */
function png(width: number, height: number, type = 'IHDR'): Uint8Array {
  const bytes = new Uint8Array(24);
  const view = new DataView(bytes.buffer);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  view.setUint32(8, 13);
  bytes.set(new TextEncoder().encode(type), 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('the screenshot header', () => {
  it('reads the pixel size a screencap PNG declares', () => {
    expect(parsePngSize(png(720, 1600))).toEqual({ width: 720, height: 1600 });
  });

  /** ⚠️ `Buffer.slice` shares the pool allocation, so the view's own offset is
   * load-bearing — reading from offset 0 of the backing buffer would read
   * whatever neighbour the pool put there. */
  it('reads through a view that does not start at its buffer', () => {
    const padded = new Uint8Array(4 + 24);
    padded.set(png(464, 1024), 4);
    expect(parsePngSize(padded.subarray(4))).toEqual({ width: 464, height: 1024 });
  });

  it('answers null for bytes that are not a PNG', () => {
    expect(parsePngSize(new TextEncoder().encode('not a picture at all, sorry'))).toBeNull();
  });

  it('answers null when the first chunk is not IHDR', () => {
    expect(parsePngSize(png(720, 1600, 'IDAT'))).toBeNull();
  });

  it('answers null for a buffer shorter than the header', () => {
    expect(parsePngSize(png(720, 1600).subarray(0, 16))).toBeNull();
  });

  it('answers null for a declared size of zero', () => {
    expect(parsePngSize(png(0, 1600))).toBeNull();
  });
});

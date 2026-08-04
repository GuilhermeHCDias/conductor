import { ERROR_CODES, type ErrorCode } from '@shared/ipc';

/**
 * The scrcpy video socket, as a parser. Pure: it is handed bytes and gives back
 * events, and it has no idea a socket, a device or a process exists (criterion
 * 44). That is what makes every trap below testable with nothing plugged in.
 *
 * The wire, read out of scrcpy-server 3.3.4 and confirmed streaming on hardware
 * on 2026-08-04:
 *
 *   1. `send_dummy_byte` — one zero byte, on the first socket only. It is how a
 *      forward tunnel tells "connected" from "adb accepted the connection but
 *      nothing is listening".
 *   2. `send_device_meta` — 64 bytes: the device name, UTF-8, truncated to 63
 *      bytes and zero-padded to 64.
 *   3. `send_codec_meta` — 12 bytes on the video socket: codec id, initial
 *      width, initial height, all big-endian u32.
 *   4. then, per packet, `send_frame_meta`'s 12 bytes — a big-endian u64 whose
 *      bit 63 is the config flag, bit 62 the key-frame flag and low 62 bits the
 *      PTS in microseconds — followed by a big-endian u32 length and exactly
 *      that many bytes of Annex-B payload.
 *
 * Every one of those is a default of the server, which is why criterion 17 must
 * not pass them: each flag spelled out costs characters against the 255 the
 * device's `app_process` will accept.
 */

/** `send_device_meta`'s field: 63 usable bytes plus at least one NUL. */
export const DEVICE_META_BYTES = 64;

/** `send_codec_meta`: codec id, width, height. */
export const CODEC_META_BYTES = 12;

/** `send_frame_meta`: the flags-and-PTS u64, then the u32 length. */
export const FRAME_HEADER_BYTES = 12;

/** The dummy byte, the device name and the codec header, in that order. */
export const PREFIX_BYTES = 1 + DEVICE_META_BYTES + CODEC_META_BYTES;

/**
 * Criterion 21. The length arrives as 32 bits off a socket, so believing it is
 * how a stream of noise becomes a 4 GB allocation in main. Generous against the
 * 29 KB key frame the phone actually sent, and finite by construction.
 */
export const MAX_PACKET_BYTES = 4 * 1024 * 1024;

/** Where the codec header sits within the prefix. */
const CODEC_META_OFFSET = 1 + DEVICE_META_BYTES;

/** Bit 63 of the frame meta. */
const CONFIG_FLAG = 1n << 63n;
/** Bit 62. */
const KEY_FRAME_FLAG = 1n << 62n;
/** Everything below both flags. */
const PTS_MASK = (1n << 62n) - 1n;

export type ScrcpyMeta = {
  /** What the phone calls itself — `SM-A075M` on the device this was read from. */
  readonly deviceName: string;
  /** The FourCC the server sent, as its four characters: `h264`. */
  readonly codec: string;
  readonly width: number;
  readonly height: number;
};

export type ScrcpyPacket = {
  /** Set on the packet carrying SPS and PPS. It configures the decoder and is
   * never handed to it as a frame. */
  readonly config: boolean;
  readonly keyFrame: boolean;
  /**
   * Microseconds, from the low 62 bits. A double holds those exactly up to
   * 2^53 µs — 285 years of device uptime — so the narrowing is safe for every
   * value a phone can produce, and `EncodedVideoChunk` wants a number anyway.
   */
  readonly pts: number;
  readonly payload: Uint8Array;
};

export type ScrcpyEvent =
  | { readonly type: 'meta'; readonly meta: ScrcpyMeta }
  | { readonly type: 'packet'; readonly packet: ScrcpyPacket };

/**
 * A wire that said something it should not have. It carries a stable code
 * because the two ways this happens need telling apart: a truncated prefix
 * means the server died on startup (on a Samsung, almost always the 255-char
 * command line), and an impossible length means the bytes are not scrcpy's.
 */
export class ScrcpyProtocolError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = 'ScrcpyProtocolError';
  }
}

/**
 * Incremental, because TCP is: a read carries whatever happened to be in the
 * kernel buffer, which may be half a header or six packets. State is a byte
 * offset and a buffer, and every `push` drains as much as is fully there —
 * which is what makes the output independent of the chunking (criterion 20).
 */
export class ScrcpyParser {
  private buffer = new Uint8Array(0);
  /** Bytes at the head of `buffer` already emitted. Compacted lazily, so a
   * 30 fps stream does not re-copy its backlog on every packet. */
  private consumed = 0;
  private handshakeDone = false;

  /** Everything the bytes so far complete, in order. */
  push(chunk: Uint8Array): ScrcpyEvent[] {
    if (chunk.length > 0) {
      this.append(chunk);
    }

    const events: ScrcpyEvent[] = [];
    if (!this.handshakeDone) {
      const meta = this.takeHandshake();
      if (meta === null) {
        return events;
      }
      events.push({ type: 'meta', meta });
    }

    for (let packet = this.takePacket(); packet !== null; packet = this.takePacket()) {
      events.push({ type: 'packet', packet });
    }
    return events;
  }

  /**
   * Criterion 18. The prefix is strict: a stream that stops inside it means the
   * server never really came up, and saying so is the difference between a
   * fixable report and a mystery. Past the prefix, a stream simply ending is
   * the device going away — criterion 25's business, not this parser's.
   */
  end(): void {
    if (this.handshakeDone) {
      return;
    }
    throw new ScrcpyProtocolError(
      ERROR_CODES.mirrorHandshakeFailed,
      `The scrcpy stream ended ${describePrefixStage(this.available)}, after ${this.available} of ${PREFIX_BYTES} bytes.`,
    );
  }

  private get available(): number {
    return this.buffer.length - this.consumed;
  }

  private append(chunk: Uint8Array): void {
    const kept = this.buffer.subarray(this.consumed);
    const next = new Uint8Array(kept.length + chunk.length);
    next.set(kept, 0);
    next.set(chunk, kept.length);
    this.buffer = next;
    this.consumed = 0;
  }

  /** `null` until all 77 bytes are in; nothing partial is ever reported. */
  private takeHandshake(): ScrcpyMeta | null {
    if (this.available < PREFIX_BYTES) {
      return null;
    }

    const prefix = this.buffer.subarray(this.consumed, this.consumed + PREFIX_BYTES);
    this.consumed += PREFIX_BYTES;
    this.handshakeDone = true;

    const view = new DataView(prefix.buffer, prefix.byteOffset, prefix.byteLength);
    return {
      deviceName: readDeviceName(prefix.subarray(1, CODEC_META_OFFSET)),
      codec: readFourCc(view.getUint32(CODEC_META_OFFSET)),
      width: view.getUint32(CODEC_META_OFFSET + 4),
      height: view.getUint32(CODEC_META_OFFSET + 8),
    };
  }

  private takePacket(): ScrcpyPacket | null {
    if (this.available < FRAME_HEADER_BYTES) {
      return null;
    }

    const head = this.buffer.subarray(this.consumed, this.consumed + FRAME_HEADER_BYTES);
    const view = new DataView(head.buffer, head.byteOffset, head.byteLength);
    const meta = view.getBigUint64(0);
    const length = view.getUint32(8);

    // Criterion 21: checked on the header, so nothing ever allocates what a
    // 32-bit number off the wire asked for.
    if (length > MAX_PACKET_BYTES) {
      throw new ScrcpyProtocolError(
        ERROR_CODES.mirrorProtocolFailed,
        `The scrcpy stream declared a packet of ${length} bytes, above the ${MAX_PACKET_BYTES}-byte ceiling.`,
      );
    }
    if (this.available < FRAME_HEADER_BYTES + length) {
      return null;
    }

    const start = this.consumed + FRAME_HEADER_BYTES;
    this.consumed = start + length;
    return {
      config: (meta & CONFIG_FLAG) !== 0n,
      keyFrame: (meta & KEY_FRAME_FLAG) !== 0n,
      pts: Number(meta & PTS_MASK),
      // Copied rather than shared: the backing buffer is recycled on the next
      // append, and this payload outlives that — it crosses IPC.
      payload: this.buffer.slice(start, start + length),
    };
  }
}

/** UTF-8 up to the first NUL. The field is padded, and the padding is not a name. */
function readDeviceName(field: Uint8Array): string {
  const end = field.indexOf(0);
  return new TextDecoder().decode(end === -1 ? field : field.subarray(0, end));
}

/** scrcpy sends the codec as the ASCII of its name packed into a u32. */
function readFourCc(value: number): string {
  return String.fromCharCode(
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  );
}

/** Which part of the strict prefix `seen` bytes stopped inside. */
function describePrefixStage(seen: number): string {
  if (seen < 1) {
    return 'before the dummy byte';
  }
  if (seen < CODEC_META_OFFSET) {
    return 'inside the device name';
  }
  return 'inside the codec header';
}

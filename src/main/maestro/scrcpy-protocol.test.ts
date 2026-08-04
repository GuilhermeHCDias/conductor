import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ERROR_CODES } from '@shared/ipc';
import { describe, expect, it } from 'vitest';
import {
  CODEC_META_BYTES,
  DEVICE_META_BYTES,
  FRAME_HEADER_BYTES,
  MAX_PACKET_BYTES,
  PREFIX_BYTES,
  type ScrcpyEvent,
  ScrcpyParser,
  ScrcpyProtocolError,
} from './scrcpy-protocol';

/**
 * The strongest tests in this spec, and the reason they can be: the parser is
 * pure. Every byte below is either transcribed from the hardware capture of
 * 2026-08-04 (a Galaxy A07, scrcpy-server 3.3.4, `max_size=1024`, encoder
 * `c2.mtk.avc.encoder`) or synthesised to hit a boundary that capture could not
 * reach.
 *
 * The captured prefix, verbatim:
 *
 *   dummy byte  : 0x00
 *   device meta : 64 bytes -> "SM-A075M"
 *   codec meta  : 12 bytes -> codec="h264" 464x1024
 *   packet 0    : len=   31 config=1 key=0 pts=0us
 *   packet 1    : len=29744 config=0 key=1 pts=652021984203us
 *   packet 2    : len=10270 config=0 key=0
 */

/* ── the captured session, as bytes ───────────────────────────────────────── */

const DEVICE_NAME = 'SM-A075M';
const WIDTH = 464;
const HEIGHT = 1024;
/** scrcpy sends the codec as a FourCC: the ASCII of "h264" as a big-endian u32. */
const H264_ID = 0x68323634;

/** The dummy byte, the 64-byte device name and the 12-byte codec header. */
function prefix(
  options: { name?: string; codecId?: number; width?: number; height?: number } = {},
): Uint8Array {
  const bytes = new Uint8Array(PREFIX_BYTES);
  const view = new DataView(bytes.buffer);

  // send_dummy_byte: one zero, on the first socket only.
  bytes[0] = 0;
  // send_device_meta: UTF-8, truncated to 63 bytes, zero-padded to 64.
  bytes.set(new TextEncoder().encode(options.name ?? DEVICE_NAME).slice(0, 63), 1);
  // send_codec_meta: codec id, initial width, initial height — all big-endian.
  view.setUint32(1 + DEVICE_META_BYTES, options.codecId ?? H264_ID);
  view.setUint32(1 + DEVICE_META_BYTES + 4, options.width ?? WIDTH);
  view.setUint32(1 + DEVICE_META_BYTES + 8, options.height ?? HEIGHT);

  return bytes;
}

/**
 * send_frame_meta: a big-endian u64 whose bit 63 is the config flag, bit 62 the
 * key-frame flag and low 62 bits the PTS in microseconds, then a big-endian u32
 * packet length, then the payload.
 */
function packet(options: {
  config?: boolean;
  keyFrame?: boolean;
  pts?: number | bigint;
  payload: Uint8Array;
  /** Overrides the length field, to build a header that lies. */
  declaredLength?: number;
}): Uint8Array {
  const header = new Uint8Array(FRAME_HEADER_BYTES);
  const view = new DataView(header.buffer);

  let meta = BigInt(options.pts ?? 0);
  if (options.config === true) {
    meta |= 1n << 63n;
  }
  if (options.keyFrame === true) {
    meta |= 1n << 62n;
  }
  view.setBigUint64(0, meta);
  view.setUint32(8, options.declaredLength ?? options.payload.length);

  return concat([header, options.payload]);
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

/** The config packet the phone actually sent: SPS then PPS, 4-byte start codes. */
const CONFIG_PAYLOAD = bytes(0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0x00, 0x1e);
const IDR_PAYLOAD = bytes(0x00, 0x00, 0x00, 0x01, 0x65, 0x88, 0x84);
const DELTA_PAYLOAD = bytes(0x00, 0x00, 0x00, 0x01, 0x41, 0x9a, 0x02);

/* ── driving the parser ───────────────────────────────────────────────────── */

/** Feeds every chunk in order and returns everything the parser emitted. */
function drain(chunks: readonly Uint8Array[]): ScrcpyEvent[] {
  const parser = new ScrcpyParser();
  return chunks.flatMap((chunk) => parser.push(chunk));
}

/** Cuts `source` at each offset, so a test can put a split exactly where it hurts. */
function splitAt(source: Uint8Array, ...offsets: readonly number[]): Uint8Array[] {
  const cuts = [0, ...offsets, source.length];
  return cuts.slice(0, -1).map((start, index) => source.subarray(start, cuts[index + 1]));
}

function everyByteSeparately(source: Uint8Array): Uint8Array[] {
  return [...source].map((byte) => bytes(byte));
}

describe('the handshake prefix', () => {
  it('reports the device, the codec and the stream size once all 77 bytes are in', () => {
    expect(drain([prefix()])).toEqual([
      {
        type: 'meta',
        meta: { deviceName: 'SM-A075M', codec: 'h264', width: 464, height: 1024 },
      },
    ]);
  });

  it('is exactly the dummy byte, the 64-byte name and the 12-byte codec header', () => {
    expect(PREFIX_BYTES).toBe(1 + DEVICE_META_BYTES + CODEC_META_BYTES);
    expect(DEVICE_META_BYTES).toBe(64);
    expect(CODEC_META_BYTES).toBe(12);
  });

  it('strips the zero padding from the device name', () => {
    const [event] = drain([prefix({ name: 'Pixel 7' })]);

    expect(event).toEqual({
      type: 'meta',
      meta: { deviceName: 'Pixel 7', codec: 'h264', width: 464, height: 1024 },
    });
  });

  /** The server truncates to 63 bytes, so the field can be full with no NUL. */
  it('reads a name that fills all 63 usable bytes', () => {
    const long = 'A'.repeat(63);
    const [event] = drain([prefix({ name: long })]);

    expect(event).toEqual({
      type: 'meta',
      meta: { deviceName: long, codec: 'h264', width: 464, height: 1024 },
    });
  });

  it('says nothing at all until the prefix is complete', () => {
    const full = prefix();

    expect(drain([full.subarray(0, PREFIX_BYTES - 1)])).toEqual([]);
  });

  /** Criterion 18 — a strict prefix, and dying inside it has its own code. */
  describe('when the stream ends inside it', () => {
    it.each([
      ['before the dummy byte', 0],
      ['inside the device name', 1],
      ['inside the device name, one byte short', DEVICE_META_BYTES],
      ['inside the codec header', 1 + DEVICE_META_BYTES],
      ['inside the codec header, one byte short', PREFIX_BYTES - 1],
    ])('fails %s', (_label, seen) => {
      const parser = new ScrcpyParser();
      parser.push(prefix().subarray(0, seen));

      expect(() => {
        parser.end();
      }).toThrow(ScrcpyProtocolError);
    });

    it('fails with the handshake code, distinct from every other failure', () => {
      const parser = new ScrcpyParser();
      parser.push(prefix().subarray(0, 40));

      try {
        parser.end();
        expect.unreachable('the truncated prefix should have failed');
      } catch (error) {
        expect(error).toBeInstanceOf(ScrcpyProtocolError);
        expect((error as ScrcpyProtocolError).code).toBe(ERROR_CODES.mirrorHandshakeFailed);
      }
    });

    it('names which part of the prefix it died in', () => {
      const parser = new ScrcpyParser();
      parser.push(prefix().subarray(0, 1 + DEVICE_META_BYTES));

      expect(() => {
        parser.end();
      }).toThrow(/codec header/i);
    });
  });

  it('accepts an end once the prefix is complete', () => {
    const parser = new ScrcpyParser();
    parser.push(prefix());

    expect(() => {
      parser.end();
    }).not.toThrow();
  });

  /** A stream that stops between packets is the device going away, not a
   * malformed prefix — that is criterion 25's business, not this parser's. */
  it('accepts an end part-way through a packet payload', () => {
    const parser = new ScrcpyParser();
    parser.push(concat([prefix(), packet({ payload: IDR_PAYLOAD }).subarray(0, 14)]));

    expect(() => {
      parser.end();
    }).not.toThrow();
  });
});

describe('a packet', () => {
  const parse = (...packets: readonly Uint8Array[]): ScrcpyEvent[] =>
    drain([concat([prefix(), ...packets])]).slice(1);

  /** Criterion 19 — 12 bytes of header, then exactly `length` bytes. */
  it('carries its payload, its flags and its PTS', () => {
    expect(parse(packet({ keyFrame: true, pts: 652021984203, payload: IDR_PAYLOAD }))).toEqual([
      {
        type: 'packet',
        packet: { config: false, keyFrame: true, pts: 652021984203, payload: IDR_PAYLOAD },
      },
    ]);
  });

  it('reads the config flag from bit 63', () => {
    const [event] = parse(packet({ config: true, payload: CONFIG_PAYLOAD }));

    expect(event).toMatchObject({ packet: { config: true, keyFrame: false } });
  });

  it('reads the key-frame flag from bit 62', () => {
    const [event] = parse(packet({ keyFrame: true, payload: IDR_PAYLOAD }));

    expect(event).toMatchObject({ packet: { config: false, keyFrame: true } });
  });

  /** Both flags live above the PTS, so neither may leak into it. */
  it('masks both flags out of the PTS', () => {
    const [event] = parse(packet({ config: true, keyFrame: true, pts: 1, payload: DELTA_PAYLOAD }));

    expect(event).toMatchObject({ packet: { config: true, keyFrame: true, pts: 1 } });
  });

  it('reads a PTS that uses the full low 62 bits', () => {
    // 0x3FFF_FFFF_FFFF_FFFF would not survive the trip through a double; this is
    // the largest PTS a Number can hold exactly, and it is 285 years of uptime.
    const huge = Number.MAX_SAFE_INTEGER;
    const [event] = parse(
      packet({ config: true, keyFrame: true, pts: huge, payload: IDR_PAYLOAD }),
    );

    expect(event).toMatchObject({ packet: { pts: huge } });
  });

  /** The three packets the phone actually sent, in order. */
  it('parses the captured opening of a real session', () => {
    const events = parse(
      packet({ config: true, pts: 0, payload: CONFIG_PAYLOAD }),
      packet({ keyFrame: true, pts: 652021984203, payload: IDR_PAYLOAD }),
      packet({ pts: 652022017536, payload: DELTA_PAYLOAD }),
    );

    expect(events).toEqual([
      {
        type: 'packet',
        packet: { config: true, keyFrame: false, pts: 0, payload: CONFIG_PAYLOAD },
      },
      {
        type: 'packet',
        packet: { config: false, keyFrame: true, pts: 652021984203, payload: IDR_PAYLOAD },
      },
      {
        type: 'packet',
        packet: { config: false, keyFrame: false, pts: 652022017536, payload: DELTA_PAYLOAD },
      },
    ]);
  });

  it('accepts a zero-length packet without stalling the ones behind it', () => {
    const events = parse(
      packet({ payload: new Uint8Array(0) }),
      packet({ keyFrame: true, payload: IDR_PAYLOAD }),
    );

    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ packet: { keyFrame: true, payload: IDR_PAYLOAD } });
  });

  it('emits nothing while a payload is still arriving', () => {
    const whole = concat([prefix(), packet({ payload: IDR_PAYLOAD })]);

    expect(drain([whole.subarray(0, whole.length - 1)])).toHaveLength(1); // the meta only
  });
});

/**
 * Criterion 20. TCP hands over whatever it has, so the same bytes must produce
 * the same events however they are cut up — including through a header, through
 * a payload, and one byte at a time.
 */
describe('however the stream is chunked', () => {
  const SESSION = concat([
    prefix(),
    packet({ config: true, pts: 0, payload: CONFIG_PAYLOAD }),
    packet({ keyFrame: true, pts: 652021984203, payload: IDR_PAYLOAD }),
    packet({ pts: 652022017536, payload: DELTA_PAYLOAD }),
  ]);

  const EXPECTED = drain([SESSION]);

  it('produces something worth comparing against', () => {
    expect(EXPECTED).toHaveLength(4);
  });

  it.each([
    ['split inside the device name', splitAt(SESSION, 30)],
    ['split inside the codec header', splitAt(SESSION, 1 + DEVICE_META_BYTES + 5)],
    ['split at the end of the prefix', splitAt(SESSION, PREFIX_BYTES)],
    ['split inside a frame header', splitAt(SESSION, PREFIX_BYTES + 6)],
    ['split inside a payload', splitAt(SESSION, PREFIX_BYTES + FRAME_HEADER_BYTES + 3)],
    ['split at every boundary at once', splitAt(SESSION, 1, 40, 65, 77, 83, 95, 100)],
  ])('is identical when %s', (_label, chunks) => {
    expect(drain(chunks)).toEqual(EXPECTED);
  });

  it('is identical one byte at a time', () => {
    expect(drain(everyByteSeparately(SESSION))).toEqual(EXPECTED);
  });

  it('is identical when a chunk is empty', () => {
    expect(drain([new Uint8Array(0), SESSION, new Uint8Array(0)])).toEqual(EXPECTED);
  });
});

/**
 * Criterion 21. The length is 32 bits and comes off the wire: believing it is
 * how a stream of noise turns into a 4 GB allocation in main.
 */
describe('an impossible packet length', () => {
  it('fails rather than allocating what the header asks for', () => {
    const parser = new ScrcpyParser();
    parser.push(prefix());

    expect(() => {
      parser.push(packet({ payload: new Uint8Array(0), declaredLength: MAX_PACKET_BYTES + 1 }));
    }).toThrow(ScrcpyProtocolError);
  });

  /** Rejected on the header alone — nothing waits for the payload to arrive. */
  it('fails on the header, before a single payload byte has been seen', () => {
    const parser = new ScrcpyParser();
    parser.push(prefix());
    const header = packet({
      payload: new Uint8Array(0),
      declaredLength: 0xffffffff,
    }).subarray(0, FRAME_HEADER_BYTES);

    expect(() => {
      parser.push(header);
    }).toThrow(/0x100000|4294967295|too large/i);
  });

  it('fails with the protocol code, distinct from the handshake one', () => {
    const parser = new ScrcpyParser();
    parser.push(prefix());

    try {
      parser.push(packet({ payload: new Uint8Array(0), declaredLength: MAX_PACKET_BYTES + 1 }));
      expect.unreachable('the oversized length should have failed');
    } catch (error) {
      expect((error as ScrcpyProtocolError).code).toBe(ERROR_CODES.mirrorProtocolFailed);
    }
  });

  it('accepts a packet exactly at the ceiling', () => {
    const parser = new ScrcpyParser();
    parser.push(prefix());
    const payload = new Uint8Array(MAX_PACKET_BYTES);

    expect(parser.push(packet({ payload }))).toHaveLength(1);
  });

  /** The ceiling is generous against the 29 KB the phone actually sent, and
   * finite by construction. */
  it('sits far above a real key frame and far below a runaway', () => {
    expect(MAX_PACKET_BYTES).toBeGreaterThan(29_744 * 8);
    expect(MAX_PACKET_BYTES).toBeLessThan(64 * 1024 * 1024);
  });
});

/** Criterion 44 — pure: no I/O, no Electron, no process. */
describe('the module itself', () => {
  const source = readFileSync(resolve('src/main/maestro/scrcpy-protocol.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('imports nothing that touches the outside world', () => {
    expect(code).not.toMatch(/from\s+['"]node:/);
    expect(code).not.toMatch(/from\s+['"]electron['"]/);
    expect(code).not.toMatch(/require\(/);
  });

  it('imports only the shared contract', () => {
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

    expect(imports).toEqual(['@shared/ipc']);
  });
});

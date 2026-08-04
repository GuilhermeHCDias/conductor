import { describe, expect, it } from 'vitest';
import { codecString, decoderConfig, NAL_TYPE, nalType, nalUnits } from './h264';

/**
 * The renderer's `SelectorSynth`: pure, trap-dense, and testable to exhaustion
 * with no device and no WebCodecs. jsdom has neither, which is exactly why every
 * decode *decision* lives here and the hook that uses them stays thin.
 *
 * The hardware capture of 2026-08-04 settled the one question this could not be
 * written without: the payload is **Annex-B**, and the config packet carries SPS
 * then PPS with 4-byte start codes —
 *
 *   packet 0 : len=31 config=1 key=0 pts=0us  00 00 00 01 67 …  -> SPS(4b), PPS(4b)
 *
 * so the decoder is configured with no `description` and the `avcC` fallback is
 * dead code that never needed writing. The capture recorded that shape and those
 * first bytes; the full 31 were not transcribed, so the SPS bodies below are real
 * encoder output of the same shape rather than that exact packet.
 */

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

const START_4 = [0x00, 0x00, 0x00, 0x01];
const START_3 = [0x00, 0x00, 0x01];

/** Constrained baseline, level 3.0 — what an Android `avc` encoder emits by
 * default. profile_idc 0x42, constraint flags 0xc0, level_idc 0x1e. */
const SPS_BASELINE = bytes(
  0x67,
  0x42,
  0xc0,
  0x1e,
  0xd9,
  0x00,
  0xf0,
  0x11,
  0x7e,
  0xf0,
  0x11,
  0x00,
  0x00,
  0x03,
  0x00,
  0x01,
  0x00,
  0x00,
  0x03,
  0x00,
  0x32,
  0x0f,
  0x16,
  0x2e,
  0x48,
);

/** High profile, level 3.2. profile_idc 0x64, no constraint flags, level 0x20. */
const SPS_HIGH = bytes(0x67, 0x64, 0x00, 0x20, 0xac, 0xd9, 0x40, 0x74, 0x02, 0x7e, 0x5c, 0x05);

const PPS = bytes(0x68, 0xcb, 0x8c, 0xb2);
const IDR = bytes(0x65, 0x88, 0x84, 0x00, 0x21, 0xff);

/** The config packet, assembled the way the phone sends it. */
const CONFIG_PACKET = bytes(...START_4, ...SPS_BASELINE, ...START_4, ...PPS);

describe('splitting Annex-B', () => {
  it('splits on four-byte start codes', () => {
    expect(nalUnits(CONFIG_PACKET)).toEqual([SPS_BASELINE, PPS]);
  });

  /** Both lengths are legal, and encoders mix them within one stream. */
  it('splits on three-byte start codes', () => {
    const stream = bytes(...START_3, ...SPS_BASELINE, ...START_3, ...PPS);

    expect(nalUnits(stream)).toEqual([SPS_BASELINE, PPS]);
  });

  it('splits a stream that mixes the two lengths', () => {
    const stream = bytes(...START_4, ...SPS_BASELINE, ...START_3, ...PPS, ...START_4, ...IDR);

    expect(nalUnits(stream)).toEqual([SPS_BASELINE, PPS, IDR]);
  });

  it('finds nothing in an empty payload', () => {
    expect(nalUnits(new Uint8Array(0))).toEqual([]);
  });

  /** Bytes with no start code are not a NAL stream, and guessing would hand the
   * decoder a unit that begins in the middle of one. */
  it('finds nothing when there is no start code at all', () => {
    expect(nalUnits(bytes(0x41, 0x9a, 0x02))).toEqual([]);
  });

  it('drops a start code with nothing behind it', () => {
    expect(nalUnits(bytes(...START_4, ...IDR, ...START_4))).toEqual([IDR]);
  });

  it('skips leading bytes before the first start code', () => {
    expect(nalUnits(bytes(0xff, 0xff, ...START_4, ...IDR))).toEqual([IDR]);
  });
});

describe('the NAL type', () => {
  /** The low five bits. The two above them are `nal_ref_idc`, and reading the
   * whole byte would call an SPS with a different reference idc something else. */
  it.each([
    ['an SPS', 0x67, NAL_TYPE.sps],
    ['a PPS', 0x68, NAL_TYPE.pps],
    ['an IDR', 0x65, NAL_TYPE.idr],
    ['a non-IDR slice', 0x41, NAL_TYPE.nonIdr],
    ['an SPS whose reference idc is zero', 0x07, NAL_TYPE.sps],
  ])('reads %s', (_label, header, expected) => {
    expect(nalType(bytes(header, 0x42, 0xc0, 0x1e))).toBe(expected);
  });

  it('reports nothing for an empty unit', () => {
    expect(nalType(new Uint8Array(0))).toBeNull();
  });
});

/**
 * Criterion 34. The profile, the constraint flags and the level all come out of
 * the SPS. Hardcoding `avc1.42E01E` is the bug this criterion exists to prevent:
 * the decoder would then reject — or worse, mis-decode — every stream from an
 * encoder that chose differently.
 */
describe('the codec string', () => {
  it('reads profile, constraint flags and level out of a baseline SPS', () => {
    expect(codecString(SPS_BASELINE)).toBe('avc1.42c01e');
  });

  it('reads them out of a high-profile SPS', () => {
    expect(codecString(SPS_HIGH)).toBe('avc1.640020');
  });

  it('is not the same string for two different encoders', () => {
    expect(codecString(SPS_BASELINE)).not.toBe(codecString(SPS_HIGH));
  });

  it('pads each field to two hex digits', () => {
    expect(codecString(bytes(0x67, 0x42, 0x00, 0x0a))).toBe('avc1.42000a');
  });

  it('refuses a NAL that is not an SPS', () => {
    expect(codecString(PPS)).toBeNull();
    expect(codecString(IDR)).toBeNull();
  });

  it('refuses an SPS too short to carry all three fields', () => {
    expect(codecString(bytes(0x67, 0x42, 0xc0))).toBeNull();
  });
});

/** Criterion 35 — Annex-B, no `description`, and latency asked for by name. */
describe('the decoder config', () => {
  it('is built from the config packet and the stream’s own size', () => {
    expect(decoderConfig(CONFIG_PACKET, 464, 1024)).toEqual({
      codec: 'avc1.42c01e',
      codedWidth: 464,
      codedHeight: 1024,
      optimizeForLatency: true,
    });
  });

  /**
   * The presence of `description` is what tells WebCodecs the bitstream is
   * AVCC. Setting one for an Annex-B stream fails the very first decode, and
   * the capture settled that this stream is Annex-B.
   */
  it('carries no description, because the stream is Annex-B', () => {
    const config = decoderConfig(CONFIG_PACKET, 464, 1024);

    expect(config).not.toBeNull();
    expect(config === null ? true : 'description' in config).toBe(false);
  });

  it('asks for the latency the §5.5 loop lives on', () => {
    expect(decoderConfig(CONFIG_PACKET, 464, 1024)?.optimizeForLatency).toBe(true);
  });

  it('takes the size from the codec header rather than from the SPS', () => {
    expect(decoderConfig(CONFIG_PACKET, 720, 1600)).toMatchObject({
      codedWidth: 720,
      codedHeight: 1600,
    });
  });

  it('finds the SPS wherever in the packet it sits', () => {
    const reordered = bytes(...START_4, ...PPS, ...START_4, ...SPS_HIGH);

    expect(decoderConfig(reordered, 464, 1024)?.codec).toBe('avc1.640020');
  });

  it('refuses a config packet that carries no SPS', () => {
    expect(decoderConfig(bytes(...START_4, ...PPS), 464, 1024)).toBeNull();
  });

  it('refuses an empty config packet', () => {
    expect(decoderConfig(new Uint8Array(0), 464, 1024)).toBeNull();
  });
});

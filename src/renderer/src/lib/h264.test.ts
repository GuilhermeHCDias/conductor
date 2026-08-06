import { describe, expect, it } from 'vitest';
import { codecString, decoderConfig, NAL_TYPE, nalType, nalUnits, withParameterSets } from './h264';

/**
 * The renderer's `SelectorSynth`: pure, trap-dense, and testable to exhaustion
 * with no device and no WebCodecs. jsdom has neither, which is exactly why every
 * decode *decision* lives here and the hook that uses them stays thin.
 *
 * The bytes below are **the real config packet**, read off a Galaxy A07
 * (`SM-A075M`, Android 16) on 2026-08-04 at `max_size=1024`:
 *
 *   packet 0 : len=31 config=1 key=0 pts=0us  00 00 00 01 67 …  -> SPS(19b), PPS(4b)
 *
 * It settled the question this module could not be written without — the payload
 * is **Annex-B**, SPS then PPS, 4-byte start codes — so the decoder is configured
 * with no `description` and the `avcC` fallback is dead code that never needed
 * writing.
 *
 * ⚠️ And it settled a second one that matters more. That phone encodes in
 * **High profile at level 3.2**, not the constrained baseline everyone reaches
 * for: a hardcoded `avc1.42E01E` would have been wrong on the very device this
 * spec was verified against. That is criterion 34, in one fixture.
 */

const bytes = (...values: number[]): Uint8Array => new Uint8Array(values);

const START_4 = [0x00, 0x00, 0x00, 0x01];
const START_3 = [0x00, 0x00, 0x01];

/** Captured: High profile (0x64), no constraint flags (0x00), level 3.2 (0x20). */
const SPS = bytes(
  0x67,
  0x64,
  0x00,
  0x20,
  0xac,
  0x1b,
  0x1a,
  0x81,
  0xd0,
  0x20,
  0x69,
  0xa8,
  0x08,
  0x08,
  0x08,
  0x3c,
  0x22,
  0x11,
  0xa8,
);

/** Captured, from the same packet. */
const PPS = bytes(0x68, 0xea, 0x43, 0xcb);

/** A second encoder's SPS — constrained baseline, level 3.0 — so the tests can
 * show the string actually tracks the stream instead of being a constant. */
const SPS_BASELINE = bytes(0x67, 0x42, 0xc0, 0x1e, 0xd9, 0x00, 0xf0, 0x11, 0x7e);

const IDR = bytes(0x65, 0x88, 0x84, 0x00, 0x21, 0xff);

/** The captured 31 bytes, exactly as the phone sent them. */
const CONFIG_PACKET = bytes(...START_4, ...SPS, ...START_4, ...PPS);

describe('splitting Annex-B', () => {
  it('splits the captured config packet into its SPS and its PPS', () => {
    expect(CONFIG_PACKET).toHaveLength(31);
    expect(nalUnits(CONFIG_PACKET)).toEqual([SPS, PPS]);
  });

  /** Both lengths are legal, and encoders mix them within one stream. */
  it('splits on three-byte start codes', () => {
    const stream = bytes(...START_3, ...SPS, ...START_3, ...PPS);

    expect(nalUnits(stream)).toEqual([SPS, PPS]);
  });

  it('splits a stream that mixes the two lengths', () => {
    const stream = bytes(...START_4, ...SPS, ...START_3, ...PPS, ...START_4, ...IDR);

    expect(nalUnits(stream)).toEqual([SPS, PPS, IDR]);
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
  /** The phone this spec was verified against encodes in High profile. */
  it('reads High profile level 3.2 out of the captured SPS', () => {
    expect(codecString(SPS)).toBe('avc1.640020');
  });

  it('reads constrained baseline out of another encoder’s SPS', () => {
    expect(codecString(SPS_BASELINE)).toBe('avc1.42c01e');
  });

  it('is not the same string for two different encoders', () => {
    expect(codecString(SPS)).not.toBe(codecString(SPS_BASELINE));
  });

  /** The bug criterion 34 exists to prevent, stated as a test: the constrained
   * baseline everyone hardcodes is not what the verified device sends. */
  it('is not the baseline profile everybody hardcodes', () => {
    expect(codecString(SPS)).not.toBe('avc1.42e01e');
    expect(codecString(SPS)).not.toBe('avc1.42001e');
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
  it('is read off the config packet alone', () => {
    expect(decoderConfig(CONFIG_PACKET)).toEqual({
      codec: 'avc1.640020',
      optimizeForLatency: true,
    });
  });

  /**
   * The presence of `description` is what tells WebCodecs the bitstream is
   * AVCC. Setting one for an Annex-B stream fails the very first decode, and
   * the capture settled that this stream is Annex-B.
   */
  it('carries no description, because the stream is Annex-B', () => {
    const config = decoderConfig(CONFIG_PACKET);

    expect(config).not.toBeNull();
    expect(config === null ? true : 'description' in config).toBe(false);
  });

  /**
   * A rotation swaps the stream's size mid-session, announced only by the new
   * SPS. A pinned `codedWidth` would contradict that SPS for the rest of the
   * session — the fields are optional, and the bitstream is the authority.
   */
  it('pins no coded size, because the SPS changes on rotation', () => {
    const config = decoderConfig(CONFIG_PACKET);

    expect(config).not.toBeNull();
    expect(config === null ? true : 'codedWidth' in config).toBe(false);
    expect(config === null ? true : 'codedHeight' in config).toBe(false);
  });

  it('asks for the latency the §5.5 loop lives on', () => {
    expect(decoderConfig(CONFIG_PACKET)?.optimizeForLatency).toBe(true);
  });

  it('finds the SPS wherever in the packet it sits', () => {
    const reordered = bytes(...START_4, ...PPS, ...START_4, ...SPS_BASELINE);

    expect(decoderConfig(reordered)?.codec).toBe('avc1.42c01e');
  });

  it('refuses a config packet that carries no SPS', () => {
    expect(decoderConfig(bytes(...START_4, ...PPS))).toBeNull();
  });

  it('refuses an empty config packet', () => {
    expect(decoderConfig(new Uint8Array(0))).toBeNull();
  });
});

/**
 * With no `description`, WebCodecs takes SPS and PPS from the bitstream itself
 * — and scrcpy puts them only in the config packet, never in the key frame. A
 * key frame that opens straight at its IDR therefore decodes to *nothing*, with
 * no error to say why: the decoder just swallows every chunk. Observed on the
 * Galaxy A07 on 2026-08-04, as a mirror that stayed black while streaming.
 */
describe('fronting a key frame with the parameter sets', () => {
  it('puts the config packet first, byte for byte', () => {
    const idr = bytes(...START_4, ...IDR);

    expect(withParameterSets(CONFIG_PACKET, idr)).toEqual(
      bytes(...START_4, ...SPS, ...START_4, ...PPS, ...START_4, ...IDR),
    );
  });

  /** The join must still read as one legal Annex-B stream. */
  it('yields a stream the splitter reads as SPS, PPS, then the frame', () => {
    const joined = withParameterSets(CONFIG_PACKET, bytes(...START_4, ...IDR));

    expect(nalUnits(joined)).toEqual([SPS, PPS, IDR]);
  });

  /** The frame's own bytes cross IPC and feed the decoder; neither input may
   * be aliased by the result. */
  it('copies rather than aliases its inputs', () => {
    const frame = bytes(...START_4, ...IDR);
    const joined = withParameterSets(CONFIG_PACKET, frame);

    joined.fill(0xff);

    expect(CONFIG_PACKET).toEqual(bytes(...START_4, ...SPS, ...START_4, ...PPS));
    expect(frame).toEqual(bytes(...START_4, ...IDR));
  });
});

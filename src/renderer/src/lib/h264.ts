/**
 * Every decode decision the mirror makes, as pure functions. No React, no
 * `window.conductor`, and — deliberately — no WebCodecs: jsdom has none, and a
 * decision that can only be tested by mounting a component is a decision in the
 * wrong layer (AGENTS.md § Testing).
 *
 * The stream is H.264 in **Annex-B**, with SPS and PPS arriving in the packet
 * whose config flag is set. That was confirmed on hardware on 2026-08-04 —
 * `00 00 00 01 67 …` — which is why the decoder is configured without a
 * `description` and the `avcC` path below does not exist.
 *
 * Annex-B cuts both ways: with no `description`, WebCodecs reads the parameter
 * sets from the bitstream itself, and scrcpy sends them only in the config
 * packet. A key frame handed over bare decodes to *nothing* — no error, no
 * output, a mirror that streams and stays black (observed on the same hardware,
 * same day). `withParameterSets` is the other half of the contract.
 */

/** The `nal_unit_type` values this module recognises. */
export const NAL_TYPE = {
  nonIdr: 1,
  idr: 5,
  sps: 7,
  pps: 8,
} as const;

/**
 * The type of one NAL unit: the low five bits of its first byte. The two above
 * them are `nal_ref_idc`, which varies with how the encoder is referencing —
 * reading the whole byte would call an SPS at one reference idc a different
 * thing from an SPS at another.
 */
export function nalType(nal: Uint8Array): number | null {
  const header = nal[0];
  return header === undefined ? null : header & 0x1f;
}

/**
 * Splits an Annex-B payload into its NAL units, start codes removed. Both the
 * three- and four-byte start codes are legal and encoders mix them inside one
 * stream, so both are recognised.
 *
 * Bytes before the first start code are not a NAL — handing the decoder a unit
 * that begins in the middle of one is worse than finding nothing.
 */
export function nalUnits(payload: Uint8Array): Uint8Array[] {
  const units: Uint8Array[] = [];
  let start = -1;

  for (let index = 0; index + 2 < payload.length; index += 1) {
    if (payload[index] !== 0x00 || payload[index + 1] !== 0x00) {
      continue;
    }

    let length: number;
    if (payload[index + 2] === 0x01) {
      length = 3;
    } else if (payload[index + 2] === 0x00 && payload[index + 3] === 0x01) {
      length = 4;
    } else {
      continue;
    }

    if (start !== -1) {
      units.push(payload.subarray(start, index));
    }
    start = index + length;
    // Past the code just consumed, so a four-byte code is never read as a
    // three-byte one starting at its second zero.
    index = start - 1;
  }

  if (start !== -1 && start < payload.length) {
    units.push(payload.subarray(start));
  }
  return units;
}

/**
 * Criterion 34. `avc1.PPCCLL` — profile_idc, the constraint-flags byte and
 * level_idc, each as two hex digits, all read out of the SPS. Hardcoding a
 * profile is the bug this exists to prevent: the decoder would reject, or
 * quietly mis-decode, every stream from an encoder that chose differently.
 *
 * The three fields are the first bytes after the NAL header, and they are safe
 * to read raw: emulation prevention only escapes a `00 00` pair, and profile_idc
 * is never zero.
 */
export function codecString(sps: Uint8Array): string | null {
  if (nalType(sps) !== NAL_TYPE.sps) {
    return null;
  }

  const profile = sps[1];
  const constraints = sps[2];
  const level = sps[3];
  if (profile === undefined || constraints === undefined || level === undefined) {
    return null;
  }
  return `avc1.${hex(profile)}${hex(constraints)}${hex(level)}`;
}

/**
 * Criterion 35. The decoder's configuration, read off the config packet alone.
 *
 * `description` is absent on purpose, and its absence is what tells WebCodecs
 * the bitstream is Annex-B — setting one would fail the very first decode.
 *
 * The coded size is absent just as deliberately. The SPS in the bitstream is
 * the authority on geometry, and it *changes* when the device rotates — the
 * codec header spoke once, at session start, and a pinned `codedWidth` would
 * contradict every SPS after the first rotation. The fields are optional; the
 * frames that come out carry their own size, and the canvas follows them.
 */
export function decoderConfig(configPacket: Uint8Array): VideoDecoderConfig | null {
  const sps = nalUnits(configPacket).find((nal) => nalType(nal) === NAL_TYPE.sps);
  if (sps === undefined) {
    return null;
  }

  const codec = codecString(sps);
  if (codec === null) {
    return null;
  }

  return { codec, optimizeForLatency: true };
}

/**
 * The config packet put back in front of a key frame, so the decoder finds SPS
 * and PPS in the bitstream where Annex-B promises them. Repeating parameter
 * sets before an IDR is legal, and it is exactly what scrcpy's own player does
 * by writing the config packet into the stream it hands its decoder.
 *
 * A copy, not a view: the frame's bytes cross IPC and feed the decoder, and
 * neither input may be aliased by the result.
 */
export function withParameterSets(configPacket: Uint8Array, frame: Uint8Array): Uint8Array {
  const joined = new Uint8Array(configPacket.length + frame.length);
  joined.set(configPacket, 0);
  joined.set(frame, configPacket.length);
  return joined;
}

function hex(value: number): string {
  return value.toString(16).padStart(2, '0');
}

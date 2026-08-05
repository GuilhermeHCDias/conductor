import { ERROR_CODES } from '@shared/ipc';
import { type RefObject, useEffect } from 'react';
import { decoderConfig, withParameterSets } from '../lib/h264';
import { selectSelectedId, useDeviceStore } from '../stores/device.store';

/**
 * The picture: `mirror:event` in, a decoded frame on the canvas out.
 *
 * Mounted by the `DeviceMirror` view rather than by `App.tsx` (criterion 41), so
 * the subscription and the session both end when the panel does. At ~30 frames a
 * second, a listener left behind is a memory leak with a framerate on it.
 *
 * Frames never pass through a store. They go from the subscription straight into
 * the decoder and onto the canvas — putting them through Zustand would re-render
 * the window at the framerate of the phone (criterion 42).
 */
export function useMirrorStream(canvas: RefObject<HTMLCanvasElement | null>): void {
  const selectedId = useDeviceStore(selectSelectedId);
  const startMirror = useDeviceStore((state) => state.startMirror);
  const stopMirror = useDeviceStore((state) => state.stopMirror);
  const mirrorEnded = useDeviceStore((state) => state.mirrorEnded);
  const mirrorResized = useDeviceStore((state) => state.mirrorResized);
  const mirrorUnsupported = useDeviceStore((state) => state.mirrorUnsupported);

  useEffect(() => {
    // Criterion 43. Checked rather than assumed: without WebCodecs there is no
    // picture to be had, and the panel has to say so instead of showing an
    // empty bezel that looks like a phone with the screen off.
    if (window.VideoDecoder === undefined) {
      mirrorUnsupported();
      return;
    }
    if (selectedId === null) {
      return;
    }

    /** The last config packet seen. Held so it can ride in front of every key
     * frame: an Annex-B decoder reads its parameter sets from the bitstream. */
    let pendingConfig: Uint8Array | null = null;
    let configured = false;

    const decoder = new window.VideoDecoder({
      output: (frame) => {
        // Criterion 36. The draw is best effort; the close is not — an
        // unclosed `VideoFrame` holds a GPU buffer and stalls the decoder
        // within seconds, so it happens on every path out of here.
        try {
          const target = canvas.current;
          if (target === null) {
            return;
          }
          // A rotation swaps the stream's size mid-session, and the frames are
          // the only messenger: resize the bitmap before drawing — a landscape
          // frame in a portrait canvas is a cropped corner — and tell the
          // store, so the fit and the footprint follow. Only on change: a
          // store write per frame would re-render the window at the phone's
          // framerate (criterion 42).
          if (target.width !== frame.displayWidth || target.height !== frame.displayHeight) {
            target.width = frame.displayWidth;
            target.height = frame.displayHeight;
            const { mirrorSessionId } = useDeviceStore.getState();
            if (mirrorSessionId !== null) {
              mirrorResized(mirrorSessionId, frame.displayWidth, frame.displayHeight);
            }
          }
          target.getContext('2d')?.drawImage(frame, 0, 0);
        } finally {
          frame.close();
        }
      },
      error: (error) => {
        const { mirrorSessionId } = useDeviceStore.getState();
        if (mirrorSessionId !== null) {
          mirrorEnded(mirrorSessionId, {
            code: ERROR_CODES.mirrorDecodeFailed,
            message: `This renderer could not decode the mirror stream. ${error.message}`,
          });
        }
      },
    });

    /** Configures from the held config packet — which is all a configuration
     * needs: the geometry belongs to the SPS, not to the config. */
    const configure = (): void => {
      if (pendingConfig === null) {
        return;
      }
      const config = decoderConfig(pendingConfig);
      if (config === null) {
        return;
      }
      decoder.configure(config);
      configured = true;
    };

    const unsubscribe = window.conductor.onMirrorEvent((payload) => {
      if (!payload.ok) {
        return;
      }
      const event = payload.data;

      if (event.type === 'ended') {
        // The store decides whether this names the session it is showing: a
        // late report must not put away the one that replaced it.
        mirrorEnded(event.sessionId, { code: event.code, message: event.message });
        return;
      }

      if (event.config) {
        // SPS and PPS, never a picture. It configures the decoder here, and it
        // is held to ride in front of every key frame: Annex-B decoders read
        // their parameter sets from the bitstream, not from the configuration.
        pendingConfig = event.data;
        configured = false;
        configure();
        return;
      }

      // A decoder that was never configured throws on `decode`, and a frame
      // before the first config packet has nothing to be decoded against.
      if (!configured) {
        return;
      }

      decoder.decode(
        new EncodedVideoChunk({
          type: event.keyFrame ? 'key' : 'delta',
          timestamp: event.pts,
          // A key frame travels with the parameter sets in front: without
          // them in-band, an Annex-B decoder emits nothing and says nothing.
          data:
            event.keyFrame && pendingConfig !== null
              ? withParameterSets(pendingConfig, event.data)
              : event.data,
        }),
      );
    });

    void startMirror(selectedId);

    return () => {
      unsubscribe();
      if (decoder.state !== 'closed') {
        decoder.close();
      }
      void stopMirror();
    };
  }, [canvas, selectedId, startMirror, stopMirror, mirrorEnded, mirrorResized, mirrorUnsupported]);
}

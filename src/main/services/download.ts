import { createWriteStream } from 'node:fs';
import { rm } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { net } from 'electron';

/**
 * The install pipeline's one network door (doctor criterion 12): Electron's
 * `net` — proxy-aware, the app's own session — streamed straight to disk. The
 * archive is ~315 MB, so nothing here ever holds the body; bytes go from the
 * response to the file as they arrive, and progress is counted on the way.
 *
 * A failure is a `DownloadError` carrying the raw cause as `detail` — the
 * HTTP status, the network error, the stall — which the service wraps in its
 * product-language sentence (criterion 17). An abort is an `AbortError`, the
 * way `run.ts` reports one: dispose is not a failure.
 */

export type DownloadProgress = {
  readonly received: number;
  /** `Content-Length`, or `null` when the server sent none. */
  readonly total: number | null;
};

export type DownloadOptions = {
  readonly signal: AbortSignal;
  readonly onProgress?: (progress: DownloadProgress) => void;
  /** No bytes for this long fails the transfer. Criterion 17 says 60 s. */
  readonly stallMs?: number;
};

export type DownloadFn = (url: string, dest: string, options: DownloadOptions) => Promise<void>;

export class DownloadError extends Error {
  readonly detail: string;

  constructor(detail: string) {
    super(`The download failed: ${detail}`);
    this.name = 'DownloadError';
    this.detail = detail;
  }
}

/** The stall clock, in seconds, as the detail names it. */
const DEFAULT_STALL_MS = 60_000;

export function downloadToFile(url: string, dest: string, options: DownloadOptions): Promise<void> {
  const stallMs = options.stallMs ?? DEFAULT_STALL_MS;
  return new Promise<void>((resolve, reject) => {
    const request = net.request({ url, redirect: 'follow' });
    let settled = false;
    let stall: ReturnType<typeof setTimeout> | null = null;
    let file: ReturnType<typeof createWriteStream> | null = null;

    const clearStall = (): void => {
      if (stall !== null) {
        clearTimeout(stall);
        stall = null;
      }
    };

    /** One outcome, whichever arrives first; a failure leaves no file. */
    const settle = (error: Error | null): void => {
      if (settled) {
        return;
      }
      settled = true;
      clearStall();
      options.signal.removeEventListener('abort', onAbort);
      if (error === null) {
        resolve();
        return;
      }
      file?.destroy();
      void rm(dest, { force: true }).finally(() => {
        reject(error);
      });
    };

    const fail = (detail: string): void => {
      request.abort();
      settle(new DownloadError(detail));
    };

    const onAbort = (): void => {
      request.abort();
      const error = new Error('The download was aborted.');
      error.name = 'AbortError';
      settle(error);
    };

    const armStall = (): void => {
      clearStall();
      stall = setTimeout(() => {
        fail(`no bytes for ${Math.round(stallMs / 1000)} s`);
      }, stallMs);
    };

    if (options.signal.aborted) {
      onAbort();
      return;
    }
    options.signal.addEventListener('abort', onAbort, { once: true });

    request.on('error', (error: Error) => {
      settle(new DownloadError(error.message));
    });
    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        fail(`HTTP ${response.statusCode}`);
        return;
      }
      const lengthHeader = response.headers['content-length'];
      const raw = Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader;
      const total = raw === undefined ? null : Number.parseInt(raw, 10);
      let received = 0;
      const out = createWriteStream(dest);
      file = out;
      out.on('error', (error) => {
        fail(error.message);
      });
      out.on('finish', () => {
        settle(null);
      });
      response.on('data', (chunk: Buffer) => {
        received += chunk.length;
        armStall();
        options.onProgress?.({
          received,
          total: total === null || Number.isNaN(total) ? null : total,
        });
      });
      response.on('error', (error: Error) => {
        fail(error.message);
      });
      response.on('aborted', () => {
        fail('the connection was closed');
      });
      // Electron documents `IncomingMessage` as implementing Node's Readable
      // interface; its typings stop at the events. Piping — rather than
      // writing each chunk by hand — is what gives the file stream's
      // backpressure a say, so a slow disk never lets 315 MB pile up in main.
      (response as unknown as Readable).pipe(out);
      armStall();
    });
    request.end();
  });
}

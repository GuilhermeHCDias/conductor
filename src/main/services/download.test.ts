import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The one network door of the install pipeline (doctor criteria 12, 17):
 * Electron's proxy-aware `net`, streamed to disk chunk by chunk, never
 * buffered whole. `electron` is mocked because `net` does not exist under
 * node — the fake request is what the tests drive.
 */

type FakeResponse = PassThrough & { statusCode: number; headers: Record<string, string> };

class FakeRequest extends EventEmitter {
  aborted = false;

  end(): void {}

  abort(): void {
    this.aborted = true;
    this.emit('abort');
  }
}

const requests: Array<{
  options: { url: string; redirect?: string };
  request: FakeRequest;
  respond: (status: number, headers?: Record<string, string>) => FakeResponse;
}> = [];

vi.mock('electron', () => ({
  net: {
    request: (options: { url: string; redirect?: string }) => {
      const request = new FakeRequest();
      const entry = {
        options,
        request,
        respond: (status: number, headers: Record<string, string> = {}) => {
          const response = Object.assign(new PassThrough(), { statusCode: status, headers });
          request.emit('response', response);
          return response;
        },
      };
      requests.push(entry);
      return request;
    },
  },
}));

const { DownloadError, downloadToFile } = await import('./download');

let dir: string;

beforeEach(() => {
  requests.length = 0;
  dir = mkdtempSync(join(tmpdir(), 'conductor-download-'));
});

afterEach(() => {
  vi.useRealTimers();
  rmSync(dir, { recursive: true, force: true });
});

/** The request is issued synchronously; the response is the test's to send. */
function lastRequest(): (typeof requests)[number] {
  const entry = requests.at(-1);
  if (entry === undefined) {
    throw new Error('No request was issued.');
  }
  return entry;
}

const URL = 'https://github.com/mobile-dev-inc/maestro/releases/download/cli-2.10.0/maestro.zip';

describe('downloadToFile', () => {
  it('streams the body to the file and reports bytes against Content-Length', async () => {
    const dest = join(dir, 'maestro.zip');
    const progress: Array<{ received: number; total: number | null }> = [];
    const done = downloadToFile(URL, dest, {
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p),
    });
    const entry = lastRequest();
    expect(entry.options).toMatchObject({ url: URL, redirect: 'follow' });

    const response = entry.respond(200, { 'content-length': '10' });
    response.write(Buffer.from('hello '));
    response.write(Buffer.from('wor'));
    response.end(Buffer.from('l'));
    await done;

    expect(readFileSync(dest, 'utf8')).toBe('hello worl');
    expect(progress).toEqual([
      { received: 6, total: 10 },
      { received: 9, total: 10 },
      { received: 10, total: 10 },
    ]);
  });

  it('reports an unknown total when the server sends no length', async () => {
    const dest = join(dir, 'file');
    const progress: Array<{ received: number; total: number | null }> = [];
    const done = downloadToFile(URL, dest, {
      signal: new AbortController().signal,
      onProgress: (p) => progress.push(p),
    });
    const response = lastRequest().respond(200);
    response.end(Buffer.from('abc'));
    await done;

    expect(progress).toEqual([{ received: 3, total: null }]);
  });

  /** Criterion 17 — the HTTP status is the raw cause; the sentence is the
   * service's. Nothing half-written survives. */
  it('fails with the HTTP status on anything but 200 and leaves no file', async () => {
    const dest = join(dir, 'file');
    const done = downloadToFile(URL, dest, { signal: new AbortController().signal });
    lastRequest().respond(503).end();

    await expect(done).rejects.toMatchObject({ name: 'DownloadError', detail: 'HTTP 503' });
    expect(existsSync(dest)).toBe(false);
  });

  it('fails with the network error when the request never gets a response', async () => {
    const dest = join(dir, 'file');
    const done = downloadToFile(URL, dest, { signal: new AbortController().signal });
    lastRequest().request.emit('error', new Error('net::ERR_NAME_NOT_RESOLVED'));

    await expect(done).rejects.toMatchObject({
      name: 'DownloadError',
      detail: 'net::ERR_NAME_NOT_RESOLVED',
    });
    expect(existsSync(dest)).toBe(false);
  });

  /** Criterion 20 — dispose aborts the transfer, and the request goes down
   * with it rather than draining 315 MB into a job dir being deleted. */
  it('aborts the request on the signal and rejects', async () => {
    const dest = join(dir, 'file');
    const controller = new AbortController();
    const done = downloadToFile(URL, dest, { signal: controller.signal });
    const response = lastRequest().respond(200, { 'content-length': '100' });
    response.write(Buffer.from('partial'));

    controller.abort();

    await expect(done).rejects.toMatchObject({ name: 'AbortError' });
    expect(lastRequest().request.aborted).toBe(true);
    expect(existsSync(dest)).toBe(false);
  });

  /** Criterion 17 — a transfer that moves no bytes for 60 s fails the same
   * way a connection failure does. */
  it('fails the transfer after the stall window with no bytes', async () => {
    vi.useFakeTimers();
    const dest = join(dir, 'file');
    const done = downloadToFile(URL, dest, {
      signal: new AbortController().signal,
      stallMs: 60_000,
    });
    const response = lastRequest().respond(200, { 'content-length': '100' });
    response.write(Buffer.from('some'));
    await vi.advanceTimersByTimeAsync(59_000);
    response.write(Buffer.from('more'));
    await vi.advanceTimersByTimeAsync(59_000);
    // Still alive: every chunk resets the clock.
    expect(lastRequest().request.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1_000);

    await expect(done).rejects.toMatchObject({
      name: 'DownloadError',
      detail: 'no bytes for 60 s',
    });
    expect(lastRequest().request.aborted).toBe(true);
    expect(existsSync(dest)).toBe(false);
  });

  it('is a DownloadError instance the service can tell from a bug', () => {
    const error = new DownloadError('HTTP 404');

    expect(error).toBeInstanceOf(Error);
    expect(error.detail).toBe('HTTP 404');
    expect(error.message).toContain('HTTP 404');
  });
});

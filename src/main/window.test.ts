import { describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
}));

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
  optimizer: { watchWindowShortcuts: () => {} },
}));

process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';

const { isRendererUrl, RENDERER_URL } = await import('./window');

/**
 * `isRendererUrl` is the allowlist the IPC sender guard checks against, so a
 * URL that slips through here is a URL that can invoke privileged handlers.
 */
describe('isRendererUrl', () => {
  it('accepts the renderer URL itself', () => {
    expect(isRendererUrl(RENDERER_URL)).toBe(true);
  });

  it.each(['/', '/index.html', '/assets/index.js'])('accepts the path %s under it', (path) => {
    expect(isRendererUrl(`${RENDERER_URL}${path}`)).toBe(true);
  });

  it('accepts a query string and a hash', () => {
    expect(isRendererUrl(`${RENDERER_URL}?a=1`)).toBe(true);
    expect(isRendererUrl(`${RENDERER_URL}#/route`)).toBe(true);
  });

  // The reason the guard tests for a separator rather than a bare prefix.
  it.each([
    'http://localhost:5173.evil.example',
    'http://localhost:51730',
    'http://localhost:5173evil',
    'http://localhost:5173@evil.example',
  ])('rejects %s, which merely starts with the renderer URL', (url) => {
    expect(isRendererUrl(url)).toBe(false);
  });

  it.each(['https://evil.example', 'file:///etc/passwd', 'about:blank', 'javascript:alert(1)', ''])(
    'rejects the unrelated URL %s',
    (url) => {
      expect(isRendererUrl(url)).toBe(false);
    },
  );
});

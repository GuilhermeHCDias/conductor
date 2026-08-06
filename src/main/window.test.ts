import type { BrowserWindowConstructorOptions } from 'electron';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  constructed: [] as BrowserWindowConstructorOptions[],
  windowOpenHandlers: [] as unknown[],
  permissionHandlers: [] as unknown[],
  listeners: [] as string[],
}));

vi.mock('electron', () => ({
  BrowserWindow: class {
    readonly webContents = {
      setWindowOpenHandler: (handler: unknown) => mock.windowOpenHandlers.push(handler),
      session: {
        setPermissionRequestHandler: (handler: unknown) => mock.permissionHandlers.push(handler),
      },
      on: (event: string) => mock.listeners.push(event),
    };

    constructor(options: BrowserWindowConstructorOptions) {
      mock.constructed.push(options);
    }

    once(): void {}
    show(): void {}
    loadURL(): Promise<void> {
      return Promise.resolve();
    }
  },
}));

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: true },
  optimizer: { watchWindowShortcuts: () => {} },
}));

process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173';

const { createWindow, isRendererUrl, RENDERER_URL } = await import('./window');

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

/**
 * Criterion 7 — the Aurora layout wants the OS's own traffic lights, not the
 * design system's drawn ones: in a real window those would be a frame inside a
 * frame. The §9.3 flags around them are the point of this second describe —
 * a chrome change must not quietly relax the sandbox.
 */
describe('createWindow', () => {
  beforeEach(() => {
    mock.constructed.length = 0;
    mock.windowOpenHandlers.length = 0;
    mock.permissionHandlers.length = 0;
    mock.listeners.length = 0;
  });

  const optionsOf = (): BrowserWindowConstructorOptions => {
    createWindow();
    const options = mock.constructed[0];
    if (options === undefined) {
      throw new Error('createWindow constructed no BrowserWindow.');
    }
    return options;
  };

  it('hides the title bar so the OS draws the lights over the toolbar', () => {
    expect(optionsOf().titleBarStyle).toBe('hiddenInset');
  });

  // 18px in, and centred in the 52px toolbar — (52 - 12) / 2 for 12px lights.
  // The renderer paints that toolbar edge to edge at the top of the window and
  // reserves the 70px these span; see `.trafficLightInset` in
  // Toolbar.module.css and `.desktop` in App.module.css, which is why neither
  // number may drift without the other.
  it('places the lights inside the toolbar, where it reserves space for them', () => {
    expect(optionsOf().trafficLightPosition).toEqual({ x: 18, y: 20 });
  });

  it('gives the window a vibrant material', () => {
    expect(optionsOf().vibrancy).toBe('under-window');
  });

  // Vibrancy only renders through a transparent window background; the renderer
  // paints --bg-window and the wash over it.
  it('leaves the window background transparent', () => {
    expect(optionsOf().backgroundColor).toBe('#00000000');
  });

  it('keeps the §9.3 flags exactly as they were', () => {
    expect(optionsOf().webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: false,
    });
  });

  it('keeps the window small enough to reach the narrowest breakpoint', () => {
    expect(optionsOf().minWidth).toBe(960);
  });

  it('still denies every window-open request and guards navigation', () => {
    createWindow();

    expect(mock.windowOpenHandlers).toHaveLength(1);
    expect(mock.permissionHandlers).toHaveLength(1);
    expect(mock.listeners).toContain('will-navigate');
  });
});

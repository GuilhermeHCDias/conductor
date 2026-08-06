import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import type { Plugin } from 'vite';

const alias = {
  '@renderer': resolve('src/renderer/src'),
  '@shared': resolve('src/shared'),
};

/** The posture of .context.md §9.3, spelled out as directives. */
const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // §10.1 rule 2 sends device frames across IPC as bytes; the renderer turns
  // them into object URLs, so blob: and data: have to be allowed.
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Same policy, widened by exactly what Vite's dev server needs: its inline
 * HMR preamble, its injected styles and its websocket. Never shipped. */
const DEVELOPMENT_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws://localhost:* http://localhost:*",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * `onHeadersReceived` never fires for `file://`, which is how the packaged
 * renderer loads — so the policy has to travel inside the HTML itself.
 */
function contentSecurityPolicy(): Plugin {
  return {
    name: 'conductor:csp',
    transformIndexHtml: {
      order: 'post',
      // Injected as text rather than as a tag descriptor: Vite escapes attribute
      // values, and a policy whose `'self'` arrives as `&#39;self&#39;` is far
      // harder to audit in the shipped file.
      handler(html, context) {
        const policy = context.server === undefined ? PRODUCTION_CSP : DEVELOPMENT_CSP;
        return html.replace(
          '<head>',
          `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
        );
      },
    },
  };
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
  },
  // A sandboxed preload cannot `require` anything but `electron`, so its
  // dependencies have to be bundled in. electron-vite externalizes them by
  // default; left on, the preload ships a bare `require('zod')` that throws on
  // load and the bridge is never exposed.
  preload: {
    resolve: { alias },
    // Bundling the dependencies in (above) is what makes minifying worthwhile
    // here: without it the preload ships its bundled deps unminified.
    build: { externalizeDeps: false, minify: true },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    plugins: [react(), contentSecurityPolicy()],
    // electron-vite leaves every target unminified by default, so a release
    // build would otherwise ship development-shaped code. Main is left readable
    // on purpose: it is a few kB, and its stack traces are the ones that surface
    // in logs when the app misbehaves.
    build: {
      minify: true,
      rollupOptions: { input: resolve('src/renderer/index.html') },
    },
  },
});

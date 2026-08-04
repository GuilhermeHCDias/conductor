import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Criterion 55 — the layout shell performs no integration. The renderer is
 * sandboxed (`nodeIntegration: false`, `contextIsolation: true`), so a `node:`
 * import here would not merely be out of scope, it would throw at load; and a
 * `window.conductor` call would mean the shell had grown a dependency on IPC
 * that no later spec asked it for.
 *
 * The tests themselves are exempt: they run in Node, never ship, and this file
 * has to read the tree to check it.
 */

const RENDERER = resolve('src/renderer/src');

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sources(path);
    }
    if (!/\.tsx?$/.test(entry.name) || entry.name.includes('.test.')) {
      return [];
    }
    // The jsdom setup is test infrastructure, not renderer code.
    return entry.name === 'test-setup.ts' ? [] : [path];
  });
}

/** Prose is not code: several modules explain in a comment what they do not do. */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const FILES = sources(RENDERER).map((path) => {
  const raw = readFileSync(path, 'utf8');
  // `code` is what the module does; `raw` is what it says. A rule about calls
  // reads `code`; a rule about suppressions has to read `raw`, or a comment
  // could never trip it.
  return { name: relative(RENDERER, path), code: stripComments(raw), raw };
});

describe('the renderer tree', () => {
  it('is not empty', () => {
    expect(FILES.length).toBeGreaterThan(15);
  });

  it.each(FILES)('$name imports nothing from node:', ({ code }) => {
    expect(code).not.toMatch(/from\s+['"]node:/);
    expect(code).not.toMatch(/require\(\s*['"]node:/);
  });

  it.each(FILES)('$name never reaches for window.conductor', ({ code }) => {
    expect(code).not.toContain('window.conductor');
  });

  // AGENTS.md § Naming: import by full path, and there is no barrel anywhere.
  it('has no barrel file', () => {
    const barrels = FILES.filter(
      (file) => file.name === 'index.ts' || file.name.endsWith('/index.ts'),
    );

    expect(barrels.map((file) => file.name)).toEqual([]);
  });

  // Criterion 57. A `noRestrictedImports` failure means process creation ended
  // up in the wrong file; an exception is almost always the wrong answer.
  it.each(FILES)('$name needs no biome exception', ({ raw }) => {
    expect(raw).not.toContain('biome-ignore');
  });

  it.each(FILES)('$name types itself without any', ({ code }) => {
    expect(code).not.toMatch(/\bas\s+any\b/);
    expect(code).not.toMatch(/:\s*any\b/);
    expect(code).not.toMatch(/<any[,>]/);
  });
});

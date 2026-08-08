import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { conductorPluginDir } from './services/publish.service';

/**
 * The guard over `resources/conductor-plugin` — the skills the app hands to
 * every headless `claude` it starts (§6.0, §8.4). They are prose, so nothing
 * here proves they teach well; that is what the manual evaluations are for.
 * What it proves is that they still *load*, and that the failures a skill file
 * carries silently are not in them: a name the loader will not take, a link
 * into nowhere, an MCP tool outside §4.3.4's allowlist, a script the session
 * has no `Bash` to run, a date that quietly expires.
 *
 * It reads the real tree, `describe-changes` included — a rule only the newest
 * skill obeys is a rule that lasts one spec. In the spirit of `window.test.ts`
 * and `styles.test.ts`: what is guarded here is a convention, not a module.
 */

/** The repo root, from this file rather than from the runner's cwd: the app is
 * developed in worktrees, and `resources/` is present in every one. */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Resolved through the app's own function, so this reads the directory
 * `--plugin-dir` will point at rather than a second copy of the path. */
const PLUGIN_DIR = conductorPluginDir({
  packaged: false,
  resourcesPath: '',
  appPath: REPO_ROOT,
});

const SKILLS_DIR = join(PLUGIN_DIR, 'skills');

/** §4.3.4's allowlist, and nothing else. The client blocks everything outside
 * it before the model learns the tool exists, so a skill naming one of the
 * Cloud tools is teaching a step that cannot run. */
const MCP_ALLOWLIST = ['cheat_sheet', 'inspect_screen', 'list_devices', 'take_screenshot'];

/** Registered unconditionally by the MCP server (§4.3.4) and deliberately left
 * out of the allowlist — `run` included, which is the one that would let the
 * assistant drive the device (this spec's Out of scope). */
const MCP_WITHHELD = [
  'describe_cloud_run',
  'get_cloud_run_status',
  'list_cloud_devices',
  'open_maestro_viewer',
  'run_on_cloud',
];

/** The two this spec ships. `describe-changes` predates them and is held to
 * every mechanical rule below, but not to criterion 3's ordering clause: it
 * names no rules section, and the spec forbids modifying it. */
const AUTHORED_HERE = ['work-in-conductor', 'write-flow'];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;

/**
 * The front matter as a map, plus the body exactly as `publish.service.ts`
 * hands it to `--system-prompt` — same regex, same trim (its own
 * `stripFrontMatter` is private). Criterion 26 rides on the two agreeing.
 */
function parse(source: string): { front: Record<string, string>; body: string } {
  const match = source.match(FRONT_MATTER);
  if (match === null) {
    return { front: {}, body: source };
  }
  const front: Record<string, string> = {};
  let key = '';
  for (const line of (match[1] ?? '').split(/\r?\n/)) {
    const declaration = line.match(/^([a-z][\w-]*):\s*(.*)$/i);
    if (declaration !== null) {
      key = declaration[1] ?? '';
      // A folded scalar (`description: >`) declares no value on its own line.
      front[key] = /^[>|]-?$/.test(declaration[2] ?? '') ? '' : (declaration[2] ?? '');
      continue;
    }
    if (key !== '' && line.trim() !== '') {
      front[key] = `${front[key] ?? ''} ${line.trim()}`.trim();
    }
  }
  return { front, body: source.slice(match[0].length).replace(/^\s*\n/, '') };
}

type Skill = {
  readonly name: string;
  readonly dir: string;
  readonly front: Record<string, string>;
  readonly body: string;
  /** Every file the skill directory holds — SKILL.md and its references. */
  readonly files: readonly { readonly path: string; readonly text: string }[];
};

const SKILLS: Skill[] = readdirSync(SKILLS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const dir = join(SKILLS_DIR, entry.name);
    const files = walk(dir).map((path) => ({
      path: path
        .slice(dir.length + 1)
        .split(sep)
        .join('/'),
      text: readFileSync(path, 'utf8'),
    }));
    const skill = files.find((file) => file.path === 'SKILL.md');
    const { front, body } = parse(skill?.text ?? '');
    return { name: entry.name, dir, front, body, files };
  })
  .sort((left, right) => left.name.localeCompare(right.name));

/** Every relative link in `text` — external URLs and bare anchors excluded. */
function relativeLinks(text: string): string[] {
  return [...text.matchAll(/\[[^\]]*\]\(([^)\s]+)[^)]*\)/g)]
    .map((match) => match[1] ?? '')
    .filter((href) => !/^(https?:|mailto:|#)/.test(href));
}

const exists = (path: string): boolean => {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
};

it('finds the shipped plugin', () => {
  expect(SKILLS.map((skill) => skill.name)).toEqual([
    'describe-changes',
    'work-in-conductor',
    'write-flow',
  ]);
});

/** Criterion 1 — the loader keys a skill by its directory; a `name` that
 * disagrees is a skill that answers to a trigger nobody types. */
describe('criterion 1 — the front matter the loader reads', () => {
  it.each(SKILLS)('$name declares a SKILL.md', ({ files }) => {
    expect(files.map((file) => file.path)).toContain('SKILL.md');
  });

  it.each(SKILLS)('$name names itself in its front matter', ({ name, front }) => {
    expect(front.name).toBe(name);
  });

  it.each(SKILLS)('$name carries a description', ({ front }) => {
    expect(front.description ?? '').not.toBe('');
  });
});

/** Criterion 2 — the loader's limits on both fields, and the one thing the
 * description is for: the model reads it, and nothing else, when deciding
 * whether this skill is the one the request calls for. */
describe('criterion 2 — name and description', () => {
  it.each(SKILLS)('$name is a short kebab-case name', ({ front }) => {
    expect((front.name ?? '').length).toBeLessThanOrEqual(64);
    expect(front.name ?? '').toMatch(/^[a-z0-9-]+$/);
  });

  // The skill is the app's, not the vendor's: the assistant is "the
  // assistant" everywhere the person can see it (§8.0's vocabulary rule).
  it.each(SKILLS)('$name names neither anthropic nor claude', ({ front }) => {
    expect(front.name ?? '').not.toMatch(/anthropic|claude/i);
  });

  it.each(SKILLS)('$name describes itself inside the limit', ({ front }) => {
    expect((front.description ?? '').length).toBeLessThanOrEqual(1024);
  });

  it.each(SKILLS)('$name keeps XML out of its description', ({ front }) => {
    expect(front.description ?? '').not.toMatch(/<[^>]+>/);
  });

  it.each(SKILLS)('$name describes itself in the third person', ({ front }) => {
    expect(front.description ?? '').not.toMatch(/\b(I|me|my|you|your|yours)\b/i);
  });

  it.each(SKILLS)('$name says when to use it, not only what it does', ({ front }) => {
    expect(front.description ?? '').toMatch(/\buse when\b/i);
  });

  /** The triggers the AI window will actually see typed at it. */
  it.each(['write', 'generate', 'add', 'extend', 'fix', 'test', 'flow'])(
    'write-flow fires on “%s”',
    (trigger) => {
      const description = SKILLS.find((skill) => skill.name === 'write-flow')?.front.description;

      expect(description ?? '').toMatch(new RegExp(`\\b${trigger}`, 'i'));
    },
  );
});

/** Criterion 3 — a skill is read top-down, so what must never be broken comes
 * before what is merely useful. */
describe('criterion 3 — the body', () => {
  it.each(SKILLS)('$name stays under 500 lines', ({ body }) => {
    expect(body.split('\n').length).toBeLessThanOrEqual(500);
  });

  // `.context.md` is Portuguese and these files are not: an accented vowel is
  // the first sign a rule was copied across rather than written here.
  it.each(SKILLS)('$name is written in English', ({ body, front }) => {
    expect(`${front.description ?? ''}\n${body}`).not.toMatch(/[àáâãäçèéêëìíîïñòóôõöùúûü]/i);
  });

  it.each(SKILLS)('$name opens with prose, not with an example', ({ body }) => {
    const opening = body.split(/^## /m)[0] ?? '';

    expect(opening).not.toMatch(/^```/m);
    expect(opening).not.toMatch(/^\|/m);
  });

  it.each(SKILLS)('$name opens on something other than the fun part', ({ body }) => {
    const first = body.match(/^## (.+)$/m)?.[1] ?? '';

    expect(first).not.toMatch(/workflow|example|anti-pattern|checklist/i);
  });

  it.each(AUTHORED_HERE)('%s leads with its non-negotiables', (name) => {
    const body = SKILLS.find((skill) => skill.name === name)?.body ?? '';

    expect(body.match(/^## (.+)$/m)?.[1] ?? '').toMatch(/non-negotiable|rules/i);
  });
});

/**
 * Criterion 4 — a skill is loaded from wherever `--plugin-dir` points, so a
 * link that leaves the skill directory or names a file that is not there is a
 * dead end at the one moment the model went looking for more.
 */
describe('criterion 4 — references, one level deep', () => {
  it.each(SKILLS)('$name links only with forward slashes', ({ body }) => {
    for (const href of relativeLinks(body)) {
      expect(href).not.toContain('\\');
    }
  });

  it.each(SKILLS)('$name links inside its own directory', ({ body }) => {
    for (const href of relativeLinks(body)) {
      expect(href).not.toMatch(/^(\/|\.\.\/)/);
    }
  });

  it.each(SKILLS)('$name links to files that exist', ({ dir, body }) => {
    for (const href of relativeLinks(body)) {
      expect(exists(join(dir, href.split('#')[0] ?? ''))).toBe(true);
    }
  });

  it.each(SKILLS)('$name lets no reference link on to a third file', ({ files }) => {
    for (const file of files.filter((each) => each.path !== 'SKILL.md')) {
      expect({ file: file.path, links: relativeLinks(file.text) }).toEqual({
        file: file.path,
        links: [],
      });
    }
  });
});

/**
 * Criterion 5 — the allowlist is enforced in the client, before the model is
 * told the tool exists (§4.3.4). A skill naming anything outside it teaches a
 * step that fails, and a bare tool name is a name the model cannot call.
 */
describe('criterion 5 — MCP tools', () => {
  it.each(SKILLS)('$name names only allowlisted tools', ({ files }) => {
    for (const file of files) {
      for (const [, server, tool] of file.text.matchAll(/mcp__([a-z0-9_]+)__([a-z0-9_]+)/g)) {
        expect({ file: file.path, server, tool }).toEqual({
          file: file.path,
          server: 'maestro',
          tool: expect.stringMatching(new RegExp(`^(${MCP_ALLOWLIST.join('|')})$`)),
        });
      }
    }
  });

  it.each(SKILLS)('$name qualifies every tool it names', ({ files }) => {
    for (const file of files) {
      for (const tool of MCP_ALLOWLIST) {
        const bare = file.text.match(`(?<!mcp__maestro__)\\b${tool}\\b`);

        expect({ file: file.path, tool, bare }).toEqual({ file: file.path, tool, bare: null });
      }
    }
  });

  it.each(SKILLS)('$name names none of the tools we withhold', ({ files }) => {
    for (const file of files) {
      for (const tool of [...MCP_WITHHELD, 'mcp__maestro__run\\b']) {
        expect({ file: file.path, found: file.text.match(tool) }).toEqual({
          file: file.path,
          found: null,
        });
      }
    }
  });
});

/** Criterion 6 — the session runs without `Bash` (§12.18), so a script is
 * something the assistant can read and never run. */
describe('criterion 6 — nothing executable', () => {
  it.each(SKILLS)('$name ships markdown and nothing else', ({ files }) => {
    expect(files.map((file) => file.path).filter((path) => !path.endsWith('.md'))).toEqual([]);
  });

  it('the plugin carries no scripts directory', () => {
    const paths = walk(PLUGIN_DIR).map((path) => path.slice(PLUGIN_DIR.length));

    expect(paths.filter((path) => path.split(sep).includes('scripts'))).toEqual([]);
  });
});

/**
 * Criterion 7 — these files ship inside a binary and are read months after
 * they are written. Anything that dates them is a claim that goes stale with
 * nobody watching; the same reasoning §4.3.3 used to refuse a vendored
 * cheatsheet.
 */
describe('criterion 7 — nothing that expires', () => {
  // "may" is left out on purpose — as a month it never travels without a year,
  // which the pattern above already catches, and as a modal verb it is exactly
  // how a rule states what is allowed.
  const MONTHS =
    'january|february|march|april|june|july|august|september|october|november|december';

  it.each(SKILLS)('$name states no date, version or vintage', ({ files, front }) => {
    for (const file of [...files, { path: 'front matter', text: front.description ?? '' }]) {
      for (const expiring of [
        /\b(19|20)\d{2}\b/,
        /\b\d{4}-\d{2}-\d{2}\b/,
        /\bv?\d+\.\d+(\.\d+)?\b/,
        /\bas of\b/i,
        new RegExp(`\\b(${MONTHS})\\b`, 'i'),
      ]) {
        expect({ file: file.path, dated: file.text.match(expiring) }).toEqual({
          file: file.path,
          dated: null,
        });
      }
    }
  });
});

/** Criterion 26 — §8.4 reads a skill body and hands it straight to
 * `--system-prompt`. A file that is front matter and nothing else passes every
 * rule above and sends the model an empty instruction. */
describe('criterion 26 — the body survives the strip', () => {
  it.each(SKILLS)('$name leaves a body once its front matter is stripped', ({ body }) => {
    expect(body.trim()).not.toBe('');
    expect(body).not.toMatch(FRONT_MATTER);
  });
});

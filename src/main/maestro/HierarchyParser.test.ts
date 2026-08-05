import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { TreeNode } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { HierarchyParseError, parseHierarchy } from './HierarchyParser';

/**
 * With `SelectorSynth`, the highest-trap-density module in the project — and
 * like `scrcpy-protocol`, it earns strong tests by being pure: everything below
 * runs with no `maestro`, no `adb` and no phone.
 *
 * `inspect-screen.capture.json` is not a hand-written sample. It is the real
 * answer `maestro mcp --no-viewer`'s `inspect_screen` gave for
 * `{"device_id":"R9QYC01EMXL"}` on 2026-08-04 — a Galaxy A07 (SM-A075M)
 * showing the Samsung launcher, 11,674 bytes, 110 elements, 21 levels deep.
 * Everything the capture reaches is asserted against it; everything it does not
 * reach (`hint`, `scroll`, `focused`, `checked` are default on every one of
 * those 110 elements) is a hand-built case below, derived from that shape
 * rather than invented beside it.
 */

const CAPTURE = readFileSync(resolve('src/main/maestro/inspect-screen.capture.json'), 'utf8');

/** The abbreviation table and defaults exactly as the server declares them —
 * the base every hand-built response below varies one thing against. */
const SCHEMA = {
  platform: 'android',
  abbreviations: {
    b: 'bounds',
    txt: 'text',
    rid: 'resource-id',
    a11y: 'content-desc',
    hint: 'hintText',
    cls: 'class',
    scroll: 'scrollable',
    c: 'children',
  },
  defaults: {
    enabled: true,
    clickable: false,
    focused: false,
    selected: false,
    checked: false,
    scrollable: false,
    txt: '',
    hint: '',
    rid: '',
    a11y: '',
    cls: '',
  },
} as const;

/** A response carrying one root element, with the real schema unless overridden. */
function response(element: unknown, schema: unknown = SCHEMA): string {
  return JSON.stringify({ ui_schema: schema, elements: [element] });
}

/** Every node of a tree, root first. */
function flatten(node: TreeNode): TreeNode[] {
  return [node, ...node.children.flatMap(flatten)];
}

function depth(node: TreeNode): number {
  return 1 + Math.max(0, ...node.children.map(depth));
}

/* ── the real capture ─────────────────────────────────────────────────────── */

describe('the captured payload', () => {
  const root = parseHierarchy(CAPTURE);

  /** Criterion 9 — one internal node per element, the root included. */
  it('produces one node per element in the capture', () => {
    expect(flatten(root)).toHaveLength(110);
  });

  it('recurses the whole 21 levels the launcher reported', () => {
    expect(depth(root)).toBe(21);
  });

  /**
   * ⚠️ The real root carries `enabled` and `c` and *nothing else* — no `b`.
   * A parser that assumed the root is the full-screen rectangle would invent
   * bounds nobody reported, and §5.2's scale calibration (next spec) divides by
   * that width.
   */
  it('reports the root’s absent bounds as null rather than inventing a screen', () => {
    expect(root.bounds).toBeNull();
  });

  /** The one element in the capture that contradicts a default, which is the
   * whole reason defaults may not be applied over a stated value. */
  it('takes the root’s stated enabled:false over the schema default of true', () => {
    expect(root.enabled).toBe(false);
  });

  it('keeps the root’s three children', () => {
    expect(root.children).toHaveLength(3);
  });

  /** Criterion 4, on a real element carrying most of the fields at once. */
  it('reads every field of a real launcher icon', () => {
    const icon = flatten(root).find((node) => node.text === 'Spotify');

    expect(icon).toEqual({
      bounds: { x1: 27, y1: 862, x2: 194, y2: 1056 },
      className: 'android.widget.TextView',
      text: 'Spotify',
      resourceId: 'com.sec.android.app.launcher:id/icon',
      contentDescription: 'Spotify',
      hintText: null,
      scrollable: false,
      clickable: true,
      enabled: true,
      focused: false,
      selected: false,
      checked: false,
      children: [],
    });
  });

  it('reads the deepest element the capture reaches', () => {
    const forecast = flatten(root).find((node) => node.text?.startsWith('Mostly sunny tomorrow'));

    expect(forecast).toMatchObject({
      bounds: { x1: 244, y1: 516, x2: 478, y2: 585 },
      contentDescription: 'Mostly sunny tomorrow. High of 26°',
      className: 'android.widget.TextView',
      // Not clickable, and the capture never says so — the default is what
      // makes this `false` rather than a guess.
      clickable: false,
    });
  });

  it('reads the 18 clickable elements the capture reported', () => {
    expect(flatten(root).filter((node) => node.clickable === true)).toHaveLength(18);
  });

  /** §5.3: `a11y` is a distinct field that *becomes* `text:` in a selector.
   * Collapsing them here would lose which one the device actually reported. */
  it('keeps content-desc separate from text where they differ', () => {
    const page = flatten(root).find(
      (node) => node.contentDescription === 'Page 1 of 2., Default page',
    );

    expect(page).toMatchObject({
      contentDescription: 'Page 1 of 2., Default page',
      text: null,
      selected: true,
    });
  });

  /**
   * The capture's own proof of criterion 5, and the reason the two are told
   * apart above: the launcher reports the page dot as `selected: true` and the
   * page it sits under as nothing at all. One is read, the other resolves to
   * the schema's `false` — and a parser that guessed would report both alike.
   */
  it('reads a stated selected beside a sibling that resolves to the default', () => {
    const selected = flatten(root).filter((node) => node.selected === true);
    const page = flatten(root).find((node) => node.contentDescription === 'Page 1 of 2.');

    expect(selected).toHaveLength(2);
    expect(page).toMatchObject({ selected: false, clickable: false });
  });
});

/* ── defaults ─────────────────────────────────────────────────────────────── */

/**
 * Criterion 5. The compact format's central trap, and the one the capture
 * settled: a field absent from an element means "it equals what `defaults`
 * says", not "unknown". Assuming `false`/`""` independently would agree with
 * this server today and diverge silently the day it changes its mind.
 */
describe('resolving a field the element omits', () => {
  const bare = parseHierarchy(response({ b: '[0,0][10,10]' }));

  it('takes enabled from the schema’s default of true, not from false', () => {
    expect(bare.enabled).toBe(true);
  });

  it.each([
    ['clickable', false],
    ['focused', false],
    ['selected', false],
    ['checked', false],
    ['scrollable', false],
  ] as const)('takes %s from the schema default', (field, expected) => {
    expect(bare[field]).toBe(expected);
  });

  /** The inversion that proves these are read rather than assumed. */
  it('follows a schema that declares the opposite defaults', () => {
    const inverted = parseHierarchy(
      response(
        { b: '[0,0][10,10]' },
        {
          ...SCHEMA,
          defaults: {
            ...SCHEMA.defaults,
            enabled: false,
            clickable: true,
            focused: true,
            selected: true,
            checked: true,
            scrollable: true,
          },
        },
      ),
    );

    expect(inverted).toMatchObject({
      enabled: false,
      clickable: true,
      focused: true,
      selected: true,
      checked: true,
      scrollable: true,
    });
  });

  /**
   * ⚠️ `defaults` and the elements do not agree on how to spell a key. The
   * server declares `scrollable` in full there while abbreviating it to
   * `scroll` on an element, and abbreviates `txt`/`hint`/`rid`/`a11y`/`cls` in
   * both. Looking defaults up by the element's own spelling finds nothing for
   * `scroll`; looking them up by the expanded name finds nothing for `txt`.
   * Both spellings have to resolve to the same field.
   */
  it('resolves a default declared in full against a field abbreviated on the element', () => {
    const scrolling = parseHierarchy(response({ b: '[0,0][10,10]', scroll: true }));

    expect(scrolling.scrollable).toBe(true);
  });

  it('resolves a default declared abbreviated against the field it abbreviates', () => {
    const named = parseHierarchy(
      response({ b: '[0,0][10,10]' }, { ...SCHEMA, defaults: { ...SCHEMA.defaults, txt: 'none' } }),
    );

    expect(named.text).toBe('none');
  });

  /** A field the schema declares no default for is genuinely unreported (§5.2).
   * `bounds` is exactly that, which the real root proves. */
  it('reports a field with neither a value nor a default as null', () => {
    const noDefaults = parseHierarchy(response({ b: '[0,0][10,10]' }, { ...SCHEMA, defaults: {} }));

    expect(noDefaults).toMatchObject({
      text: null,
      className: null,
      enabled: null,
      clickable: null,
      scrollable: null,
    });
  });
});

/**
 * Criterion 6. `""` is how *this* format spells "not reported"; `null` is how
 * the internal model spells it, whichever format it came from. One
 * representation, so nothing downstream has to check for two — and §5.3's
 * `text:` selector is regex full-string, where an empty string is a match
 * against every element rather than none.
 */
describe('normalising the empty string', () => {
  it.each([
    ['text', 'text'],
    ['className', 'class'],
    ['resourceId', 'resource id'],
    ['contentDescription', 'content description'],
    ['hintText', 'hint text'],
  ] as const)('reports an absent %s as null rather than as ""', (field, _label) => {
    expect(parseHierarchy(response({ b: '[0,0][10,10]' }))[field]).toBeNull();
  });

  // The element said `""` itself rather than leaving the field out. Same
  // meaning, same representation — otherwise "absent" and "empty" would be two
  // states downstream for one fact.
  it('reports an explicitly empty string as null too', () => {
    expect(parseHierarchy(response({ b: '[0,0][10,10]', txt: '' })).text).toBeNull();
  });

  it('keeps a string that is merely whitespace, which is not the same as absent', () => {
    expect(parseHierarchy(response({ b: '[0,0][10,10]', txt: ' ' })).text).toBe(' ');
  });

  it('keeps a value the schema’s own default happens to equal', () => {
    expect(parseHierarchy(response({ b: '[0,0][10,10]', txt: '0' })).text).toBe('0');
  });
});

/* ── abbreviations ────────────────────────────────────────────────────────── */

/**
 * Criterion 8. The table travels *with* the response, so it is read from there
 * rather than hardcoded. A server that renames one key would otherwise be
 * mis-read in silence — the worst outcome, because a dropped `rid` demotes a
 * selector from `id:` to `text:` without anything looking broken (§5.4).
 */
describe('translating abbreviated keys', () => {
  it.each([
    ['b', '[1,2][3,4]', 'bounds', { x1: 1, y1: 2, x2: 3, y2: 4 }],
    ['txt', 'Entrar', 'text', 'Entrar'],
    ['rid', 'com.vtex.pnp:id/login', 'resourceId', 'com.vtex.pnp:id/login'],
    ['a11y', 'Botão de login', 'contentDescription', 'Botão de login'],
    ['hint', 'e-mail', 'hintText', 'e-mail'],
    ['cls', 'android.widget.Button', 'className', 'android.widget.Button'],
    ['scroll', true, 'scrollable', true],
  ] as const)('reads %s as %s', (abbreviated, value, field, expected) => {
    const node = parseHierarchy(response({ b: '[0,0][10,10]', [abbreviated]: value }));

    expect(node[field]).toEqual(expected);
  });

  /** The five booleans the server abbreviates nothing for arrive spelled out. */
  it.each(['clickable', 'enabled', 'focused', 'selected', 'checked'] as const)(
    'reads the unabbreviated %s',
    (field) => {
      expect(parseHierarchy(response({ b: '[0,0][10,10]', [field]: true }))[field]).toBe(true);
    },
  );

  /** A future server renames `txt` to `t`. The table says so, so it is read. */
  it('follows a renamed abbreviation instead of today’s table', () => {
    const renamed = parseHierarchy(
      response(
        { b: '[0,0][10,10]', t: 'Entrar' },
        {
          ...SCHEMA,
          abbreviations: { ...SCHEMA.abbreviations, t: 'text' },
          defaults: { ...SCHEMA.defaults, t: '' },
        },
      ),
    );

    expect(renamed.text).toBe('Entrar');
  });

  /** The same fact from the other side: with `txt` gone from the table it is
   * no longer text, and pretending otherwise is the silent mis-map. */
  it('stops reading a key the table no longer declares', () => {
    const { txt: _dropped, ...abbreviations } = SCHEMA.abbreviations;
    const renamed = parseHierarchy(
      response({ b: '[0,0][10,10]', txt: 'Entrar' }, { ...SCHEMA, abbreviations }),
    );

    expect(renamed.text).toBeNull();
  });

  /** A table that spells a key out is a table that changes nothing. */
  it('reads a field the table declares no abbreviation for', () => {
    const spelled = parseHierarchy(
      response({ bounds: '[1,2][3,4]', text: 'Entrar' }, { ...SCHEMA, abbreviations: {} }),
    );

    expect(spelled).toMatchObject({ bounds: { x1: 1, y1: 2, x2: 3, y2: 4 }, text: 'Entrar' });
  });
});

/* ── bounds ───────────────────────────────────────────────────────────────── */

/** Criterion 7 — the shared parser's results, reached through this one. */
describe('bounds', () => {
  it('parses the string form into numbers', () => {
    expect(parseHierarchy(response({ b: '[194,86][528,280]' })).bounds).toEqual({
      x1: 194,
      y1: 86,
      x2: 528,
      y2: 280,
    });
  });

  it('keeps an element that starts off the left edge negative', () => {
    expect(parseHierarchy(response({ b: '[-96,0][360,64]' })).bounds).toMatchObject({ x1: -96 });
  });

  // Criterion 10 rather than a silent null: the field was reported, and we could
  // not read it. Guessing here is how a hit-test starts matching the wrong node.
  it('rejects bounds that are present and unreadable', () => {
    expect(() => parseHierarchy(response({ b: '194,86,528,280' }))).toThrow(HierarchyParseError);
  });
});

/* ── recursion ────────────────────────────────────────────────────────────── */

/** Criterion 9. */
describe('recursing through children', () => {
  it('reads a node with no children as a leaf', () => {
    expect(parseHierarchy(response({ b: '[0,0][10,10]' })).children).toEqual([]);
  });

  it('reads an explicitly empty child list as a leaf', () => {
    expect(parseHierarchy(response({ b: '[0,0][10,10]', c: [] })).children).toEqual([]);
  });

  it('keeps siblings in the order the device reported them', () => {
    const node = parseHierarchy(
      response({ b: '[0,0][10,10]', c: [{ txt: 'first' }, { txt: 'second' }, { txt: 'third' }] }),
    );

    expect(node.children.map((child) => child.text)).toEqual(['first', 'second', 'third']);
  });

  it('recurses past the depth the capture happens to reach', () => {
    let element: Record<string, unknown> = { txt: 'leaf' };
    for (let level = 0; level < 60; level += 1) {
      element = { b: `[0,0][${level},${level}]`, c: [element] };
    }

    const node = parseHierarchy(response(element));

    expect(depth(node)).toBe(61);
    expect(flatten(node).at(-1)?.text).toBe('leaf');
  });

  /** Defaults apply at every level, not only at the root. */
  it('applies the schema to a nested element too', () => {
    const node = parseHierarchy(response({ b: '[0,0][10,10]', c: [{ txt: 'child' }] }));

    expect(node.children[0]).toMatchObject({ enabled: true, clickable: false, hintText: null });
  });
});

/* ── malformed responses ──────────────────────────────────────────────────── */

/**
 * Criterion 10. A tool schema carries no version contract the way a released
 * CLI subcommand does (the spec's own *Decisions*), so this is the layer that
 * absorbs a server that changed shape. It must fail loudly: a best-guess tree
 * would surface three steps later as a selector that matches nothing.
 */
describe('a response that is not the documented shape', () => {
  const rejects = (text: string): void => {
    expect(() => parseHierarchy(text)).toThrow(HierarchyParseError);
  };

  it('carries a stable code', () => {
    try {
      parseHierarchy('not json');
      expect.unreachable('parseHierarchy should have thrown');
    } catch (error) {
      expect(error).toMatchObject({ code: 'hierarchy/parse-failed' });
    }
  });

  it.each([
    ['text that is not JSON', 'not json at all'],
    ['a JSON array', '[]'],
    ['a JSON string', '"hierarchy"'],
    ['null', 'null'],
    ['an object with neither key', '{}'],
  ])('rejects %s', (_case, text) => {
    rejects(text);
  });

  it('rejects a response missing ui_schema', () => {
    rejects(JSON.stringify({ elements: [{ b: '[0,0][1,1]' }] }));
  });

  it('rejects a response missing elements', () => {
    rejects(JSON.stringify({ ui_schema: SCHEMA }));
  });

  it('rejects elements that are not an array', () => {
    rejects(JSON.stringify({ ui_schema: SCHEMA, elements: { b: '[0,0][1,1]' } }));
  });

  it('rejects a ui_schema that is not an object', () => {
    rejects(JSON.stringify({ ui_schema: 'android', elements: [{ b: '[0,0][1,1]' }] }));
  });

  it('rejects an abbreviation table that does not map strings to strings', () => {
    rejects(response({ b: '[0,0][1,1]' }, { ...SCHEMA, abbreviations: { b: 7 } }));
  });

  /**
   * ⚠️ Absent is not the same fact as `{}`. A table written out empty is a
   * server saying "these keys are already their own names" and is read (above).
   * A table *missing* is a payload we cannot read at all: the elements below
   * still arrive abbreviated, and treating every key as already-expanded
   * resolves `b`/`txt`/`cls`/`c` to nothing — one all-null node, no children,
   * reported as success. That is criterion 10's "partial or best-guess tree",
   * and it is the exact silent mis-map criterion 8 exists to prevent.
   */
  it('rejects a ui_schema declaring no abbreviations', () => {
    const { abbreviations: _absent, ...schema } = SCHEMA;
    rejects(response({ b: '[0,0][1,1]', txt: 'Entrar' }, schema));
  });

  it('rejects a ui_schema declaring no defaults', () => {
    const { defaults: _absent, ...schema } = SCHEMA;
    rejects(response({ b: '[0,0][1,1]', txt: 'Entrar' }, schema));
  });

  /**
   * `hierarchy()` answers with one `TreeNode`, so a payload that is not one
   * tree cannot be represented. Wrapping several roots in a node the device
   * never reported would put a fabricated element into the hit-test.
   */
  it('rejects an empty element list', () => {
    rejects(JSON.stringify({ ui_schema: SCHEMA, elements: [] }));
  });

  it('rejects more than one root element', () => {
    rejects(
      JSON.stringify({ ui_schema: SCHEMA, elements: [{ b: '[0,0][1,1]' }, { b: '[0,0][2,2]' }] }),
    );
  });

  it.each([
    ['an element that is not an object', 'element'],
    ['an element that is null', null],
    ['an element that is an array', []],
  ])('rejects %s', (_case, element) => {
    rejects(response(element));
  });

  it('rejects a string field holding a number', () => {
    rejects(response({ b: '[0,0][1,1]', txt: 7 }));
  });

  it('rejects a boolean field holding a string', () => {
    rejects(response({ b: '[0,0][1,1]', clickable: 'true' }));
  });

  /** §5.2's warning made executable: the raw format also carries the booleans
   * as `"true"`/`"false"` strings, and reading those would invert nothing —
   * `"false"` is truthy. */
  it('rejects the string "false" rather than reading it as true', () => {
    rejects(response({ b: '[0,0][1,1]', enabled: 'false' }));
  });

  it('rejects children that are not an array', () => {
    rejects(response({ b: '[0,0][1,1]', c: { txt: 'child' } }));
  });

  /** The failure is found however deep it is, not only at the root. */
  it('rejects a malformed element nested inside a valid one', () => {
    rejects(response({ b: '[0,0][1,1]', c: [{ b: '[0,0][1,1]', c: [{ txt: 7 }] }] }));
  });

  it('rejects a default of a type the field cannot hold', () => {
    rejects(response({ b: '[0,0][1,1]' }, { ...SCHEMA, defaults: { ...SCHEMA.defaults, txt: 7 } }));
  });

  it('names the field it could not read', () => {
    expect(() => parseHierarchy(response({ b: '[0,0][1,1]', txt: 7 }))).toThrow(/text/);
  });
});

/* ── purity ───────────────────────────────────────────────────────────────── */

/** Criterion 11 — pure: no I/O, no Electron, no process, no device. */
describe('the module itself', () => {
  const source = readFileSync(resolve('src/main/maestro/HierarchyParser.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  it('imports nothing that touches the outside world', () => {
    expect(code).not.toMatch(/from\s+['"]node:/);
    expect(code).not.toMatch(/from\s+['"]electron['"]/);
    expect(code).not.toMatch(/require\(/);
  });

  it('imports only the shared contract and the shared bounds parser', () => {
    const imports = [...code.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((match) => match[1]);

    expect([...imports].sort()).toEqual(['./bounds', '@shared/ipc', '@shared/types']);
  });

  /** Criterion 7 again, structurally: there is one bounds parser and this
   * module is not a second one. */
  it('does not parse bounds itself', () => {
    expect(code).not.toMatch(/\\\[.*\\d.*\\\]/);
  });
});

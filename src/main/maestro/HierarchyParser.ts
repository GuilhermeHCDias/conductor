import { ERROR_CODES } from '@shared/ipc';
import type { TreeNode } from '@shared/types';
import { parseBounds } from './bounds';

/**
 * `inspect_screen`'s answer → the internal tree.
 *
 * Pure, and deliberately so (§9.2): it takes the response text and returns a
 * `TreeNode`, which is what lets the traps below be driven from a real captured
 * payload with no `maestro`, no `adb` and no phone.
 *
 * The format is the MCP server's compact one, not the raw `maestro hierarchy`
 * dump §5.2 describes — a reversal the spec makes with numbers (~271ms against
 * ~3.83s). It is lossy and abbreviated, and the three things that follow from
 * that are the whole of this module:
 *
 *  1. **Keys are abbreviated, and the table travels with the response.** It is
 *     read from `ui_schema.abbreviations`, never from a copy of today's table,
 *     so a server that renames a key is read correctly rather than mis-mapped
 *     in silence.
 *  2. **An absent field is not unknown — it equals `ui_schema.defaults`.** That
 *     is the one genuinely new fact the hardware capture settled, and assuming
 *     `false`/`""` instead would agree with this server right up until it
 *     changes its mind.
 *  3. **`""` means "not reported", and so does `null`.** The raw format already
 *     spells it `null` (§5.2); one internal model cannot have two spellings for
 *     one fact, so the empty string is normalised away here.
 */

/** The response said something we cannot represent. Stable code, because the
 * layer above has to tell "the server changed shape" from "the phone is gone". */
export class HierarchyParseError extends Error {
  readonly code = ERROR_CODES.hierarchyParseFailed;

  constructor(detail: string) {
    super(`inspect_screen answered with something Conductor could not read. ${detail}`);
    this.name = 'HierarchyParseError';
  }
}

/**
 * Wire name → field, after the response's own abbreviations have been expanded.
 * These are the *expanded* names the table maps to (`b` → `bounds`), plus the
 * five booleans the server abbreviates nothing for.
 */
const STRING_FIELDS = {
  text: 'text',
  class: 'className',
  'resource-id': 'resourceId',
  'content-desc': 'contentDescription',
  hintText: 'hintText',
} as const;

const BOOLEAN_FIELDS = {
  scrollable: 'scrollable',
  clickable: 'clickable',
  enabled: 'enabled',
  focused: 'focused',
  selected: 'selected',
  checked: 'checked',
} as const;

const BOUNDS_FIELD = 'bounds';
const CHILDREN_FIELD = 'children';

export function parseHierarchy(text: string): TreeNode {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new HierarchyParseError('It was not JSON.');
  }

  if (!isRecord(payload)) {
    throw new HierarchyParseError('The response was not an object.');
  }

  const schema = payload.ui_schema;
  if (!isRecord(schema)) {
    throw new HierarchyParseError('It carried no ui_schema.');
  }

  const elements = payload.elements;
  if (!Array.isArray(elements)) {
    throw new HierarchyParseError('It carried no elements array.');
  }

  // `hierarchy()` answers with one node. Wrapping several roots in an element
  // the device never reported would put a node into the hit-test that does not
  // exist on the screen, so this is reported rather than papered over.
  const [root, ...rest] = elements;
  if (root === undefined || rest.length > 0) {
    throw new HierarchyParseError(`It carried ${elements.length} root elements, not one.`);
  }

  const expand = expander(schema.abbreviations);
  return readElement(root, expand, canonicalise(schema.defaults, expand));
}

/**
 * Criterion 8. The response's own table, as a lookup — a key it does not
 * mention is already the name it means.
 */
function expander(abbreviations: unknown): (key: string) => string {
  if (abbreviations === undefined) {
    return (key) => key;
  }
  if (!isRecord(abbreviations)) {
    throw new HierarchyParseError('Its ui_schema.abbreviations was not an object.');
  }

  const table = new Map<string, string>();
  for (const [key, value] of Object.entries(abbreviations)) {
    if (typeof value !== 'string') {
      throw new HierarchyParseError(`Its abbreviation for ${key} was not a name.`);
    }
    table.set(key, value);
  }
  return (key) => table.get(key) ?? key;
}

/**
 * ⚠️ `defaults` and the elements do not agree on how to spell a key: the server
 * declares `scrollable` in full there while abbreviating it to `scroll` on an
 * element, and abbreviates `txt`/`hint`/`rid`/`a11y`/`cls` in both. Expanding
 * both sides through the same table is what makes one lookup answer for either
 * spelling — reading `defaults` by the element's own key would find nothing for
 * `scroll` and quietly substitute a guess.
 */
function canonicalise(
  values: unknown,
  expand: (key: string) => string,
): ReadonlyMap<string, unknown> {
  if (values === undefined) {
    return new Map();
  }
  if (!isRecord(values)) {
    throw new HierarchyParseError('Its ui_schema.defaults was not an object.');
  }

  const canonical = new Map<string, unknown>();
  for (const [key, value] of Object.entries(values)) {
    canonical.set(expand(key), value);
  }
  return canonical;
}

function readElement(
  element: unknown,
  expand: (key: string) => string,
  defaults: ReadonlyMap<string, unknown>,
): TreeNode {
  if (!isRecord(element)) {
    throw new HierarchyParseError('One of its elements was not an object.');
  }

  const own = canonicalise(element, expand);
  /** Criterion 5: the element's own value, else what the schema declared for
   * that field, else genuinely nothing. */
  const read = (field: string): unknown => (own.has(field) ? own.get(field) : defaults.get(field));

  const node: Record<string, unknown> = {
    bounds: readBounds(read(BOUNDS_FIELD)),
    children: readChildren(read(CHILDREN_FIELD), expand, defaults),
  };
  for (const [wire, field] of Object.entries(STRING_FIELDS)) {
    node[field] = readString(read(wire), wire);
  }
  for (const [wire, field] of Object.entries(BOOLEAN_FIELDS)) {
    node[field] = readBoolean(read(wire), wire);
  }
  return node as unknown as TreeNode;
}

/**
 * Criterion 6. `""` and absent are the same fact, and the internal model spells
 * it `null` whichever format it arrived in — §5.3's `text:` selector is a
 * full-string regex, where an empty one would match every element rather than
 * none.
 */
function readString(value: unknown, wire: string): string | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new HierarchyParseError(`Its ${wire} was ${describe(value)}, not text.`);
  }
  return value === '' ? null : value;
}

/**
 * ⚠️ §5.2: the raw format carries these booleans as `"true"`/`"false"` strings
 * as well as as booleans, and `"false"` is truthy. A coerced read would invert
 * exactly the elements it matters most for, so a non-boolean is a failure here
 * rather than a conversion.
 */
function readBoolean(value: unknown, wire: string): boolean | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'boolean') {
    throw new HierarchyParseError(`Its ${wire} was ${describe(value)}, not a boolean.`);
  }
  return value;
}

/**
 * Absent bounds are `null` — the real root of a real capture reports none, and
 * `ui_schema.defaults` declares no default for them. Bounds that are *present*
 * and unreadable are a failure: the device reported a rectangle and we could
 * not read it, and a guess there is a hit-test that selects the wrong element.
 */
function readBounds(value: unknown): TreeNode['bounds'] {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new HierarchyParseError(`Its bounds were ${describe(value)}, not text.`);
  }

  const bounds = parseBounds(value);
  if (bounds === null) {
    throw new HierarchyParseError(`Its bounds did not read as [x1,y1][x2,y2]: ${value}`);
  }
  return bounds;
}

/** Criterion 9 — to whatever depth the device reported, and no deeper. */
function readChildren(
  value: unknown,
  expand: (key: string) => string,
  defaults: ReadonlyMap<string, unknown>,
): readonly TreeNode[] {
  if (value === undefined || value === null) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new HierarchyParseError(`Its children were ${describe(value)}, not a list.`);
  }
  return value.map((child) => readElement(child, expand, defaults));
}

function describe(value: unknown): string {
  return Array.isArray(value) ? 'a list' : `${typeof value} ${JSON.stringify(value)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

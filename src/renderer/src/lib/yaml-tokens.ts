/**
 * The YAML body's whole colouring decision, ported from the design system's
 * `YamlEditor.jsx` tokenizer. Pure and React-free: the editor maps a kind to a
 * `--syn-*` class and does nothing else.
 */

export type YamlTokenKind = 'plain' | 'key' | 'anchor' | 'string' | 'number' | 'punct' | 'comment';

export type YamlToken = {
  readonly kind: YamlTokenKind;
  readonly text: string;
};

/** Maestro's flow-header keys. Everything else that takes a colon is a command. */
const HEADER_KEYS = /^(appId|tags|env|onFlowStart|onFlowComplete|name)$/;

const DOCUMENT_SEPARATOR = /^\s*---\s*$/;
/** indent · optional `- ` · key · `:` · the rest of the line */
const MAPPING = /^(\s*)(-\s*)?([A-Za-z_][\w.-]*)(:)(.*)$/;
/** indent · `- ` · the rest of the line */
const LIST_ITEM = /^(\s*)(-\s*)(.*)$/;
const SCALAR = /^\s*(true|false|null|\d+(\.\d+)?)\s*$/;

/**
 * How many Maestro commands a flow holds — the `<n> commands` in the toolbar's
 * subtitle. A command is a top-level list item; an indented `- ` is an argument
 * to the command above it.
 */
export function countCommands(yaml: string): number {
  return yaml.split('\n').filter((line) => line.startsWith('- ')).length;
}

export function tokenizeYamlLine(line: string): YamlToken[] {
  const tokens: YamlToken[] = [];
  // An empty span would render an empty <span>; nothing downstream wants one.
  const push = (kind: YamlTokenKind, text: string | undefined): void => {
    if (text !== undefined && text !== '') {
      tokens.push({ kind, text });
    }
  };

  // A `#` inside a quoted string would be misread as a comment. Maestro flows do
  // not carry one often enough to justify a quote-aware scanner, and the design
  // system's tokenizer splits on the first `#` too.
  const commentAt = line.indexOf('#');
  const body = commentAt >= 0 ? line.slice(0, commentAt) : line;
  const comment = commentAt >= 0 ? line.slice(commentAt) : '';

  if (DOCUMENT_SEPARATOR.test(body)) {
    push('punct', body);
    push('comment', comment);
    return tokens;
  }

  const mapping = MAPPING.exec(body);
  if (mapping !== null) {
    push('plain', mapping[1]);
    push('punct', mapping[2]);
    push(HEADER_KEYS.test(mapping[3] ?? '') ? 'anchor' : 'key', mapping[3]);
    push('punct', mapping[4]);
    const rest = mapping[5];
    if (rest !== undefined && rest !== '') {
      push(SCALAR.test(rest) ? 'number' : 'string', rest);
    }
    push('comment', comment);
    return tokens;
  }

  const item = LIST_ITEM.exec(body);
  if (item !== null) {
    push('plain', item[1]);
    push('punct', item[2]);
    push('string', item[3]);
  } else {
    push('plain', body);
  }
  push('comment', comment);
  return tokens;
}

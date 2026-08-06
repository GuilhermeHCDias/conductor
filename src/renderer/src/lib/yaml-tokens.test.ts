import { describe, expect, it } from 'vitest';
import { countCommands, tokenizeYamlLine } from './yaml-tokens';

/** Criterion 10 — the `<n> commands` the toolbar subtitle reports. */
describe('countCommands', () => {
  it('counts the top-level list items of a flow', () => {
    const yaml = 'appId: com.example.app\n---\n- launchApp:\n    clearState: true\n';

    expect(countCommands(yaml)).toBe(1);
  });

  it('counts each command once, however many keys it carries', () => {
    const yaml = ['- launchApp:', '    clearState: true', '- tapOn:', '    text: "Entrar"'].join(
      '\n',
    );

    expect(countCommands(yaml)).toBe(2);
  });

  // Only top-level items are commands; a nested `- ` is an argument.
  it('ignores indented list items', () => {
    expect(countCommands('- runFlow:\n    commands:\n      - tapOn: x\n')).toBe(1);
  });

  it('counts nothing in a header-only flow', () => {
    expect(countCommands('appId: com.example.app\n---\n')).toBe(0);
  });

  it('counts nothing in an empty document', () => {
    expect(countCommands('')).toBe(0);
  });
});

/**
 * Criterion 26 — the YAML body is a read-only, syntax-coloured render, so the
 * whole of its colouring is decided here, in one pure function, and the editor
 * only maps a kind to a `--syn-*` class.
 */
describe('tokenizeYamlLine', () => {
  it('reads a Maestro header key as an anchor', () => {
    expect(tokenizeYamlLine('appId: com.example.app')).toEqual([
      { kind: 'anchor', text: 'appId' },
      { kind: 'punct', text: ':' },
      { kind: 'string', text: ' com.example.app' },
    ]);
  });

  it.each(['tags', 'env', 'onFlowStart', 'onFlowComplete', 'name'])(
    'reads %s as an anchor too',
    (keyword) => {
      expect(tokenizeYamlLine(`${keyword}: x`)[0]).toEqual({ kind: 'anchor', text: keyword });
    },
  );

  it('reads any other mapping key as a key', () => {
    expect(tokenizeYamlLine('clearState: true')[0]).toEqual({
      kind: 'key',
      text: 'clearState',
    });
  });

  it('reads the document separator as punctuation', () => {
    expect(tokenizeYamlLine('---')).toEqual([{ kind: 'punct', text: '---' }]);
  });

  it('reads a command as a dash plus a key', () => {
    expect(tokenizeYamlLine('- launchApp:')).toEqual([
      { kind: 'punct', text: '- ' },
      { kind: 'key', text: 'launchApp' },
      { kind: 'punct', text: ':' },
    ]);
  });

  it('keeps indentation as plain text so the shape of the flow survives', () => {
    expect(tokenizeYamlLine('    clearState: true')).toEqual([
      { kind: 'plain', text: '    ' },
      { kind: 'key', text: 'clearState' },
      { kind: 'punct', text: ':' },
      { kind: 'number', text: ' true' },
    ]);
  });

  it.each(['true', 'false', 'null', '10000', '1.5'])('reads %s as a number', (value) => {
    expect(tokenizeYamlLine(`timeout: ${value}`)[2]).toEqual({
      kind: 'number',
      text: ` ${value}`,
    });
  });

  it('reads anything else after the colon as a string', () => {
    expect(tokenizeYamlLine('text: "Detalhes do pedido"')[2]).toEqual({
      kind: 'string',
      text: ' "Detalhes do pedido"',
    });
  });

  it('reads a bare list item as a dash plus a string', () => {
    expect(tokenizeYamlLine('  - waitForAnimationToEnd')).toEqual([
      { kind: 'plain', text: '  ' },
      { kind: 'punct', text: '- ' },
      { kind: 'string', text: 'waitForAnimationToEnd' },
    ]);
  });

  it('splits a trailing comment off whatever precedes it', () => {
    expect(tokenizeYamlLine('appId: com.example.app # the app under test')).toEqual([
      { kind: 'anchor', text: 'appId' },
      { kind: 'punct', text: ':' },
      { kind: 'string', text: ' com.example.app ' },
      { kind: 'comment', text: '# the app under test' },
    ]);
  });

  it('reads a whole-line comment as one comment span', () => {
    expect(tokenizeYamlLine('# written by Conductor')).toEqual([
      { kind: 'comment', text: '# written by Conductor' },
    ]);
  });

  it('emits no empty spans', () => {
    for (const line of ['', '   ', '---', '- tapOn:', 'appId: x # y']) {
      for (const token of tokenizeYamlLine(line)) {
        expect(token.text).not.toBe('');
      }
    }
  });

  it('returns nothing for an empty line', () => {
    expect(tokenizeYamlLine('')).toEqual([]);
  });

  it('reads an unparseable line as plain text rather than dropping it', () => {
    expect(tokenizeYamlLine('???')).toEqual([{ kind: 'plain', text: '???' }]);
  });
});

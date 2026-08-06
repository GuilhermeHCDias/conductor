import type { FlowMeta } from '@shared/types';
import { describe, expect, it } from 'vitest';
import { flowTree } from './flow-tree';

/**
 * The sidebar's shape, derived pure (criteria 11, 14): folders first, then
 * loose files, alphabetical throughout — and a non-empty query flattens
 * everything into matches.
 */

function meta(path: string): FlowMeta {
  const slash = path.lastIndexOf('/');
  return {
    path,
    name: slash === -1 ? path : path.slice(slash + 1),
    folder: slash === -1 ? '' : path.slice(0, slash),
    commandCount: 1,
    hash: 'x',
  };
}

const INDEX = {
  flows: [
    meta('login.yaml'),
    meta('checkout/pix.yml'),
    meta('checkout/card.yml'),
    meta('a/b/deep.yaml'),
    meta('boot.yaml'),
  ],
  folders: ['checkout', 'a', 'a/b', 'drafts'],
};

describe('flowTree', () => {
  /** Criterion 11 — folders alphabetical, each with its own flows sorted;
   * a directory nested deeper renders as its own compact `a/b` row. */
  it('groups folders and their flows, nested ones as compact rows', () => {
    const tree = flowTree(INDEX, '');
    if (tree.mode !== 'tree') {
      throw new Error('Expected the tree.');
    }

    expect(tree.folders.map((folder) => folder.path)).toEqual(['a', 'a/b', 'checkout', 'drafts']);
    expect(tree.folders[1]?.flows.map((flow) => flow.name)).toEqual(['deep.yaml']);
    expect(tree.folders[2]?.flows.map((flow) => flow.name)).toEqual(['card.yml', 'pix.yml']);
  });

  /** Criterion 13 — an empty folder is still a folder row. */
  it('keeps empty folders', () => {
    const tree = flowTree(INDEX, '');
    if (tree.mode !== 'tree') {
      throw new Error('Expected the tree.');
    }

    expect(tree.folders[3]).toEqual({ path: 'drafts', flows: [] });
  });

  /** Criterion 11 — root files after the folders, alphabetical. */
  it('lists loose flows sorted', () => {
    const tree = flowTree(INDEX, '');
    if (tree.mode !== 'tree') {
      throw new Error('Expected the tree.');
    }

    expect(tree.loose.map((flow) => flow.name)).toEqual(['boot.yaml', 'login.yaml']);
  });

  it('sorts case-insensitively', () => {
    const tree = flowTree({ flows: [meta('Zebra.yaml'), meta('apple.yaml')], folders: [] }, '');
    if (tree.mode !== 'tree') {
      throw new Error('Expected the tree.');
    }

    expect(tree.loose.map((flow) => flow.name)).toEqual(['apple.yaml', 'Zebra.yaml']);
  });

  /** Criterion 14 — a query flattens: matches by file or folder name,
   * case-insensitive, and no folder rows at all. */
  it('flattens to matches while searching', () => {
    const tree = flowTree(INDEX, 'PIX');

    expect(tree).toEqual({ mode: 'search', matches: [meta('checkout/pix.yml')] });
  });

  it('matches by folder name too', () => {
    const tree = flowTree(INDEX, 'checkout');
    if (tree.mode !== 'search') {
      throw new Error('Expected the flat matches.');
    }

    expect(tree.matches.map((flow) => flow.path)).toEqual([
      'checkout/card.yml',
      'checkout/pix.yml',
    ]);
  });

  it('answers no matches as an empty list, never a tree', () => {
    expect(flowTree(INDEX, 'zzz')).toEqual({ mode: 'search', matches: [] });
  });
});

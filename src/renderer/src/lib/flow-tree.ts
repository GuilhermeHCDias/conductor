import type { FlowIndex, FlowMeta } from '@shared/types';

/**
 * Criterion 11's shape, derived pure: folder rows first — every directory in
 * the index, the nested ones as their own compact `a/b` rows — then the root
 * files, everything alphabetical, case-insensitive. Criterion 14 flattens it:
 * while a query is live there are only matches, by file or folder name, and
 * no folder rows at all.
 */

export type FlowTreeFolder = {
  /** The folder's identity — its root-relative path, also its row label. */
  readonly path: string;
  readonly flows: readonly FlowMeta[];
};

export type FlowTree =
  | {
      readonly mode: 'tree';
      readonly folders: readonly FlowTreeFolder[];
      readonly loose: readonly FlowMeta[];
    }
  | { readonly mode: 'search'; readonly matches: readonly FlowMeta[] };

export function flowTree(index: FlowIndex, query: string): FlowTree {
  const needle = query.trim().toLowerCase();
  if (needle !== '') {
    return {
      mode: 'search',
      matches: sortedFlows(
        index.flows.filter(
          (flow) =>
            flow.name.toLowerCase().includes(needle) || flow.folder.toLowerCase().includes(needle),
        ),
      ),
    };
  }
  const folders = [...index.folders].sort(alphabetical).map((path) => ({
    path,
    flows: sortedFlows(index.flows.filter((flow) => flow.folder === path)),
  }));
  return {
    mode: 'tree',
    folders,
    loose: sortedFlows(index.flows.filter((flow) => flow.folder === '')),
  };
}

function sortedFlows(flows: readonly FlowMeta[]): readonly FlowMeta[] {
  return [...flows].sort((a, b) => alphabetical(a.name, b.name));
}

function alphabetical(a: string, b: string): number {
  const left = a.toLowerCase();
  const right = b.toLowerCase();
  if (left === right) {
    // Case is the only difference — keep the order deterministic anyway.
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return left < right ? -1 : 1;
}

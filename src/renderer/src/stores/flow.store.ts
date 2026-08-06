import { create } from 'zustand';
import { FLOW_YAML } from '../fixtures/flows';

/**
 * The open flow's YAML text, in memory only — the landing place for a step the
 * command menu appends while the real editor and `flow:save` belong to later
 * specs. Seeded from the fixture flow the shell used to render directly.
 *
 * Criterion 38 is the law of this store: appending is strictly additive.
 * Existing bytes stay byte-identical and one block joins at the end — §12
 * rule 7's spirit, because this text eventually goes through code review.
 */

export type FlowData = {
  readonly yaml: string;
  /** Criterion 39 — the document bar's dirty mark follows this. */
  readonly dirty: boolean;
  /** Advances once per append. The editor watches it to reveal the new lines
   * without diffing the text. */
  readonly revision: number;
};

export type FlowActions = {
  /** Appends one step block — no leading or trailing newline of its own; the
   * store owns the joining and the trailing newline. */
  appendStep: (step: string) => void;
};

export type FlowState = FlowData & FlowActions;

function createFlowData(): FlowData {
  return { yaml: FLOW_YAML, dirty: false, revision: 0 };
}

export const useFlowStore = create<FlowState>((set, get) => ({
  ...createFlowData(),

  appendStep: (step) => {
    const { yaml, revision } = get();
    set({
      // Trimming exactly one trailing newline and putting it back is what
      // keeps the existing bytes identical whether or not the text ended
      // with one.
      yaml: `${yaml.replace(/\n$/, '')}\n${step}\n`,
      dirty: true,
      revision: revision + 1,
    });
  },
}));

/** Restores the seed. Used by tests, which share one module instance. */
export function resetFlowStore(): void {
  useFlowStore.setState(createFlowData());
}

export function selectYaml(state: FlowState): string {
  return state.yaml;
}

export function selectDirty(state: FlowState): boolean {
  return state.dirty;
}

export function selectRevision(state: FlowState): number {
  return state.revision;
}

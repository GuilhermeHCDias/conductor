import type {
  DoctorInstallFailure,
  DoctorPlan,
  DoctorReport,
  DoctorState,
  ToolId,
} from '@shared/ipc';

/**
 * The four rows of the installer (criteria 35, 39), derived — never
 * rendered from a timer: the plan says what will happen, the install in
 * flight says what is happening, the outcomes so far say what did, and the
 * report supplies the version a landed tool reads. The view lays this out
 * and adds nothing.
 */

/** What one tool came to in the install on screen (criterion 39). */
export type ToolOutcome =
  | { readonly kind: 'done'; readonly version: string }
  | ({ readonly kind: 'failed' } & DoctorInstallFailure);

/** Criterion 1's order, criterion 35's names. */
export const TOOL_DISPLAY_NAMES: Record<ToolId, string> = {
  java: 'Zulu JDK 21',
  maestro: 'Maestro',
  gh: 'GitHub CLI',
  adb: 'Android platform-tools',
};

const ORDER: readonly ToolId[] = ['java', 'maestro', 'gh', 'adb'];

/** The kit's glyph per state: teal check, tertiary dashed circle, amber
 * alert, the fail colour, and the active row's spinner. */
export type SetupGlyph = 'present' | 'install' | 'alert' | 'fail' | 'active';

export type SetupRowModel = {
  readonly id: ToolId;
  readonly name: string;
  readonly glyph: SetupGlyph;
  /** The right-aligned mono state, or the step line under the active row. */
  readonly mono: string;
  /** The 4 px bar under the active row: determinate, or `null` pct for Homebrew. */
  readonly bar: { readonly pct: number | null } | null;
};

export type SetupRowsInput = {
  readonly plan: DoctorPlan | null;
  readonly install: DoctorState['install'];
  readonly outcomes: Partial<Record<ToolId, ToolOutcome>>;
  readonly report: DoctorReport | null;
  /** The terms checkbox — unchecked, the adb row says so (criterion 37). */
  readonly termsAccepted: boolean;
};

export function setupRows(input: SetupRowsInput): readonly SetupRowModel[] {
  return ORDER.map((id) => ({ id, name: TOOL_DISPLAY_NAMES[id], ...rowOf(id, input) }));
}

function rowOf(
  id: ToolId,
  { plan, install, outcomes, report, termsAccepted }: SetupRowsInput,
): Pick<SetupRowModel, 'glyph' | 'mono' | 'bar'> {
  const entry = plan?.tools.find((tool) => tool.id === id);
  if (entry === undefined) {
    return { glyph: 'install', mono: 'Checking…', bar: null };
  }
  const short = report?.rows.find((row) => row.id === id && row.status === 'ok')?.short;
  const running = install !== null && 'pct' in install;
  const settled = install !== null && 'failed' in install;

  if (running && install.tool === id) {
    const pct = install.pct;
    return {
      glyph: 'active',
      mono: pct === null ? install.step : `${install.step} · ${Math.round(pct)}%`,
      bar: { pct },
    };
  }
  const outcome = outcomes[id];
  if ((running || settled) && outcome !== undefined) {
    switch (outcome.kind) {
      case 'done':
        return { glyph: 'present', mono: `Installed · ${short ?? outcome.version}`, bar: null };
      case 'failed':
        return { glyph: 'fail', mono: outcome.message, bar: null };
    }
  }
  switch (entry.state) {
    case 'present':
      return { glyph: 'present', mono: `Installed · ${short ?? entry.detail}`, bar: null };
    case 'unavailable':
      return { glyph: 'alert', mono: entry.detail, bar: null };
    case 'install':
      if (running) {
        return { glyph: 'install', mono: 'Waiting', bar: null };
      }
      if (id === 'adb' && !termsAccepted) {
        return { glyph: 'alert', mono: 'Accept the terms to install', bar: null };
      }
      return {
        glyph: 'install',
        mono: entry.method === 'homebrew' ? 'Will install with Homebrew' : 'Will download',
        bar: null,
      };
  }
}

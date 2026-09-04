import type { DoctorPlan, DoctorReport, DoctorState } from '@shared/ipc';
import { describe, expect, it } from 'vitest';
import { setupRows, TOOL_DISPLAY_NAMES, type ToolOutcome } from './setup-rows';

/**
 * The four rows of the installer (criteria 35, 39): what each reads and
 * which glyph it carries, derived from the plan, the install in flight, the
 * outcomes so far and the report. Pure — the view only lays it out.
 */

const PLAN: DoctorPlan = {
  tools: [
    { id: 'java', state: 'present', method: null, detail: 'openjdk version "21.0.4" · /jdk' },
    { id: 'maestro', state: 'install', method: 'direct', detail: 'Will download' },
    { id: 'gh', state: 'install', method: 'homebrew', detail: 'Will install with Homebrew' },
    { id: 'adb', state: 'install', method: 'direct', detail: 'Will download' },
  ],
  homebrew: '/opt/homebrew/bin/brew',
  androidTermsRequired: true,
  profile: '~/.zprofile',
};

const REPORT: DoctorReport = {
  rows: [
    {
      id: 'java',
      name: 'Java Development Kit',
      status: 'ok',
      label: 'Ready',
      detail: 'x',
      short: 'java 21.0.4',
    },
    {
      id: 'maestro',
      name: 'Maestro',
      status: 'fail',
      label: 'Not installed',
      detail: 'x',
      short: 'not installed',
    },
    {
      id: 'gh',
      name: 'GitHub CLI',
      status: 'ok',
      label: 'Installed',
      detail: 'x',
      short: 'gh 2.100.0',
    },
  ],
  checkedAt: 0,
  issues: 1,
};

const NONE: Partial<Record<'java' | 'maestro' | 'gh' | 'adb', ToolOutcome>> = {};

function rows(
  plan: DoctorPlan | null,
  install: DoctorState['install'] = null,
  outcomes = NONE,
  termsAccepted = true,
) {
  return setupRows({ plan, install, outcomes, report: REPORT, termsAccepted }).map((row) => [
    row.id,
    row.glyph,
    row.mono,
  ]);
}

describe('setupRows', () => {
  it('names the four tools as the plan screen does', () => {
    expect(TOOL_DISPLAY_NAMES).toEqual({
      java: 'Zulu JDK 21',
      maestro: 'Maestro',
      gh: 'GitHub CLI',
      adb: 'Android platform-tools',
    });
  });

  it('reads Checking on every row before the plan lands', () => {
    expect(rows(null)).toEqual([
      ['java', 'install', 'Checking…'],
      ['maestro', 'install', 'Checking…'],
      ['gh', 'install', 'Checking…'],
      ['adb', 'install', 'Checking…'],
    ]);
  });

  /** Criterion 35 — the plan screen: Installed with the doctor's short,
   * the method for the rest. */
  it('reads the plan: Installed with the short, Will install with Homebrew, Will download', () => {
    expect(rows(PLAN)).toEqual([
      ['java', 'present', 'Installed · java 21.0.4'],
      ['maestro', 'install', 'Will download'],
      ['gh', 'install', 'Will install with Homebrew'],
      ['adb', 'install', 'Will download'],
    ]);
  });

  /** Criterion 37 — unchecked terms show on the adb row. */
  it('reads the adb row as skipped while the terms are unchecked', () => {
    expect(rows(PLAN, null, NONE, false).at(-1)).toEqual([
      'adb',
      'alert',
      'Skipped — accept the terms to install',
    ]);
  });

  it('reads Not available on Intel Macs and Skipped from the plan', () => {
    const plan: DoctorPlan = {
      ...PLAN,
      tools: [
        { id: 'java', state: 'unavailable', method: null, detail: 'Not available on Intel Macs' },
        { id: 'maestro', state: 'install', method: 'direct', detail: 'Will download' },
        { id: 'gh', state: 'unavailable', method: null, detail: 'Not available on Intel Macs' },
        {
          id: 'adb',
          state: 'skipped',
          method: 'direct',
          detail: 'Accept the Android SDK terms to install',
        },
      ],
      androidTermsRequired: false,
    };
    expect(rows(plan)).toEqual([
      ['java', 'alert', 'Not available on Intel Macs'],
      ['maestro', 'install', 'Will download'],
      ['gh', 'alert', 'Not available on Intel Macs'],
      ['adb', 'alert', 'Skipped'],
    ]);
  });

  /** Criterion 39 — the progress screen: the active row's step and pct,
   * settled rows Installed, waiting rows Waiting, a failed row its sentence. */
  it('reads the install in flight: done, active with its step, waiting', () => {
    const result = setupRows({
      plan: PLAN,
      install: {
        installId: 'install-1',
        tool: 'gh',
        pct: null,
        step: 'Installing gh with Homebrew',
      },
      outcomes: { maestro: { kind: 'done', version: '2.10.0' } },
      report: REPORT,
      termsAccepted: true,
    });

    expect(result.map((row) => [row.id, row.glyph, row.mono])).toEqual([
      ['java', 'present', 'Installed · java 21.0.4'],
      ['maestro', 'present', 'Installed · 2.10.0'],
      ['gh', 'active', 'Installing gh with Homebrew'],
      ['adb', 'install', 'Waiting'],
    ]);
    expect(result[2]?.bar).toEqual({ pct: null });
    expect(result[3]?.bar).toBeNull();
  });

  it('reads a download with its percentage, and a failure with its sentence', () => {
    const result = setupRows({
      plan: PLAN,
      install: {
        installId: 'install-1',
        tool: 'adb',
        pct: 43,
        step: 'Downloading Android platform-tools',
      },
      outcomes: {
        maestro: { kind: 'done', version: '2.10.0' },
        gh: {
          kind: 'failed',
          code: 'doctor/brew-failed',
          message: "Homebrew couldn't install the GitHub CLI.",
          detail: 'Error: x',
        },
      },
      report: REPORT,
      termsAccepted: true,
    });

    expect(result.map((row) => [row.id, row.glyph, row.mono])).toEqual([
      ['java', 'present', 'Installed · java 21.0.4'],
      ['maestro', 'present', 'Installed · 2.10.0'],
      ['gh', 'fail', "Homebrew couldn't install the GitHub CLI."],
      ['adb', 'active', 'Downloading Android platform-tools · 43%'],
    ]);
    expect(result[3]?.bar).toEqual({ pct: 43 });
  });

  it('prefers the doctor short once the row rechecked, and reads skipped and settled outcomes', () => {
    const result = setupRows({
      plan: PLAN,
      install: { installId: 'install-1', failed: {} },
      outcomes: {
        maestro: { kind: 'done', version: '2.10.0' },
        gh: { kind: 'done', version: 'brew' },
        adb: { kind: 'skipped', detail: 'Accept the Android SDK terms to install' },
      },
      report: REPORT,
      termsAccepted: false,
    });

    expect(result.map((row) => [row.id, row.glyph, row.mono])).toEqual([
      ['java', 'present', 'Installed · java 21.0.4'],
      ['maestro', 'present', 'Installed · 2.10.0'],
      ['gh', 'present', 'Installed · gh 2.100.0'],
      ['adb', 'alert', 'Skipped'],
    ]);
  });
});

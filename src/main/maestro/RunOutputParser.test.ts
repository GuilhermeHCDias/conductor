import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { type ParsedStep, RunOutputParser } from './RunOutputParser';

/**
 * Fixture-driven, per the spec's own test plan: `maestro-test.capture.json` is
 * not a hand-written sample — it is real `maestro test` output captured on the
 * reference device (2026-08-05, maestro 2.8.0, non-TTY), chunk boundaries
 * included. The boundaries are the point: a step's label arrives as a partial
 * line ending in `...` the moment the step starts, and the verdict arrives
 * minutes later on the same line — so the parser is tested against exactly the
 * chunking the pipe produced, plus adversarial re-chunkings of it.
 */

type Scenario = {
  readonly stdout: readonly string[];
  readonly stderr: readonly string[];
  readonly exitCode: number;
};

const CAPTURE = JSON.parse(
  readFileSync(resolve('src/main/maestro/maestro-test.capture.json'), 'utf8'),
) as { readonly scenarios: Record<string, Scenario> };

function scenario(name: string): Scenario {
  const found = CAPTURE.scenarios[name];
  if (found === undefined) {
    throw new Error(`The capture carries no scenario named ${name}.`);
  }
  return found;
}

/** Feeds every chunk, then flushes — the way the run's exit path will. */
function feed(chunks: readonly string[]): { steps: ParsedStep[]; lines: string[] } {
  const parser = new RunOutputParser();
  const steps: ParsedStep[] = [];
  const lines: string[] = [];
  for (const chunk of chunks) {
    const out = parser.push(chunk);
    steps.push(...out.steps);
    lines.push(...out.lines);
  }
  const rest = parser.flush();
  steps.push(...rest.steps);
  lines.push(...rest.lines);
  return { steps, lines };
}

describe('the happy capture', () => {
  const { steps, lines } = feed(scenario('happy').stdout);

  /** Criterion 6 — a started event the moment the label's partial line lands,
   * and the verdict when Maestro appends it. */
  it('reports each step starting and passing, labelled as Maestro printed it', () => {
    expect(steps).toEqual([
      { type: 'step-started', label: 'Launch app "com.android.settings"' },
      { type: 'step-passed', label: 'Launch app "com.android.settings"' },
      { type: 'step-started', label: 'Swipe from (50%, 60%) to (50%, 40%) in 400 ms' },
      { type: 'step-passed', label: 'Swipe from (50%, 60%) to (50%, 40%) in 400 ms' },
      { type: 'step-started', label: 'Press back' },
      { type: 'step-passed', label: 'Press back' },
    ]);
  });

  /** Criterion 8 — everything is a log line, the prologue included, verbatim
   * and in order. */
  it('passes every line through as log, prologue included', () => {
    expect(lines).toEqual([
      'Running on R9QYC01EMXL',
      ' > Flow happy',
      'Launch app "com.android.settings"... COMPLETED',
      'Swipe from (50%, 60%) to (50%, 40%) in 400 ms... COMPLETED',
      'Press back... COMPLETED',
    ]);
  });
});

describe('the failing capture', () => {
  const { steps, lines } = feed(scenario('failing').stdout);

  it('reports the failing step as failed', () => {
    expect(steps.at(-1)).toEqual({
      type: 'step-failed',
      label: 'Assert that "Conductor fixture text that never exists 94713" is visible',
    });
    expect(steps.filter((step) => step.type === 'step-failed')).toHaveLength(1);
  });

  /** The assertion explanation is prose the parser has never seen — it crosses
   * untouched, empty lines included, never as an event and never as a crash. */
  it('passes the explanation and the debug banner through as plain lines', () => {
    expect(lines).toContain(
      'Assertion is false: "Conductor fixture text that never exists 94713" is visible',
    );
    expect(lines).toContain('Possible causes:');
    expect(lines).toContain('==== Debug output (logs & screenshots) ====');
    expect(steps.filter((step) => step.type === 'step-passed')).toHaveLength(1);
  });
});

describe('the canceled capture', () => {
  it('leaves the mid-flight step started, and flush surfaces its partial line', () => {
    const parser = new RunOutputParser();
    const steps: ParsedStep[] = [];
    for (const chunk of scenario('canceled').stdout) {
      steps.push(...parser.push(chunk).steps);
    }

    expect(steps.at(-1)).toEqual({
      type: 'step-started',
      label: 'Assert that "Conductor fixture text that never exists 94713" is visible',
    });

    const rest = parser.flush();
    expect(rest.lines).toEqual([
      'Assert that "Conductor fixture text that never exists 94713" is visible...',
    ]);
    expect(parser.flush()).toEqual({ steps: [], lines: [] });
  });
});

describe('the error captures', () => {
  /** Syntax errors produce no steps at all — stderr is plain log, and the
   * verdict belongs to the exit code, not to this parser (criterion 7). */
  it.each(['syntaxError', 'unknownProperty', 'unknownDevice'] as const)(
    'passes %s stderr through as log with no step events',
    (name) => {
      const { steps, lines } = feed(scenario(name).stderr);

      expect(steps).toEqual([]);
      expect(lines).toHaveLength(1);
    },
  );
});

describe('chunking', () => {
  /** The pipe owes the parser nothing: the same bytes in 3-byte pieces must
   * mean the same run. */
  it('reports the same steps and lines however the bytes are split', () => {
    const whole = scenario('failing').stdout.join('');
    const pieces: string[] = [];
    for (let at = 0; at < whole.length; at += 3) {
      pieces.push(whole.slice(at, at + 3));
    }

    expect(feed(pieces)).toEqual(feed(scenario('failing').stdout));
  });

  /** A whole step line arriving in one chunk still tells the start before the
   * verdict — downstream always sees the pair in order. */
  it('synthesizes the start when a completed line arrives all at once', () => {
    const { steps } = feed(['Tap on "Login"... COMPLETED\n']);

    expect(steps).toEqual([
      { type: 'step-started', label: 'Tap on "Login"' },
      { type: 'step-passed', label: 'Tap on "Login"' },
    ]);
  });

  it('does not report the same start twice as the line completes', () => {
    const { steps } = feed(['Tap on "Login"...', ' COMPLETED\n']);

    expect(steps).toEqual([
      { type: 'step-started', label: 'Tap on "Login"' },
      { type: 'step-passed', label: 'Tap on "Login"' },
    ]);
  });

  /** A label that itself contains an ellipsis keeps it — only the final marker
   * is the marker. */
  it('keeps an ellipsis inside the label', () => {
    const { steps } = feed(['Assert that "Loading..." is visible... COMPLETED\n']);

    expect(steps).toEqual([
      { type: 'step-started', label: 'Assert that "Loading..." is visible' },
      { type: 'step-passed', label: 'Assert that "Loading..." is visible' },
    ]);
  });
});

describe('defensive parsing', () => {
  /** The CLI is spawned non-TTY, so escapes should never appear — but a stray
   * one must not corrupt a label or a log line (spec constraint). */
  it('strips ANSI escapes before parsing and display', () => {
    const { steps, lines } = feed(['\u001B[32mPress back...\u001B[0m COMPLETED\n']);

    expect(steps).toEqual([
      { type: 'step-started', label: 'Press back' },
      { type: 'step-passed', label: 'Press back' },
    ]);
    expect(lines).toEqual(['Press back... COMPLETED']);
  });

  it('strips an escape split across two chunks', () => {
    const { lines } = feed(['\u001B[3', '2mPress back... COMPLETED\n']);

    expect(lines).toEqual(['Press back... COMPLETED']);
  });

  it('detects a step start behind a trailing escape', () => {
    const { steps } = feed(['Press back...\u001B[0m']);

    expect(steps).toEqual([{ type: 'step-started', label: 'Press back' }]);
  });

  it('drops the carriage return of a CRLF line', () => {
    const { lines } = feed(['Press back... COMPLETED\r\n']);

    expect(lines).toEqual(['Press back... COMPLETED']);
  });

  /** Criterion 8's degradation path: a verdict the vocabulary does not know is
   * a plain line — the step it might close stays open, and the terminal event
   * (exit-derived) is what settles the run. */
  it('passes an unknown verdict through without inventing a completion', () => {
    const { steps, lines } = feed(['Tap on "x"...', ' SKIPPED\n']);

    expect(steps).toEqual([{ type: 'step-started', label: 'Tap on "x"' }]);
    expect(lines).toEqual(['Tap on "x"... SKIPPED']);
  });

  /** A flush can hold a whole verdict when the child died between the write
   * and the newline — the verdict still counts. */
  it('parses a final unterminated line on flush', () => {
    const parser = new RunOutputParser();
    parser.push('Tap on "Login"...');
    parser.push(' COMPLETED');

    expect(parser.flush()).toEqual({
      steps: [{ type: 'step-passed', label: 'Tap on "Login"' }],
      lines: ['Tap on "Login"... COMPLETED'],
    });
  });
});

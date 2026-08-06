/**
 * Turns `maestro test`'s non-TTY sequential output into best-effort step
 * events, line by line. Pure — no I/O, no Electron (§9.2) — and fixture-driven:
 * everything it recognises was captured from the real CLI on the reference
 * device (`maestro-test.capture.json`).
 *
 * The captured shape it reads: a step's label arrives as a partial line ending
 * in `...` the moment the step starts, and ` COMPLETED` / ` FAILED` plus the
 * newline arrive only when the step settles — so starts are detected on the
 * *partial* buffer, not just on complete lines.
 *
 * Best-effort is the contract (criterion 8): a line it does not recognise is a
 * plain log line, never a crash and never a stall — and the run's verdict never
 * comes from here at all. The outcome belongs to the process exit (criterion
 * 7); these events only decorate the wait.
 */

export type ParsedStep =
  | { readonly type: 'step-started'; readonly label: string }
  | { readonly type: 'step-passed'; readonly label: string }
  | { readonly type: 'step-failed'; readonly label: string };

export type ParsedOutput = {
  readonly steps: readonly ParsedStep[];
  readonly lines: readonly string[];
};

/**
 * `<label>... COMPLETED` / `<label>... FAILED`, as the capture shows them. The
 * group is greedy on purpose: a label may itself contain an ellipsis
 * (`Assert that "Loading..." is visible`), and only the final marker is the
 * marker. Any other verdict word — the CLI has more states than the capture
 * exercised — falls through as a plain line, and the step it would have closed
 * is settled by the terminal event instead.
 */
const STEP_VERDICT = /^(.*)\.\.\. (COMPLETED|FAILED)\s*$/;

export class RunOutputParser {
  /**
   * The line still being written, raw. Kept unstripped so an ANSI escape split
   * across two chunks reassembles here before `stripAnsi` ever sees it.
   */
  private partial = '';
  /** True once the current line already produced its `step-started` — the
   * verdict arriving later must not start the step twice. */
  private startedOpen = false;

  push(chunk: string): ParsedOutput {
    const steps: ParsedStep[] = [];
    const lines: string[] = [];

    this.partial += chunk;
    let newline = this.partial.indexOf('\n');
    while (newline !== -1) {
      const raw = this.partial.slice(0, newline);
      this.partial = this.partial.slice(newline + 1);
      this.settleLine(raw, steps, lines);
      newline = this.partial.indexOf('\n');
    }

    // The start of a step is a line that does not exist yet: `<label>...` with
    // the verdict still minutes away. Detected here, on the partial, so the
    // panel shows the step running while Maestro works on it.
    const pending = stripAnsi(this.partial);
    if (!this.startedOpen && pending.length > 3 && pending.endsWith('...')) {
      steps.push({ type: 'step-started', label: pending.slice(0, -3) });
      this.startedOpen = true;
    }

    return { steps, lines };
  }

  /** The end of the stream. A final unterminated line still counts — the child
   * can die between the write and the newline. */
  flush(): ParsedOutput {
    if (this.partial === '') {
      return { steps: [], lines: [] };
    }
    const steps: ParsedStep[] = [];
    const lines: string[] = [];
    const raw = this.partial;
    this.partial = '';
    this.settleLine(raw, steps, lines);
    return { steps, lines };
  }

  /** One complete line: logged verbatim (post-strip), and read for a verdict. */
  private settleLine(raw: string, steps: ParsedStep[], lines: string[]): void {
    const line = stripAnsi(raw.endsWith('\r') ? raw.slice(0, -1) : raw);
    lines.push(line);

    const verdict = STEP_VERDICT.exec(line);
    if (verdict !== null) {
      const label = verdict[1] ?? '';
      // A whole line can arrive in one chunk; downstream still deserves the
      // start before the verdict, so it is synthesised when never seen.
      if (!this.startedOpen) {
        steps.push({ type: 'step-started', label });
      }
      steps.push({
        type: verdict[2] === 'COMPLETED' ? 'step-passed' : 'step-failed',
        label,
      });
    }
    this.startedOpen = false;
  }
}

const ESCAPE = 0x1b;
const BELL = 0x07;

/**
 * Defensive only — the CLI is spawned non-TTY and the capture carries no
 * escape — but a stray CSI or OSC sequence must not corrupt a label or a log
 * line. A hand scanner rather than a regex: the control characters involved
 * are exactly what `noControlCharactersInRegex` exists to keep out of one.
 * An escape truncated by the end of the text is dropped; the raw buffer above
 * still holds it, so it is stripped whole once the rest arrives.
 */
function stripAnsi(text: string): string {
  if (!text.includes(String.fromCharCode(ESCAPE))) {
    return text;
  }

  let out = '';
  let at = 0;
  while (at < text.length) {
    if (text.charCodeAt(at) !== ESCAPE) {
      out += text[at];
      at += 1;
      continue;
    }
    const kind = text[at + 1];
    if (kind === '[') {
      // CSI: parameter bytes until a final byte in @–~.
      at += 2;
      while (at < text.length && (text.charCodeAt(at) < 0x40 || text.charCodeAt(at) > 0x7e)) {
        at += 1;
      }
      at += 1;
    } else if (kind === ']') {
      // OSC: swallowed until BEL or the next escape (of ST), inclusive.
      at += 2;
      while (at < text.length && text.charCodeAt(at) !== BELL && text.charCodeAt(at) !== ESCAPE) {
        at += 1;
      }
      at += text.charCodeAt(at) === ESCAPE ? 2 : 1;
    } else {
      // A two-character escape, or a lone trailing ESC.
      at += 2;
    }
  }
  return out;
}

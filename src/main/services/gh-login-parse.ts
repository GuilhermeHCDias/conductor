/**
 * What `gh auth login --web` prints, read for the two facts the sign-in step
 * shows (criteria 29, 31). The token never appears in this output and is
 * never looked for (§9.0); the code is shown once and never stored.
 */

/** The one URL the sign-in ever opens (criterion 30). */
export const GH_DEVICE_URL = 'https://github.com/login/device';

/** `! First copy your one-time code: 1234-ABCD` — the spec's regex. */
export function parseLoginCode(text: string): string | null {
  const match = /one-time code:\s+([A-Z0-9]{4}-[A-Z0-9]{4})/.exec(text);
  return match?.[1] ?? null;
}

/** `✓ Logged in as <account>` at the end of the flow, or `gh auth status`'s
 * `Logged in to github.com account <account>`. */
export function parseLoginAccount(text: string): string | null {
  const match = /Logged in (?:as|to \S+ account)\s+(\S+)/.exec(text);
  return match?.[1] ?? null;
}

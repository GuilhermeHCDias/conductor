/**
 * §7.1 — the folder is the contract, but not every file in it is a flow.
 * These are the classification rules the index applies, extracted pure so
 * every consumer counts the same way: the `FlowService` index and the repo
 * resolver's flow count must never disagree about what a flow is.
 */

/** §7.1 — a flow is classified by its header: an `appId:` line before the
 * `---` separator. What fails the test is not a flow, and is never touched. */
export function flowBody(content: string): string | null {
  const lines = content.split('\n');
  const separator = lines.findIndex((line) => line.trim() === '---');
  if (separator === -1) {
    return null;
  }
  if (!lines.slice(0, separator).some((line) => line.startsWith('appId:'))) {
    return null;
  }
  return lines.slice(separator + 1).join('\n');
}

/** Top-level `- ` lines after the separator: the commands, and never a header
 * list like `tags:`. */
export function countCommands(body: string): number {
  return body.split('\n').filter((line) => line.startsWith('- ')).length;
}

/** The extension as the file actually wears it — case preserved; `''` when
 * the name wears none of the given extensions. */
export function flowExtensionOf(name: string, extensions: readonly string[]): string {
  const lower = name.toLowerCase();
  for (const extension of extensions) {
    if (lower.endsWith(extension)) {
      return name.slice(name.length - extension.length);
    }
  }
  return '';
}

export function hasFlowExtension(name: string, extensions: readonly string[]): boolean {
  return flowExtensionOf(name, extensions) !== '';
}

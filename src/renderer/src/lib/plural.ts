/**
 * Counted nouns for the window's chrome. The chrome is English (§8.0), and
 * every noun it counts so far is a regular plural, so one `s` is the whole
 * rule — when an irregular one arrives it gets an explicit plural argument,
 * not a lookup table built before anything needs it.
 */
export function counted(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

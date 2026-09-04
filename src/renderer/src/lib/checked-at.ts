/**
 * The doctor sheet's header time (criterion 26): `checked 9:12 am`, in local
 * time, the kit's way — no leading zero, lowercase meridiem — and
 * `checking…` before the first report has landed.
 */
const FORMAT = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

export function checkedAtLabel(checkedAt: number | null): string {
  if (checkedAt === null) {
    return 'checking…';
  }
  // Some ICU builds put a narrow no-break space before AM/PM.
  const time = FORMAT.format(new Date(checkedAt))
    .replace(/[\s ]+/g, ' ')
    .toLowerCase();
  return `checked ${time}`;
}

import { describe, expect, it } from 'vitest';
import { checkedAtLabel } from './checked-at';

/** Doctor criterion 26 — the sheet's header time, in local time, the kit's
 * way (`checked 9:12 am`); `checking…` before the first report. */
describe('checkedAtLabel', () => {
  it('reads checking… before any report', () => {
    expect(checkedAtLabel(null)).toBe('checking…');
  });

  it('formats a morning time without a leading zero, lowercase am', () => {
    expect(checkedAtLabel(new Date(2026, 8, 3, 9, 12).getTime())).toBe('checked 9:12 am');
  });

  it('formats an evening time on the 12-hour clock', () => {
    expect(checkedAtLabel(new Date(2026, 8, 3, 21, 5).getTime())).toBe('checked 9:05 pm');
  });

  it('formats midnight and noon', () => {
    expect(checkedAtLabel(new Date(2026, 8, 3, 0, 0).getTime())).toBe('checked 12:00 am');
    expect(checkedAtLabel(new Date(2026, 8, 3, 12, 30).getTime())).toBe('checked 12:30 pm');
  });
});

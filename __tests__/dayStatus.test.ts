import { canChangeDayStatus, expandAbsenceRange } from '../src/lib/rules/dayStatus';
import { addDays, daysBetween } from '../src/lib/util/dates';

describe('day status rules', () => {
  it('allows changes until the bus alarmed or picked the student up', () => {
    expect(canChangeDayStatus(null)).toBe(true);
    expect(canChangeDayStatus('PENDING')).toBe(true);
    expect(canChangeDayStatus('ABSENT')).toBe(true);
    expect(canChangeDayStatus('SKIPPED')).toBe(true);
    expect(canChangeDayStatus('ALARMED')).toBe(false);
    expect(canChangeDayStatus('ACKNOWLEDGED')).toBe(false);
    expect(canChangeDayStatus('BOARDED')).toBe(false);
    expect(canChangeDayStatus('DROPPED')).toBe(false);
  });

  it('expands an absence range into one record per day', () => {
    expect(expandAbsenceRange('2026-10-16', null)).toEqual(['2026-10-16']);
    expect(expandAbsenceRange('2026-10-16', '2026-10-15')).toEqual(['2026-10-16']); // until before from → single day
    expect(expandAbsenceRange('2026-10-16', '2026-10-19')).toEqual(['2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19']);
    expect(expandAbsenceRange('2026-10-29', '2026-11-02')).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
  });

  it('caps very long ranges at 31 days', () => {
    expect(expandAbsenceRange('2026-01-01', '2026-12-31')).toHaveLength(31);
  });

  it('date helpers handle month boundaries', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    expect(daysBetween('2026-03-30', '2026-04-01')).toEqual(['2026-03-30', '2026-03-31', '2026-04-01']);
  });
});

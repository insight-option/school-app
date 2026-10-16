import type { StopStatus } from '../data/client';
import { daysBetween } from '../util/dates';

/** Day-status business rules (pure, unit-tested). */
export const LOCKED_STOP_STATUSES: StopStatus[] = ['ALARMED', 'ACKNOWLEDGED', 'BOARDED', 'DROPPED'];

/** A student may change today's status until the bus has alarmed / picked them up. */
export function canChangeDayStatus(todayStopStatus: StopStatus | null | undefined): boolean {
  if (!todayStopStatus) return true;
  return !LOCKED_STOP_STATUSES.includes(todayStopStatus);
}

/** "Absent until Thursday" → one record per day (capped at 31 days). */
export function expandAbsenceRange(fromYmd: string, untilYmd?: string | null): string[] {
  if (!untilYmd || untilYmd < fromYmd) return [fromYmd];
  return daysBetween(fromYmd, untilYmd).slice(0, 31);
}

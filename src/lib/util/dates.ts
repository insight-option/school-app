/** Pure date helpers (no i18n / platform imports so they can be unit-tested and shared). */

/** YYYY-MM-DD in the given IANA timezone (defaults to device). */
export function todayIn(timeZone?: string | null, date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timeZone || undefined, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromYmd: string, toYmd: string): string[] {
  const out: string[] = [];
  let cur = fromYmd;
  for (let i = 0; i < 60 && cur <= toYmd; i++) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

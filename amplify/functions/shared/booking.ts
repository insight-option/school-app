/**
 * Booking rules shared by the platform Lambda and the app (pure – no AWS imports).
 *
 * Opening hours are stored per weekday ("0" = Sunday … "6" = Saturday, Qatar time) as a list of
 * [open, close] "HH:mm" ranges. A range that closes at or before it opens runs past midnight
 * (e.g. ["16:00", "02:00"]); slots after midnight still belong to the opening day.
 */

export type OpeningHours = Record<string, [string, string][]>;
export type PriceMode = 'PER_HOUR' | 'PER_SESSION' | 'PER_PERSON' | 'ON_REQUEST' | 'FREE';

export const QATAR_UTC_OFFSET_MINUTES = 180; // Asia/Qatar, no daylight saving
export const DEFAULT_SLOT_MINUTES = 60;
export const WEEKDAYS = ['0', '1', '2', '3', '4', '5', '6'] as const;
/**
 * Slot locks are written per quarter hour of real (wall-clock) time, independent of the venue's
 * slot length: changing the slot grid or the opening hours later can never let two bookings of
 * the same court overlap. Opening hours and slot lengths are therefore kept on the 15-minute grid.
 */
export const LOCK_MINUTES = 15;

const HHMM = /^(?:([01]\d|2[0-3]):([0-5]\d)|(24):(00))$/;

export function toMinutes(hhmm: string): number {
  const m = HHMM.exec((hhmm ?? '').trim());
  if (!m) return NaN;
  return m[3] ? 1440 : Number(m[1]) * 60 + Number(m[2]);
}

/** "HH:mm" on the quarter-hour grid (what the hours editor offers). */
export const isQuarterHour = (hhmm: string) => {
  const m = toMinutes(hhmm);
  return !isNaN(m) && m % LOCK_MINUTES === 0;
};

/** Minutes after midnight → "HH:mm" (wraps after 24:00, e.g. 1500 → "01:00"). */
export function fromMinutes(total: number): string {
  const m = ((total % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** Accepts the stored JSON (object or string); drops malformed ranges. */
export function parseHours(raw: unknown): OpeningHours {
  let v: unknown = raw;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      return {};
    }
  }
  const out: OpeningHours = {};
  if (!v || typeof v !== 'object') return out;
  for (const day of WEEKDAYS) {
    const ranges = (v as Record<string, unknown>)[day];
    if (!Array.isArray(ranges)) continue;
    const ok = ranges.filter(
      (r): r is [string, string] => Array.isArray(r) && r.length === 2 && typeof r[0] === 'string' && typeof r[1] === 'string' && !isNaN(toMinutes(r[0])) && !isNaN(toMinutes(r[1])),
    );
    if (ok.length) out[day] = ok.map(([a, b]) => [a, b]);
  }
  return out;
}

/** Weekday of a YYYY-MM-DD date (0 = Sunday). */
export function weekdayOf(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** Open intervals of a day in minutes after midnight (`end` may exceed 1440 for overnight ranges). */
export function dayIntervals(hours: OpeningHours, date: string): { start: number; end: number }[] {
  const ranges = hours[String(weekdayOf(date))] ?? [];
  return ranges
    .map(([a, b]) => {
      const start = toMinutes(a);
      let end = toMinutes(b);
      if (end <= start) end += 1440;
      return { start, end };
    })
    .sort((x, y) => x.start - y.start);
}

const A_SUNDAY = '2026-11-01'; // any Sunday – dayIntervals() works on dates

/** Why opening hours cannot be saved (null = fine): HH:mm on the quarter-hour grid, no overlapping ranges in a day. */
export function hoursProblem(hours: OpeningHours): string | null {
  for (const day of WEEKDAYS) {
    for (const [a, b] of hours[day] ?? []) {
      if (isNaN(toMinutes(a)) || isNaN(toMinutes(b)) || a === b) return 'Opening hours must be HH:mm – HH:mm';
      if (!isQuarterHour(a) || !isQuarterHour(b)) return 'Opening hours must be on the quarter hour (:00, :15, :30, :45)';
    }
    const ivs = dayIntervals(hours, addDays(A_SUNDAY, Number(day)));
    for (let i = 1; i < ivs.length; i++) if (ivs[i].start < ivs[i - 1].end) return 'Opening hours of one day must not overlap';
  }
  return null;
}

/** Bookable slot starts of a day. */
export function daySlots(hours: OpeningHours, date: string, slotMinutes: number): { start: number; end: number }[] {
  const step = slotMinutes > 0 ? slotMinutes : DEFAULT_SLOT_MINUTES;
  const out: { start: number; end: number }[] = [];
  for (const iv of dayIntervals(hours, date)) {
    for (let t = iv.start; t + step <= iv.end; t += step) out.push({ start: t, end: t + step });
  }
  return out;
}

/** True when [start, start + duration) is inside one open interval and aligned to the slot grid. */
export function windowIsOpen(hours: OpeningHours, date: string, start: number, duration: number, slotMinutes: number): boolean {
  if (duration <= 0 || duration % slotMinutes !== 0) return false;
  return dayIntervals(hours, date).some((iv) => start >= iv.start && start + duration <= iv.end && (start - iv.start) % slotMinutes === 0);
}

/**
 * Lock keys a booking occupies on one unit: `date#mmmm#unit` for every quarter hour, where date and
 * minute are the real calendar time (an overnight slot at 01:00 of Sunday's hours locks Monday 0060),
 * so overlapping hours of two days still share the same locks.
 */
export function slotKeys(date: string, start: number, duration: number, unit: number): string[] {
  const keys: string[] = [];
  for (let t = start; t < start + duration; t += LOCK_MINUTES) {
    const day = Math.floor(t / 1440);
    const minute = t - day * 1440;
    keys.push(`${day ? addDays(date, day) : date}#${String(minute).padStart(4, '0')}#${unit}`);
  }
  return keys;
}

/** Calendar dates whose lock rows a booking window touches (the booking date, plus the next day when it runs past midnight). */
export function lockDates(date: string, start: number, duration: number): string[] {
  const last = Math.floor((start + Math.max(duration, 1) - 1) / 1440);
  return Array.from({ length: last + 1 }, (_, i) => (i ? addDays(date, i) : date));
}

/** Parses a slot key back into its start minute and unit. */
export function parseSlotKey(key: string): { date: string; start: number; unit: number } | null {
  const [date, start, unit] = key.split('#');
  if (!date || start === undefined || unit === undefined) return null;
  return { date, start: Number(start), unit: Number(unit) };
}

/** Price of a booking; null when the venue shows no price ("on request"). */
export function bookingPrice(mode: PriceMode | null | undefined, price: number | null | undefined, durationMinutes: number, people = 1): number | null {
  if (mode === 'FREE') return 0;
  if (mode === 'ON_REQUEST' || price == null || !isFinite(price)) return null;
  switch (mode) {
    case 'PER_HOUR':
      return round2((price * durationMinutes) / 60);
    case 'PER_PERSON':
      return round2(price * Math.max(1, people));
    case 'PER_SESSION':
    default:
      return round2(price);
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Current date (YYYY-MM-DD) and minute of day in Qatar. */
export function qatarNow(now: number = Date.now()): { date: string; minutes: number } {
  const d = new Date(now + QATAR_UTC_OFFSET_MINUTES * 60_000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Minutes from a booking-day minute (may exceed 1440 for overnight slots) to `now` – negative before, ≥ 0 after. */
export function minutesSince(date: string, minute: number, now: { date: string; minutes: number }): number {
  const days = Math.round((Date.parse(`${now.date}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) / 86_400_000);
  return days * 1440 + now.minutes - minute;
}

/** End minute of a booking on its booking day (overnight bookings end after 1440). */
export function bookingEndMinute(startTime: string, endTime: string): number {
  const s = toMinutes(startTime);
  const e = toMinutes(endTime);
  return e <= s ? e + 1440 : e;
}

/** Milliseconds until a booking starts (Qatar time). */
export function msUntil(date: string, start: number, now: number = Date.now()): number {
  const startUtc = Date.parse(`${date}T00:00:00Z`) + (start - QATAR_UTC_OFFSET_MINUTES) * 60_000;
  return startUtc - now;
}

/** True when the venue is open right now (for the "Open now" badge). */
export function isOpenNow(hours: OpeningHours, now: number = Date.now()): boolean {
  const { date, minutes } = qatarNow(now);
  if (dayIntervals(hours, date).some((iv) => minutes >= iv.start && minutes < iv.end)) return true;
  // still inside yesterday's overnight range?
  return dayIntervals(hours, addDays(date, -1)).some((iv) => iv.end > 1440 && minutes + 1440 < iv.end);
}

/** Booking reference shown to customers, e.g. BK-7K3Q9X (no ambiguous characters). */
export function newBookingReference(randomBytes: (n: number) => Uint8Array): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(6);
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return `BK-${out}`;
}

/** `biz-` + 10 random chars – also the name of the business's Cognito admin group. */
export function newBusinessId(randomBytes: (n: number) => Uint8Array): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return `biz-${out}`;
}

export function isValidBusinessId(id: string | null | undefined): boolean {
  return !!id && /^biz-[a-z0-9]{10}$/.test(id);
}

/** Tenant id of a customer account (`custom:schoolId`), unique per user so it never grants shared reads. */
export const customerTenantId = (sub: string) => `cus-${sub}`;

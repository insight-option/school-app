/** Time zones offered in school settings and the set-up wizard (school day, trip dates). */
export const TIMEZONES = [
  'Asia/Qatar',
  'Asia/Riyadh',
  'Asia/Dubai',
  'Asia/Kuwait',
  'Asia/Bahrain',
  'Asia/Muscat',
  'Asia/Amman',
  'Asia/Baghdad',
  'Asia/Beirut',
  'Africa/Cairo',
  'Africa/Casablanca',
  'Europe/Istanbul',
  'Europe/London',
  'Asia/Karachi',
  'Asia/Kolkata',
  'UTC',
] as const;

/** The device's time zone when we offer it, otherwise Qatar. */
export function defaultTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz && (TIMEZONES as readonly string[]).includes(tz)) return tz;
  } catch {
    // Intl without time zone support
  }
  return 'Asia/Qatar';
}

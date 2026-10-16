import i18n from '../i18n';
import { addDays, todayIn } from './dates';

export { addDays, daysBetween, todayIn } from './dates';

const locale = () => (i18n.language === 'ar' ? 'ar' : 'en');

export function formatTime(iso: string | null | undefined, timeZone?: string | null): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', timeZone: timeZone || undefined }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

export function formatDate(isoOrYmd: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  if (!isoOrYmd) return '—';
  const d = isoOrYmd.length === 10 ? new Date(`${isoOrYmd}T12:00:00`) : new Date(isoOrYmd);
  try {
    return new Intl.DateTimeFormat(locale(), opts).format(d);
  } catch {
    return isoOrYmd;
  }
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat(locale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** "Today", "Yesterday" or a short date. */
export function relativeDay(isoOrYmd: string, t: (k: string) => string): string {
  const ymd = isoOrYmd.length === 10 ? isoOrYmd : todayIn(undefined, new Date(isoOrYmd));
  const today = todayIn();
  if (ymd === today) return t('common.today');
  if (ymd === addDays(today, -1)) return t('common.yesterday');
  return formatDate(ymd, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function timeAgoShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const diff = Date.now() - Date.parse(iso);
  const m = Math.round(diff / 60000);
  if (m < 1) return locale() === 'ar' ? 'الآن' : 'now';
  if (m < 60) return `${m}${locale() === 'ar' ? ' د' : 'm'}`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}${locale() === 'ar' ? ' س' : 'h'}`;
  return formatDate(iso);
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return '—';
  if (meters < 1000) return `${Math.round(meters)} ${locale() === 'ar' ? 'م' : 'm'}`;
  return `${(meters / 1000).toFixed(1)} ${locale() === 'ar' ? 'كم' : 'km'}`;
}

export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return '—';
  const min = Math.max(1, Math.round(seconds / 60));
  return `${min} ${locale() === 'ar' ? 'د' : 'min'}`;
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
}

export function formatMillis(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function bytes(n: number | null | undefined): string {
  if (!n) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvEscape(r[c])).join(','))].join('\n');
}

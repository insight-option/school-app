import { matchesSearch, normalizeSearch } from '../../amplify/functions/shared/tenancy';

/** The subset of School fields the directory works with (pure helpers – unit-tested). */
export type DirectorySchool = {
  schoolId: string;
  name: string;
  tagline?: string | null;
  city?: string | null;
  country?: string | null;
  curriculum?: string | null;
  grades?: string | null;
  languages?: string | null;
  applicationsOpen?: boolean | null;
  transportAvailable?: boolean | null;
  applicationDeadline?: string | null;
  feesFrom?: number | null;
  feesTo?: number | null;
  currency?: string | null;
};

export type DirectoryFilter = {
  query: string;
  openOnly: boolean;
  transportOnly: boolean;
  curriculum: string | null;
};

export const EMPTY_FILTER: DirectoryFilter = { query: '', openOnly: false, transportOnly: false, curriculum: null };

export function schoolSearchText(s: DirectorySchool): string {
  return [s.name, s.tagline, s.city, s.country, s.curriculum, s.grades, s.languages].filter(Boolean).join(' ');
}

/** Applications are open and the deadline (if any) has not passed. */
export function acceptsApplications(s: DirectorySchool, today = new Date().toISOString().slice(0, 10)): boolean {
  if (!s.applicationsOpen) return false;
  return !s.applicationDeadline || s.applicationDeadline >= today;
}

/**
 * Filters and ranks the directory: name matches first (prefix before substring), then schools that
 * accept applications, then alphabetical. Pure and synchronous so typing stays instant.
 */
export function filterSchools<T extends DirectorySchool>(schools: readonly T[], f: DirectoryFilter, today?: string): T[] {
  const q = normalizeSearch(f.query);
  const curriculum = f.curriculum ? normalizeSearch(f.curriculum) : null;
  const rows = schools.filter((s) => {
    if (f.openOnly && !acceptsApplications(s, today)) return false;
    if (f.transportOnly && !s.transportAvailable) return false;
    if (curriculum && normalizeSearch(s.curriculum) !== curriculum) return false;
    return matchesSearch(schoolSearchText(s), q);
  });
  const rank = (s: T) => {
    const name = normalizeSearch(s.name);
    const nameScore = !q ? 0 : name.startsWith(q) ? 0 : name.includes(q) ? 1 : 2;
    return nameScore * 2 + (acceptsApplications(s, today) ? 0 : 1);
  };
  return rows
    .map((s) => ({ s, r: rank(s), n: normalizeSearch(s.name) }))
    .sort((a, b) => a.r - b.r || a.n.localeCompare(b.n))
    .map((x) => x.s);
}

/** Most common curricula (for the filter chips), at most `limit`. */
export function topCurricula(schools: readonly DirectorySchool[], limit = 6): string[] {
  const counts = new Map<string, { label: string; n: number }>();
  for (const s of schools) {
    const label = s.curriculum?.trim();
    if (!label) continue;
    const key = normalizeSearch(label);
    const cur = counts.get(key);
    counts.set(key, { label: cur?.label ?? label, n: (cur?.n ?? 0) + 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label))
    .slice(0, limit)
    .map((c) => c.label);
}

/** "12,000 – 18,000 SAR" / "From 12,000 SAR" / null. */
export function feeRange(s: DirectorySchool, locale = 'en'): string | null {
  const fmt = (n: number) => {
    try {
      return new Intl.NumberFormat(locale === 'ar' ? 'ar' : 'en', { maximumFractionDigits: 0 }).format(n);
    } catch {
      return String(Math.round(n));
    }
  };
  const cur = s.currency?.trim() ? ` ${s.currency.trim()}` : '';
  if (s.feesFrom != null && s.feesTo != null && s.feesTo > s.feesFrom) return `${fmt(s.feesFrom)} – ${fmt(s.feesTo)}${cur}`;
  if (s.feesFrom != null) return `${fmt(s.feesFrom)}${cur}`;
  if (s.feesTo != null) return `${fmt(s.feesTo)}${cur}`;
  return null;
}

export function locationLine(s: DirectorySchool): string {
  return [s.city, s.country].filter((x) => !!x && x.trim()).join(', ');
}

/** Normalises a website for Linking.openURL. */
export function websiteUrl(raw: string | null | undefined): string | null {
  const v = raw?.trim();
  if (!v) return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

const GENERIC_WORDS = new Set(['school', 'schools', 'academy', 'international', 'college', 'institute', 'the', 'of', 'and', 'مدرسة', 'مدارس', 'أكاديمية', 'اكاديمية', 'الدولية', 'العالمية']);

/** Logo placeholder: "Al Noor International School" → "AN", "Riverside Academy" → "RA", "مدرسة الأمل" → "أ". */
export function schoolInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const significant = words.filter((w) => !GENERIC_WORDS.has(w.toLowerCase()));
  const first = significant[0] ?? words[0];
  // Arabic letters join when written side by side, so one letter (without the article) reads best.
  if (/[؀-ۿ]/.test(first)) return first.replace(/^ال(?=\S{2,})/, '')[0];
  const parts = significant.length >= 2 ? significant : words;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Splits "a, b; c\nd" into a clean list (used by the profile editor for chips/lists). */
export function splitList(raw: string | null | undefined, max = 30): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(/[\n,;،]/)) {
    const v = part.trim();
    const k = normalizeSearch(v);
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Multi-school helpers shared by the Lambdas and the app (pure – no AWS SDK imports).
 */

/** The school that existed before multi-school support (data created by the first deployments). */
export const LEGACY_SCHOOL_ID = 'default';

/** `School.directory` values (GSI partition key – never null). */
export const DIRECTORY_PUBLIC = 'PUBLIC';
export const DIRECTORY_HIDDEN = 'HIDDEN';

/**
 * The shared "School office" chat seat of a school. Office admins read/write as this seat so parents
 * see one office, not individual staff. The legacy school keeps its original seat id.
 */
export function officeSeatId(schoolId: string | null | undefined): string {
  return !schoolId || schoolId === LEGACY_SCHOOL_ID ? 'OFFICE' : `OFFICE_${schoolId}`;
}

export function isOfficeSeat(userId: string | null | undefined): boolean {
  return !!userId && (userId === 'OFFICE' || userId.startsWith('OFFICE_'));
}

const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o/1/i/l

/** `sch-` + 10 random chars, e.g. sch-k3m9q2x7ra. Also the name of the school's Cognito admin group. */
export function newSchoolId(randomBytes: (n: number) => Uint8Array): string {
  return `sch-${randomString(10, randomBytes)}`;
}

export function isValidSchoolId(id: string | null | undefined): boolean {
  return !!id && (id === LEGACY_SCHOOL_ID || /^sch-[a-z0-9]{10}$/.test(id));
}

/** Application reference shown to parents, e.g. AP-7K3Q9X2M (no ambiguous characters). */
export function newApplicationReference(randomBytes: (n: number) => Uint8Array): string {
  return `AP-${randomString(8, randomBytes).toUpperCase()}`;
}

function randomString(length: number, randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) out += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return out;
}

/**
 * Normalises text for search: lower case, Latin diacritics removed, Arabic diacritics/tatweel
 * removed and letter variants unified (أ إ آ → ا, ى → ي, ة → ه), whitespace collapsed.
 */
export function normalizeSearch(input: string | null | undefined): string {
  if (!input) return '';
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ً-ٰٟـ]/g, '')
    .replace(/[آأإ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when every word of the query appears in the haystack (order-independent, prefix-friendly). */
export function matchesSearch(haystack: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (!q) return true;
  const h = normalizeSearch(haystack);
  return q.split(' ').every((word) => h.includes(word));
}

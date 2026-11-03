import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, clientFor, listAll, unwrap, type Booking, type Business, type Category, type Venue } from '../lib/data/client';
import { useSession } from '../lib/auth/session';
import { DIRECTORY_PUBLIC, matchesSearch } from '../../amplify/functions/shared/tenancy';
import { bookingPrice, isOpenNow, parseHours, qatarNow, toMinutes, type OpeningHours } from '../../amplify/functions/shared/booking';

/**
 * Marketplace data shared by Explore (guests + customers), the partner workspace and the owner
 * console: categories, listed venues & businesses, availability and bookings.
 */

export const platformKeys = {
  categories: ['platform', 'categories'] as const,
  venues: ['platform', 'venues'] as const,
  venue: (id: string) => ['platform', 'venue', id] as const,
  businesses: ['platform', 'businesses'] as const,
  business: (id: string) => ['platform', 'business', id] as const,
  availability: (venueId: string, date: string) => ['platform', 'availability', venueId, date] as const,
  myBookings: (userId: string) => ['platform', 'myBookings', userId] as const,
  booking: (id: string) => ['platform', 'booking', id] as const,
};

// ───────────────────────────── categories ─────────────────────────────

export function useCategories() {
  const session = useSession();
  return useQuery({
    queryKey: platformKeys.categories,
    enabled: session.status !== 'loading',
    staleTime: 10 * 60_000,
    gcTime: 30 * 24 * 3600_000,
    queryFn: async (): Promise<Category[]> => {
      const rows = await listAll((nextToken) => clientFor(session.status === 'signedIn').models.Category.list({ limit: 200, nextToken }), 5);
      return rows.sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.nameEn.localeCompare(b.nameEn));
    },
  });
}

export const activeCategories = (rows: Category[] | undefined, kind?: 'SCHOOL' | 'ACTIVITY') =>
  (rows ?? []).filter((c) => c.active !== false && (!kind || c.kind === kind));

export const categoryName = (c: Pick<Category, 'nameEn' | 'nameAr'> | null | undefined, arabic: boolean) => (c ? (arabic ? c.nameAr || c.nameEn : c.nameEn) : '');

/** Suggested categories for a fresh platform (owner console → Categories → "Add the defaults"). */
export const DEFAULT_CATEGORIES: { slug: string; kind: 'SCHOOL' | 'ACTIVITY'; nameEn: string; nameAr: string; icon: string; color: string }[] = [
  { slug: 'schools', kind: 'SCHOOL', nameEn: 'Schools', nameAr: 'المدارس', icon: 'school', color: '#8A1538' },
  { slug: 'football', kind: 'ACTIVITY', nameEn: 'Football', nameAr: 'كرة القدم', icon: 'football', color: '#12A150' },
  { slug: 'padel', kind: 'ACTIVITY', nameEn: 'Padel', nameAr: 'بادل', icon: 'tennisball', color: '#0C8599' },
  { slug: 'tennis', kind: 'ACTIVITY', nameEn: 'Tennis', nameAr: 'التنس', icon: 'tennisball-outline', color: '#B08900' },
  { slug: 'basketball', kind: 'ACTIVITY', nameEn: 'Basketball', nameAr: 'كرة السلة', icon: 'basketball', color: '#E8590C' },
  { slug: 'swimming', kind: 'ACTIVITY', nameEn: 'Swimming', nameAr: 'السباحة', icon: 'water', color: '#3E63DD' },
  { slug: 'fitness', kind: 'ACTIVITY', nameEn: 'Gym & fitness', nameAr: 'اللياقة البدنية', icon: 'barbell', color: '#6E56CF' },
  { slug: 'martial-arts', kind: 'ACTIVITY', nameEn: 'Martial arts', nameAr: 'فنون القتال', icon: 'body', color: '#D6336C' },
  { slug: 'kids', kind: 'ACTIVITY', nameEn: 'Kids activities', nameAr: 'أنشطة الأطفال', icon: 'happy', color: '#F59E0B' },
  { slug: 'events', kind: 'ACTIVITY', nameEn: 'Halls & events', nameAr: 'القاعات والفعاليات', icon: 'sparkles', color: '#5F3DC4' },
  { slug: 'other', kind: 'ACTIVITY', nameEn: 'More activities', nameAr: 'أنشطة أخرى', icon: 'grid', color: '#5E5862' },
];

// ───────────────────────────── venues & businesses ─────────────────────────────

/** Every listed venue (public directory); cached and persisted for an instant Explore screen. */
export function useDirectoryVenues() {
  const session = useSession();
  return useQuery({
    queryKey: platformKeys.venues,
    enabled: session.status !== 'loading',
    staleTime: 2 * 60_000,
    gcTime: 7 * 24 * 3600_000,
    queryFn: async (): Promise<Venue[]> =>
      listAll((nextToken) => clientFor(session.status === 'signedIn').models.Venue.listDirectoryVenues({ directory: DIRECTORY_PUBLIC }, { limit: 200, nextToken }), 10),
  });
}

export function useVenue(venueId: string | null | undefined) {
  const session = useSession();
  const qc = useQueryClient();
  return useQuery({
    queryKey: platformKeys.venue(venueId ?? ''),
    enabled: !!venueId && session.status !== 'loading',
    staleTime: 60_000,
    initialData: () => qc.getQueryData<Venue[]>(platformKeys.venues)?.find((v) => v.id === venueId),
    initialDataUpdatedAt: () => qc.getQueryState(platformKeys.venues)?.dataUpdatedAt,
    queryFn: async () => unwrap(await clientFor(session.status === 'signedIn').models.Venue.get({ id: venueId! }), 'venue'),
  });
}

export function useDirectoryBusinesses() {
  const session = useSession();
  return useQuery({
    queryKey: platformKeys.businesses,
    enabled: session.status !== 'loading',
    staleTime: 5 * 60_000,
    gcTime: 7 * 24 * 3600_000,
    queryFn: async (): Promise<Business[]> =>
      listAll((nextToken) => clientFor(session.status === 'signedIn').models.Business.listDirectoryBusinesses({ directory: DIRECTORY_PUBLIC }, { limit: 200, nextToken }), 10),
  });
}

export function useBusiness(businessId: string | null | undefined) {
  const session = useSession();
  const qc = useQueryClient();
  return useQuery({
    queryKey: platformKeys.business(businessId ?? ''),
    enabled: !!businessId && session.status !== 'loading',
    staleTime: 60_000,
    initialData: () => qc.getQueryData<Business[]>(platformKeys.businesses)?.find((b) => b.businessId === businessId),
    initialDataUpdatedAt: () => qc.getQueryState(platformKeys.businesses)?.dataUpdatedAt,
    queryFn: async () => unwrap(await clientFor(session.status === 'signedIn').models.Business.get({ businessId: businessId! }), 'business'),
  });
}

export type VenueFilter = { query?: string; categoryId?: string | null; openNow?: boolean; indoor?: boolean | null; audience?: string | null; maxPrice?: number | null };

export function filterVenues(venues: Venue[], f: VenueFilter, categoryNameOf?: (id: string) => string): Venue[] {
  return venues.filter((v) => {
    if (f.categoryId && v.categoryId !== f.categoryId) return false;
    if (f.indoor != null && v.indoor !== f.indoor) return false;
    if (f.audience && v.audience && v.audience !== 'ALL' && v.audience !== f.audience) return false;
    if (f.maxPrice != null && v.price != null && v.price > f.maxPrice) return false;
    if (f.openNow && !isOpenNow(parseHours(v.openingHours))) return false;
    if (f.query) {
      const hay = [v.name, v.businessName, v.area, v.city, v.address, categoryNameOf?.(v.categoryId), ...(v.amenities ?? [])].filter(Boolean).join(' ');
      if (!matchesSearch(hay, f.query)) return false;
    }
    return true;
  });
}

/** Featured first, then most booked, then name. */
export const rankVenues = (venues: Venue[]) =>
  [...venues].sort((a, b) => Number(!!b.featured) - Number(!!a.featured) || (b.bookingCount ?? 0) - (a.bookingCount ?? 0) || a.name.localeCompare(b.name));

/** Straight-line distance in km (for "Near you"). */
export function distanceKm(a: { lat: number; lng: number } | null | undefined, b: { lat: number; lng: number } | null | undefined): number | null {
  if (!a || !b) return null;
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ───────────────────────────── display helpers ─────────────────────────────

export function formatMoney(amount: number, currency = 'QAR', lang = 'en'): string {
  try {
    return new Intl.NumberFormat(lang === 'ar' ? 'ar-QA' : 'en-QA', { style: 'currency', currency, maximumFractionDigits: amount % 1 ? 2 : 0 }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

/** "QAR 250 / hour", "Free", "Price on request" – labels come from i18n (`platform.price.*`). */
export function priceLabel(v: Pick<Venue, 'priceMode' | 'price' | 'currency'>, t: (k: string, o?: Record<string, unknown>) => string, lang = 'en'): string {
  if (v.priceMode === 'FREE') return t('platform.price.free');
  if (v.priceMode === 'ON_REQUEST' || v.price == null) return t('platform.price.onRequest');
  const amount = formatMoney(v.price, v.currency ?? 'QAR', lang);
  switch (v.priceMode) {
    case 'PER_HOUR':
      return t('platform.price.perHour', { amount });
    case 'PER_PERSON':
      return t('platform.price.perPerson', { amount });
    default:
      return t('platform.price.perSession', { amount });
  }
}

export { bookingPrice, isOpenNow, parseHours, qatarNow, toMinutes, type OpeningHours };

/** Today's opening ranges as text ("08:00 – 23:00"), or null when closed today. */
export function todayHours(hours: OpeningHours): string | null {
  const day = String(new Date(Date.now() + 3 * 3_600_000).getUTCDay());
  const ranges = hours[day];
  return ranges?.length ? ranges.map(([a, b]) => `${a} – ${b}`).join(', ') : null;
}

// ───────────────────────────── availability & bookings ─────────────────────────────

export function useVenueAvailability(venueId: string | null | undefined, date: string | null | undefined) {
  const session = useSession();
  return useQuery({
    queryKey: platformKeys.availability(venueId ?? '', date ?? ''),
    enabled: !!venueId && !!date && session.status !== 'loading',
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => unwrap(await clientFor(session.status === 'signedIn').queries.venueAvailability({ venueId: venueId!, date: date! }), 'availability'),
  });
}

export function useBookVenue() {
  const qc = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationFn: async (input: { venueId: string; date: string; startTime: string; durationMinutes: number; people?: number; note?: string; phone?: string }) =>
      unwrap(await client.mutations.bookVenue(input), 'booking'),
    onSuccess: (booking, input) => {
      if (!booking) return;
      qc.setQueryData(platformKeys.booking(booking.id), booking);
      qc.setQueryData<Booking[]>(platformKeys.myBookings(session.userId ?? ''), (old) => [booking, ...(old ?? [])]);
      void qc.invalidateQueries({ queryKey: platformKeys.availability(input.venueId, input.date) });
    },
  });
}

/** The signed-in customer's bookings, newest first. */
export function useMyBookings() {
  const session = useSession();
  const userId = session.userId ?? '';
  return useQuery({
    queryKey: platformKeys.myBookings(userId),
    enabled: session.status === 'signedIn' && !!userId,
    staleTime: 30_000,
    queryFn: async (): Promise<Booking[]> =>
      listAll((nextToken) => client.models.Booking.listBookingsByCustomer({ customerId: userId }, { limit: 100, nextToken, sortDirection: 'DESC' }), 5),
  });
}

export function useBooking(bookingId: string | null | undefined) {
  const session = useSession();
  const qc = useQueryClient();
  return useQuery({
    queryKey: platformKeys.booking(bookingId ?? ''),
    enabled: !!bookingId && session.status === 'signedIn',
    staleTime: 15_000,
    initialData: () => qc.getQueryData<Booking[]>(platformKeys.myBookings(session.userId ?? ''))?.find((b) => b.id === bookingId),
    queryFn: async () => unwrap(await client.models.Booking.get({ id: bookingId! }), 'booking'),
  });
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; reason?: string }) => unwrap(await client.mutations.cancelBooking(input), 'cancel'),
    onSuccess: (b) => {
      if (!b) return;
      qc.setQueryData(platformKeys.booking(b.id), b);
      void qc.invalidateQueries({ queryKey: ['platform', 'myBookings'] });
      void qc.invalidateQueries({ queryKey: ['partner'] });
      void qc.invalidateQueries({ queryKey: ['platform', 'availability', b.venueId] });
    },
  });
}

/** Upcoming = pending/confirmed and not finished yet (Qatar time). */
export function isUpcoming(b: Pick<Booking, 'status' | 'date' | 'endTime' | 'startTime'>): boolean {
  if (b.status !== 'PENDING' && b.status !== 'CONFIRMED') return false;
  const now = qatarNow();
  if (b.date > now.date) return true;
  if (b.date < now.date) return false;
  const end = toMinutes(b.endTime);
  return (end <= toMinutes(b.startTime) ? end + 1440 : end) > now.minutes;
}

export const BOOKING_TONE: Record<string, 'warning' | 'success' | 'danger' | 'neutral' | 'primary'> = {
  PENDING: 'warning',
  CONFIRMED: 'success',
  DECLINED: 'danger',
  CANCELLED: 'neutral',
  COMPLETED: 'primary',
  NO_SHOW: 'danger',
};

export const AMENITY_ICONS: Record<string, string> = {
  parking: 'car',
  showers: 'water',
  changing: 'shirt',
  lockers: 'lock-closed',
  lights: 'bulb',
  ac: 'snow',
  cafe: 'cafe',
  wifi: 'wifi',
  equipment: 'basketball',
  coaching: 'person',
  prayer: 'moon',
  firstaid: 'medkit',
  seating: 'people',
  toilets: 'male-female',
};
export const AMENITY_KEYS = Object.keys(AMENITY_ICONS);

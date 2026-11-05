import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, listAll, unwrap, type Booking, type Business, type Invoice, type Plan, type TenantSubscription, type Venue } from '../lib/data/client';
import { useSession } from '../lib/auth/session';
import { addDays, bookingEndMinute, minutesSince, qatarNow, toMinutes } from '../../amplify/functions/shared/booking';

/**
 * Partner (activity business) workspace data. The partner's business id is their tenant id
 * (`custom:schoolId`, also Profile.schoolId). Every query key starts with 'partner' so a single
 * invalidation refreshes the workspace.
 */

export const partnerKeys = {
  all: ['partner'] as const,
  business: (id: string) => ['partner', 'business', id] as const,
  venues: (id: string) => ['partner', 'venues', id] as const,
  bookings: (id: string) => ['partner', 'bookings', id] as const,
  subscription: (id: string) => ['partner', 'subscription', id] as const,
  invoices: (id: string) => ['partner', 'invoices', id] as const,
  plans: ['partner', 'plans'] as const,
};

/** Bookings loaded for the workspace: 60 days back … 120 days ahead (Qatar dates). */
export const BOOKING_WINDOW = { back: 60, ahead: 120 };

export function useMyBusinessId(): string {
  const session = useSession();
  return session.role === 'PARTNER' ? session.schoolId : '';
}

/** Qatar "now" that ticks every minute (never read the clock during render). */
export function useQatarClock(intervalMs = 60_000) {
  const [now, setNow] = useState(() => qatarNow());
  useEffect(() => {
    const id = setInterval(() => setNow(qatarNow()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

export function useMyBusiness() {
  const id = useMyBusinessId();
  return useQuery({
    queryKey: partnerKeys.business(id),
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<Business | null> => (await client.models.Business.get({ businessId: id })).data ?? null,
  });
}

export function useMyVenues() {
  const id = useMyBusinessId();
  return useQuery({
    queryKey: partnerKeys.venues(id),
    enabled: !!id,
    staleTime: 60_000,
    queryFn: async (): Promise<Venue[]> => listAll((nextToken) => client.models.Venue.listVenuesByBusiness({ businessId: id }, { limit: 100, nextToken }), 10),
  });
}

export function useMyVenue(venueId: string | null | undefined) {
  const id = useMyBusinessId();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['partner', 'venue', venueId ?? ''],
    enabled: !!venueId && venueId !== 'new' && !!id,
    staleTime: 30_000,
    initialData: () => qc.getQueryData<Venue[]>(partnerKeys.venues(id))?.find((v) => v.id === venueId),
    queryFn: async () => unwrap(await client.models.Venue.get({ id: venueId! }), 'venue'),
  });
}

/** All bookings of the business inside BOOKING_WINDOW (one query powers dashboard, lists and strip). */
export function useBusinessBookings() {
  const id = useMyBusinessId();
  return useQuery({
    queryKey: partnerKeys.bookings(id),
    enabled: !!id,
    staleTime: 20_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<Booking[]> => {
      const today = qatarNow().date;
      const from = addDays(today, -BOOKING_WINDOW.back);
      const to = addDays(today, BOOKING_WINDOW.ahead);
      const rows = await listAll(
        (nextToken) => client.models.Booking.listBookingsByBusinessAndDate({ businessId: id, date: { between: [from, to] } }, { limit: 200, nextToken }),
        25,
      );
      return rows.sort(compareBookings);
    },
  });
}

export const compareBookings = (a: Booking, b: Booking) => a.date.localeCompare(b.date) || toMinutes(a.startTime) - toMinutes(b.startTime);

export function usePartnerBooking(bookingId: string | null | undefined) {
  const id = useMyBusinessId();
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['partner', 'booking', bookingId ?? ''],
    enabled: !!bookingId && !!id,
    staleTime: 15_000,
    initialData: () => qc.getQueryData<Booking[]>(partnerKeys.bookings(id))?.find((b) => b.id === bookingId),
    queryFn: async () => unwrap(await client.models.Booking.get({ id: bookingId! }), 'booking'),
  });
}

/**
 * Live updates: new bookings and status changes of this business arrive without refreshing.
 * No filter – businessId is the admin-group auth field, AppSync scopes events to the caller's groups.
 */
export function useBusinessBookingsLive() {
  const id = useMyBusinessId();
  const qc = useQueryClient();
  useEffect(() => {
    if (!id) return;
    const upsert = (b: Booking) => {
      if (b.businessId !== id) return;
      qc.setQueryData<Booking[]>(partnerKeys.bookings(id), (old) => {
        if (!old) return old;
        const i = old.findIndex((x) => x.id === b.id);
        const next = i >= 0 ? old.map((x) => (x.id === b.id ? b : x)) : [...old, b];
        return next.sort(compareBookings);
      });
      qc.setQueryData(['partner', 'booking', b.id], b);
    };
    const s1 = client.models.Booking.onCreate().subscribe({ next: upsert, error: (e) => console.warn('bookings sub', e) });
    const s2 = client.models.Booking.onUpdate().subscribe({ next: upsert, error: (e) => console.warn('bookings sub', e) });
    return () => {
      s1.unsubscribe();
      s2.unsubscribe();
    };
  }, [id, qc]);
}

function patchBooking(qc: ReturnType<typeof useQueryClient>, businessId: string, bookingId: string, patch: Partial<Booking>) {
  qc.setQueryData<Booking[]>(partnerKeys.bookings(businessId), (old) => old?.map((b) => (b.id === bookingId ? { ...b, ...patch } : b)));
  qc.setQueryData<Booking | undefined>(['partner', 'booking', bookingId], (old) => (old ? { ...old, ...patch } : old));
}

type Snapshot = { list?: Booking[]; one?: Booking };

export function useRespondBooking() {
  const qc = useQueryClient();
  const id = useMyBusinessId();
  return useMutation({
    mutationFn: async (input: { bookingId: string; status: 'CONFIRMED' | 'DECLINED' | 'COMPLETED' | 'NO_SHOW'; note?: string }) =>
      unwrap(await client.mutations.respondBooking({ bookingId: input.bookingId, status: input.status, note: input.note || undefined }), 'booking'),
    onMutate: async (input): Promise<Snapshot> => {
      await qc.cancelQueries({ queryKey: partnerKeys.bookings(id) });
      const snap = { list: qc.getQueryData<Booking[]>(partnerKeys.bookings(id)), one: qc.getQueryData<Booking>(['partner', 'booking', input.bookingId]) };
      patchBooking(qc, id, input.bookingId, { status: input.status, businessNote: input.note || undefined });
      return snap;
    },
    onError: (_e, input, snap) => {
      if (snap?.list) qc.setQueryData(partnerKeys.bookings(id), snap.list);
      if (snap?.one) qc.setQueryData(['partner', 'booking', input.bookingId], snap.one);
    },
    onSuccess: (b) => {
      if (b) patchBooking(qc, id, b.id, b);
    },
    onSettled: (b) => {
      void qc.invalidateQueries({ queryKey: partnerKeys.bookings(id) });
      if (b) void qc.invalidateQueries({ queryKey: ['platform', 'availability', b.venueId] });
    },
  });
}

export function usePartnerCancelBooking() {
  const qc = useQueryClient();
  const id = useMyBusinessId();
  return useMutation({
    mutationFn: async (input: { bookingId: string; reason?: string }) => unwrap(await client.mutations.cancelBooking({ bookingId: input.bookingId, reason: input.reason || undefined }), 'cancel'),
    onMutate: async (input): Promise<Snapshot> => {
      await qc.cancelQueries({ queryKey: partnerKeys.bookings(id) });
      const snap = { list: qc.getQueryData<Booking[]>(partnerKeys.bookings(id)), one: qc.getQueryData<Booking>(['partner', 'booking', input.bookingId]) };
      patchBooking(qc, id, input.bookingId, { status: 'CANCELLED', cancelledBy: 'BUSINESS' });
      return snap;
    },
    onError: (_e, input, snap) => {
      if (snap?.list) qc.setQueryData(partnerKeys.bookings(id), snap.list);
      if (snap?.one) qc.setQueryData(['partner', 'booking', input.bookingId], snap.one);
    },
    onSuccess: (b) => {
      if (b) patchBooking(qc, id, b.id, b);
    },
    onSettled: (b) => {
      void qc.invalidateQueries({ queryKey: partnerKeys.bookings(id) });
      if (b) void qc.invalidateQueries({ queryKey: ['platform', 'availability', b.venueId] });
    },
  });
}

/** Venue payload accepted by the `saveVenue` Lambda (see amplify/functions/platform/business.ts). */
export type VenuePayload = {
  id?: string | null;
  name: string;
  categoryId: string;
  listed: boolean;
  description?: string | null;
  photos: string[];
  city?: string | null;
  area?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  amenities: string[];
  audience?: string | null;
  indoor?: boolean | null;
  surface?: string | null;
  priceMode: 'PER_HOUR' | 'PER_SESSION' | 'PER_PERSON' | 'ON_REQUEST' | 'FREE';
  price?: number | null;
  currency?: string | null;
  priceNote?: string | null;
  openingHours: Record<string, [string, string][]>;
  slotMinutes: number;
  minDurationMinutes: number;
  maxDurationMinutes: number;
  capacity: number;
  unitLabel?: string | null;
  maxPeople?: number | null;
  bookingMode: 'INSTANT' | 'REQUEST' | 'CONTACT';
  advanceDays: number;
  cancellationHours: number;
  rules?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
};

export function useSaveVenue() {
  const qc = useQueryClient();
  const id = useMyBusinessId();
  return useMutation({
    mutationFn: async (venue: VenuePayload) => unwrap(await client.mutations.saveVenue({ venue: JSON.stringify(venue) }), 'venue'),
    onSuccess: (v) => {
      if (!v) return;
      qc.setQueryData(['partner', 'venue', v.id], v);
      qc.setQueryData<Venue[]>(partnerKeys.venues(id), (old) => {
        if (!old) return old;
        return old.some((x) => x.id === v.id) ? old.map((x) => (x.id === v.id ? v : x)) : [...old, v];
      });
      void qc.invalidateQueries({ queryKey: partnerKeys.venues(id) });
      void qc.invalidateQueries({ queryKey: partnerKeys.business(id) });
      void qc.invalidateQueries({ queryKey: ['platform', 'venues'] });
      void qc.invalidateQueries({ queryKey: ['platform', 'venue', v.id] });
    },
  });
}

export function useRemoveVenue() {
  const qc = useQueryClient();
  const id = useMyBusinessId();
  return useMutation({
    mutationFn: async (venueId: string) => {
      unwrap(await client.mutations.removeVenue({ venueId }), 'venue');
      return venueId;
    },
    onSuccess: (venueId) => {
      qc.setQueryData<Venue[]>(partnerKeys.venues(id), (old) => old?.filter((v) => v.id !== venueId));
      qc.removeQueries({ queryKey: ['partner', 'venue', venueId] });
      void qc.invalidateQueries({ queryKey: partnerKeys.business(id) });
      void qc.invalidateQueries({ queryKey: ['platform', 'venues'] });
    },
  });
}

/** Business profile payload accepted by `saveBusinessProfile` / `registerBusiness`. */
export type BusinessPayload = {
  name?: string;
  ownerName?: string;
  listed?: boolean;
  categoryIds?: string[];
  tagline?: string | null;
  description?: string | null;
  logoKey?: string | null;
  coverKey?: string | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  website?: string | null;
  instagram?: string | null;
  city?: string | null;
  area?: string | null;
  address?: string | null;
  lat?: number | null;
  lng?: number | null;
  language?: 'en' | 'ar';
};

export function useSaveBusinessProfile() {
  const qc = useQueryClient();
  const id = useMyBusinessId();
  return useMutation({
    mutationFn: async (profile: BusinessPayload) => unwrap(await client.mutations.saveBusinessProfile({ profile: JSON.stringify(profile) }), 'business'),
    onSuccess: (b) => {
      if (b) qc.setQueryData(partnerKeys.business(id), b);
      void qc.invalidateQueries({ queryKey: partnerKeys.business(id) });
      void qc.invalidateQueries({ queryKey: partnerKeys.venues(id) });
      void qc.invalidateQueries({ queryKey: ['platform'] });
    },
  });
}

export function useMySubscription() {
  const id = useMyBusinessId();
  return useQuery({
    queryKey: partnerKeys.subscription(id),
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<TenantSubscription | null> => (await client.models.TenantSubscription.get({ tenantId: id })).data ?? null,
  });
}

export function useMyInvoices() {
  const id = useMyBusinessId();
  return useQuery({
    queryKey: partnerKeys.invoices(id),
    enabled: !!id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Invoice[]> =>
      listAll((nextToken) => client.models.Invoice.listInvoicesByTenant({ tenantId: id }, { limit: 100, nextToken, sortDirection: 'DESC' }), 5),
  });
}

export function usePlans() {
  return useQuery({
    queryKey: partnerKeys.plans,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Plan[]> => {
      const rows = await listAll((nextToken) => client.models.Plan.list({ limit: 100, nextToken }), 5);
      return rows
        .filter((p) => p.active !== false && (p.tenantType === 'BUSINESS' || p.tenantType === 'ANY'))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.priceMonthly ?? 0) - (b.priceMonthly ?? 0));
    },
  });
}

// ───────────────────────────── pure helpers (dashboard / lists) ─────────────────────────────

export const isActiveBooking = (b: Pick<Booking, 'status'>) => b.status === 'PENDING' || b.status === 'CONFIRMED';

/** Minutes since midnight of a booking's end (overnight bookings end on the next day). */
export const endMinutes = (b: Pick<Booking, 'startTime' | 'endTime'>): number => bookingEndMinute(b.startTime, b.endTime);

export function hasStarted(b: Pick<Booking, 'date' | 'startTime'>, now: { date: string; minutes: number }): boolean {
  return minutesSince(b.date, toMinutes(b.startTime), now) >= 0;
}

/** Overnight-aware: a 23:00–01:00 booking is still running at 00:30 the next day. */
export function hasEnded(b: Pick<Booking, 'date' | 'startTime' | 'endTime'>, now: { date: string; minutes: number }): boolean {
  return minutesSince(b.date, endMinutes(b), now) >= 0;
}

export type DashboardStats = {
  today: number;
  pending: number;
  week: number;
  revenueMonth: number;
  currency: string;
};

export function dashboardStats(bookings: Booking[], now: { date: string; minutes: number }): DashboardStats {
  const weekEnd = addDays(now.date, 6);
  const month = now.date.slice(0, 7);
  let today = 0;
  let pending = 0;
  let week = 0;
  let revenueMonth = 0;
  let currency = 'QAR';
  for (const b of bookings) {
    if (b.status === 'PENDING' && !hasEnded(b, now)) pending++;
    if (isActiveBooking(b) || b.status === 'COMPLETED') {
      if (b.date === now.date) today++;
      if (b.date >= now.date && b.date <= weekEnd) week++;
    }
    if ((b.status === 'CONFIRMED' || b.status === 'COMPLETED') && b.date.slice(0, 7) === month && b.price) {
      revenueMonth += b.price;
      currency = b.currency ?? currency;
    }
  }
  return { today, pending, week, revenueMonth, currency };
}

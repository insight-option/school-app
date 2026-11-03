import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  client,
  listAll,
  unwrap,
  type AppConfig,
  type Booking,
  type BookingStatus,
  type Business,
  type Category,
  type Invoice,
  type InvoiceStatus,
  type Plan,
  type PlatformEvent,
  type School,
  type TenantSubscription,
  type Venue,
} from '../lib/data/client';
import { APP_CONFIG_ID, APP_CONFIG_KEY } from './branding';
import { DEFAULT_CATEGORIES, platformKeys } from './platform';

/**
 * Owner console data. The OWNER Cognito group has full access to every model, so most reads and
 * writes go straight to the models; Cognito and cascade operations use the platform Lambda.
 */

export const ownerKeys = {
  overview: ['owner', 'overview'] as const,
  schools: ['owner', 'schools'] as const,
  businesses: ['owner', 'businesses'] as const,
  subscriptions: ['owner', 'subscriptions'] as const,
  invoices: ['owner', 'invoices'] as const,
  tenantInvoices: (tenantId: string) => ['owner', 'invoices', 'tenant', tenantId] as const,
  plans: ['owner', 'plans'] as const,
  bookings: ['owner', 'bookings'] as const,
  events: ['owner', 'events'] as const,
  users: (search: string) => ['owner', 'users', search] as const,
  people: (schoolId: string) => ['owner', 'people', schoolId] as const,
  venues: (businessId: string) => ['owner', 'venues', businessId] as const,
  businessBookings: (businessId: string) => ['owner', 'businessBookings', businessId] as const,
};

export type TenantType = 'SCHOOL' | 'BUSINESS';

// ───────────────────────────── overview ─────────────────────────────

export type OwnerOverviewData = {
  generatedAt: string;
  tenants: {
    schools: number;
    schoolsSuspended: number;
    businesses: number;
    businessesSuspended: number;
    venues: number;
    venuesListed: number;
    newLast30: number;
    withoutSubscription: number;
  };
  people: Record<string, number>;
  bookings: { total: number; last30: number; byStatus: Record<string, number>; byDay: Record<string, number>; gmv30: number; commission30: number };
  billing: {
    mrr: number;
    outstanding: number;
    overdueCount: number;
    paidThisMonth: number;
    revenueByMonth: Record<string, number>;
    subscriptionsByStatus: Record<string, number>;
    currency: string;
  };
};

export function useOwnerOverview() {
  return useQuery({
    queryKey: ownerKeys.overview,
    staleTime: 60_000,
    queryFn: async (): Promise<OwnerOverviewData> => {
      const res = unwrap(await client.queries.ownerOverview(), 'overview');
      return JSON.parse(res?.json ?? '{}') as OwnerOverviewData;
    },
  });
}

// ───────────────────────────── tenants ─────────────────────────────

export function useOwnerSchools() {
  return useQuery({
    queryKey: ownerKeys.schools,
    staleTime: 60_000,
    queryFn: async (): Promise<School[]> => listAll((nextToken) => client.models.School.list({ limit: 500, nextToken }), 20),
  });
}

export function useOwnerBusinesses() {
  return useQuery({
    queryKey: ownerKeys.businesses,
    staleTime: 60_000,
    queryFn: async (): Promise<Business[]> => listAll((nextToken) => client.models.Business.list({ limit: 500, nextToken }), 20),
  });
}

export function useSubscriptions() {
  return useQuery({
    queryKey: ownerKeys.subscriptions,
    staleTime: 60_000,
    queryFn: async (): Promise<TenantSubscription[]> => listAll((nextToken) => client.models.TenantSubscription.list({ limit: 500, nextToken }), 20),
  });
}

export type TenantRow = {
  id: string;
  type: TenantType;
  name: string;
  logoKey: string | null;
  color: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
  city: string | null;
  createdAt: string | null;
  listed: boolean;
  subscription: TenantSubscription | null;
  venueCount: number | null;
};

/** Schools and businesses as one list, newest first. */
export function useTenants() {
  const schools = useOwnerSchools();
  const businesses = useOwnerBusinesses();
  const subs = useSubscriptions();
  const subMap = new Map((subs.data ?? []).map((s) => [s.tenantId, s]));
  const rows: TenantRow[] = [
    ...(schools.data ?? []).map((s) => ({
      id: s.schoolId,
      type: 'SCHOOL' as const,
      name: s.name,
      logoKey: s.logoKey ?? null,
      color: s.primaryColor ?? null,
      status: (s.status ?? 'ACTIVE') as TenantRow['status'],
      city: [s.city, s.country].filter(Boolean).join(', ') || null,
      createdAt: s.createdAt ?? null,
      listed: s.directory === 'PUBLIC',
      subscription: subMap.get(s.schoolId) ?? null,
      venueCount: null,
    })),
    ...(businesses.data ?? []).map((b) => ({
      id: b.businessId,
      type: 'BUSINESS' as const,
      name: b.name,
      logoKey: b.logoKey ?? null,
      color: b.primaryColor ?? null,
      status: b.status as TenantRow['status'],
      city: [b.area, b.city].filter(Boolean).join(', ') || null,
      createdAt: b.createdAt ?? null,
      listed: b.directory === 'PUBLIC',
      subscription: subMap.get(b.businessId) ?? null,
      venueCount: b.venueCount ?? 0,
    })),
  ].sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
  return {
    rows,
    isLoading: schools.isLoading || businesses.isLoading,
    isError: schools.isError && businesses.isError,
    isRefetching: schools.isRefetching || businesses.isRefetching || subs.isRefetching,
    refetch: () => Promise.all([schools.refetch(), businesses.refetch(), subs.refetch()]),
  };
}

export function useTenantPeople(schoolId: string | null | undefined, enabled = true) {
  return useQuery({
    queryKey: ownerKeys.people(schoolId ?? ''),
    enabled: !!schoolId && enabled,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const count = async (role: 'STUDENT' | 'TEACHER' | 'DRIVER') =>
        (await listAll((nextToken) => client.models.Profile.listProfilesBySchoolAndRole({ schoolId: schoolId!, role: { eq: role } }, { limit: 1000, nextToken }), 20)).length;
      const [students, teachers, drivers] = await Promise.all([count('STUDENT'), count('TEACHER'), count('DRIVER')]);
      return { students, teachers, drivers };
    },
  });
}

export function useBusinessVenues(businessId: string | null | undefined) {
  return useQuery({
    queryKey: ownerKeys.venues(businessId ?? ''),
    enabled: !!businessId,
    staleTime: 60_000,
    queryFn: async (): Promise<Venue[]> => listAll((nextToken) => client.models.Venue.listVenuesByBusiness({ businessId: businessId! }, { limit: 200, nextToken }), 10),
  });
}

export function useBusinessBookings(businessId: string | null | undefined) {
  return useQuery({
    queryKey: ownerKeys.businessBookings(businessId ?? ''),
    enabled: !!businessId,
    staleTime: 60_000,
    queryFn: async (): Promise<Booking[]> => unwrap(await client.models.Booking.listBookingsByBusiness({ businessId: businessId! }, { limit: 15, sortDirection: 'DESC' }), 'bookings'),
  });
}

function invalidateTenants(qc: ReturnType<typeof useQueryClient>) {
  void qc.invalidateQueries({ queryKey: ownerKeys.schools });
  void qc.invalidateQueries({ queryKey: ownerKeys.businesses });
  void qc.invalidateQueries({ queryKey: ownerKeys.subscriptions });
  void qc.invalidateQueries({ queryKey: ownerKeys.overview });
  void qc.invalidateQueries({ queryKey: ownerKeys.events });
}

export function useSetTenantStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenantType: TenantType; tenantId: string; status: 'ACTIVE' | 'SUSPENDED' }) => unwrap(await client.mutations.ownerSetTenantStatus(input), 'status'),
    onSuccess: () => {
      invalidateTenants(qc);
      void qc.invalidateQueries({ queryKey: platformKeys.venues });
    },
  });
}

export function useDeleteTenant() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { tenantType: TenantType; tenantId: string; confirmName: string }) => unwrap(await client.mutations.ownerDeleteTenant(input), 'delete'),
    onSuccess: (_r, input) => {
      if (input.tenantType === 'SCHOOL') qc.setQueryData<School[]>(ownerKeys.schools, (old) => old?.filter((s) => s.schoolId !== input.tenantId));
      else qc.setQueryData<Business[]>(ownerKeys.businesses, (old) => old?.filter((b) => b.businessId !== input.tenantId));
      invalidateTenants(qc);
    },
  });
}

export function useSetBusinessVerified() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { businessId: string; verified: boolean }) => unwrap(await client.models.Business.update(input), 'business'),
    onMutate: (input) => qc.setQueryData<Business[]>(ownerKeys.businesses, (old) => old?.map((b) => (b.businessId === input.businessId ? { ...b, verified: input.verified } : b))),
    onSettled: () => void qc.invalidateQueries({ queryKey: ownerKeys.businesses }),
  });
}

export function useSetBusinessListed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { businessId: string; listed: boolean }) =>
      unwrap(await client.mutations.saveBusinessProfile({ businessId: input.businessId, profile: JSON.stringify({ listed: input.listed }) }), 'business'),
    onMutate: (input) =>
      qc.setQueryData<Business[]>(ownerKeys.businesses, (old) => old?.map((b) => (b.businessId === input.businessId ? { ...b, directory: input.listed ? 'PUBLIC' : 'HIDDEN' } : b))),
    onSettled: (_d, _e, input) => {
      void qc.invalidateQueries({ queryKey: ownerKeys.businesses });
      void qc.invalidateQueries({ queryKey: ownerKeys.venues(input.businessId) });
      void qc.invalidateQueries({ queryKey: platformKeys.venues });
    },
  });
}

export function useSetSchoolListed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { schoolId: string; listed: boolean }) => unwrap(await client.models.School.update({ schoolId: input.schoolId, directory: input.listed ? 'PUBLIC' : 'HIDDEN' }), 'school'),
    onMutate: (input) => qc.setQueryData<School[]>(ownerKeys.schools, (old) => old?.map((s) => (s.schoolId === input.schoolId ? { ...s, directory: input.listed ? 'PUBLIC' : 'HIDDEN' } : s))),
    onSettled: () => void qc.invalidateQueries({ queryKey: ownerKeys.schools }),
  });
}

export function useSetVenueFeatured() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; businessId: string; featured: boolean }) => unwrap(await client.models.Venue.update({ id: input.id, featured: input.featured }), 'venue'),
    onMutate: (input) => qc.setQueryData<Venue[]>(ownerKeys.venues(input.businessId), (old) => old?.map((v) => (v.id === input.id ? { ...v, featured: input.featured } : v))),
    onSettled: (_d, _e, input) => {
      void qc.invalidateQueries({ queryKey: ownerKeys.venues(input.businessId) });
      void qc.invalidateQueries({ queryKey: platformKeys.venues });
    },
  });
}

// ───────────────────────────── subscriptions, plans, invoices ─────────────────────────────

export type SubscriptionInput = {
  tenantId: string;
  tenantType: TenantType;
  tenantName: string;
  planId?: string | null;
  planName?: string | null;
  status: NonNullable<TenantSubscription['status']>;
  cycle: NonNullable<TenantSubscription['cycle']>;
  price?: number | null;
  currency?: string | null;
  commissionPercent?: number | null;
  trialEndsAt?: string | null;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  billingName?: string | null;
  billingEmail?: string | null;
  billingPhone?: string | null;
  notes?: string | null;
};

export function useSaveSubscription() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ isNew, ...input }: SubscriptionInput & { isNew: boolean }) =>
      isNew
        ? unwrap(await client.models.TenantSubscription.create({ ...input, startedAt: new Date().toISOString() }), 'subscription')
        : unwrap(await client.models.TenantSubscription.update(input), 'subscription'),
    onSuccess: (sub) => {
      if (sub) qc.setQueryData<TenantSubscription[]>(ownerKeys.subscriptions, (old) => [...(old ?? []).filter((s) => s.tenantId !== sub.tenantId), sub]);
      void qc.invalidateQueries({ queryKey: ownerKeys.overview });
    },
  });
}

export function usePlans() {
  return useQuery({
    queryKey: ownerKeys.plans,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Plan[]> =>
      (await listAll((nextToken) => client.models.Plan.list({ limit: 200, nextToken }), 5)).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.priceMonthly ?? 0) - (b.priceMonthly ?? 0)),
  });
}

export type PlanInput = Omit<Plan, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export function useSavePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: PlanInput) => (id ? unwrap(await client.models.Plan.update({ id, ...input }), 'plan') : unwrap(await client.models.Plan.create(input), 'plan')),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ownerKeys.plans }),
  });
}

export function useDeletePlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await client.models.Plan.delete({ id }), 'plan'),
    onSuccess: (_d, id) => qc.setQueryData<Plan[]>(ownerKeys.plans, (old) => old?.filter((p) => p.id !== id)),
  });
}

export function useInvoices() {
  return useQuery({
    queryKey: ownerKeys.invoices,
    staleTime: 60_000,
    queryFn: async (): Promise<Invoice[]> =>
      (await listAll((nextToken) => client.models.Invoice.list({ limit: 500, nextToken }), 20)).sort((a, b) => b.issueDate.localeCompare(a.issueDate) || b.number.localeCompare(a.number)),
  });
}

export function useTenantInvoices(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: ownerKeys.tenantInvoices(tenantId ?? ''),
    enabled: !!tenantId,
    staleTime: 60_000,
    queryFn: async (): Promise<Invoice[]> =>
      listAll((nextToken) => client.models.Invoice.listInvoicesByTenant({ tenantId: tenantId! }, { limit: 200, nextToken, sortDirection: 'DESC' }), 5),
  });
}

export type InvoiceItem = { description: string; quantity: number; unitPrice: number; total: number };

/** Next invoice number for a year: INV-2026-0001, INV-2026-0002 … */
export function nextInvoiceNumber(existing: Pick<Invoice, 'number'>[], year: number): string {
  const prefix = `INV-${year}-`;
  let max = 0;
  for (const inv of existing) {
    if (!inv.number.startsWith(prefix)) continue;
    const n = Number(inv.number.slice(prefix.length));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export function invoiceTotals(items: InvoiceItem[], discount: number, taxPercent: number) {
  const subtotal = round2(items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0));
  const afterDiscount = Math.max(0, subtotal - (discount || 0));
  const tax = round2((afterDiscount * (taxPercent || 0)) / 100);
  return { subtotal, tax, total: round2(afterDiscount + tax) };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export type InvoiceInput = Omit<Invoice, 'id' | 'createdAt' | 'updatedAt' | 'items'> & { id?: string; items: InvoiceItem[] };

function invalidateInvoices(qc: ReturnType<typeof useQueryClient>, tenantId?: string) {
  void qc.invalidateQueries({ queryKey: ownerKeys.invoices });
  if (tenantId) void qc.invalidateQueries({ queryKey: ownerKeys.tenantInvoices(tenantId) });
  void qc.invalidateQueries({ queryKey: ownerKeys.overview });
}

export function useSaveInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, items, ...rest }: InvoiceInput) => {
      const payload = { ...rest, items: JSON.stringify(items) };
      return id ? unwrap(await client.models.Invoice.update({ id, ...payload }), 'invoice') : unwrap(await client.models.Invoice.create(payload), 'invoice');
    },
    onSuccess: (inv) => invalidateInvoices(qc, inv?.tenantId),
  });
}

export function useSetInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: InvoiceStatus; paymentMethod?: string | null; paymentReference?: string | null }) =>
      unwrap(
        await client.models.Invoice.update({
          id: input.id,
          status: input.status,
          ...(input.status === 'PAID' ? { paidAt: new Date().toISOString(), paymentMethod: input.paymentMethod ?? null, paymentReference: input.paymentReference ?? null } : {}),
        }),
        'invoice',
      ),
    onMutate: (input) => qc.setQueryData<Invoice[]>(ownerKeys.invoices, (old) => old?.map((i) => (i.id === input.id ? { ...i, status: input.status } : i))),
    onSettled: (inv) => invalidateInvoices(qc, inv?.tenantId),
  });
}

export function parseInvoiceItems(raw: unknown): InvoiceItem[] {
  let v: unknown = raw;
  for (let i = 0; i < 3 && typeof v === 'string'; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  return Array.isArray(v)
    ? v.map((x: Partial<InvoiceItem>) => ({ description: String(x.description ?? ''), quantity: Number(x.quantity ?? 1), unitPrice: Number(x.unitPrice ?? 0), total: Number(x.total ?? 0) }))
    : [];
}

// ───────────────────────────── bookings ─────────────────────────────

export function useAllBookings() {
  return useQuery({
    queryKey: ownerKeys.bookings,
    staleTime: 30_000,
    queryFn: async (): Promise<Booking[]> =>
      (await listAll((nextToken) => client.models.Booking.list({ limit: 500, nextToken }), 20)).sort((a, b) => b.bookedAt.localeCompare(a.bookedAt)),
  });
}

function patchBooking(qc: ReturnType<typeof useQueryClient>, b: Booking | null | undefined) {
  if (!b) return;
  qc.setQueryData<Booking[]>(ownerKeys.bookings, (old) => old?.map((x) => (x.id === b.id ? b : x)));
  void qc.invalidateQueries({ queryKey: ownerKeys.businessBookings(b.businessId) });
  void qc.invalidateQueries({ queryKey: ['platform', 'availability', b.venueId] });
  void qc.invalidateQueries({ queryKey: ownerKeys.overview });
}

export function useOwnerRespondBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; status: BookingStatus; note?: string }) => unwrap(await client.mutations.respondBooking(input), 'booking'),
    onSuccess: (b) => patchBooking(qc, b),
  });
}

export function useOwnerCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bookingId: string; reason?: string }) => unwrap(await client.mutations.cancelBooking(input), 'booking'),
    onSuccess: (b) => patchBooking(qc, b),
  });
}

// ───────────────────────────── activity ─────────────────────────────

export function usePlatformEvents(pageSize = 30) {
  return useInfiniteQuery({
    queryKey: [...ownerKeys.events, pageSize],
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const res = await client.models.PlatformEvent.listEventsByFeed({ feed: 'ALL' }, { sortDirection: 'DESC', limit: pageSize, nextToken: pageParam });
      unwrap(res, 'activity');
      return { items: res.data as PlatformEvent[], nextToken: res.nextToken ?? null };
    },
    getNextPageParam: (last) => last.nextToken ?? undefined,
  });
}

// ───────────────────────────── users ─────────────────────────────

export type PlatformUser = {
  username: string;
  sub?: string | null;
  email?: string | null;
  name?: string | null;
  enabled?: boolean | null;
  status?: string | null;
  groups?: (string | null)[] | null;
  schoolId?: string | null;
  createdAt?: string | null;
};

export function useOwnerUsers(search: string) {
  return useInfiniteQuery({
    queryKey: ownerKeys.users(search),
    staleTime: 30_000,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) => {
      const page = unwrap(await client.queries.ownerListUsers({ search: search || null, nextToken: pageParam }), 'users');
      return { users: (page?.users ?? []).filter(Boolean) as PlatformUser[], nextToken: page?.nextToken ?? null };
    },
    getNextPageParam: (last) => last.nextToken ?? undefined,
  });
}

export type UserAction = 'ENABLE' | 'DISABLE' | 'DELETE' | 'RESET_PASSWORD';

export function useOwnerUserAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { username: string; action: UserAction }) => unwrap(await client.mutations.ownerUserAction(input), 'user'),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['owner', 'users'] });
      void qc.invalidateQueries({ queryKey: ownerKeys.events });
    },
  });
}

// ───────────────────────────── categories ─────────────────────────────

export type CategoryInput = Omit<Category, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export function useSaveCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...input }: CategoryInput) => (id ? unwrap(await client.models.Category.update({ id, ...input }), 'category') : unwrap(await client.models.Category.create(input), 'category')),
    onSuccess: (c) => {
      if (c) qc.setQueryData<Category[]>(platformKeys.categories, (old) => [...(old ?? []).filter((x) => x.id !== c.id), c].sort((a, b) => (a.order ?? 999) - (b.order ?? 999)));
      void qc.invalidateQueries({ queryKey: platformKeys.categories });
    },
  });
}

export function useDeleteCategory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => unwrap(await client.models.Category.delete({ id }), 'category'),
    onSuccess: (_d, id) => qc.setQueryData<Category[]>(platformKeys.categories, (old) => old?.filter((c) => c.id !== id)),
  });
}

/** Swaps the `order` of two categories (move up / down). */
export function useReorderCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (pairs: { id: string; order: number }[]) => {
      for (const p of pairs) unwrap(await client.models.Category.update(p), 'category');
    },
    onMutate: (pairs) =>
      qc.setQueryData<Category[]>(platformKeys.categories, (old) =>
        old?.map((c) => {
          const p = pairs.find((x) => x.id === c.id);
          return p ? { ...c, order: p.order } : c;
        }).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
      ),
    onSettled: () => void qc.invalidateQueries({ queryKey: platformKeys.categories }),
  });
}

/** Creates the recommended categories that do not exist yet (matched by slug). Returns how many were added. */
export function useSeedCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (existing: Category[]) => {
      const slugs = new Set(existing.map((c) => c.slug));
      let order = existing.reduce((m, c) => Math.max(m, c.order ?? 0), 0);
      let added = 0;
      for (const d of DEFAULT_CATEGORIES) {
        if (slugs.has(d.slug)) continue;
        order += 1;
        unwrap(await client.models.Category.create({ ...d, order, active: true }), 'category');
        added++;
      }
      return added;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: platformKeys.categories }),
  });
}

// ───────────────────────────── branding ─────────────────────────────

export type AppConfigInput = Partial<Omit<AppConfig, 'id' | 'createdAt' | 'updatedAt'>> & { appName: string };

export function useSaveAppConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: AppConfigInput) => {
      const existing = (await client.models.AppConfig.get({ id: APP_CONFIG_ID })).data;
      return existing
        ? unwrap(await client.models.AppConfig.update({ id: APP_CONFIG_ID, ...input }), 'branding')
        : unwrap(await client.models.AppConfig.create({ id: APP_CONFIG_ID, ...input }), 'branding');
    },
    onSuccess: (cfg) => {
      if (cfg) qc.setQueryData(APP_CONFIG_KEY, cfg);
      void qc.invalidateQueries({ queryKey: APP_CONFIG_KEY });
    },
  });
}

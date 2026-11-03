import {
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminListGroupsForUserCommand,
  AdminResetUserPasswordCommand,
  DeleteGroupCommand,
  ListUsersCommand,
  type UserType,
} from '@aws-sdk/client-cognito-identity-provider';
import type { Schema } from '../../data/resource';
import { forEachPage, listAll, mapLimit, nowIso, type DataClient } from '../shared/data';
import { HandlerError, type Caller } from '../shared/types';
import { DIRECTORY_HIDDEN, LEGACY_SCHOOL_ID } from '../shared/tenancy';
import { addDays, qatarNow } from '../shared/booking';
import { recordEvent } from '../shared/platform';
import { syncVenues, type Deps } from './business';

type Models = DataClient['models'];

// ───────────────────────────── overview ─────────────────────────────

const monthsBack = (n: number) => {
  const out: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    out.push(m.toISOString().slice(0, 7));
  }
  return out;
};

async function scanAll<T>(list: (nextToken: string | null | undefined) => Promise<{ data: T[]; nextToken?: string | null; errors?: { message: string }[] }>, maxPages = 100): Promise<T[]> {
  return listAll(list, maxPages);
}

const monthlyEquivalent = (price: number | null | undefined, cycle: string | null | undefined) => {
  const p = price ?? 0;
  if (cycle === 'YEARLY') return p / 12;
  if (cycle === 'QUARTERLY') return p / 3;
  return p;
};

/** Counters and series for the owner dashboard (bounded scans – fine for a growing platform). */
export async function ownerOverview(client: DataClient) {
  const m = client.models;
  const [schools, businesses, venues, subs, invoices, bookings] = await Promise.all([
    scanAll((t) => m.School.list({ limit: 500, nextToken: t })),
    scanAll((t) => m.Business.list({ limit: 500, nextToken: t })),
    scanAll((t) => m.Venue.list({ limit: 500, nextToken: t })),
    scanAll((t) => m.TenantSubscription.list({ limit: 500, nextToken: t })),
    scanAll((t) => m.Invoice.list({ limit: 500, nextToken: t })),
    scanAll((t) => m.Booking.list({ limit: 1000, nextToken: t }), 50),
  ]);
  const roles = ['STUDENT', 'TEACHER', 'DRIVER', 'ADMIN', 'PARTNER', 'CUSTOMER'] as const;
  const people: Record<string, number> = {};
  await Promise.all(
    roles.map(async (role) => {
      let n = 0;
      await forEachPage((t) => m.Profile.listProfilesByRole({ role }, { limit: 1000, nextToken: t }), async (items) => void (n += items.length), 50);
      people[role] = n;
    }),
  );

  const today = qatarNow().date;
  const from30 = addDays(today, -30);
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const months = monthsBack(6);
  const subByTenant = new Map(subs.map((s) => [s.tenantId, s]));

  const bookingsByDay = Object.fromEntries(days14.map((d) => [d, 0]));
  const bookingsByStatus: Record<string, number> = {};
  let gmv30 = 0;
  let commission30 = 0;
  let bookings30 = 0;
  for (const b of bookings) {
    bookingsByStatus[b.status ?? 'PENDING'] = (bookingsByStatus[b.status ?? 'PENDING'] ?? 0) + 1;
    const bookedDay = (b.bookedAt ?? '').slice(0, 10);
    if (bookedDay in bookingsByDay) bookingsByDay[bookedDay]++;
    if (bookedDay >= from30) {
      bookings30++;
      if (b.status === 'CONFIRMED' || b.status === 'COMPLETED') {
        gmv30 += b.price ?? 0;
        commission30 += ((b.price ?? 0) * (subByTenant.get(b.businessId)?.commissionPercent ?? 0)) / 100;
      }
    }
  }

  const revenueByMonth = Object.fromEntries(months.map((mo) => [mo, 0]));
  let outstanding = 0;
  let overdueCount = 0;
  let paidThisMonth = 0;
  const thisMonth = today.slice(0, 7);
  for (const inv of invoices) {
    if (inv.status === 'PAID') {
      const mo = (inv.paidAt ?? inv.issueDate).slice(0, 7);
      if (mo in revenueByMonth) revenueByMonth[mo] += inv.total;
      if (mo === thisMonth) paidThisMonth += inv.total;
    } else if (inv.status === 'ISSUED' || inv.status === 'OVERDUE') {
      outstanding += inv.total;
      if (inv.status === 'OVERDUE' || (inv.dueDate && inv.dueDate < today)) overdueCount++;
    }
  }

  const subsByStatus: Record<string, number> = {};
  let mrr = 0;
  for (const s of subs) {
    subsByStatus[s.status] = (subsByStatus[s.status] ?? 0) + 1;
    if (s.status === 'ACTIVE' || s.status === 'PAST_DUE') mrr += monthlyEquivalent(s.price, s.cycle);
  }
  const newTenants30 = [...schools, ...businesses].filter((t) => (t.createdAt ?? '').slice(0, 10) >= from30).length;

  return {
    json: JSON.stringify({
      generatedAt: nowIso(),
      tenants: {
        schools: schools.length,
        schoolsSuspended: schools.filter((s) => s.status === 'SUSPENDED').length,
        businesses: businesses.length,
        businessesSuspended: businesses.filter((b) => b.status === 'SUSPENDED').length,
        venues: venues.length,
        venuesListed: venues.filter((v) => v.directory === 'PUBLIC').length,
        newLast30: newTenants30,
        withoutSubscription: [...schools.map((s) => s.schoolId), ...businesses.map((b) => b.businessId)].filter((id) => !subByTenant.has(id)).length,
      },
      people,
      bookings: { total: bookings.length, last30: bookings30, byStatus: bookingsByStatus, byDay: bookingsByDay, gmv30, commission30 },
      billing: { mrr, outstanding, overdueCount, paidThisMonth, revenueByMonth, subscriptionsByStatus: subsByStatus, currency: subs[0]?.currency ?? 'QAR' },
    }),
  };
}

// ───────────────────────────── users ─────────────────────────────

const attr = (u: UserType, name: string) => u.Attributes?.find((a) => a.Name === name)?.Value;

export async function ownerListUsers(deps: Deps, args: { search?: string | null; nextToken?: string | null }) {
  const q = (args.search ?? '').trim().replace(/"/g, '');
  let filter: string | undefined;
  if (q) filter = q.includes('@') ? `email ^= "${q.toLowerCase()}"` : `username ^= "${q}"`;
  const res = await deps.cognito.send(new ListUsersCommand({ UserPoolId: deps.userPoolId, Limit: 50, PaginationToken: args.nextToken || undefined, Filter: filter }));
  let users = res.Users ?? [];
  if (q && !users.length && !q.includes('@')) {
    // fall back to a name prefix search
    const byName = await deps.cognito.send(new ListUsersCommand({ UserPoolId: deps.userPoolId, Limit: 50, Filter: `name ^= "${q}"` }));
    users = byName.Users ?? [];
  }
  const out = await mapLimit(users, 5, async (u) => {
    const groups = await deps.cognito
      .send(new AdminListGroupsForUserCommand({ UserPoolId: deps.userPoolId, Username: u.Username!, Limit: 20 }))
      .then((g) => (g.Groups ?? []).map((x) => x.GroupName ?? '').filter(Boolean))
      .catch(() => [] as string[]);
    return {
      username: u.Username ?? '',
      sub: attr(u, 'sub'),
      email: attr(u, 'email'),
      name: attr(u, 'name'),
      enabled: u.Enabled ?? true,
      status: u.UserStatus,
      groups,
      schoolId: attr(u, 'custom:schoolId'),
      createdAt: u.UserCreateDate?.toISOString(),
    };
  });
  return { users: out, nextToken: res.PaginationToken ?? null };
}

export async function ownerUserAction(deps: Deps, identity: Caller, args: { username: string; action: string }) {
  const { cognito, userPoolId, client } = deps;
  if (args.username === identity.username) throw new HandlerError('You cannot change your own owner account here', 'FORBIDDEN');
  const groups = await cognito
    .send(new AdminListGroupsForUserCommand({ UserPoolId: userPoolId, Username: args.username, Limit: 20 }))
    .then((g) => (g.Groups ?? []).map((x) => x.GroupName ?? ''));
  if (groups.includes('OWNER')) throw new HandlerError('Owner accounts are managed in Cognito', 'FORBIDDEN');
  switch (args.action) {
    case 'ENABLE':
      await cognito.send(new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: args.username }));
      break;
    case 'DISABLE':
      await cognito.send(new AdminDisableUserCommand({ UserPoolId: userPoolId, Username: args.username }));
      break;
    case 'RESET_PASSWORD':
      await cognito.send(new AdminResetUserPasswordCommand({ UserPoolId: userPoolId, Username: args.username }));
      break;
    case 'DELETE': {
      const page = await cognito.send(new ListUsersCommand({ UserPoolId: userPoolId, Filter: `username = "${args.username.replace(/"/g, '')}"`, Limit: 1 }));
      const sub = page.Users?.[0] ? attr(page.Users[0], 'sub') : undefined;
      if (sub) {
        await client.models.Profile.delete({ userId: sub }).catch(() => undefined);
        const devices = await listAll((t) => client.models.Device.listDevicesByUser({ userId: sub }, { limit: 50, nextToken: t }), 4).catch(() => []);
        await mapLimit(devices, 5, (d) => client.models.Device.delete({ id: d.id }));
      }
      await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: args.username }));
      break;
    }
    default:
      throw new HandlerError('Unknown action', 'VALIDATION');
  }
  await recordEvent(client, { type: `USER_${args.action}`, title: args.username, actorId: identity.sub });
  return { ok: true, count: 1 };
}

// ───────────────────────────── tenants ─────────────────────────────

export async function ownerSetTenantStatus(deps: Deps, identity: Caller, args: { tenantType: string; tenantId: string; status: 'ACTIVE' | 'SUSPENDED' | 'PENDING' }) {
  const { client } = deps;
  let name = args.tenantId;
  if (args.tenantType === 'SCHOOL') {
    const school = (await client.models.School.get({ schoolId: args.tenantId })).data;
    if (!school) throw new HandlerError('School not found', 'NOT_FOUND');
    name = school.name;
    await client.models.School.update({ schoolId: school.schoolId, status: args.status });
  } else if (args.tenantType === 'BUSINESS') {
    const business = (await client.models.Business.get({ businessId: args.tenantId })).data;
    if (!business) throw new HandlerError('Business not found', 'NOT_FOUND');
    name = business.name;
    const updated = (await client.models.Business.update({ businessId: business.businessId, status: args.status })).data;
    if (updated) await syncVenues(client, updated);
  } else throw new HandlerError('Unknown tenant type', 'VALIDATION');
  const sub = (await client.models.TenantSubscription.get({ tenantId: args.tenantId })).data;
  if (sub && args.status === 'SUSPENDED' && sub.status !== 'CANCELLED') await client.models.TenantSubscription.update({ tenantId: args.tenantId, status: 'SUSPENDED' });
  if (sub && args.status === 'ACTIVE' && sub.status === 'SUSPENDED') await client.models.TenantSubscription.update({ tenantId: args.tenantId, status: 'ACTIVE' });
  await recordEvent(client, { type: args.status === 'SUSPENDED' ? 'TENANT_SUSPENDED' : 'TENANT_REACTIVATED', title: name, tenantId: args.tenantId, tenantType: args.tenantType as 'SCHOOL' | 'BUSINESS', actorId: identity.sub });
  return { ok: true, count: 1 };
}

/** Models scoped by `schoolId`, with their primary keys (for the cascade delete of a school). */
const SCHOOL_MODELS: { model: keyof Models; key: string[] }[] = [
  { model: 'Application', key: ['id'] },
  { model: 'Class', key: ['id'] },
  { model: 'Bus', key: ['busId'] },
  { model: 'BusLocation', key: ['busId'] },
  { model: 'StudentDayStatus', key: ['studentId', 'date'] },
  { model: 'Trip', key: ['id'] },
  { model: 'TripStop', key: ['id'] },
  { model: 'Conversation', key: ['id'] },
  { model: 'ConversationMember', key: ['conversationId', 'userId'] },
  { model: 'Message', key: ['id'] },
  { model: 'MessageReport', key: ['id'] },
  { model: 'Feedback', key: ['id'] },
  { model: 'Broadcast', key: ['id'] },
  { model: 'Notification', key: ['id'] },
  { model: 'Course', key: ['id'] },
  { model: 'CourseLesson', key: ['id'] },
  { model: 'CourseEnrollment', key: ['id'] },
  { model: 'AuditLog', key: ['id'] },
  { model: 'ImportJob', key: ['id'] },
  { model: 'SchoolSettings', key: ['schoolId'] },
  { model: 'School', key: ['schoolId'] },
];

type AnyModel = {
  list: (o: { filter?: unknown; limit?: number; nextToken?: string | null }) => Promise<{ data: Record<string, unknown>[]; nextToken?: string | null; errors?: { message: string }[] }>;
  delete: (k: Record<string, unknown>) => Promise<unknown>;
};

async function deleteWhere(client: DataClient, model: keyof Models, key: string[], field: string, value: string): Promise<number> {
  const m = client.models[model] as unknown as AnyModel;
  let n = 0;
  // Always re-read the first page: deleting while paging would skip rows.
  for (let round = 0; round < 1000; round++) {
    const page = await m.list({ filter: { [field]: { eq: value } }, limit: 1000 });
    if (page.errors?.length) throw new Error(`${String(model)}: ${page.errors.map((e) => e.message).join('; ')}`);
    let rows = page.data;
    let token = page.nextToken;
    while (!rows.length && token) {
      const next = await m.list({ filter: { [field]: { eq: value } }, limit: 1000, nextToken: token });
      rows = next.data;
      token = next.nextToken;
    }
    if (!rows.length) break;
    await mapLimit(rows, 10, (r) => m.delete(Object.fromEntries(key.map((k) => [k, r[k]]))));
    n += rows.length;
  }
  return n;
}

async function deleteAccounts(deps: Deps, tenantId: string): Promise<number> {
  const { client, cognito, userPoolId } = deps;
  const profiles = await listAll((t) => client.models.Profile.listProfilesBySchool({ schoolId: tenantId }, { limit: 500, nextToken: t }), 200);
  await mapLimit(profiles, 4, async (p) => {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: p.username })).catch((e: { name?: string }) => {
      if (e.name !== 'UserNotFoundException') throw e;
    });
    const devices = await listAll((t) => client.models.Device.listDevicesByUser({ userId: p.userId }, { limit: 50, nextToken: t }), 4).catch(() => []);
    await mapLimit(devices, 5, (d) => client.models.Device.delete({ id: d.id }));
    await client.models.Profile.delete({ userId: p.userId });
  });
  return profiles.length;
}

export async function ownerDeleteTenant(deps: Deps, identity: Caller, args: { tenantType: string; tenantId: string; confirmName: string }) {
  const { client, cognito, userPoolId } = deps;
  const confirm = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const summary: Record<string, number> = {};
  let name = '';
  if (args.tenantType === 'SCHOOL') {
    const school = (await client.models.School.get({ schoolId: args.tenantId })).data;
    const settings = (await client.models.SchoolSettings.get({ schoolId: args.tenantId })).data;
    name = school?.name ?? settings?.name ?? '';
    if (!school && !settings) throw new HandlerError('School not found', 'NOT_FOUND');
    if (!confirm(args.confirmName, name)) throw new HandlerError('Type the exact school name to confirm', 'VALIDATION');
    summary.accounts = await deleteAccounts(deps, args.tenantId);
    for (const { model, key } of SCHOOL_MODELS) summary[String(model)] = await deleteWhere(client, model, key, 'schoolId', args.tenantId);
    if (args.tenantId !== LEGACY_SCHOOL_ID) await cognito.send(new DeleteGroupCommand({ UserPoolId: userPoolId, GroupName: args.tenantId })).catch(() => undefined);
  } else if (args.tenantType === 'BUSINESS') {
    const business = (await client.models.Business.get({ businessId: args.tenantId })).data;
    if (!business) throw new HandlerError('Business not found', 'NOT_FOUND');
    name = business.name;
    if (!confirm(args.confirmName, name)) throw new HandlerError('Type the exact business name to confirm', 'VALIDATION');
    const venues = await listAll((t) => client.models.Venue.listVenuesByBusiness({ businessId: business.businessId }, { limit: 200, nextToken: t }), 20);
    for (const v of venues) {
      const slots = await listAll((t) => client.models.VenueSlot.listSlotsByVenueAndDate({ venueId: v.id }, { limit: 1000, nextToken: t }), 50);
      await mapLimit(slots, 10, (s) => client.models.VenueSlot.delete({ venueId: s.venueId, slotKey: s.slotKey }));
      await client.models.Venue.delete({ id: v.id });
    }
    summary.venues = venues.length;
    const bookings = await listAll((t) => client.models.Booking.listBookingsByBusiness({ businessId: business.businessId }, { limit: 1000, nextToken: t }), 100);
    const today = qatarNow().date;
    const upcoming = bookings.filter((b) => (b.status === 'PENDING' || b.status === 'CONFIRMED') && b.date >= today);
    for (const b of upcoming) {
      await client.models.Notification.create({
        userId: b.customerId,
        schoolId: `cus-${b.customerId}`,
        type: 'BOOKING',
        title: `Booking cancelled · ${b.venueName ?? ''}`,
        body: `${b.date} ${b.startTime} – the venue is no longer available.`,
        read: false,
        sentAt: nowIso(),
      }).catch(() => undefined);
    }
    await mapLimit(bookings, 10, (b) => client.models.Booking.delete({ id: b.id }));
    summary.bookings = bookings.length;
    summary.accounts = await deleteAccounts(deps, business.businessId);
    summary.notifications = await deleteWhere(client, 'Notification', ['id'], 'schoolId', business.businessId);
    await client.models.Business.delete({ businessId: business.businessId });
    await cognito.send(new DeleteGroupCommand({ UserPoolId: userPoolId, GroupName: business.businessId })).catch(() => undefined);
  } else throw new HandlerError('Unknown tenant type', 'VALIDATION');
  // Invoices stay for the owner's records (tenantName is kept on each invoice).
  await client.models.TenantSubscription.delete({ tenantId: args.tenantId }).catch(() => undefined);
  await recordEvent(client, { type: 'TENANT_DELETED', title: name, detail: JSON.stringify(summary), tenantId: args.tenantId, tenantType: args.tenantType as 'SCHOOL' | 'BUSINESS', actorId: identity.sub });
  return { ok: true, count: Object.values(summary).reduce((a, b) => a + b, 0) };
}

export type _Unused = Schema;
export { DIRECTORY_HIDDEN };

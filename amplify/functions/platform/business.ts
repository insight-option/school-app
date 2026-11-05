import { randomBytes } from 'node:crypto';
import {
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUpdateUserAttributesCommand,
  CreateGroupCommand,
  DeleteGroupCommand,
  type CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { z } from 'zod';
import type { Schema } from '../../data/resource';
import { listAll, mapLimit, nowIso, unwrap, withRetry, type DataClient } from '../shared/data';
import { HandlerError, type Caller } from '../shared/types';
import { DIRECTORY_HIDDEN, DIRECTORY_PUBLIC, normalizeSearch } from '../shared/tenancy';
import { customerTenantId, hoursProblem, newBusinessId, parseHours, qatarNow } from '../shared/booking';
import { recordEvent, startTrialSubscription } from '../shared/platform';

export type Deps = { client: DataClient; cognito: CognitoIdentityProviderClient; userPoolId: string };
type Business = Schema['Business']['type'];
type Venue = Schema['Venue']['type'];

const SCHOOL_ROLES = ['ADMIN', 'TEACHER', 'DRIVER', 'STUDENT'];
const ROLE_GROUPS = [...SCHOOL_ROLES, 'PARTNER', 'CUSTOMER', 'OWNER'];

const optText = (max: number) => z.string().trim().max(max).optional().nullable();
const mediaKey = z.string().regex(/^(school-media|branding)\/[A-Za-z0-9:_\-./]+$/, 'Invalid media key').max(300);
const listOf = (maxItems: number, maxLen: number) => z.array(z.string().trim().min(1).max(maxLen)).max(maxItems).optional().nullable();

export const BusinessInput = z.object({
  name: z.string().trim().min(2, 'Business name is required').max(120),
  ownerName: z.string().trim().min(2, 'Your name is required').max(120).optional(),
  listed: z.boolean().optional().nullable(),
  categoryIds: listOf(12, 64),
  tagline: optText(160),
  description: optText(4000),
  logoKey: mediaKey.optional().nullable().or(z.literal('')),
  coverKey: mediaKey.optional().nullable().or(z.literal('')),
  primaryColor: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal('')]).optional().nullable(),
  phone: optText(32),
  email: z.union([z.email(), z.literal('')]).optional().nullable(),
  whatsapp: optText(32),
  website: optText(200),
  instagram: optText(80),
  city: optText(80),
  area: optText(80),
  address: optText(300),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  language: z.enum(['en', 'ar']).optional().nullable(),
});

const HoursInput = z.record(z.string(), z.array(z.tuple([z.string(), z.string()])).max(4));

export const VenueInput = z.object({
  id: z.string().max(64).optional().nullable(),
  businessId: z.string().max(64).optional().nullable(), // owner console only
  name: z.string().trim().min(2, 'Name is required').max(120),
  categoryId: z.string().trim().min(1, 'Choose a category').max(64),
  listed: z.boolean().optional().nullable(),
  description: optText(4000),
  photos: z.array(mediaKey).max(12).optional().nullable(),
  city: optText(80),
  area: optText(80),
  address: optText(300),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  amenities: listOf(30, 60),
  audience: z.enum(['ALL', 'MEN', 'WOMEN', 'KIDS', 'FAMILY']).optional().nullable(),
  indoor: z.boolean().optional().nullable(),
  surface: optText(60),
  priceMode: z.enum(['PER_HOUR', 'PER_SESSION', 'PER_PERSON', 'ON_REQUEST', 'FREE']),
  price: z.number().min(0).max(1_000_000).optional().nullable(),
  currency: optText(8),
  priceNote: optText(200),
  openingHours: HoursInput.optional().nullable(),
  slotMinutes: z.number().int().refine((n) => [15, 30, 45, 60, 90, 120, 180, 240].includes(n), 'Slot length must be 15–240 minutes').optional().nullable(),
  minDurationMinutes: z.number().int().min(15).max(1440).optional().nullable(),
  maxDurationMinutes: z.number().int().min(15).max(1440).optional().nullable(),
  capacity: z.number().int().min(1).max(100).optional().nullable(),
  unitLabel: optText(40),
  maxPeople: z.number().int().min(1).max(10_000).optional().nullable(),
  bookingMode: z.enum(['INSTANT', 'REQUEST', 'CONTACT']),
  advanceDays: z.number().int().min(1).max(365).optional().nullable(),
  cancellationHours: z.number().int().min(0).max(720).optional().nullable(),
  rules: optText(2000),
  phone: optText(32),
  whatsapp: optText(32),
  featured: z.boolean().optional().nullable(), // owner console only
});

export function parseOrThrow<T>(schema: z.ZodType<T>, raw: unknown): T {
  let v = raw;
  for (let i = 0; i < 2 && typeof v === 'string'; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      throw new HandlerError('Invalid JSON', 'VALIDATION');
    }
  }
  const r = schema.safeParse(v);
  if (!r.success) throw new HandlerError(r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '), 'VALIDATION');
  return r.data;
}

async function userGroups(deps: Deps, username: string): Promise<string[]> {
  const res = await deps.cognito.send(new AdminListGroupsForUserCommand({ UserPoolId: deps.userPoolId, Username: username, Limit: 60 }));
  return (res.Groups ?? []).map((g) => g.GroupName ?? '').filter(Boolean);
}

async function verifiedEmail(deps: Deps, identity: Caller, what: string): Promise<string> {
  const user = await deps.cognito.send(new AdminGetUserCommand({ UserPoolId: deps.userPoolId, Username: identity.username }));
  const attr = (n: string) => user.UserAttributes?.find((a) => a.Name === n)?.Value;
  if (attr('email_verified') !== 'true') throw new HandlerError(`Verify your e-mail address before ${what}`, 'FORBIDDEN');
  return attr('email') ?? '';
}

async function assertNoRole(deps: Deps, identity: Caller) {
  const existing = (await deps.client.models.Profile.get({ userId: identity.sub })).data;
  if (existing) throw new HandlerError('This account already has a workspace. Sign out and create a new account.', 'CONFLICT');
  const groups = await userGroups(deps, identity.username);
  if (groups.some((g) => ROLE_GROUPS.includes(g))) throw new HandlerError('This account already has a workspace.', 'CONFLICT');
}

/** The business the caller administers (partners) – or the one named in the input (owner). */
export async function resolveBusiness(client: DataClient, identity: Caller, requested?: string | null): Promise<Business> {
  const isOwner = identity.groups.includes('OWNER');
  let businessId = requested ?? '';
  if (!isOwner || !businessId) {
    const profile = (await client.models.Profile.get({ userId: identity.sub })).data;
    if (!profile || profile.role !== 'PARTNER') {
      if (isOwner && !businessId) throw new HandlerError('businessId is required', 'VALIDATION');
      throw new HandlerError('Partner accounts only', 'FORBIDDEN');
    }
    if (profile.isActive === false) throw new HandlerError('Account disabled', 'FORBIDDEN');
    businessId = profile.schoolId;
  }
  const business = (await client.models.Business.get({ businessId })).data;
  if (!business) throw new HandlerError('Business not found', 'NOT_FOUND');
  if (!isOwner && !identity.groups.includes(business.businessId)) throw new HandlerError('Business not found', 'NOT_FOUND');
  return business;
}

const venueDirectory = (business: Pick<Business, 'status' | 'directory'>, listed: boolean | null | undefined) =>
  business.status === 'ACTIVE' && business.directory === DIRECTORY_PUBLIC && listed !== false ? DIRECTORY_PUBLIC : DIRECTORY_HIDDEN;

/**
 * Re-derives the denormalised business fields and directory flag of every venue of a business.
 * The business's categories are the ones it chose plus every category one of its venues is in.
 */
export async function syncVenues(client: DataClient, business: Business) {
  const venues = await listAll((nextToken) => client.models.Venue.listVenuesByBusiness({ businessId: business.businessId }, { limit: 100, nextToken }), 20);
  await mapLimit(venues, 6, async (v) => {
    const directory = venueDirectory(business, v.listed);
    if (v.directory !== directory || v.businessName !== business.name || v.businessLogoKey !== (business.logoKey ?? null)) {
      await client.models.Venue.update({ id: v.id, directory, businessName: business.name, businessLogoKey: business.logoKey ?? null });
    }
  });
  const chosen = (business.categoryIds ?? []).filter((c): c is string => !!c);
  const categoryIds = Array.from(new Set([...chosen, ...venues.map((v) => v.categoryId)]));
  if (business.venueCount !== venues.length || JSON.stringify([...chosen].sort()) !== JSON.stringify([...categoryIds].sort())) {
    await client.models.Business.update({ businessId: business.businessId, venueCount: venues.length, categoryIds });
  }
}



// ───────────────────────────── registration ─────────────────────────────

/** "List my business": verified account without a workspace → partner admin of a new business. */
export async function registerBusiness(deps: Deps, identity: Caller, raw: unknown) {
  const { client, cognito, userPoolId } = deps;
  const existing = (await client.models.Profile.get({ userId: identity.sub })).data;
  if (existing?.role === 'PARTNER') return { schoolId: existing.schoolId, role: 'PARTNER', changed: true };
  const input = parseOrThrow(BusinessInput, raw);
  if ((input.lat == null) !== (input.lng == null)) throw new HandlerError('Location needs both latitude and longitude', 'VALIDATION');
  const email = await verifiedEmail(deps, identity, 'listing a business');
  await assertNoRole(deps, identity);

  const businessId = newBusinessId((n) => randomBytes(n));
  const ownerName = input.ownerName || input.name;
  const steps: (() => Promise<unknown>)[] = [];
  try {
    await cognito.send(new CreateGroupCommand({ UserPoolId: userPoolId, GroupName: businessId, Description: `Admins of ${input.name}`.slice(0, 2048) }));
    steps.push(() => cognito.send(new DeleteGroupCommand({ UserPoolId: userPoolId, GroupName: businessId })));
    await withRetry(() => cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: identity.username, GroupName: businessId })));
    await withRetry(() => cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: identity.username, GroupName: 'PARTNER' })));
    steps.push(() => cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: userPoolId, Username: identity.username, GroupName: 'PARTNER' })));
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: identity.username,
        UserAttributes: [
          { Name: 'custom:schoolId', Value: businessId },
          { Name: 'custom:role', Value: 'PARTNER' },
          { Name: 'name', Value: ownerName },
        ],
      }),
    );
    unwrap(
      await client.models.Profile.create({
        userId: identity.sub,
        username: identity.username,
        role: 'PARTNER',
        schoolId: businessId,
        fullName: ownerName,
        email,
        phone: input.phone ?? undefined,
        isActive: true,
        language: input.language ?? 'en',
      }),
      'Profile.create',
    );
    steps.push(() => client.models.Profile.delete({ userId: identity.sub }));
    unwrap(
      await client.models.Business.create({
        businessId,
        name: input.name,
        nameLower: normalizeSearch(input.name),
        directory: input.listed === false ? DIRECTORY_HIDDEN : DIRECTORY_PUBLIC,
        status: 'ACTIVE',
        categoryIds: input.categoryIds ?? [],
        tagline: input.tagline ?? undefined,
        description: input.description ?? undefined,
        logoKey: input.logoKey || undefined,
        coverKey: input.coverKey || undefined,
        primaryColor: input.primaryColor || undefined,
        phone: input.phone ?? undefined,
        email: input.email || email || undefined,
        whatsapp: input.whatsapp ?? undefined,
        website: input.website ?? undefined,
        instagram: input.instagram ?? undefined,
        city: input.city ?? undefined,
        area: input.area ?? undefined,
        address: input.address ?? undefined,
        location: input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : undefined,
        ownerUserId: identity.sub,
        verified: false,
        venueCount: 0,
      }),
      'Business.create',
    );
  } catch (e) {
    console.error('registerBusiness failed, rolling back', e);
    for (const undo of steps.reverse()) await undo().catch((err) => console.error('rollback step failed', err));
    throw e;
  }
  await startTrialSubscription(client, { tenantId: businessId, tenantType: 'BUSINESS', tenantName: input.name, billingName: ownerName, billingEmail: email, billingPhone: input.phone ?? undefined });
  await recordEvent(client, { type: 'BUSINESS_REGISTERED', title: input.name, detail: `${ownerName} · ${email}`, tenantId: businessId, tenantType: 'BUSINESS', actorId: identity.sub });
  return { schoolId: businessId, role: 'PARTNER', changed: true };
}

/** A verified account without a workspace becomes a customer (books activities). */
export async function registerCustomer(deps: Deps, identity: Caller, args: { name: string; phone?: string | null; language?: string | null }) {
  const { client, cognito, userPoolId } = deps;
  const existing = (await client.models.Profile.get({ userId: identity.sub })).data;
  if (existing) return { schoolId: existing.schoolId, role: existing.role, changed: false };
  const name = (args.name ?? '').trim().slice(0, 120);
  if (name.length < 2) throw new HandlerError('Your name is required', 'VALIDATION');
  const email = await verifiedEmail(deps, identity, 'booking');
  await assertNoRole(deps, identity);
  const tenant = customerTenantId(identity.sub);
  await withRetry(() => cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: identity.username, GroupName: 'CUSTOMER' })));
  await cognito.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: identity.username,
      UserAttributes: [
        { Name: 'custom:schoolId', Value: tenant },
        { Name: 'custom:role', Value: 'CUSTOMER' },
        { Name: 'name', Value: name },
      ],
    }),
  );
  unwrap(
    await client.models.Profile.create({
      userId: identity.sub,
      username: identity.username,
      role: 'CUSTOMER',
      schoolId: tenant,
      fullName: name,
      email,
      phone: args.phone?.trim().slice(0, 32) || undefined,
      isActive: true,
      language: args.language === 'ar' ? 'ar' : 'en',
    }),
    'Profile.create',
  );
  await recordEvent(client, { type: 'CUSTOMER_JOINED', title: name, detail: email, actorId: identity.sub });
  return { schoolId: tenant, role: 'CUSTOMER', changed: true };
}

// ───────────────────────────── business profile & venues ─────────────────────────────

export async function saveBusinessProfile(client: DataClient, identity: Caller, raw: unknown, requestedId?: string | null) {
  const business = await resolveBusiness(client, identity, requestedId);
  const input = parseOrThrow(BusinessInput.partial().extend({ name: BusinessInput.shape.name.optional() }), raw);
  if ((input.lat == null) !== (input.lng == null)) throw new HandlerError('Location needs both latitude and longitude', 'VALIDATION');
  const patch: Record<string, unknown> = { businessId: business.businessId };
  const set = (k: string, v: unknown) => {
    if (v !== undefined) patch[k] = v === '' ? null : v;
  };
  if (input.name) {
    patch.name = input.name;
    patch.nameLower = normalizeSearch(input.name);
  }
  if (input.listed !== undefined && input.listed !== null) patch.directory = input.listed ? DIRECTORY_PUBLIC : DIRECTORY_HIDDEN;
  for (const k of ['tagline', 'description', 'logoKey', 'coverKey', 'primaryColor', 'phone', 'email', 'whatsapp', 'website', 'instagram', 'city', 'area', 'address'] as const) set(k, input[k]);
  if (input.categoryIds) patch.categoryIds = input.categoryIds;
  if (input.lat != null && input.lng != null) patch.location = { lat: input.lat, lng: input.lng };
  const updated = unwrap(await client.models.Business.update(patch as Parameters<typeof client.models.Business.update>[0]), 'Business.update');
  await syncVenues(client, updated);
  if (input.name && input.name !== business.name) {
    const sub = (await client.models.TenantSubscription.get({ tenantId: business.businessId })).data;
    if (sub) await client.models.TenantSubscription.update({ tenantId: business.businessId, tenantName: input.name });
  }
  return (await client.models.Business.get({ businessId: business.businessId })).data;
}

export async function saveVenue(client: DataClient, identity: Caller, raw: unknown): Promise<Venue> {
  const input = parseOrThrow(VenueInput, raw);
  const business = await resolveBusiness(client, identity, identity.groups.includes('OWNER') ? input.businessId : null);
  if ((input.lat == null) !== (input.lng == null)) throw new HandlerError('Location needs both latitude and longitude', 'VALIDATION');
  const category = (await client.models.Category.get({ id: input.categoryId })).data;
  if (!category || category.active === false) throw new HandlerError('Choose a category', 'VALIDATION');

  const hours = input.openingHours ? parseHours(input.openingHours) : null;
  const hoursError = hours ? hoursProblem(hours) : null;
  if (hoursError) throw new HandlerError(hoursError, 'VALIDATION');
  const slotMinutes = input.slotMinutes ?? 60;
  const minD = input.minDurationMinutes ?? slotMinutes;
  const maxD = input.maxDurationMinutes ?? Math.max(minD, slotMinutes * 3);
  if (minD % slotMinutes !== 0 || maxD % slotMinutes !== 0 || maxD < minD) throw new HandlerError('Durations must be multiples of the slot length (min ≤ max)', 'VALIDATION');
  if (['PER_HOUR', 'PER_SESSION', 'PER_PERSON'].includes(input.priceMode) && (input.price == null || input.price <= 0)) throw new HandlerError('Enter a price, or choose "On request" / "Free"', 'VALIDATION');
  if (input.bookingMode === 'CONTACT' && !input.phone && !input.whatsapp && !business.phone && !business.whatsapp) {
    throw new HandlerError('"Contact to book" needs a phone or WhatsApp number', 'VALIDATION');
  }

  let current: Venue | null = null;
  if (input.id) {
    current = (await client.models.Venue.get({ id: input.id })).data;
    if (!current || current.businessId !== business.businessId) throw new HandlerError('Venue not found', 'NOT_FOUND');
  }
  const isOwner = identity.groups.includes('OWNER');
  const fields = {
    businessId: business.businessId,
    businessName: business.name,
    businessLogoKey: business.logoKey ?? null,
    name: input.name,
    nameLower: normalizeSearch(input.name),
    categoryId: category.id,
    listed: input.listed !== false,
    directory: venueDirectory(business, input.listed),
    description: input.description ?? null,
    photos: input.photos ?? [],
    city: input.city ?? business.city ?? null,
    area: input.area ?? business.area ?? null,
    address: input.address ?? business.address ?? null,
    location: input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : (current?.location ?? business.location ?? null),
    amenities: input.amenities ?? [],
    audience: input.audience ?? 'ALL',
    indoor: input.indoor ?? null,
    surface: input.surface ?? null,
    priceMode: input.priceMode,
    price: input.priceMode === 'FREE' || input.priceMode === 'ON_REQUEST' ? null : (input.price ?? null),
    currency: input.currency || 'QAR',
    priceNote: input.priceNote ?? null,
    openingHours: hours ? JSON.stringify(hours) : (current?.openingHours ?? null),
    slotMinutes,
    minDurationMinutes: minD,
    maxDurationMinutes: maxD,
    capacity: input.capacity ?? 1,
    unitLabel: input.unitLabel ?? null,
    maxPeople: input.maxPeople ?? null,
    bookingMode: input.bookingMode,
    advanceDays: input.advanceDays ?? 14,
    cancellationHours: input.cancellationHours ?? 6,
    rules: input.rules ?? null,
    phone: input.phone ?? business.phone ?? null,
    whatsapp: input.whatsapp ?? business.whatsapp ?? null,
    ...(isOwner && input.featured != null ? { featured: input.featured } : {}),
  };
  const saved = current
    ? unwrap(await client.models.Venue.update({ id: current.id, ...fields } as Parameters<typeof client.models.Venue.update>[0]), 'Venue.update')
    : unwrap(await client.models.Venue.create({ ...fields, bookingCount: 0, featured: isOwner ? !!input.featured : false } as Parameters<typeof client.models.Venue.create>[0]), 'Venue.create');
  await syncVenues(client, business);
  if (!current) await recordEvent(client, { type: 'VENUE_CREATED', title: `${saved.name} · ${business.name}`, tenantId: business.businessId, tenantType: 'BUSINESS', actorId: identity.sub });
  return saved;
}

export async function deleteVenue(client: DataClient, identity: Caller, venueId: string) {
  const venue = (await client.models.Venue.get({ id: venueId })).data;
  if (!venue) throw new HandlerError('Venue not found', 'NOT_FOUND');
  const business = await resolveBusiness(client, identity, identity.groups.includes('OWNER') ? venue.businessId : null);
  if (venue.businessId !== business.businessId) throw new HandlerError('Venue not found', 'NOT_FOUND');
  const today = qatarNow().date;
  const upcoming = (
    await listAll((nextToken) => client.models.Booking.listBookingsByVenue({ venueId, date: { ge: today } }, { limit: 200, nextToken }), 10)
  ).filter((b) => b.status === 'PENDING' || b.status === 'CONFIRMED');
  if (upcoming.length) throw new HandlerError(`This venue has ${upcoming.length} upcoming booking(s). Cancel them or hide the venue instead.`, 'CONFLICT');
  const slots = await listAll((nextToken) => client.models.VenueSlot.listSlotsByVenueAndDate({ venueId }, { limit: 500, nextToken }), 50);
  await mapLimit(slots, 10, (s) => client.models.VenueSlot.delete({ venueId: s.venueId, slotKey: s.slotKey }));
  await client.models.Venue.delete({ id: venueId });
  await syncVenues(client, business);
  return { ok: true, count: 1 };
}

export { nowIso };

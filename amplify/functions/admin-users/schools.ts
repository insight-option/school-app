import { randomBytes } from 'node:crypto';
import {
  AdminAddUserToGroupCommand,
  AdminGetUserCommand,
  AdminListGroupsForUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUpdateUserAttributesCommand,
  CreateGroupCommand,
  DeleteGroupCommand,
  GetGroupCommand,
  type CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { z } from 'zod';
import type { Schema } from '../../data/resource';
import { audit, nowIso, unwrap, withRetry, type DataClient } from '../shared/data';
import { DIRECTORY_HIDDEN, DIRECTORY_PUBLIC, newSchoolId, normalizeSearch } from '../shared/tenancy';
import { recordEvent, startTrialSubscription } from '../shared/platform';
import { HandlerError, type Caller } from '../shared/types';
import type { SchoolCaller } from '../shared/caller';

type School = Schema['School']['type'];

const optText = (max: number) => z.string().trim().max(max).optional().nullable();
const mediaKey = z
  .string()
  .max(300)
  .refine((k) => k === '' || k.startsWith('school-media/') || k.startsWith('school/branding/'), 'Invalid image');
const listOf = (maxItems: number, maxLen: number) => z.array(z.string().trim().min(1).max(maxLen)).max(maxItems).optional().nullable();

/** Public directory profile, as edited in Office → Public profile (all optional = partial update). */
export const SchoolProfileInput = z.object({
  name: z.string().trim().min(2, 'School name is required').max(120).optional(),
  listed: z.boolean().optional(),
  tagline: optText(160),
  description: optText(4000),
  logoKey: mediaKey.optional().nullable(),
  coverKey: mediaKey.optional().nullable(),
  primaryColor: z.union([z.string().regex(/^#[0-9a-fA-F]{6}$/), z.literal('')]).optional().nullable(),
  city: optText(80),
  country: optText(80),
  address: optText(300),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  phone: optText(32),
  email: z.union([z.email(), z.literal('')]).optional().nullable(),
  website: optText(200),
  curriculum: optText(80),
  grades: optText(80),
  gradeOptions: listOf(30, 40),
  languages: optText(120),
  genderPolicy: z.enum(['MIXED', 'BOYS', 'GIRLS']).optional().nullable(),
  feesFrom: z.number().min(0).max(10_000_000).optional().nullable(),
  feesTo: z.number().min(0).max(10_000_000).optional().nullable(),
  currency: optText(8),
  transportAvailable: z.boolean().optional().nullable(),
  foundedYear: z.number().int().min(1800).max(2100).optional().nullable(),
  facilities: listOf(24, 40),
  applicationsOpen: z.boolean().optional().nullable(),
  academicYear: optText(20),
  applicationDeadline: z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Deadline must be YYYY-MM-DD'), z.literal('')]).optional().nullable(),
  admissionsNote: optText(2000),
  requiredDocuments: listOf(20, 120),
  seatsAvailable: z.number().int().min(0).max(100_000).optional().nullable(),
});
export type SchoolProfile = z.infer<typeof SchoolProfileInput>;

function jsonArg(value: unknown): unknown {
  let v = value;
  for (let i = 0; i < 3 && typeof v === 'string'; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      throw new HandlerError('Invalid JSON input', 'VALIDATION');
    }
  }
  return v ?? {};
}

export function parseSchoolProfile(raw: unknown): SchoolProfile {
  const r = SchoolProfileInput.safeParse(jsonArg(raw));
  if (!r.success) throw new HandlerError(r.error.issues.map((i) => `${i.path.join('.') || 'profile'}: ${i.message}`).join('; '), 'VALIDATION');
  const p = r.data;
  if (p.feesFrom != null && p.feesTo != null && p.feesTo < p.feesFrom) throw new HandlerError('Fees "to" must be higher than "from"', 'VALIDATION');
  if ((p.lat == null) !== (p.lng == null)) throw new HandlerError('Location needs both latitude and longitude', 'VALIDATION');
  return p;
}

/** Map validated profile fields onto School columns (undefined = leave unchanged, '' / null = clear). */
function schoolColumns(p: SchoolProfile): Partial<School> {
  const out: Record<string, unknown> = {};
  const text = (k: keyof SchoolProfile, col: string = k) => {
    const v = p[k];
    if (v !== undefined) out[col] = v === '' ? null : v;
  };
  if (p.name !== undefined) {
    out.name = p.name;
    out.nameLower = normalizeSearch(p.name);
  }
  if (p.listed !== undefined) out.directory = p.listed ? DIRECTORY_PUBLIC : DIRECTORY_HIDDEN;
  (['tagline', 'description', 'logoKey', 'coverKey', 'primaryColor', 'city', 'country', 'address', 'phone', 'email', 'website', 'curriculum', 'grades', 'languages', 'currency', 'academicYear', 'applicationDeadline', 'admissionsNote'] as const).forEach((k) => text(k));
  (['gradeOptions', 'facilities', 'requiredDocuments', 'genderPolicy', 'feesFrom', 'feesTo', 'transportAvailable', 'foundedYear', 'applicationsOpen', 'seatsAvailable'] as const).forEach((k) => {
    if (p[k] !== undefined) out[k] = p[k];
  });
  if (p.lat !== undefined || p.lng !== undefined) out.location = p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null;
  return out as Partial<School>;
}

const SchoolSignupInput = z.object({
  name: z.string().trim().min(2, 'School name is required').max(120),
  adminName: z.string().trim().min(2, 'Your name is required').max(120),
  phone: optText(32),
  city: optText(80),
  country: optText(80),
  address: optText(300),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lng: z.number().min(-180).max(180).optional().nullable(),
  timezone: optText(64),
  language: z.enum(['en', 'ar']).optional().nullable(),
  logoKey: mediaKey.optional().nullable(),
  profile: z.unknown().optional().nullable(),
});

type Deps = { client: DataClient; cognito: CognitoIdentityProviderClient; userPoolId: string };

async function groupExists(deps: Deps, groupName: string): Promise<boolean> {
  try {
    await deps.cognito.send(new GetGroupCommand({ UserPoolId: deps.userPoolId, GroupName: groupName }));
    return true;
  } catch (e) {
    if ((e as { name?: string }).name === 'ResourceNotFoundException') return false;
    throw e;
  }
}

async function ensureSchoolGroup(deps: Deps, schoolId: string, schoolName: string) {
  if (await groupExists(deps, schoolId)) return;
  try {
    await deps.cognito.send(
      new CreateGroupCommand({ UserPoolId: deps.userPoolId, GroupName: schoolId, Description: `Office admins of ${schoolName}`.slice(0, 2048) }),
    );
  } catch (e) {
    if ((e as { name?: string }).name !== 'GroupExistsException') throw e;
  }
}

async function userGroups(deps: Deps, username: string): Promise<string[]> {
  const res = await deps.cognito.send(new AdminListGroupsForUserCommand({ UserPoolId: deps.userPoolId, Username: username, Limit: 60 }));
  return (res.Groups ?? []).map((g) => g.GroupName ?? '').filter(Boolean);
}

/**
 * "Create my school": a verified, signed-in account without a school creates one and becomes its
 * first office admin. Creates the school's admin group, profile, settings and directory listing.
 */
export async function registerSchool(deps: Deps, identity: Caller, raw: unknown) {
  const { client, cognito, userPoolId } = deps;
  const existing = (await client.models.Profile.get({ userId: identity.sub })).data;
  if (existing) {
    if (existing.role === 'ADMIN') return { schoolId: existing.schoolId, role: 'ADMIN', changed: true };
    throw new HandlerError('This account already belongs to a school. Sign out and create a new account for your school.', 'CONFLICT');
  }
  const r = SchoolSignupInput.safeParse(raw);
  if (!r.success) throw new HandlerError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'VALIDATION');
  const input = r.data;
  const extra = input.profile ? parseSchoolProfile(input.profile) : {};
  if ((input.lat == null) !== (input.lng == null)) throw new HandlerError('Location needs both latitude and longitude', 'VALIDATION');

  const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: identity.username }));
  const attr = (n: string) => user.UserAttributes?.find((a) => a.Name === n)?.Value;
  if (attr('email_verified') !== 'true') throw new HandlerError('Verify your e-mail address before creating a school', 'FORBIDDEN');
  const groups = await userGroups(deps, identity.username);
  if (groups.some((g) => ['ADMIN', 'TEACHER', 'DRIVER', 'STUDENT', 'PARTNER', 'CUSTOMER', 'OWNER'].includes(g))) {
    throw new HandlerError('This account already has a workspace', 'CONFLICT');
  }
  const email = attr('email') ?? '';

  const schoolId = newSchoolId((n) => randomBytes(n));
  const location = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : undefined;
  const steps: (() => Promise<unknown>)[] = []; // rollback in reverse order
  try {
    await ensureSchoolGroup(deps, schoolId, input.name);
    steps.push(() => cognito.send(new DeleteGroupCommand({ UserPoolId: userPoolId, GroupName: schoolId })));
    await withRetry(() => cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: identity.username, GroupName: schoolId })));
    await withRetry(() => cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: identity.username, GroupName: 'ADMIN' })));
    steps.push(() => cognito.send(new AdminRemoveUserFromGroupCommand({ UserPoolId: userPoolId, Username: identity.username, GroupName: 'ADMIN' })));
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: identity.username,
        UserAttributes: [
          { Name: 'custom:schoolId', Value: schoolId },
          { Name: 'custom:role', Value: 'ADMIN' },
          { Name: 'name', Value: input.adminName },
        ],
      }),
    );
    unwrap(
      await client.models.Profile.create({
        userId: identity.sub,
        username: identity.username,
        role: 'ADMIN',
        schoolId,
        fullName: input.adminName,
        email,
        phone: input.phone ?? undefined,
        isActive: true,
        language: input.language ?? 'en',
      }),
      'Profile.create',
    );
    steps.push(() => client.models.Profile.delete({ userId: identity.sub }));
    unwrap(
      await client.models.SchoolSettings.create({
        schoolId,
        name: input.name,
        logoKey: input.logoKey || undefined,
        address: input.address ?? undefined,
        schoolLocation: location,
        timezone: input.timezone || 'Asia/Qatar',
        defaultLanguage: input.language ?? 'en',
        morningTripStart: '06:30',
        afternoonTripStart: '13:30',
        studentChatEnabled: true,
        alarmRepeatSeconds: 20,
        alarmMaxRepeats: 5,
      }),
      'SchoolSettings.create',
    );
    steps.push(() => client.models.SchoolSettings.delete({ schoolId }));
    unwrap(
      await client.models.School.create({
        ...(schoolColumns(extra) as Record<string, unknown>),
        schoolId,
        name: input.name,
        nameLower: normalizeSearch(input.name),
        directory: extra.listed === false ? DIRECTORY_HIDDEN : DIRECTORY_PUBLIC,
        logoKey: input.logoKey || (extra.logoKey ?? undefined) || undefined,
        city: input.city ?? extra.city ?? undefined,
        country: input.country ?? extra.country ?? undefined,
        address: input.address ?? extra.address ?? undefined,
        location: location ?? (schoolColumns(extra).location ?? undefined),
        phone: input.phone ?? extra.phone ?? undefined,
        email: extra.email || email || undefined,
        applicationsOpen: extra.applicationsOpen ?? false,
      } as Parameters<typeof client.models.School.create>[0]),
      'School.create',
    );
  } catch (e) {
    console.error('registerSchool failed, rolling back', e);
    for (const undo of steps.reverse()) await undo().catch((err) => console.error('rollback step failed', err));
    throw e;
  }
  // Billing and the owner's activity feed must never undo a school that was created successfully.
  await Promise.all([
    startTrialSubscription(client, { tenantId: schoolId, tenantType: 'SCHOOL', tenantName: input.name, billingName: input.adminName, billingEmail: email, billingPhone: input.phone ?? undefined }).catch((e) =>
      console.error('trial subscription failed', e),
    ),
    recordEvent(client, { type: 'SCHOOL_REGISTERED', title: input.name, detail: `${input.adminName} · ${email}`, tenantId: schoolId, tenantType: 'SCHOOL', actorId: identity.sub }).catch((e) => console.error('platform event failed', e)),
  ]);
  await audit(client, {
    schoolId,
    actorId: identity.sub,
    actorName: input.adminName,
    action: 'CREATE_SCHOOL',
    entityType: 'School',
    entityId: schoolId,
    after: { name: input.name, at: nowIso() },
  });
  return { schoolId, role: 'ADMIN', changed: true };
}

/**
 * Brings the caller's Cognito state in line with their profile: the `custom:schoolId` attribute (read
 * by the API's school rules) and, for office admins, membership of the school's admin group plus a
 * directory row. Also migrates accounts created before multi-school support.
 */
export async function syncMyAccess(deps: Deps, identity: Caller) {
  const { client, cognito, userPoolId } = deps;
  const profile = (await client.models.Profile.get({ userId: identity.sub })).data;
  if (!profile) return { schoolId: null, role: null, changed: false };
  let changed = false;

  if (identity.schoolId !== profile.schoolId) {
    const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: identity.username }));
    const current = user.UserAttributes?.find((a) => a.Name === 'custom:schoolId')?.Value;
    if (current !== profile.schoolId) {
      await cognito.send(
        new AdminUpdateUserAttributesCommand({ UserPoolId: userPoolId, Username: identity.username, UserAttributes: [{ Name: 'custom:schoolId', Value: profile.schoolId }] }),
      );
    }
    changed = true; // the caller's token lacks the claim → refresh needed either way
  }

  if (profile.role === 'ADMIN' && profile.isActive !== false) {
    const settings = (await client.models.SchoolSettings.get({ schoolId: profile.schoolId })).data;
    const schoolName = settings?.name ?? 'School';
    if (!identity.groups.includes(profile.schoolId)) {
      await ensureSchoolGroup(deps, profile.schoolId, schoolName);
      const groups = await userGroups(deps, identity.username);
      if (!groups.includes(profile.schoolId)) {
        await cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: userPoolId, Username: identity.username, GroupName: profile.schoolId }));
      }
      changed = true;
    }
    const listing = (await client.models.School.get({ schoolId: profile.schoolId })).data;
    if (!listing) {
      await client.models.School.create({
        schoolId: profile.schoolId,
        name: schoolName,
        nameLower: normalizeSearch(schoolName),
        directory: DIRECTORY_PUBLIC,
        logoKey: settings?.logoKey ?? undefined,
        primaryColor: settings?.primaryColor ?? undefined,
        address: settings?.address ?? undefined,
        location: settings?.schoolLocation ?? undefined,
        email: profile.email ?? undefined,
        applicationsOpen: false,
      });
    }
  }
  return { schoolId: profile.schoolId, role: profile.role, changed };
}

/** Office → Public profile: validated save; keeps SchoolSettings' name/logo/address/location in sync. */
export async function saveSchoolProfile(deps: Deps, caller: SchoolCaller, raw: unknown): Promise<School> {
  const { client } = deps;
  const p = parseSchoolProfile(raw);
  const cols = schoolColumns(p);
  const [existingRes, settingsRes] = await Promise.all([client.models.School.get({ schoolId: caller.schoolId }), client.models.SchoolSettings.get({ schoolId: caller.schoolId })]);
  const existing = existingRes.data;
  const settings = settingsRes.data;
  let saved: School | null;
  if (existing) {
    saved = unwrap(await client.models.School.update({ ...(cols as Record<string, unknown>), schoolId: caller.schoolId } as Parameters<typeof client.models.School.update>[0]), 'School.update');
  } else {
    const name = p.name ?? settings?.name ?? 'School';
    saved = unwrap(
      await client.models.School.create({
        ...(cols as Record<string, unknown>),
        schoolId: caller.schoolId,
        name,
        nameLower: normalizeSearch(name),
        directory: p.listed === false ? DIRECTORY_HIDDEN : DIRECTORY_PUBLIC,
      } as Parameters<typeof client.models.School.create>[0]),
      'School.create',
    );
  }
  if (!saved) throw new Error('School save returned nothing');
  if (settings) {
    const patch: Record<string, unknown> = {};
    if (p.name !== undefined && p.name !== settings.name) patch.name = p.name;
    if (p.logoKey !== undefined && (p.logoKey || null) !== (settings.logoKey ?? null)) patch.logoKey = p.logoKey || null;
    if (p.primaryColor !== undefined && (p.primaryColor || null) !== (settings.primaryColor ?? null)) patch.primaryColor = p.primaryColor || null;
    if (p.address !== undefined && (p.address || null) !== (settings.address ?? null)) patch.address = p.address || null;
    if (cols.location !== undefined) patch.schoolLocation = cols.location;
    if (Object.keys(patch).length) await client.models.SchoolSettings.update({ schoolId: caller.schoolId, ...patch } as Parameters<typeof client.models.SchoolSettings.update>[0]);
  }
  await audit(client, {
    schoolId: caller.schoolId,
    actorId: caller.sub,
    actorName: caller.profile.fullName,
    action: 'UPDATE_SCHOOL_PROFILE',
    entityType: 'School',
    entityId: caller.schoolId,
    after: { fields: Object.keys(p) },
  });
  return saved;
}

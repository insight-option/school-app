import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { z } from 'zod';
import type { Schema } from '../../data/resource';
import { audit, getDataClient, listAll, mapLimit, nowIso, type DataClient, type DataEnv, unwrap, withRetry } from '../shared/data';
import {
  addUserToGroup,
  busConversationId,
  classConversationId,
  ensureBusGroup,
  ensureClassGroup,
  ensureOfficeConversation,
  listMembers,
  officeConversationId,
  removeMember,
} from '../shared/conversations';
import { HandlerError, opName, requireAdmin, type AppSyncEvent, type Caller } from '../shared/types';

type Env = DataEnv & {
  USER_POOL_ID: string;
  SCHOOL_NAME?: string;
  SES_FROM_EMAIL?: string;
  SES_FROM_NAME?: string;
};
// `process.env` is populated by Amplify (incl. USER_POOL_ID from backend.ts); typed here so the
// backend type-checks before the first `ampx sandbox` generates `$amplify/env/admin-users`.
const env = process.env as unknown as Env;

const cognito = new CognitoIdentityProviderClient({});
const ses = new SESv2Client({});

type Profile = Schema['Profile']['type'];
type Role = Schema['Role']['type'];

// ────────────────────────────── validation ──────────────────────────────
const username = z
  .string()
  .trim()
  .min(2, 'ID must be at least 2 characters')
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, 'ID may contain letters, digits, dot, dash and underscore only');
const password = z.string().min(8, 'Password must be at least 8 characters').max(99);
const optStr = z.string().trim().max(200).optional().nullable();

const StudentInput = z.object({
  username,
  password,
  parentEmail: z.email(),
  fullName: z.string().trim().min(2).max(120),
  classId: optStr,
  busId: optStr,
  parentPhone: optStr,
  homeAddress: z.string().trim().max(400).optional().nullable(),
  homeLat: z.number().min(-90).max(90).optional().nullable(),
  homeLng: z.number().min(-180).max(180).optional().nullable(),
  grade: optStr,
});
const TeacherInput = z.object({
  username,
  password,
  email: z.email(),
  fullName: z.string().trim().min(2).max(120),
  phone: optStr,
  classIds: z.array(z.string()).optional().nullable(),
});
const BusInput = z.object({
  username,
  password,
  plate: z.string().trim().min(2).max(32),
  driverName: z.string().trim().min(2).max(120),
  driverPhone: optStr,
  capacity: z.number().int().min(1).max(200).optional().nullable(),
  email: z.union([z.email(), z.literal('')]).optional().nullable(),
});
const BulkRow = z.object({
  username,
  password: z.union([password, z.literal('')]).optional().nullable(),
  parentEmail: z.email(),
  fullName: z.string().trim().min(2).max(120),
  className: optStr,
  classId: optStr,
  busId: optStr,
  parentPhone: optStr,
  homeAddress: z.string().trim().max(400).optional().nullable(),
  grade: optStr,
});

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
    throw new HandlerError(msg, 'VALIDATION');
  }
  return r.data;
}

// ────────────────────────────── cognito helpers ──────────────────────────────
async function createCognitoUser(input: {
  username: string;
  password: string;
  email: string;
  fullName: string;
  phone?: string | null;
  role: Role;
  schoolId: string;
  sendEmail: boolean;
  permanent: boolean;
}): Promise<string> {
  const attrs = [
    { Name: 'email', Value: input.email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'name', Value: input.fullName },
    { Name: 'custom:role', Value: input.role },
    { Name: 'custom:schoolId', Value: input.schoolId },
  ];
  if (input.phone && /^\+\d{6,15}$/.test(input.phone)) attrs.push({ Name: 'phone_number', Value: input.phone });
  let sub: string | undefined;
  try {
    const res = await withRetry(() =>
      cognito.send(
        new AdminCreateUserCommand({
          UserPoolId: env.USER_POOL_ID,
          Username: input.username,
          TemporaryPassword: input.password,
          UserAttributes: attrs,
          DesiredDeliveryMediums: input.sendEmail ? ['EMAIL'] : undefined,
          MessageAction: input.sendEmail ? undefined : 'SUPPRESS',
        }),
      ),
    );
    sub = res.User?.Attributes?.find((a) => a.Name === 'sub')?.Value;
  } catch (e) {
    const name = (e as { name?: string }).name;
    if (name === 'UsernameExistsException') throw new HandlerError(`ID "${input.username}" already exists`, 'CONFLICT');
    if (name === 'InvalidPasswordException') throw new HandlerError(`Password does not meet the policy: ${(e as Error).message}`, 'VALIDATION');
    if (name === 'InvalidParameterException') throw new HandlerError((e as Error).message, 'VALIDATION');
    throw e;
  }
  if (!sub) throw new Error('Cognito did not return a sub');
  try {
    if (input.permanent) {
      await withRetry(() =>
        cognito.send(
          new AdminSetUserPasswordCommand({ UserPoolId: env.USER_POOL_ID, Username: input.username, Password: input.password, Permanent: true }),
        ),
      );
    }
    await withRetry(() =>
      cognito.send(new AdminAddUserToGroupCommand({ UserPoolId: env.USER_POOL_ID, Username: input.username, GroupName: input.role })),
    );
  } catch (e) {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: env.USER_POOL_ID, Username: input.username })).catch(() => undefined);
    throw e;
  }
  return sub;
}

async function deleteCognitoUser(user: string) {
  try {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: env.USER_POOL_ID, Username: user }));
  } catch (e) {
    if ((e as { name?: string }).name !== 'UserNotFoundException') throw e;
  }
}

function generatePassword(): string {
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const all = lower + upper + digits;
  let p = pick(upper) + pick(lower) + pick(digits) + pick(digits);
  for (let i = 0; i < 6; i++) p += pick(all);
  return p
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

async function sendCredentialsEmail(to: string, subject: string, body: string): Promise<boolean> {
  if (!env.SES_FROM_EMAIL) return false;
  try {
    await ses.send(
      new SendEmailCommand({
        FromEmailAddress: env.SES_FROM_NAME ? `${env.SES_FROM_NAME} <${env.SES_FROM_EMAIL}>` : env.SES_FROM_EMAIL,
        Destination: { ToAddresses: [to] },
        Content: { Simple: { Subject: { Data: subject }, Body: { Text: { Data: body } } } },
      }),
    );
    return true;
  } catch (e) {
    console.error('SES send failed', e);
    return false;
  }
}

// ────────────────────────────── profile helpers ──────────────────────────────
async function getProfileByUsername(client: DataClient, user: string): Promise<Profile | undefined> {
  const res = await client.models.Profile.listProfilesByUsername({ username: user }, { limit: 2 });
  return res.data[0];
}

async function getClass(client: DataClient, classId: string) {
  const res = await client.models.Class.get({ id: classId });
  if (!res.data) throw new HandlerError(`Class ${classId} not found`, 'NOT_FOUND');
  return res.data;
}

async function getBus(client: DataClient, busId: string) {
  const res = await client.models.Bus.get({ busId });
  if (!res.data) throw new HandlerError(`Bus ${busId} not found`, 'NOT_FOUND');
  return res.data;
}

async function bumpCount(client: DataClient, kind: 'class' | 'bus', id: string, delta: number) {
  if (kind === 'class') {
    const c = await client.models.Class.get({ id });
    if (c.data) await client.models.Class.update({ id, studentCount: Math.max(0, (c.data.studentCount ?? 0) + delta) });
  } else {
    const b = await client.models.Bus.get({ busId: id });
    if (b.data) await client.models.Bus.update({ busId: id, studentCount: Math.max(0, (b.data.studentCount ?? 0) + delta) });
  }
}

/** Move a student between classes / buses, maintaining counters and group chats. */
async function applyStudentAssignment(
  client: DataClient,
  profile: Profile,
  target: { classId?: string | null; busId?: string | null },
  actor: Caller,
): Promise<Profile> {
  const update: Partial<Profile> & { userId: string } = { userId: profile.userId };
  const student = { userId: profile.userId, role: 'STUDENT', schoolId: profile.schoolId };

  if (target.classId !== undefined && (target.classId ?? '') !== (profile.classId ?? '')) {
    if (profile.classId) {
      await removeMember(client, classConversationId(profile.classId), profile.userId);
      await bumpCount(client, 'class', profile.classId, -1);
    }
    if (target.classId) {
      const cls = await getClass(client, target.classId);
      await ensureClassGroup(client, { id: cls.id, name: cls.name, schoolId: cls.schoolId });
      await addUserToGroup(client, classConversationId(cls.id), 'CLASS_GROUP', cls.name, 'Class group', student);
      await bumpCount(client, 'class', cls.id, +1);
      update.classId = cls.id;
      update.className = cls.name;
      if (cls.grade) update.grade = cls.grade;
    } else {
      update.classId = null;
      update.className = null;
    }
  }

  if (target.busId !== undefined && (target.busId ?? '') !== (profile.busId ?? '')) {
    if (profile.busId) {
      await removeMember(client, busConversationId(profile.busId), profile.userId);
      await bumpCount(client, 'bus', profile.busId, -1);
    }
    if (target.busId) {
      const bus = await getBus(client, target.busId);
      await ensureBusGroup(client, { busId: bus.busId, plate: bus.plate, schoolId: bus.schoolId });
      await addUserToGroup(client, busConversationId(bus.busId), 'BUS_GROUP', `Bus ${bus.plate}`, 'Bus group', student);
      await bumpCount(client, 'bus', bus.busId, +1);
      update.busId = bus.busId;
      update.busName = bus.plate;
    } else {
      update.busId = null;
      update.busName = null;
    }
  }

  if (Object.keys(update).length === 1) return profile;
  const after = unwrap(await client.models.Profile.update(update), 'Profile.update');
  await audit(client, {
    schoolId: profile.schoolId,
    actorId: actor.sub,
    actorName: actor.username,
    action: 'ASSIGN_STUDENT',
    entityType: 'Profile',
    entityId: profile.userId,
    before: { classId: profile.classId, busId: profile.busId },
    after: { classId: after.classId, busId: after.busId },
  });
  return after;
}

// ────────────────────────────── operations ──────────────────────────────
async function createStudent(client: DataClient, caller: Caller, raw: unknown, sendEmail = true) {
  const input = parse(StudentInput, raw);
  if (await getProfileByUsername(client, input.username)) throw new HandlerError(`ID "${input.username}" already exists`, 'CONFLICT');
  const cls = input.classId ? await getClass(client, input.classId) : undefined;
  const bus = input.busId ? await getBus(client, input.busId) : undefined;

  const sub = await createCognitoUser({
    username: input.username,
    password: input.password,
    email: input.parentEmail,
    fullName: input.fullName,
    phone: input.parentPhone,
    role: 'STUDENT',
    schoolId: caller.schoolId,
    sendEmail,
    permanent: false,
  });

  try {
    const homeLocation = input.homeLat != null && input.homeLng != null ? { lat: input.homeLat, lng: input.homeLng } : undefined;
    const profile = unwrap(
      await client.models.Profile.create({
        userId: sub,
        username: input.username,
        role: 'STUDENT',
        schoolId: caller.schoolId,
        fullName: input.fullName,
        email: input.parentEmail,
        parentEmail: input.parentEmail,
        parentPhone: input.parentPhone ?? undefined,
        homeAddress: input.homeAddress ?? undefined,
        homeLocation,
        grade: input.grade ?? cls?.grade ?? undefined,
        isActive: true,
        language: 'en',
      }),
      'Profile.create',
    );
    await ensureOfficeConversation(client, {
      userId: sub,
      fullName: input.fullName,
      role: 'STUDENT',
      schoolId: caller.schoolId,
      subtitle: cls?.name ?? 'Student',
    });
    await applyStudentAssignment(client, profile, { classId: cls?.id ?? null, busId: bus?.busId ?? null }, caller);
    await audit(client, {
      schoolId: caller.schoolId,
      actorId: caller.sub,
      actorName: caller.username,
      action: 'CREATE_STUDENT',
      entityType: 'Profile',
      entityId: sub,
      after: { username: input.username, fullName: input.fullName, classId: cls?.id, busId: bus?.busId },
    });
    return { userId: sub, username: input.username, emailSent: sendEmail };
  } catch (e) {
    await deleteCognitoUser(input.username);
    await client.models.Profile.delete({ userId: sub }).catch(() => undefined);
    throw e;
  }
}

async function createTeacher(client: DataClient, caller: Caller, raw: unknown) {
  const input = parse(TeacherInput, raw);
  if (await getProfileByUsername(client, input.username)) throw new HandlerError(`ID "${input.username}" already exists`, 'CONFLICT');
  const sub = await createCognitoUser({
    username: input.username,
    password: input.password,
    email: input.email,
    fullName: input.fullName,
    phone: input.phone,
    role: 'TEACHER',
    schoolId: caller.schoolId,
    sendEmail: true,
    permanent: false,
  });
  try {
    unwrap(
      await client.models.Profile.create({
        userId: sub,
        username: input.username,
        role: 'TEACHER',
        schoolId: caller.schoolId,
        fullName: input.fullName,
        email: input.email,
        phone: input.phone ?? undefined,
        isActive: true,
        language: 'en',
        classIds: [],
      }),
      'Profile.create',
    );
    await ensureOfficeConversation(client, { userId: sub, fullName: input.fullName, role: 'TEACHER', schoolId: caller.schoolId, subtitle: 'Teacher' });
    if (input.classIds?.length) await assignTeacher(client, caller, { teacherId: sub, classIds: input.classIds });
    await audit(client, {
      schoolId: caller.schoolId,
      actorId: caller.sub,
      actorName: caller.username,
      action: 'CREATE_TEACHER',
      entityType: 'Profile',
      entityId: sub,
      after: { username: input.username, fullName: input.fullName },
    });
    return { userId: sub, username: input.username, emailSent: true };
  } catch (e) {
    await deleteCognitoUser(input.username);
    await client.models.Profile.delete({ userId: sub }).catch(() => undefined);
    throw e;
  }
}

async function createBus(client: DataClient, caller: Caller, raw: unknown) {
  const input = parse(BusInput, raw);
  if (await getProfileByUsername(client, input.username)) throw new HandlerError(`ID "${input.username}" already exists`, 'CONFLICT');
  const existing = await client.models.Bus.get({ busId: input.username });
  if (existing.data) throw new HandlerError(`Bus "${input.username}" already exists`, 'CONFLICT');
  // Cognito requires an e-mail attribute; drivers get no e-mail (credentials are handed over by the office).
  const email = input.email && input.email.length > 0 ? input.email : `${input.username.toLowerCase()}@bus.invalid`;
  const sub = await createCognitoUser({
    username: input.username,
    password: input.password,
    email,
    fullName: input.driverName,
    phone: input.driverPhone,
    role: 'DRIVER',
    schoolId: caller.schoolId,
    sendEmail: false,
    permanent: true,
  });
  try {
    const settings = await client.models.SchoolSettings.get({ schoolId: caller.schoolId });
    const start = settings.data?.schoolLocation ?? { lat: 0, lng: 0 };
    unwrap(
      await client.models.Bus.create({
        busId: input.username,
        schoolId: caller.schoolId,
        plate: input.plate,
        driverName: input.driverName,
        driverPhone: input.driverPhone ?? undefined,
        capacity: input.capacity ?? 40,
        driverUserId: sub,
        studentCount: 0,
        isActive: true,
        conversationId: busConversationId(input.username),
      }),
      'Bus.create',
    );
    unwrap(
      await client.models.BusLocation.create({
        busId: input.username,
        driverUserId: sub,
        lat: start.lat,
        lng: start.lng,
        heading: 0,
        speed: 0,
        accuracy: 0,
        updatedAt: nowIso(),
      }),
      'BusLocation.create',
    );
    unwrap(
      await client.models.Profile.create({
        userId: sub,
        username: input.username,
        role: 'DRIVER',
        schoolId: caller.schoolId,
        fullName: input.driverName,
        email: input.email && input.email.length > 0 ? input.email : undefined,
        phone: input.driverPhone ?? undefined,
        busId: input.username,
        busName: input.plate,
        isActive: true,
        language: 'en',
      }),
      'Profile.create',
    );
    await ensureBusGroup(client, { busId: input.username, plate: input.plate, schoolId: caller.schoolId });
    await addUserToGroup(client, busConversationId(input.username), 'BUS_GROUP', `Bus ${input.plate}`, 'Bus group', {
      userId: sub,
      role: 'DRIVER',
      schoolId: caller.schoolId,
    });
    await ensureOfficeConversation(client, {
      userId: sub,
      fullName: input.driverName,
      role: 'DRIVER',
      schoolId: caller.schoolId,
      subtitle: `Bus ${input.plate}`,
    });
    await audit(client, {
      schoolId: caller.schoolId,
      actorId: caller.sub,
      actorName: caller.username,
      action: 'CREATE_BUS',
      entityType: 'Bus',
      entityId: input.username,
      after: { plate: input.plate, driverName: input.driverName },
    });
    return { userId: sub, username: input.username, temporaryPassword: input.password, emailSent: false };
  } catch (e) {
    await deleteCognitoUser(input.username);
    await client.models.Bus.delete({ busId: input.username }).catch(() => undefined);
    await client.models.BusLocation.delete({ busId: input.username }).catch(() => undefined);
    await client.models.Profile.delete({ userId: sub }).catch(() => undefined);
    throw e;
  }
}

async function createStudentsBulk(client: DataClient, caller: Caller, args: { jobId: string; rowsJson: string }) {
  const { jobId } = args;
  let rows: unknown[];
  try {
    rows = JSON.parse(args.rowsJson) as unknown[];
    if (!Array.isArray(rows)) throw new Error('rows is not an array');
  } catch (e) {
    await client.models.ImportJob.update({ id: jobId, status: 'FAILED', error: `Invalid rows: ${(e as Error).message}`, finishedAt: nowIso() });
    return;
  }
  await client.models.ImportJob.update({ id: jobId, status: 'RUNNING', total: rows.length, processed: 0, created: 0, failed: 0 });
  const classes = await listAll((nextToken) => client.models.Class.listClassesBySchool({ schoolId: caller.schoolId }, { limit: 200, nextToken }));
  const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const results: { row: number; username: string; status: 'created' | 'failed'; error?: string; password?: string }[] = [];
  let processed = 0;
  let created = 0;
  let failed = 0;
  let lastFlush = Date.now();

  const flush = async (final = false) => {
    await client.models.ImportJob.update({
      id: jobId,
      processed,
      created,
      failed,
      results: JSON.stringify(results),
      ...(final ? { status: failed === rows.length && rows.length > 0 ? 'FAILED' : 'COMPLETED', finishedAt: nowIso() } : {}),
    });
    lastFlush = Date.now();
  };

  await mapLimit(rows, 3, async (raw, i) => {
    const rowNo = i + 1;
    const r = BulkRow.safeParse(raw);
    if (!r.success) {
      results.push({
        row: rowNo,
        username: String((raw as { username?: string })?.username ?? ''),
        status: 'failed',
        error: r.error.issues.map((x) => x.message).join('; '),
      });
      failed++;
    } else {
      const row = r.data;
      let classId = row.classId || undefined;
      if (!classId && row.className) classId = classByName.get(row.className.trim().toLowerCase());
      if (row.className && !classId) {
        results.push({ row: rowNo, username: row.username, status: 'failed', error: `Unknown class "${row.className}"` });
        failed++;
      } else {
        const pwd = row.password && row.password.length >= 8 ? row.password : generatePassword();
        try {
          await createStudent(
            client,
            caller,
            {
              username: row.username,
              password: pwd,
              parentEmail: row.parentEmail,
              fullName: row.fullName,
              classId,
              busId: row.busId || undefined,
              parentPhone: row.parentPhone || undefined,
              homeAddress: row.homeAddress || undefined,
              grade: row.grade || undefined,
            },
            true,
          );
          results.push({ row: rowNo, username: row.username, status: 'created', password: row.password ? undefined : pwd });
          created++;
        } catch (e) {
          results.push({ row: rowNo, username: row.username, status: 'failed', error: (e as Error).message });
          failed++;
        }
      }
    }
    processed++;
    if (Date.now() - lastFlush > 3000) await flush();
  });
  results.sort((a, b) => a.row - b.row);
  await flush(true);
  await audit(client, {
    schoolId: caller.schoolId,
    actorId: caller.sub,
    actorName: caller.username,
    action: 'BULK_IMPORT',
    entityType: 'ImportJob',
    entityId: jobId,
    after: { total: rows.length, created, failed },
  });
}

async function resetUserPassword(
  client: DataClient,
  caller: Caller,
  args: { username: string; newPassword: string; sendEmail?: boolean | null; permanent?: boolean | null },
) {
  const user = parse(username, args.username);
  const pwd = parse(password, args.newPassword);
  const profile = await getProfileByUsername(client, user);
  if (!profile) throw new HandlerError('User not found', 'NOT_FOUND');
  try {
    await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: env.USER_POOL_ID, Username: user, Password: pwd, Permanent: !!args.permanent }));
  } catch (e) {
    if ((e as { name?: string }).name === 'InvalidPasswordException') {
      throw new HandlerError(`Password does not meet the policy: ${(e as Error).message}`, 'VALIDATION');
    }
    throw e;
  }
  let emailSent = false;
  const to = profile.role === 'STUDENT' ? (profile.parentEmail ?? profile.email) : profile.email;
  if (args.sendEmail && to) {
    const school = env.SCHOOL_NAME ?? 'School';
    emailSent = await sendCredentialsEmail(
      to,
      `${school} – your password was reset`,
      [
        `Hello ${profile.fullName},`,
        '',
        `The school office reset the password for the ${school} app account with ID ${user}.`,
        '',
        `  School ID (username): ${user}`,
        `  ${args.permanent ? 'New password' : 'Temporary password'}:   ${pwd}`,
        '',
        args.permanent ? 'You can sign in right away.' : 'You will be asked to set a new password at your next login.',
      ].join('\n'),
    );
  }
  await audit(client, {
    schoolId: caller.schoolId,
    actorId: caller.sub,
    actorName: caller.username,
    action: 'RESET_PASSWORD',
    entityType: 'Profile',
    entityId: profile.userId,
    after: { emailSent, permanent: !!args.permanent },
  });
  return { userId: profile.userId, username: user, emailSent };
}

async function setUserEnabled(client: DataClient, caller: Caller, args: { username: string; enabled: boolean }) {
  const user = parse(username, args.username);
  const profile = await getProfileByUsername(client, user);
  if (!profile) throw new HandlerError('User not found', 'NOT_FOUND');
  if (args.enabled) await cognito.send(new AdminEnableUserCommand({ UserPoolId: env.USER_POOL_ID, Username: user }));
  else await cognito.send(new AdminDisableUserCommand({ UserPoolId: env.USER_POOL_ID, Username: user }));
  await client.models.Profile.update({ userId: profile.userId, isActive: args.enabled });
  if (profile.role === 'DRIVER' && profile.busId) await client.models.Bus.update({ busId: profile.busId, isActive: args.enabled });
  await audit(client, {
    schoolId: caller.schoolId,
    actorId: caller.sub,
    actorName: caller.username,
    action: args.enabled ? 'ENABLE_USER' : 'DISABLE_USER',
    entityType: 'Profile',
    entityId: profile.userId,
  });
  return { ok: true };
}

/** Remove a conversation together with every message and member row it owns. */
async function deleteConversationCascade(client: DataClient, conversationId: string) {
  const messages = await listAll(
    (nextToken) => client.models.Message.listMessagesByConversation({ conversationId }, { limit: 200, nextToken }),
    500,
  );
  await mapLimit(messages, 10, (m) => client.models.Message.delete({ id: m.id }));
  const members = await listMembers(client, conversationId);
  await mapLimit(members, 10, (m) => client.models.ConversationMember.delete({ conversationId: m.conversationId, userId: m.userId }));
  await client.models.Conversation.delete({ id: conversationId });
}

/** Everything that hangs off a user whatever their role: chats, devices, notification inbox. */
async function purgeUserData(client: DataClient, userId: string) {
  const memberships = await listAll((nextToken) =>
    client.models.ConversationMember.listMembershipsByUser({ userId }, { limit: 100, nextToken }),
  );
  await mapLimit(memberships, 4, async (m) => {
    // Private chats (direct + office) disappear entirely; group chats just lose the member.
    const isPrivate = m.conversationId.startsWith('dm_') || m.conversationId === officeConversationId(userId);
    if (isPrivate) await deleteConversationCascade(client, m.conversationId);
    else await removeMember(client, m.conversationId, m.userId);
  });
  const devices = await listAll((nextToken) => client.models.Device.listDevicesByUser({ userId }, { limit: 50, nextToken }));
  await mapLimit(devices, 5, (d) => client.models.Device.delete({ id: d.id }));
  const notifications = await listAll(
    (nextToken) => client.models.Notification.listNotificationsByUser({ userId }, { limit: 200, nextToken }),
    500,
  );
  await mapLimit(notifications, 10, (n) => client.models.Notification.delete({ id: n.id }));
}

/** Transport and learning records that only make sense while the student exists. */
async function purgeStudentData(client: DataClient, profile: Profile) {
  if (profile.classId) await bumpCount(client, 'class', profile.classId, -1);
  if (profile.busId) await bumpCount(client, 'bus', profile.busId, -1);
  const studentId = profile.userId;
  const statuses = await listAll((nextToken) => client.models.StudentDayStatus.list({ studentId, limit: 200, nextToken }));
  await mapLimit(statuses, 10, (s) => client.models.StudentDayStatus.delete({ studentId: s.studentId, date: s.date }));
  const stops = await listAll((nextToken) => client.models.TripStop.listStopsByStudentAndDate({ studentId }, { limit: 200, nextToken }), 500);
  await mapLimit(stops, 10, (s) => client.models.TripStop.delete({ id: s.id }));
  const feedback = await listAll((nextToken) => client.models.Feedback.listFeedbackByStudent({ studentId }, { limit: 200, nextToken }));
  await mapLimit(feedback, 10, (f) => client.models.Feedback.delete({ id: f.id }));
  const enrollments = await listAll((nextToken) => client.models.CourseEnrollment.listEnrollmentsByStudent({ studentId }, { limit: 200, nextToken }));
  await mapLimit(enrollments, 10, (e) => client.models.CourseEnrollment.delete({ id: e.id }));
}

/** A bus is its driver's account: remove the bus, its live position, trips, day statuses and group chat. */
async function deleteBusCascade(client: DataClient, busId: string) {
  const students = await listAll((nextToken) => client.models.Profile.listProfilesByBus({ busId }, { limit: 200, nextToken }));
  await mapLimit(students, 5, (s) => client.models.Profile.update({ userId: s.userId, busId: null, busName: null }));
  const statuses = await listAll(
    (nextToken) => client.models.StudentDayStatus.listDayStatusByBusAndDate({ busId }, { limit: 200, nextToken }),
    500,
  );
  await mapLimit(statuses, 10, (s) => client.models.StudentDayStatus.delete({ studentId: s.studentId, date: s.date }));
  const trips = await listAll((nextToken) => client.models.Trip.listTripsByBusAndDate({ busId }, { limit: 100, nextToken }), 500);
  await mapLimit(trips, 3, async (trip) => {
    const stops = await listAll((nextToken) => client.models.TripStop.listStopsByTrip({ tripId: trip.id }, { limit: 200, nextToken }));
    await mapLimit(stops, 10, (s) => client.models.TripStop.delete({ id: s.id }));
    await client.models.Trip.delete({ id: trip.id });
  });
  const group = await client.models.Conversation.get({ id: busConversationId(busId) });
  if (group.data) await deleteConversationCascade(client, group.data.id);
  await client.models.BusLocation.delete({ busId });
  await client.models.Bus.delete({ busId });
}

/**
 * Hard delete: the Cognito account, the profile and everything that belongs to the user are
 * removed. Group-chat messages the user sent stay (they carry the sender name); audit rows stay.
 */
async function deleteUser(client: DataClient, caller: Caller, args: { username: string }) {
  const user = parse(username, args.username);
  const profile = await getProfileByUsername(client, user);
  if (profile && profile.userId === caller.sub) throw new HandlerError('You cannot delete your own account', 'FORBIDDEN');
  await deleteCognitoUser(user);
  if (!profile) {
    // A bus registered under this ID whose profile is already gone still has to go.
    const bus = await client.models.Bus.get({ busId: user });
    if (bus.data) await deleteBusCascade(client, user);
    return { ok: true, message: 'Cognito user removed; no profile existed' };
  }

  await purgeUserData(client, profile.userId);
  if (profile.role === 'STUDENT') await purgeStudentData(client, profile);
  if (profile.role === 'TEACHER') {
    const classes = await listAll((nextToken) => client.models.Class.listClassesByTeacher({ teacherId: profile.userId }, { limit: 50, nextToken }));
    await mapLimit(classes, 5, (c) => client.models.Class.update({ id: c.id, teacherId: null, teacherName: null }));
  }
  if (profile.role === 'DRIVER') {
    const busId = profile.busId ?? user;
    const bus = await client.models.Bus.get({ busId });
    if (bus.data) await deleteBusCascade(client, busId);
  }
  await client.models.Profile.delete({ userId: profile.userId });
  await audit(client, {
    schoolId: caller.schoolId,
    actorId: caller.sub,
    actorName: caller.username,
    action: 'DELETE_USER',
    entityType: 'Profile',
    entityId: profile.userId,
    before: { username: user, role: profile.role, fullName: profile.fullName },
  });
  return { ok: true };
}

async function updateUserContact(client: DataClient, caller: Caller, args: { username: string; email?: string | null; phone?: string | null }) {
  const user = parse(username, args.username);
  const profile = await getProfileByUsername(client, user);
  if (!profile) throw new HandlerError('User not found', 'NOT_FOUND');
  const attrs: { Name: string; Value: string }[] = [];
  if (args.email) {
    parse(z.email(), args.email);
    attrs.push({ Name: 'email', Value: args.email }, { Name: 'email_verified', Value: 'true' });
  }
  if (args.phone && /^\+\d{6,15}$/.test(args.phone)) attrs.push({ Name: 'phone_number', Value: args.phone });
  if (attrs.length) {
    await cognito.send(new AdminUpdateUserAttributesCommand({ UserPoolId: env.USER_POOL_ID, Username: user, UserAttributes: attrs }));
  }
  await client.models.Profile.update({
    userId: profile.userId,
    ...(args.email ? (profile.role === 'STUDENT' ? { email: args.email, parentEmail: args.email } : { email: args.email }) : {}),
    ...(args.phone ? (profile.role === 'STUDENT' ? { parentPhone: args.phone } : { phone: args.phone }) : {}),
  });
  await audit(client, {
    schoolId: caller.schoolId,
    actorId: caller.sub,
    actorName: caller.username,
    action: 'UPDATE_CONTACT',
    entityType: 'Profile',
    entityId: profile.userId,
  });
  return { ok: true };
}

async function assignStudents(
  client: DataClient,
  caller: Caller,
  args: { studentIds: (string | null)[]; classId?: string | null; busId?: string | null },
) {
  const ids = args.studentIds.filter((x): x is string => !!x);
  let count = 0;
  await mapLimit(ids, 3, async (userId) => {
    const p = await client.models.Profile.get({ userId });
    if (!p.data || p.data.role !== 'STUDENT') return;
    await applyStudentAssignment(
      client,
      p.data,
      {
        classId: args.classId === undefined || args.classId === null ? undefined : args.classId,
        busId: args.busId === undefined || args.busId === null ? undefined : args.busId,
      },
      caller,
    );
    count++;
  });
  return { ok: true, count };
}

async function assignTeacher(client: DataClient, caller: Caller, args: { teacherId: string; classIds: (string | null)[] }) {
  const teacher = unwrap(await client.models.Profile.get({ userId: args.teacherId }), 'Profile.get');
  if (teacher.role !== 'TEACHER') throw new HandlerError('Not a teacher', 'VALIDATION');
  const wanted = new Set(args.classIds.filter((x): x is string => !!x));
  const current = await listAll((nextToken) => client.models.Class.listClassesByTeacher({ teacherId: teacher.userId }, { limit: 100, nextToken }));
  for (const c of current) {
    if (!wanted.has(c.id)) {
      await client.models.Class.update({ id: c.id, teacherId: null, teacherName: null });
      await removeMember(client, classConversationId(c.id), teacher.userId);
    }
  }
  const names: string[] = [];
  for (const classId of wanted) {
    const cls = await getClass(client, classId);
    names.push(cls.name);
    if (cls.teacherId && cls.teacherId !== teacher.userId) {
      // previous teacher loses the class
      await removeMember(client, classConversationId(cls.id), cls.teacherId);
      const prev = await client.models.Profile.get({ userId: cls.teacherId });
      if (prev.data) {
        await client.models.Profile.update({ userId: prev.data.userId, classIds: (prev.data.classIds ?? []).filter((x) => x !== cls.id) });
      }
    }
    await client.models.Class.update({ id: cls.id, teacherId: teacher.userId, teacherName: teacher.fullName, conversationId: classConversationId(cls.id) });
    await ensureClassGroup(client, { id: cls.id, name: cls.name, schoolId: cls.schoolId });
    await addUserToGroup(client, classConversationId(cls.id), 'CLASS_GROUP', cls.name, 'Class group', {
      userId: teacher.userId,
      role: 'TEACHER',
      schoolId: teacher.schoolId,
    });
  }
  await client.models.Profile.update({ userId: teacher.userId, classIds: Array.from(wanted), className: names.join(', ') || null });
  await audit(client, {
    schoolId: caller.schoolId,
    actorId: caller.sub,
    actorName: caller.username,
    action: 'ASSIGN_TEACHER',
    entityType: 'Profile',
    entityId: teacher.userId,
    after: { classIds: Array.from(wanted) },
  });
  return { ok: true, count: wanted.size };
}

// ────────────────────────────── entry point ──────────────────────────────
export const handler = async (event: AppSyncEvent<Record<string, unknown>>) => {
  const caller = requireAdmin(event);
  const client = await getDataClient(env);
  const args = event.arguments as never;
  try {
    switch (opName(event)) {
      case 'createStudent':
        return await createStudent(client, caller, args);
      case 'createTeacher':
        return await createTeacher(client, caller, args);
      case 'registerBus':
        return await createBus(client, caller, args);
      case 'createStudentsBulk':
        await createStudentsBulk(client, caller, args);
        return;
      case 'resetUserPassword':
        return await resetUserPassword(client, caller, args);
      case 'setUserEnabled':
        return await setUserEnabled(client, caller, args);
      case 'deleteUser':
        return await deleteUser(client, caller, args);
      case 'updateUserContact':
        return await updateUserContact(client, caller, args);
      case 'assignStudents':
        return await assignStudents(client, caller, args);
      case 'assignTeacher':
        return await assignTeacher(client, caller, args);
      default:
        throw new HandlerError(`Unknown operation ${opName(event)}`);
    }
  } catch (e) {
    if (e instanceof HandlerError) throw new Error(`[${e.code}] ${e.message}`);
    console.error(e);
    throw e;
  }
};

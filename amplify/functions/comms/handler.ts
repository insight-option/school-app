import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import type { Schema } from '../../data/resource';
import { audit, forEachPage, getDataClient, getSettings, listAll, mapLimit, nowIso, type DataClient, type DataEnv, unwrap } from '../shared/data';
import { directConversationId, ensureConversation, ensureOfficeConversation, listMembers, officeSeatId, upsertMember } from '../shared/conversations';
import { assertSameSchool, resolveAdmin, resolveCaller, type SchoolCaller } from '../shared/caller';
import { t } from '../shared/i18n';
import { getAdminUserIds, notifyUsers } from '../shared/notify';
import { isExpoPushToken, pushToUsers } from '../shared/push';
import { DIRECTORY_PUBLIC, newApplicationReference, normalizeSearch } from '../shared/tenancy';
import { HandlerError, opName, requireIdentity, type AppSyncEvent } from '../shared/types';

const env = process.env as unknown as DataEnv;

type Profile = Schema['Profile']['type'];
type Message = Schema['Message']['type'];
type MessageType = Schema['MessageType']['type'];
type Conversation = Schema['Conversation']['type'];
type Application = Schema['Application']['type'];

function preview(type: MessageType, text: string | null | undefined, lang: string | null | undefined): string {
  const s = t(lang);
  switch (type) {
    case 'VOICE':
      return s.previewVoice;
    case 'IMAGE':
      return s.previewImage;
    case 'VIDEO':
      return s.previewVideo;
    case 'FILE':
      return s.previewFile;
    default:
      return (text ?? '').slice(0, 120);
  }
}

function issues(e: z.ZodError): string {
  return e.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ');
}

/** AWSJSON arguments may arrive as an object or as (possibly double-encoded) JSON text. */
function jsonArg(value: unknown): unknown {
  let v = value;
  for (let i = 0; i < 3 && typeof v === 'string'; i++) {
    try {
      v = JSON.parse(v);
    } catch {
      throw new HandlerError('Invalid JSON input', 'VALIDATION');
    }
  }
  return v;
}

// ────────────────────────────── messaging ──────────────────────────────
const VIEWING_STALE_MS = 30 * 60_000;

const SendMessageInput = z.object({
  conversationId: z.string().min(3).max(200),
  type: z.enum(['TEXT', 'VOICE', 'IMAGE', 'VIDEO', 'FILE']),
  text: z.string().max(4000).optional().nullable(),
  attachmentKey: z.string().max(500).optional().nullable(),
  attachmentMeta: z.unknown().optional().nullable(),
  clientId: z.string().max(100).optional().nullable(),
});

async function sendMessage(client: DataClient, caller: SchoolCaller, raw: unknown): Promise<Message> {
  const r = SendMessageInput.safeParse(raw);
  if (!r.success) throw new HandlerError(r.error.issues.map((i) => i.message).join('; '), 'VALIDATION');
  const input = r.data;
  if (input.type === 'TEXT' && !input.text?.trim()) throw new HandlerError('Message is empty', 'VALIDATION');
  if (input.type !== 'TEXT' && !input.attachmentKey) throw new HandlerError('Attachment missing', 'VALIDATION');
  if (input.attachmentKey && !input.attachmentKey.startsWith(`chat/${input.conversationId}/`)) {
    throw new HandlerError('Attachment does not belong to this conversation', 'VALIDATION');
  }

  const profile = caller.profile;
  const conv = unwrap(await client.models.Conversation.get({ id: input.conversationId }), 'Conversation.get');
  if (!conv) throw new HandlerError('Conversation not found', 'NOT_FOUND');
  assertSameSchool(caller, conv.schoolId, 'Conversation');
  const officeSeat = officeSeatId(caller.schoolId);
  const members = await listMembers(client, conv.id);
  const senderSeat = caller.isAdmin ? officeSeat : caller.sub;
  const seat = members.find((m) => m.userId === senderSeat);
  if (!seat) throw new HandlerError('You are not a member of this conversation', 'FORBIDDEN');

  const sentAt = nowIso();
  const senderName = caller.isAdmin ? `${profile.fullName} (School Office)` : profile.fullName;
  const message = unwrap(
    await client.models.Message.create({
      conversationId: conv.id,
      schoolId: conv.schoolId,
      senderId: caller.sub,
      senderName,
      senderRole: profile.role,
      type: input.type,
      text: input.text?.trim() || undefined,
      attachmentKey: input.attachmentKey ?? undefined,
      attachmentMeta: input.attachmentMeta ? JSON.stringify(input.attachmentMeta) : undefined,
      sentAt,
      clientId: input.clientId ?? undefined,
      deleted: false,
    }),
    'Message.create',
  );
  if (!message) throw new Error('Message.create returned nothing');

  const previewEn = preview(input.type, input.text, 'en');
  await client.models.Conversation.update({
    id: conv.id,
    lastMessageText: previewEn,
    lastMessageAt: sentAt,
    lastMessageSenderName: senderName,
    lastMessageType: input.type,
  });

  const recipients = members.filter((m) => m.userId !== senderSeat);
  // Members with the chat open read the message right away: no unread bump, no push. A viewing flag
  // older than VIEWING_STALE_MS is ignored (the app was killed without leaving the chat).
  const viewing = (m: (typeof members)[number]) => !!m.isViewing && !!m.lastReadAt && Date.now() - Date.parse(m.lastReadAt) < VIEWING_STALE_MS;
  await mapLimit(members, 10, (m) => {
    const reads = m.userId === senderSeat || viewing(m);
    return client.models.ConversationMember.update({
      conversationId: m.conversationId,
      userId: m.userId,
      lastMessageText: previewEn,
      lastMessageAt: sentAt,
      lastMessageSenderName: senderName,
      lastMessageType: input.type,
      unreadCount: reads ? 0 : (m.unreadCount ?? 0) + 1,
      ...(reads ? { lastReadAt: sentAt } : {}),
    });
  });

  // Push to everyone who is not currently looking at this conversation.
  const pushTargets = recipients.filter((m) => !viewing(m));
  const userIds: string[] = [];
  for (const m of pushTargets) {
    if (m.userId === officeSeat) userIds.push(...(await getAdminUserIds(client, caller.schoolId)));
    else userIds.push(m.userId);
  }
  const uniqueIds = Array.from(new Set(userIds.filter((u) => u !== caller.sub)));
  if (uniqueIds.length) {
    const profiles = await mapLimit(uniqueIds, 10, async (userId) => (await client.models.Profile.get({ userId })).data);
    const byLang = new Map<string, string[]>();
    profiles.forEach((p, i) => {
      if (!p || p.isActive === false || p.schoolId !== caller.schoolId) return;
      const lang = p.language === 'ar' ? 'ar' : 'en';
      byLang.set(lang, [...(byLang.get(lang) ?? []), uniqueIds[i]]);
    });
    const isGroup = conv.type === 'CLASS_GROUP' || conv.type === 'BUS_GROUP';
    for (const [lang, ids] of byLang) {
      const body = preview(input.type, input.text, lang);
      await pushToUsers(client, ids, {
        title: isGroup ? `${conv.title} · ${senderName}` : senderName,
        body,
        data: { type: 'MESSAGE', conversationId: conv.id, messageId: message.id },
        sound: 'default',
        priority: 'high',
        channelId: 'messages',
      });
    }
    if (!isGroup) {
      // Direct / office chats also land in the notification inbox.
      await notifyUsers(client, {
        schoolId: conv.schoolId,
        userIds: uniqueIds,
        type: 'MESSAGE',
        title: senderName,
        body: previewEn,
        data: { conversationId: conv.id, messageId: message.id },
        push: false,
      });
    }
  }
  return message;
}

async function openDirectConversation(client: DataClient, caller: SchoolCaller, args: { otherUserId: string }): Promise<Conversation> {
  if (caller.isAdmin) throw new HandlerError('Admins use the office conversation (openOfficeConversation)', 'VALIDATION');
  if (!args.otherUserId || args.otherUserId === caller.sub) throw new HandlerError('Invalid user', 'VALIDATION');
  const me = caller.profile;
  const other = unwrap(await client.models.Profile.get({ userId: args.otherUserId }), 'Profile.get');
  if (!other) throw new HandlerError('User not found', 'NOT_FOUND');
  assertSameSchool(caller, other.schoolId, 'User');
  if (other.isActive === false) throw new HandlerError('This user is no longer active', 'FORBIDDEN');

  const settings = await getSettings(client, me.schoolId);
  const pair = [me.role, other.role].sort().join('-');
  let allowed = false;
  switch (pair) {
    case 'STUDENT-STUDENT':
      allowed = settings?.studentChatEnabled !== false && !!me.classId && me.classId === other.classId;
      break;
    case 'STUDENT-TEACHER': {
      const [student, teacher] = me.role === 'STUDENT' ? [me, other] : [other, me];
      allowed = !!student.classId && ((teacher.classIds ?? []).includes(student.classId) || (await isClassTeacher(client, student.classId, teacher.userId)));
      break;
    }
    case 'DRIVER-STUDENT': {
      const [student, driver] = me.role === 'STUDENT' ? [me, other] : [other, me];
      allowed = !!student.busId && student.busId === driver.busId;
      break;
    }
    case 'DRIVER-TEACHER':
    case 'TEACHER-TEACHER':
    case 'DRIVER-DRIVER':
      allowed = true; // staff of the same school may message each other
      break;
    default:
      allowed = false;
  }
  if (!allowed) throw new HandlerError('You cannot start a chat with this user', 'FORBIDDEN');

  const id = directConversationId(me.userId, other.userId);
  const conv = await ensureConversation(client, {
    id,
    schoolId: me.schoolId,
    type: 'DIRECT',
    title: `${me.fullName} · ${other.fullName}`,
    participantIds: [me.userId, other.userId],
  });
  const subtitleFor = (p: Profile) => (p.role === 'STUDENT' ? (p.className ?? 'Student') : p.role === 'TEACHER' ? 'Teacher' : p.role === 'DRIVER' ? `Driver · ${p.busName ?? ''}` : p.role);
  await upsertMember(client, {
    conversationId: id,
    userId: me.userId,
    schoolId: me.schoolId,
    conversationType: 'DIRECT',
    title: other.fullName,
    subtitle: subtitleFor(other),
    avatarKey: other.avatarKey,
    peerUserId: other.userId,
    role: me.role,
  });
  await upsertMember(client, {
    conversationId: id,
    userId: other.userId,
    schoolId: me.schoolId,
    conversationType: 'DIRECT',
    title: me.fullName,
    subtitle: subtitleFor(me),
    avatarKey: me.avatarKey,
    peerUserId: me.userId,
    role: other.role,
  });
  return conv;
}

async function isClassTeacher(client: DataClient, classId: string, teacherId: string) {
  const c = await client.models.Class.get({ id: classId });
  return c.data?.teacherId === teacherId;
}

async function openOfficeConversation(client: DataClient, caller: SchoolCaller, args: { userId?: string | null }): Promise<Conversation> {
  const targetId = caller.isAdmin && args.userId ? args.userId : caller.sub;
  const target = targetId === caller.sub ? caller.profile : unwrap(await client.models.Profile.get({ userId: targetId }), 'Profile.get');
  if (!target) throw new HandlerError('User not found', 'NOT_FOUND');
  assertSameSchool(caller, target.schoolId, 'User');
  if (target.role === 'ADMIN') throw new HandlerError('Admins do not have an office conversation', 'VALIDATION');
  const subtitle = target.role === 'STUDENT' ? (target.className ?? 'Student') : target.role === 'DRIVER' ? `Bus ${target.busName ?? ''}` : 'Teacher';
  return ensureOfficeConversation(client, {
    userId: target.userId,
    fullName: target.fullName,
    role: target.role,
    schoolId: target.schoolId,
    avatarKey: target.avatarKey,
    subtitle,
  });
}

async function reportMessage(client: DataClient, caller: SchoolCaller, args: { messageId: string; reason?: string | null }) {
  const me = caller.profile;
  const msg = unwrap(await client.models.Message.get({ id: args.messageId }), 'Message.get');
  if (!msg) throw new HandlerError('Message not found', 'NOT_FOUND');
  assertSameSchool(caller, msg.schoolId, 'Message');
  await client.models.MessageReport.create({
    schoolId: msg.schoolId,
    messageId: msg.id,
    conversationId: msg.conversationId,
    reporterId: caller.sub,
    reporterName: me.fullName,
    reason: args.reason?.slice(0, 500) ?? undefined,
    messageText: msg.text ?? undefined,
    senderName: msg.senderName,
    reportedAt: nowIso(),
    resolved: false,
  });
  const admins = await getAdminUserIds(client, caller.schoolId);
  const s = t('en');
  await notifyUsers(client, {
    schoolId: msg.schoolId,
    userIds: admins,
    type: 'SYSTEM',
    title: s.reportTitle,
    body: s.reportBody(me.fullName),
    data: { conversationId: msg.conversationId, messageId: msg.id, kind: 'MESSAGE_REPORT' },
    push: true,
  });
  return { ok: true };
}

// ────────────────────────────── feedback ──────────────────────────────
const FeedbackInput = z.object({
  studentIds: z.array(z.string().nullable()).min(1).max(60),
  audience: z.enum(['PARENT', 'OFFICE', 'BOTH']),
  category: z.enum(['ACADEMIC', 'BEHAVIOR', 'ATTENDANCE', 'PRAISE', 'OTHER']),
  rating: z.number().int().min(1).max(5).optional().nullable(),
  title: z.string().trim().min(1).max(140),
  body: z.string().trim().min(1).max(4000),
  attachmentKeys: z.array(z.string().nullable()).max(10).optional().nullable(),
});

async function submitFeedback(client: DataClient, caller: SchoolCaller, raw: unknown) {
  const r = FeedbackInput.safeParse(raw);
  if (!r.success) throw new HandlerError(issues(r.error), 'VALIDATION');
  const input = r.data;
  const author = caller.profile;
  if (author.role !== 'TEACHER' && author.role !== 'ADMIN') throw new HandlerError('Only teachers and the office can send feedback', 'FORBIDDEN');
  const studentIds = Array.from(new Set(input.studentIds.filter((x): x is string => !!x)));
  const attachmentKeys = (input.attachmentKeys ?? []).filter((x): x is string => !!x);
  if (attachmentKeys.some((k) => !k.startsWith('feedback/'))) throw new HandlerError('Invalid attachment', 'VALIDATION');
  const [admins, loaded] = await Promise.all([
    input.audience === 'PARENT' ? Promise.resolve([] as string[]) : getAdminUserIds(client, caller.schoolId),
    mapLimit(studentIds, 8, async (studentId) => (await client.models.Profile.get({ userId: studentId })).data),
  ]);
  const students = loaded.flatMap((s) => (s && s.role === 'STUDENT' && s.schoolId === caller.schoolId ? [s] : []));
  // Check every student first: a teacher picking one student outside their classes must not leave
  // half of the feedback sent.
  if (author.role === 'TEACHER') {
    const classTeacher = new Map<string, boolean>();
    for (const student of students) {
      const classId = student.classId;
      let teaches = !!classId && (author.classIds ?? []).includes(classId);
      if (!teaches && classId) {
        if (!classTeacher.has(classId)) classTeacher.set(classId, await isClassTeacher(client, classId, author.userId));
        teaches = !!classTeacher.get(classId);
      }
      if (!teaches) throw new HandlerError(`${student.fullName} is not in one of your classes`, 'FORBIDDEN');
    }
  }
  if (!students.length) throw new HandlerError('No students found', 'NOT_FOUND');
  let count = 0;

  await mapLimit(students, 4, async (student) => {
    const fb = unwrap(
      await client.models.Feedback.create({
        schoolId: student.schoolId,
        studentId: student.userId,
        studentName: student.fullName,
        classId: student.classId ?? undefined,
        className: student.className ?? undefined,
        authorId: author.userId,
        authorName: author.fullName,
        authorRole: author.role === 'ADMIN' ? 'ADMIN' : 'TEACHER',
        audience: input.audience,
        category: input.category,
        rating: input.rating ?? undefined,
        title: input.title,
        body: input.body,
        attachmentKeys,
        postedAt: nowIso(),
      }),
      'Feedback.create',
    );
    if (!fb) return;
    count++;
    const s = t(student.language);
    if (input.audience !== 'OFFICE') {
      await notifyUsers(client, {
        schoolId: student.schoolId,
        userIds: [student.userId],
        type: 'FEEDBACK',
        title: s.feedbackTitle(input.category),
        body: `${author.fullName}: ${input.title}`,
        data: { feedbackId: fb.id, studentId: student.userId },
        push: true,
      });
    }
    if (admins.length && input.audience !== 'PARENT') {
      await notifyUsers(client, {
        schoolId: student.schoolId,
        userIds: admins.filter((a) => a !== author.userId),
        type: 'FEEDBACK',
        title: `${t('en').feedbackTitle(input.category)} · ${student.fullName}`,
        body: `${author.fullName}: ${input.title}`,
        data: { feedbackId: fb.id, studentId: student.userId },
        push: true,
      });
    }
  });
  await audit(client, {
    schoolId: author.schoolId,
    actorId: caller.sub,
    actorName: author.fullName,
    action: 'SUBMIT_FEEDBACK',
    entityType: 'Feedback',
    entityId: studentIds.join(','),
    after: { count, category: input.category, audience: input.audience },
  });
  return { ok: true, count };
}

/** Teachers of the student's class (and the office) see the student's whole feedback history. */
async function listStudentFeedback(client: DataClient, caller: SchoolCaller, args: { studentId: string }) {
  const student = unwrap(await client.models.Profile.get({ userId: args.studentId }), 'Profile.get');
  if (!student || student.role !== 'STUDENT') throw new HandlerError('Student not found', 'NOT_FOUND');
  assertSameSchool(caller, student.schoolId, 'Student');
  if (!caller.isAdmin) {
    const me = caller.profile;
    const teaches = me.role === 'TEACHER' && !!student.classId && ((me.classIds ?? []).includes(student.classId) || (await isClassTeacher(client, student.classId, me.userId)));
    if (!teaches) throw new HandlerError('Student not found', 'NOT_FOUND');
  }
  const rows = await listAll(
    (nextToken) => client.models.Feedback.listFeedbackByStudent({ studentId: student.userId }, { limit: 100, nextToken, sortDirection: 'DESC' }),
    20,
  );
  return rows
    .filter((f) => f.schoolId === caller.schoolId)
    .map((f) => ({
      id: f.id,
      studentId: f.studentId,
      studentName: f.studentName,
      className: f.className ?? null,
      authorId: f.authorId,
      authorName: f.authorName,
      authorRole: f.authorRole,
      audience: f.audience,
      category: f.category,
      rating: f.rating ?? null,
      title: f.title,
      body: f.body,
      attachmentKeys: (f.attachmentKeys ?? []).filter((k): k is string => !!k),
      postedAt: f.postedAt,
    }));
}

// ────────────────────────────── broadcasts (async fan-out) ──────────────────────────────
async function sendBroadcast(client: DataClient, caller: SchoolCaller, args: { broadcastId: string }) {
  const b = unwrap(await client.models.Broadcast.get({ id: args.broadcastId }), 'Broadcast.get');
  if (!b) throw new HandlerError('Broadcast not found', 'NOT_FOUND');
  assertSameSchool(caller, b.schoolId, 'Broadcast');
  await client.models.Broadcast.update({ id: b.id, deliveryStatus: 'SENDING' });
  let recipients = 0;
  const pageHandler = async (profiles: Profile[]) => {
    const ids = profiles.filter((p) => p.isActive !== false && p.role !== 'ADMIN' && p.schoolId === b.schoolId).map((p) => p.userId);
    if (!ids.length) return;
    recipients += ids.length;
    await notifyUsers(client, {
      schoolId: b.schoolId,
      userIds: ids,
      type: 'BROADCAST',
      title: t('en').broadcastTitle(b.title),
      body: b.body.slice(0, 180),
      data: { broadcastId: b.id },
      push: true,
    });
  };
  const byRole = (role: 'STUDENT' | 'TEACHER' | 'DRIVER') =>
    forEachPage((nextToken) => client.models.Profile.listProfilesBySchoolAndRole({ schoolId: b.schoolId, role: { eq: role } }, { limit: 100, nextToken }), pageHandler);
  try {
    switch (b.audience) {
      case 'ALL_STUDENTS':
        await byRole('STUDENT');
        break;
      case 'ALL_TEACHERS':
        await byRole('TEACHER');
        break;
      case 'ALL_DRIVERS':
        await byRole('DRIVER');
        break;
      case 'CLASS': {
        const cls = b.targetId ? (await client.models.Class.get({ id: b.targetId })).data : null;
        if (cls?.schoolId === b.schoolId) {
          await forEachPage((nextToken) => client.models.Profile.listProfilesByClass({ classId: cls.id }, { limit: 100, nextToken }), pageHandler);
        }
        break;
      }
      case 'BUS': {
        const bus = b.targetId ? (await client.models.Bus.get({ busId: b.targetId })).data : null;
        if (bus?.schoolId === b.schoolId) {
          await forEachPage((nextToken) => client.models.Profile.listProfilesByBus({ busId: bus.busId }, { limit: 100, nextToken }), pageHandler);
        }
        break;
      }
    }
    await client.models.Broadcast.update({ id: b.id, recipientCount: recipients, deliveryStatus: 'SENT' });
  } catch (e) {
    console.error('broadcast failed', e);
    await client.models.Broadcast.update({ id: b.id, recipientCount: recipients, deliveryStatus: 'FAILED' });
  }
  await audit(client, {
    schoolId: b.schoolId,
    actorId: caller.sub,
    actorName: caller.username,
    action: 'SEND_BROADCAST',
    entityType: 'Broadcast',
    entityId: b.id,
    after: { audience: b.audience, targetId: b.targetId, recipients },
  });
}

async function sendPush(client: DataClient, caller: SchoolCaller, args: { userIds: (string | null)[]; title: string; body: string; data?: unknown }) {
  const requested = Array.from(new Set(args.userIds.filter((x): x is string => !!x))).slice(0, 500);
  const profiles = await mapLimit(requested, 10, async (userId) => (await client.models.Profile.get({ userId })).data);
  const ids = profiles.flatMap((p) => (p && p.schoolId === caller.schoolId ? [p.userId] : []));
  const data = (jsonArg(args.data) as Record<string, unknown> | undefined) ?? {};
  const res = await notifyUsers(client, { schoolId: caller.schoolId, userIds: ids, type: 'SYSTEM', title: args.title.slice(0, 140), body: args.body.slice(0, 500), data, push: true });
  return { ok: true, count: res.pushed };
}

// ────────────────────────────── profile self-service ──────────────────────────────
const MyProfileInput = z.object({
  avatarKey: z.string().max(500).optional().nullable(),
  language: z.enum(['en', 'ar']).optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  parentPhone: z.string().max(32).optional().nullable(),
});

async function updateMyProfile(client: DataClient, caller: SchoolCaller, raw: unknown): Promise<Profile> {
  const r = MyProfileInput.safeParse(raw);
  if (!r.success) throw new HandlerError(r.error.issues.map((i) => i.message).join('; '), 'VALIDATION');
  const me = caller.profile;
  const patch: Partial<Profile> & { userId: string } = { userId: me.userId };
  if (r.data.avatarKey !== undefined && r.data.avatarKey !== null) {
    if (r.data.avatarKey && !r.data.avatarKey.startsWith('avatars/')) throw new HandlerError('Invalid avatar key', 'VALIDATION');
    patch.avatarKey = r.data.avatarKey || null;
  }
  if (r.data.language) patch.language = r.data.language;
  if (r.data.phone !== undefined && r.data.phone !== null) patch.phone = r.data.phone || null;
  if (r.data.parentPhone !== undefined && r.data.parentPhone !== null) patch.parentPhone = r.data.parentPhone || null;
  if (Object.keys(patch).length === 1) return me;
  const updated = unwrap(await client.models.Profile.update(patch), 'Profile.update');
  if (!updated) throw new Error('Profile.update returned nothing');
  if (patch.avatarKey !== undefined) {
    // keep the avatar shown to chat peers fresh
    const memberships = await listAll((nextToken) => client.models.ConversationMember.listMembershipsByUser({ userId: me.userId }, { limit: 100, nextToken }));
    await mapLimit(memberships, 5, async (m) => {
      if (m.conversationType !== 'DIRECT' && m.conversationType !== 'OFFICE') return;
      const peers = await listMembers(client, m.conversationId);
      await mapLimit(
        peers.filter((p) => p.userId !== me.userId),
        3,
        (p) => client.models.ConversationMember.update({ conversationId: p.conversationId, userId: p.userId, avatarKey: patch.avatarKey ?? undefined }),
      );
    });
  }
  return updated;
}

async function requestDataDeletion(client: DataClient, caller: SchoolCaller, args: { reason?: string | null }) {
  const me = caller.profile;
  await audit(client, {
    schoolId: me.schoolId,
    actorId: caller.sub,
    actorName: me.fullName,
    action: 'REQUEST_DATA_DELETION',
    entityType: 'Profile',
    entityId: me.userId,
    after: { reason: args.reason?.slice(0, 500) },
  });
  const admins = await getAdminUserIds(client, caller.schoolId);
  const s = t('en');
  await notifyUsers(client, {
    schoolId: me.schoolId,
    userIds: admins,
    type: 'SYSTEM',
    title: s.deletionTitle,
    body: s.deletionBody(me.fullName),
    data: { userId: me.userId, kind: 'DATA_DELETION_REQUEST' },
    push: true,
  });
  return { ok: true, message: 'Your request was sent to the school office.' };
}

// ────────────────────────────── admissions ──────────────────────────────
const optText = (max: number) => z.string().trim().max(max).optional().nullable();
const ApplicationInput = z.object({
  studentName: z.string().trim().min(2, 'Student name is required').max(120),
  dateOfBirth: z.union([z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date of birth must be YYYY-MM-DD'), z.literal('')]).optional().nullable(),
  gender: z.union([z.enum(['MALE', 'FEMALE']), z.literal('')]).optional().nullable(),
  gradeApplying: optText(60),
  parentName: z.string().trim().min(2, 'Parent name is required').max(120),
  relationship: optText(40),
  parentEmail: z.email('A valid e-mail is required'),
  parentPhone: z.string().trim().min(6, 'A valid phone number is required').max(32),
  address: optText(300),
  currentSchool: optText(120),
  needsTransport: z.boolean().optional().nullable(),
  notes: optText(2000),
  language: z.enum(['en', 'ar']).optional().nullable(),
});

const MAX_APPLICATIONS_PER_EMAIL_PER_DAY = 5;
const MAX_APPLICATIONS_PER_SCHOOL_PER_10_MIN = 40;

/** Guest-callable: a family applies to a school that accepts online applications. */
async function submitApplication(client: DataClient, args: { schoolId: string; application: unknown }) {
  const parsed = ApplicationInput.safeParse(jsonArg(args.application));
  if (!parsed.success) throw new HandlerError(issues(parsed.error), 'VALIDATION');
  const input = parsed.data;
  const school = (await client.models.School.get({ schoolId: args.schoolId })).data;
  if (!school || school.directory !== DIRECTORY_PUBLIC || school.status === 'SUSPENDED') throw new HandlerError('School not found', 'NOT_FOUND');
  if (!school.applicationsOpen) throw new HandlerError('This school is not accepting online applications right now', 'CONFLICT');
  if (school.applicationDeadline && /^\d{4}-\d{2}-\d{2}$/.test(school.applicationDeadline) && school.applicationDeadline < new Date().toISOString().slice(0, 10)) {
    throw new HandlerError('The application deadline has passed', 'CONFLICT');
  }
  const gradeOptions = (school.gradeOptions ?? []).filter((g): g is string => !!g);
  if (input.gradeApplying && gradeOptions.length && !gradeOptions.includes(input.gradeApplying)) {
    throw new HandlerError('Please choose one of the grades the school offers', 'VALIDATION');
  }

  // Abuse guards: per family e-mail and per school.
  const emailLower = normalizeSearch(input.parentEmail);
  const dayAgo = new Date(Date.now() - 24 * 3600_000).toISOString();
  const recentByEmail = await client.models.Application.listApplicationsByEmail({ parentEmailLower: emailLower, submittedAt: { ge: dayAgo } }, { limit: 50 });
  if ((recentByEmail.data ?? []).length >= MAX_APPLICATIONS_PER_EMAIL_PER_DAY) {
    throw new HandlerError('Too many applications from this e-mail today. Please try again tomorrow.', 'RATE_LIMITED');
  }
  const duplicate = (recentByEmail.data ?? []).find((a) => a.schoolId === school.schoolId && normalizeSearch(a.studentName) === normalizeSearch(input.studentName));
  if (duplicate) {
    return { reference: duplicate.reference, schoolName: school.name, submittedAt: duplicate.submittedAt };
  }
  const tenMinAgo = new Date(Date.now() - 10 * 60_000).toISOString();
  const recentBySchool = await client.models.Application.listApplicationsBySchool({ schoolId: school.schoolId, submittedAt: { ge: tenMinAgo } }, { limit: MAX_APPLICATIONS_PER_SCHOOL_PER_10_MIN + 1 });
  if ((recentBySchool.data ?? []).length > MAX_APPLICATIONS_PER_SCHOOL_PER_10_MIN) {
    throw new HandlerError('The school is receiving many applications right now. Please try again in a few minutes.', 'RATE_LIMITED');
  }

  let reference = '';
  for (let i = 0; i < 4 && !reference; i++) {
    const candidate = newApplicationReference((n) => randomBytes(n));
    const clash = await client.models.Application.listApplicationsByReference({ reference: candidate }, { limit: 1 });
    if (!(clash.data ?? []).length) reference = candidate;
  }
  if (!reference) throw new Error('Could not allocate an application reference');

  const submittedAt = nowIso();
  const created = unwrap(
    await client.models.Application.create({
      schoolId: school.schoolId,
      reference,
      status: 'NEW',
      studentName: input.studentName,
      dateOfBirth: input.dateOfBirth || undefined,
      gender: input.gender || undefined,
      gradeApplying: input.gradeApplying || undefined,
      parentName: input.parentName,
      relationship: input.relationship || undefined,
      parentEmail: input.parentEmail.trim(),
      parentEmailLower: emailLower,
      parentPhone: input.parentPhone,
      address: input.address || undefined,
      currentSchool: input.currentSchool || undefined,
      needsTransport: input.needsTransport ?? undefined,
      notes: input.notes || undefined,
      language: input.language ?? 'en',
      submittedAt,
    }),
    'Application.create',
  );
  if (!created) throw new Error('Application.create returned nothing');

  const admins = await getAdminUserIds(client, school.schoolId);
  const s = t('en');
  await notifyUsers(client, {
    schoolId: school.schoolId,
    userIds: admins,
    type: 'APPLICATION',
    title: s.applicationTitle,
    body: s.applicationBody(input.studentName, input.gradeApplying),
    data: { applicationId: created.id, kind: 'APPLICATION' },
    push: true,
  });
  await audit(client, {
    schoolId: school.schoolId,
    actorId: 'public',
    actorName: input.parentName,
    action: 'SUBMIT_APPLICATION',
    entityType: 'Application',
    entityId: created.id,
    after: { reference, studentName: input.studentName, gradeApplying: input.gradeApplying },
  });
  return { reference, schoolName: school.name, submittedAt };
}

/** Guest-callable: the family looks up their application with the reference and e-mail. */
async function checkApplication(client: DataClient, args: { reference: string; email: string }) {
  const reference = (args.reference ?? '').trim().toUpperCase();
  const email = normalizeSearch(args.email);
  if (!/^AP-[A-Z0-9]{8}$/.test(reference) || !email) throw new HandlerError('Application not found', 'NOT_FOUND');
  const res = await client.models.Application.listApplicationsByReference({ reference }, { limit: 2 });
  const app = (res.data ?? []).find((a) => a.parentEmailLower === email);
  if (!app) throw new HandlerError('Application not found. Check the reference and the e-mail you used.', 'NOT_FOUND');
  const school = (await client.models.School.get({ schoolId: app.schoolId })).data;
  return {
    reference: app.reference,
    schoolId: app.schoolId,
    schoolName: school?.name ?? '',
    studentName: app.studentName,
    status: app.status,
    submittedAt: app.submittedAt,
    reviewedAt: app.reviewedAt ?? null,
    message: app.reviewerNote ?? null,
  };
}

async function reviewApplication(client: DataClient, caller: SchoolCaller, args: { applicationId: string; status: Application['status']; note?: string | null }): Promise<Application> {
  const app = unwrap(await client.models.Application.get({ id: args.applicationId }), 'Application.get');
  if (!app) throw new HandlerError('Application not found', 'NOT_FOUND');
  assertSameSchool(caller, app.schoolId, 'Application');
  const updated = unwrap(
    await client.models.Application.update({
      id: app.id,
      status: args.status,
      reviewerNote: args.note === undefined ? undefined : (args.note?.trim().slice(0, 2000) ?? null),
      reviewedBy: caller.profile.fullName,
      reviewedAt: nowIso(),
    }),
    'Application.update',
  );
  if (!updated) throw new Error('Application.update returned nothing');
  await audit(client, {
    schoolId: caller.schoolId,
    actorId: caller.sub,
    actorName: caller.profile.fullName,
    action: 'REVIEW_APPLICATION',
    entityType: 'Application',
    entityId: app.id,
    before: { status: app.status },
    after: { status: args.status },
  });
  return updated;
}

// ────────────────────────────── devices ──────────────────────────────
/**
 * One phone = one owner. The app cannot see other users' Device rows (owner auth), so the server
 * removes rows of the same token that belong to someone else – otherwise a previous user's bus
 * alarms would keep ringing on this phone after it changed hands.
 */
async function registerDevice(client: DataClient, sub: string, args: { expoPushToken: string; platform: string; deviceName?: string | null }) {
  const token = (args.expoPushToken ?? '').trim();
  if (!isExpoPushToken(token)) throw new HandlerError('Invalid push token', 'VALIDATION');
  const platform = (args.platform ?? '').slice(0, 16);
  const deviceName = args.deviceName?.slice(0, 80) ?? undefined;
  const rows = await listAll((nextToken) => client.models.Device.listDevicesByToken({ expoPushToken: token }, { limit: 50, nextToken }));
  await mapLimit(
    rows.filter((d) => d.userId !== sub),
    5,
    (d) => client.models.Device.delete({ id: d.id }),
  );
  const mine = rows.filter((d) => d.userId === sub);
  const now = nowIso();
  if (mine.length) {
    await client.models.Device.update({ id: mine[0].id, lastSeenAt: now, platform, deviceName });
    await mapLimit(mine.slice(1), 5, (d) => client.models.Device.delete({ id: d.id })); // duplicates
  } else {
    await client.models.Device.create({ userId: sub, expoPushToken: token, platform, deviceName, lastSeenAt: now });
  }
  return { ok: true, count: rows.length };
}

// ────────────────────────────── entry point ──────────────────────────────
export const handler = async (event: AppSyncEvent<Record<string, unknown>>) => {
  const args = event.arguments as never;
  const op = opName(event);
  try {
    const client = await getDataClient(env);
    // Guest-callable operations (identity pool) – no signed-in user.
    if (op === 'submitApplication') return await submitApplication(client, args);
    if (op === 'checkApplication') return await checkApplication(client, args);

    const identity = requireIdentity(event);
    // Account-level: also for accounts that do not belong to a school yet.
    if (op === 'registerDevice') return await registerDevice(client, identity.sub, args);
    const adminOps = new Set(['sendBroadcast', 'sendPush', 'reviewApplication']);
    const caller = adminOps.has(op) ? await resolveAdmin(client, identity) : await resolveCaller(client, identity);
    switch (op) {
      case 'sendMessage':
        return await sendMessage(client, caller, args);
      case 'openDirectConversation':
        return await openDirectConversation(client, caller, args);
      case 'openOfficeConversation':
        return await openOfficeConversation(client, caller, args);
      case 'reportMessage':
        return await reportMessage(client, caller, args);
      case 'submitFeedback':
        return await submitFeedback(client, caller, args);
      case 'listStudentFeedback':
        return await listStudentFeedback(client, caller, args);
      case 'sendBroadcast':
        await sendBroadcast(client, caller, args);
        return;
      case 'sendPush':
        return await sendPush(client, caller, args);
      case 'updateMyProfile':
        return await updateMyProfile(client, caller, args);
      case 'requestDataDeletion':
        return await requestDataDeletion(client, caller, args);
      case 'reviewApplication':
        return await reviewApplication(client, caller, args);
      default:
        throw new HandlerError(`Unknown operation ${op}`);
    }
  } catch (e) {
    if (e instanceof HandlerError) throw new Error(`[${e.code}] ${e.message}`);
    console.error(e);
    throw e;
  }
};

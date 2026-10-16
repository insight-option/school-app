import { z } from 'zod';
import type { Schema } from '../../data/resource';
import { audit, forEachPage, getDataClient, getSettings, listAll, mapLimit, nowIso, type DataClient, type DataEnv, unwrap } from '../shared/data';
import {
  OFFICE_USER_ID,
  directConversationId,
  ensureConversation,
  ensureOfficeConversation,
  listMembers,
  upsertMember,
} from '../shared/conversations';
import { t } from '../shared/i18n';
import { getAdminUserIds, notifyUsers } from '../shared/notify';
import { pushToUsers } from '../shared/push';
import { HandlerError, opName, requireIdentity, type AppSyncEvent, type Caller } from '../shared/types';

const env = process.env as unknown as DataEnv;

type Profile = Schema['Profile']['type'];
type Message = Schema['Message']['type'];
type MessageType = Schema['MessageType']['type'];
type Conversation = Schema['Conversation']['type'];

async function callerProfile(client: DataClient, caller: Caller): Promise<Profile> {
  const res = await client.models.Profile.get({ userId: caller.sub });
  if (!res.data) throw new HandlerError('Profile not found. Ask the office to recreate your account.', 'NOT_FOUND');
  if (res.data.isActive === false) throw new HandlerError('Account disabled', 'FORBIDDEN');
  return res.data;
}

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

// ────────────────────────────── messaging ──────────────────────────────
const SendMessageInput = z.object({
  conversationId: z.string().min(3).max(200),
  type: z.enum(['TEXT', 'VOICE', 'IMAGE', 'VIDEO', 'FILE']),
  text: z.string().max(4000).optional().nullable(),
  attachmentKey: z.string().max(500).optional().nullable(),
  attachmentMeta: z.unknown().optional().nullable(),
  clientId: z.string().max(100).optional().nullable(),
});

async function sendMessage(client: DataClient, caller: Caller, raw: unknown): Promise<Message> {
  const r = SendMessageInput.safeParse(raw);
  if (!r.success) throw new HandlerError(r.error.issues.map((i) => i.message).join('; '), 'VALIDATION');
  const input = r.data;
  if (input.type === 'TEXT' && !input.text?.trim()) throw new HandlerError('Message is empty', 'VALIDATION');
  if (input.type !== 'TEXT' && !input.attachmentKey) throw new HandlerError('Attachment missing', 'VALIDATION');
  if (input.attachmentKey && !input.attachmentKey.startsWith(`chat/${input.conversationId}/`)) {
    throw new HandlerError('Attachment does not belong to this conversation', 'VALIDATION');
  }

  const profile = await callerProfile(client, caller);
  const conv = unwrap(await client.models.Conversation.get({ id: input.conversationId }), 'Conversation.get');
  const members = await listMembers(client, conv.id);
  const senderSeat = caller.isAdmin ? OFFICE_USER_ID : caller.sub;
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

  const previewEn = preview(input.type, input.text, 'en');
  await client.models.Conversation.update({
    id: conv.id,
    lastMessageText: previewEn,
    lastMessageAt: sentAt,
    lastMessageSenderName: senderName,
    lastMessageType: input.type,
  });

  const recipients = members.filter((m) => m.userId !== senderSeat);
  await mapLimit(members, 10, (m) =>
    client.models.ConversationMember.update({
      conversationId: m.conversationId,
      userId: m.userId,
      lastMessageText: previewEn,
      lastMessageAt: sentAt,
      lastMessageSenderName: senderName,
      lastMessageType: input.type,
      unreadCount: m.userId === senderSeat ? 0 : (m.unreadCount ?? 0) + 1,
      ...(m.userId === senderSeat ? { lastReadAt: sentAt } : {}),
    }),
  );

  // Push to everyone who is not currently looking at this conversation.
  const pushTargets = recipients.filter((m) => !m.isViewing);
  const userIds: string[] = [];
  for (const m of pushTargets) {
    if (m.userId === OFFICE_USER_ID) userIds.push(...(await getAdminUserIds(client)));
    else userIds.push(m.userId);
  }
  const uniqueIds = Array.from(new Set(userIds.filter((u) => u !== caller.sub)));
  if (uniqueIds.length) {
    const profiles = await mapLimit(uniqueIds, 10, async (userId) => (await client.models.Profile.get({ userId })).data);
    const byLang = new Map<string, string[]>();
    profiles.forEach((p, i) => {
      if (!p || p.isActive === false) return;
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

async function openDirectConversation(client: DataClient, caller: Caller, args: { otherUserId: string }): Promise<Conversation> {
  if (caller.isAdmin) throw new HandlerError('Admins use the office conversation (openOfficeConversation)', 'VALIDATION');
  if (!args.otherUserId || args.otherUserId === caller.sub) throw new HandlerError('Invalid user', 'VALIDATION');
  const me = await callerProfile(client, caller);
  const other = unwrap(await client.models.Profile.get({ userId: args.otherUserId }), 'Profile.get');
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
      allowed = true; // staff may message each other
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

async function openOfficeConversation(client: DataClient, caller: Caller, args: { userId?: string | null }): Promise<Conversation> {
  const targetId = caller.isAdmin && args.userId ? args.userId : caller.sub;
  const target = unwrap(await client.models.Profile.get({ userId: targetId }), 'Profile.get');
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

async function reportMessage(client: DataClient, caller: Caller, args: { messageId: string; reason?: string | null }) {
  const me = await callerProfile(client, caller);
  const msg = unwrap(await client.models.Message.get({ id: args.messageId }), 'Message.get');
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
  const admins = await getAdminUserIds(client);
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

async function submitFeedback(client: DataClient, caller: Caller, raw: unknown) {
  const r = FeedbackInput.safeParse(raw);
  if (!r.success) throw new HandlerError(r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '), 'VALIDATION');
  const input = r.data;
  const author = await callerProfile(client, caller);
  if (author.role !== 'TEACHER' && author.role !== 'ADMIN') throw new HandlerError('Only teachers and the office can send feedback', 'FORBIDDEN');
  const studentIds = Array.from(new Set(input.studentIds.filter((x): x is string => !!x)));
  const attachmentKeys = (input.attachmentKeys ?? []).filter((x): x is string => !!x);
  const admins = input.audience === 'PARENT' ? [] : await getAdminUserIds(client);
  let count = 0;

  await mapLimit(studentIds, 4, async (studentId) => {
    const student = (await client.models.Profile.get({ userId: studentId })).data;
    if (!student || student.role !== 'STUDENT') return;
    if (author.role === 'TEACHER') {
      const teaches = !!student.classId && ((author.classIds ?? []).includes(student.classId) || (await isClassTeacher(client, student.classId, author.userId)));
      if (!teaches) throw new HandlerError(`${student.fullName} is not in one of your classes`, 'FORBIDDEN');
    }
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

// ────────────────────────────── broadcasts (async fan-out) ──────────────────────────────
async function sendBroadcast(client: DataClient, caller: Caller, args: { broadcastId: string }) {
  if (!caller.isAdmin) throw new HandlerError('Admin only', 'FORBIDDEN');
  const b = unwrap(await client.models.Broadcast.get({ id: args.broadcastId }), 'Broadcast.get');
  await client.models.Broadcast.update({ id: b.id, deliveryStatus: 'SENDING' });
  let recipients = 0;
  const pageHandler = async (profiles: Profile[]) => {
    const ids = profiles.filter((p) => p.isActive !== false && p.role !== 'ADMIN').map((p) => p.userId);
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
  try {
    switch (b.audience) {
      case 'ALL_STUDENTS':
        await forEachPage((nextToken) => client.models.Profile.listProfilesByRole({ role: 'STUDENT' }, { limit: 100, nextToken }), pageHandler);
        break;
      case 'ALL_TEACHERS':
        await forEachPage((nextToken) => client.models.Profile.listProfilesByRole({ role: 'TEACHER' }, { limit: 100, nextToken }), pageHandler);
        break;
      case 'ALL_DRIVERS':
        await forEachPage((nextToken) => client.models.Profile.listProfilesByRole({ role: 'DRIVER' }, { limit: 100, nextToken }), pageHandler);
        break;
      case 'CLASS':
        await forEachPage((nextToken) => client.models.Profile.listProfilesByClass({ classId: b.targetId ?? '' }, { limit: 100, nextToken }), pageHandler);
        break;
      case 'BUS':
        await forEachPage((nextToken) => client.models.Profile.listProfilesByBus({ busId: b.targetId ?? '' }, { limit: 100, nextToken }), pageHandler);
        break;
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

async function sendPush(client: DataClient, caller: Caller, args: { userIds: (string | null)[]; title: string; body: string; data?: unknown }) {
  if (!caller.isAdmin) throw new HandlerError('Admin only', 'FORBIDDEN');
  const ids = args.userIds.filter((x): x is string => !!x);
  const data = typeof args.data === 'string' ? (JSON.parse(args.data) as Record<string, unknown>) : ((args.data as Record<string, unknown> | undefined) ?? {});
  const res = await notifyUsers(client, { schoolId: caller.schoolId, userIds: ids, type: 'SYSTEM', title: args.title, body: args.body, data, push: true });
  return { ok: true, count: res.pushed };
}

// ────────────────────────────── profile self-service ──────────────────────────────
const MyProfileInput = z.object({
  avatarKey: z.string().max(500).optional().nullable(),
  language: z.enum(['en', 'ar']).optional().nullable(),
  phone: z.string().max(32).optional().nullable(),
  parentPhone: z.string().max(32).optional().nullable(),
});

async function updateMyProfile(client: DataClient, caller: Caller, raw: unknown): Promise<Profile> {
  const r = MyProfileInput.safeParse(raw);
  if (!r.success) throw new HandlerError(r.error.issues.map((i) => i.message).join('; '), 'VALIDATION');
  const me = await callerProfile(client, caller);
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

async function updateHomeLocation(client: DataClient, caller: Caller, args: { lat: number; lng: number; address?: string | null; userId?: string | null }): Promise<Profile> {
  if (!Number.isFinite(args.lat) || !Number.isFinite(args.lng) || Math.abs(args.lat) > 90 || Math.abs(args.lng) > 180) {
    throw new HandlerError('Invalid coordinates', 'VALIDATION');
  }
  const targetId = caller.isAdmin && args.userId ? args.userId : caller.sub;
  const target = unwrap(await client.models.Profile.get({ userId: targetId }), 'Profile.get');
  const before = target.homeLocation ? { ...target.homeLocation, address: target.homeAddress } : null;
  const updated = unwrap(
    await client.models.Profile.update({ userId: target.userId, homeLocation: { lat: args.lat, lng: args.lng }, homeAddress: args.address?.slice(0, 400) ?? undefined }),
    'Profile.update',
  );
  await audit(client, {
    schoolId: target.schoolId,
    actorId: caller.sub,
    actorName: caller.username,
    action: 'UPDATE_HOME_LOCATION',
    entityType: 'Profile',
    entityId: target.userId,
    before,
    after: { lat: args.lat, lng: args.lng, address: args.address },
  });
  if (before && !caller.isAdmin) {
    const admins = await getAdminUserIds(client);
    const s = t('en');
    await notifyUsers(client, {
      schoolId: target.schoolId,
      userIds: admins,
      type: 'SYSTEM',
      title: s.homeChanged,
      body: s.homeChangedBody(target.fullName),
      data: { userId: target.userId, kind: 'HOME_LOCATION_CHANGED' },
      push: false,
    });
  }
  return updated;
}

async function requestDataDeletion(client: DataClient, caller: Caller, args: { reason?: string | null }) {
  const me = await callerProfile(client, caller);
  await audit(client, {
    schoolId: me.schoolId,
    actorId: caller.sub,
    actorName: me.fullName,
    action: 'REQUEST_DATA_DELETION',
    entityType: 'Profile',
    entityId: me.userId,
    after: { reason: args.reason?.slice(0, 500) },
  });
  const admins = await getAdminUserIds(client);
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

// ────────────────────────────── entry point ──────────────────────────────
export const handler = async (event: AppSyncEvent<Record<string, unknown>>) => {
  const caller = requireIdentity(event);
  const client = await getDataClient(env);
  const args = event.arguments as never;
  try {
    switch (opName(event)) {
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
      case 'sendBroadcast':
        await sendBroadcast(client, caller, args);
        return;
      case 'sendPush':
        return await sendPush(client, caller, args);
      case 'updateMyProfile':
        return await updateMyProfile(client, caller, args);
      case 'updateHomeLocation':
        return await updateHomeLocation(client, caller, args);
      case 'requestDataDeletion':
        return await requestDataDeletion(client, caller, args);
      default:
        throw new HandlerError(`Unknown operation ${opName(event)}`);
    }
  } catch (e) {
    if (e instanceof HandlerError) throw new Error(`[${e.code}] ${e.message}`);
    console.error(e);
    throw e;
  }
};

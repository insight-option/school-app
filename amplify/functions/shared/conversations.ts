import type { Schema } from '../../data/resource';
import type { DataClient } from './data';
import { listAll, nowIso } from './data';

export const OFFICE_USER_ID = 'OFFICE';
export const classConversationId = (classId: string) => `class_${classId}`;
export const busConversationId = (busId: string) => `bus_${busId}`;
export const officeConversationId = (userId: string) => `office_${userId}`;
export const directConversationId = (a: string, b: string) => {
  const [x, y] = [a, b].sort();
  return `dm_${x}_${y}`;
};

type ConversationType = Schema['Conversation']['type']['type'];

export async function ensureConversation(
  client: DataClient,
  input: { id: string; schoolId: string; type: ConversationType; title: string; classId?: string; busId?: string; participantIds?: string[] },
) {
  const existing = await client.models.Conversation.get({ id: input.id });
  if (existing.data) {
    if (existing.data.title !== input.title) {
      await client.models.Conversation.update({ id: input.id, title: input.title });
    }
    return existing.data;
  }
  const created = await client.models.Conversation.create({
    id: input.id,
    schoolId: input.schoolId,
    type: input.type,
    title: input.title,
    classId: input.classId,
    busId: input.busId,
    participantIds: input.participantIds,
    memberCount: 0,
    lastMessageAt: nowIso(),
  });
  if (created.errors?.length) throw new Error(created.errors.map((e) => e.message).join('; '));
  return created.data!;
}

export type MemberInput = {
  conversationId: string;
  userId: string;
  schoolId: string;
  conversationType: ConversationType;
  title: string;
  subtitle?: string | null;
  avatarKey?: string | null;
  peerUserId?: string | null;
  role?: string | null;
};

/** Idempotent add/update of a membership row (what the inbox list renders). */
export async function upsertMember(client: DataClient, m: MemberInput) {
  const existing = await client.models.ConversationMember.get({ conversationId: m.conversationId, userId: m.userId });
  if (existing.data) {
    if (existing.data.title !== m.title || existing.data.subtitle !== (m.subtitle ?? null) || existing.data.avatarKey !== (m.avatarKey ?? null)) {
      await client.models.ConversationMember.update({
        conversationId: m.conversationId,
        userId: m.userId,
        title: m.title,
        subtitle: m.subtitle ?? undefined,
        avatarKey: m.avatarKey ?? undefined,
      });
    }
    return false;
  }
  const conv = await client.models.Conversation.get({ id: m.conversationId });
  const res = await client.models.ConversationMember.create({
    conversationId: m.conversationId,
    userId: m.userId,
    ownerId: m.userId,
    schoolId: m.schoolId,
    role: m.role ?? undefined,
    conversationType: m.conversationType,
    title: m.title,
    subtitle: m.subtitle ?? undefined,
    avatarKey: m.avatarKey ?? undefined,
    peerUserId: m.peerUserId ?? undefined,
    unreadCount: 0,
    isViewing: false,
    lastMessageAt: conv.data?.lastMessageAt ?? nowIso(),
    lastMessageText: conv.data?.lastMessageText ?? undefined,
    lastMessageSenderName: conv.data?.lastMessageSenderName ?? undefined,
    lastMessageType: conv.data?.lastMessageType ?? undefined,
  });
  if (res.errors?.length) throw new Error(res.errors.map((e) => e.message).join('; '));
  if (conv.data) {
    await client.models.Conversation.update({ id: m.conversationId, memberCount: (conv.data.memberCount ?? 0) + 1 });
  }
  return true;
}

export async function removeMember(client: DataClient, conversationId: string, userId: string) {
  const existing = await client.models.ConversationMember.get({ conversationId, userId });
  if (!existing.data) return false;
  await client.models.ConversationMember.delete({ conversationId, userId });
  const conv = await client.models.Conversation.get({ id: conversationId });
  if (conv.data) {
    await client.models.Conversation.update({ id: conversationId, memberCount: Math.max(0, (conv.data.memberCount ?? 0) - 1) });
  }
  return true;
}

export async function listMembers(client: DataClient, conversationId: string) {
  return listAll((nextToken) => client.models.ConversationMember.list({ conversationId, limit: 200, nextToken }));
}

/** Every user gets a private "School office" chat; the office seat sees it under the user's name. */
export async function ensureOfficeConversation(
  client: DataClient,
  user: { userId: string; fullName: string; role: string; schoolId: string; avatarKey?: string | null; subtitle?: string | null },
) {
  const id = officeConversationId(user.userId);
  const conv = await ensureConversation(client, {
    id,
    schoolId: user.schoolId,
    type: 'OFFICE',
    title: user.fullName,
    participantIds: [user.userId],
  });
  await upsertMember(client, {
    conversationId: id,
    userId: user.userId,
    schoolId: user.schoolId,
    conversationType: 'OFFICE',
    title: 'School Office',
    subtitle: null,
    role: user.role,
    peerUserId: OFFICE_USER_ID,
  });
  await upsertMember(client, {
    conversationId: id,
    userId: OFFICE_USER_ID,
    schoolId: user.schoolId,
    conversationType: 'OFFICE',
    title: user.fullName,
    subtitle: user.subtitle ?? user.role,
    avatarKey: user.avatarKey ?? undefined,
    role: 'ADMIN',
    peerUserId: user.userId,
  });
  return conv;
}

export async function ensureClassGroup(client: DataClient, cls: { id: string; name: string; schoolId: string }) {
  const id = classConversationId(cls.id);
  const conv = await ensureConversation(client, { id, schoolId: cls.schoolId, type: 'CLASS_GROUP', title: cls.name, classId: cls.id });
  await upsertMember(client, {
    conversationId: id,
    userId: OFFICE_USER_ID,
    schoolId: cls.schoolId,
    conversationType: 'CLASS_GROUP',
    title: cls.name,
    subtitle: 'Class group',
    role: 'ADMIN',
  });
  return conv;
}

export async function ensureBusGroup(client: DataClient, bus: { busId: string; plate: string; schoolId: string }) {
  const id = busConversationId(bus.busId);
  const title = `Bus ${bus.plate}`;
  const conv = await ensureConversation(client, { id, schoolId: bus.schoolId, type: 'BUS_GROUP', title, busId: bus.busId });
  await upsertMember(client, {
    conversationId: id,
    userId: OFFICE_USER_ID,
    schoolId: bus.schoolId,
    conversationType: 'BUS_GROUP',
    title,
    subtitle: 'Bus group',
    role: 'ADMIN',
  });
  return conv;
}

export async function addUserToGroup(
  client: DataClient,
  conversationId: string,
  conversationType: ConversationType,
  title: string,
  subtitle: string,
  user: { userId: string; role: string; schoolId: string },
) {
  await upsertMember(client, { conversationId, userId: user.userId, schoolId: user.schoolId, conversationType, title, subtitle, role: user.role });
}

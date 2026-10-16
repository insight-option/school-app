import { useEffect } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { client, listAll, unwrap, type ConversationMember, type Message, type MessageType } from '../lib/data/client';
import { qk } from '../lib/query/client';
import { useSession } from '../lib/auth/session';

export const OFFICE_USER_ID = 'OFFICE';

/** Inbox = this user's membership rows (denormalised titles, unread counts, last message). */
export function useInbox(seatUserId: string | null | undefined) {
  return useQuery({
    queryKey: qk.inbox(seatUserId ?? ''),
    enabled: !!seatUserId,
    staleTime: 10_000,
    queryFn: async () => {
      const rows = await listAll((nextToken) => client.models.ConversationMember.listMembershipsByUser({ userId: seatUserId! }, { limit: 100, nextToken, sortDirection: 'DESC' }));
      return rows.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    },
  });
}

export function useInboxSubscription(seatUserId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!seatUserId || !enabled) return;
    const upsert = (m: ConversationMember) =>
      qc.setQueryData<ConversationMember[]>(qk.inbox(seatUserId), (old) => {
        const list = old ?? [];
        const idx = list.findIndex((x) => x.conversationId === m.conversationId);
        const next = idx >= 0 ? list.map((x) => (x.conversationId === m.conversationId ? { ...x, ...m } : x)) : [m, ...list];
        return next.sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
      });
    const s1 = client.models.ConversationMember.onUpdate({ filter: { userId: { eq: seatUserId } } }).subscribe({ next: upsert, error: (e) => console.warn('inbox sub', e) });
    const s2 = client.models.ConversationMember.onCreate({ filter: { userId: { eq: seatUserId } } }).subscribe({ next: upsert, error: (e) => console.warn('inbox sub', e) });
    return () => {
      s1.unsubscribe();
      s2.unsubscribe();
    };
  }, [seatUserId, enabled, qc]);
}

export function useUnreadTotal(seatUserId: string | null | undefined) {
  const inbox = useInbox(seatUserId);
  return inbox.data?.reduce((acc, m) => acc + (m.unreadCount ?? 0), 0) ?? 0;
}

export function useConversation(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: qk.conversation(conversationId ?? ''),
    enabled: !!conversationId,
    staleTime: 60_000,
    queryFn: async () => unwrap(await client.models.Conversation.get({ id: conversationId! }), 'conversation'),
  });
}

export function useConversationMembers(conversationId: string | null | undefined) {
  return useQuery({
    queryKey: qk.members(conversationId ?? ''),
    enabled: !!conversationId,
    staleTime: 60_000,
    queryFn: async () => listAll((nextToken) => client.models.ConversationMember.list({ conversationId: conversationId!, limit: 200, nextToken })),
  });
}

export type MessagePage = { items: Message[]; nextToken: string | null };

/** Latest 50 first; older pages load when scrolling up. Newest messages are merged in by the subscription. */
export function useMessages(conversationId: string | null | undefined) {
  return useInfiniteQuery({
    queryKey: qk.messages(conversationId ?? ''),
    enabled: !!conversationId,
    staleTime: 5_000,
    initialPageParam: undefined as string | null | undefined,
    queryFn: async ({ pageParam }): Promise<MessagePage> => {
      const res = await client.models.Message.listMessagesByConversation({ conversationId: conversationId! }, { limit: 50, sortDirection: 'DESC', nextToken: pageParam ?? undefined });
      unwrap(res, 'messages');
      return { items: res.data, nextToken: res.nextToken ?? null };
    },
    getNextPageParam: (last) => last.nextToken ?? undefined,
  });
}

export function useMessageSubscription(conversationId: string | null | undefined, enabled = true) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!conversationId || !enabled) return;
    const s1 = client.models.Message.onCreate({ filter: { conversationId: { eq: conversationId } } }).subscribe({
      next: (msg) => {
        qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(qk.messages(conversationId), (old) => {
          if (!old) return old;
          const [first, ...rest] = old.pages;
          // replace optimistic copy (same clientId) or prepend
          const existing = first.items.findIndex((m) => m.id === msg.id || (!!msg.clientId && m.clientId === msg.clientId));
          const items = existing >= 0 ? first.items.map((m, i) => (i === existing ? msg : m)) : [msg, ...first.items];
          return { ...old, pages: [{ ...first, items }, ...rest] };
        });
      },
      error: (e) => console.warn('message sub', e),
    });
    const s2 = client.models.Message.onUpdate({ filter: { conversationId: { eq: conversationId } } }).subscribe({
      next: (msg) =>
        qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(qk.messages(conversationId), (old) =>
          old ? { ...old, pages: old.pages.map((p) => ({ ...p, items: p.items.map((m) => (m.id === msg.id ? msg : m)) })) } : old,
        ),
      error: (e) => console.warn('message sub', e),
    });
    return () => {
      s1.unsubscribe();
      s2.unsubscribe();
    };
  }, [conversationId, enabled, qc]);
}

export type SendMessageInput = {
  conversationId: string;
  type: MessageType;
  text?: string;
  attachmentKey?: string;
  attachmentMeta?: Record<string, unknown>;
  clientId: string;
};

export const SEND_MESSAGE_KEY = ['sendMessage'] as const;

/** Optimistic send; paused while offline and resumed automatically (persisted mutation). */
export function useSendMessage() {
  const qc = useQueryClient();
  const session = useSession();
  return useMutation({
    mutationKey: SEND_MESSAGE_KEY,
    mutationFn: async (input: SendMessageInput) =>
      unwrap(await client.mutations.sendMessage({ ...input, attachmentMeta: input.attachmentMeta ? JSON.stringify(input.attachmentMeta) : undefined }), 'send'),
    onMutate: async (input) => {
      const optimistic: Message = {
        id: `local-${input.clientId}`,
        conversationId: input.conversationId,
        schoolId: session.schoolId,
        senderId: session.userId ?? 'me',
        senderName: '',
        senderRole: session.role ?? 'STUDENT',
        type: input.type,
        text: input.text ?? null,
        attachmentKey: input.attachmentKey ?? null,
        attachmentMeta: input.attachmentMeta ? JSON.stringify(input.attachmentMeta) : null,
        sentAt: new Date().toISOString(),
        clientId: input.clientId,
        deleted: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(qk.messages(input.conversationId), (old) => {
        if (!old) return { pages: [{ items: [optimistic], nextToken: null }], pageParams: [undefined] };
        const [first, ...rest] = old.pages;
        return { ...old, pages: [{ ...first, items: [optimistic, ...first.items] }, ...rest] };
      });
      return { optimisticId: optimistic.id };
    },
    onSuccess: (msg, input) => {
      if (!msg) return;
      qc.setQueryData<{ pages: MessagePage[]; pageParams: unknown[] }>(qk.messages(input.conversationId), (old) => {
        if (!old) return old;
        const [first, ...rest] = old.pages;
        const withoutLocal = first.items.filter((m) => m.id !== `local-${input.clientId}`);
        const exists = withoutLocal.some((m) => m.id === msg.id);
        return { ...old, pages: [{ ...first, items: exists ? withoutLocal : [msg, ...withoutLocal] }, ...rest] };
      });
    },
  });
}

export function useMarkConversationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { conversationId: string; seatUserId: string; viewing: boolean }) => {
      const res = await client.models.ConversationMember.update({
        conversationId: input.conversationId,
        userId: input.seatUserId,
        isViewing: input.viewing,
        ...(input.viewing ? { unreadCount: 0, lastReadAt: new Date().toISOString() } : {}),
      });
      return unwrap(res, 'read');
    },
    onMutate: (input) => {
      qc.setQueryData<ConversationMember[]>(qk.inbox(input.seatUserId), (old) => old?.map((m) => (m.conversationId === input.conversationId ? { ...m, unreadCount: input.viewing ? 0 : m.unreadCount, isViewing: input.viewing } : m)));
    },
  });
}

export function useOpenDirectConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (otherUserId: string) => unwrap(await client.mutations.openDirectConversation({ otherUserId }), 'open chat'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

export function useOpenOfficeConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId?: string) => unwrap(await client.mutations.openOfficeConversation(userId ? { userId } : {}), 'open office chat'),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['inbox'] }),
  });
}

export function useReportMessage() {
  return useMutation({ mutationFn: async (input: { messageId: string; reason?: string }) => unwrap(await client.mutations.reportMessage(input), 'report') });
}

export function useDeleteMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (msg: Message) => unwrap(await client.models.Message.update({ id: msg.id, deleted: true, text: null, attachmentKey: null }), 'delete'),
    onSuccess: (msg) => {
      if (msg) void qc.invalidateQueries({ queryKey: qk.messages(msg.conversationId) });
    },
  });
}

/** Office view: all class & bus group conversations (admin oversight). */
export function useGroupConversations(enabled: boolean) {
  return useQuery({
    queryKey: qk.groupConversations(),
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      const [cls, bus] = await Promise.all([
        listAll((nextToken) => client.models.Conversation.listConversationsByType({ type: 'CLASS_GROUP' }, { limit: 100, nextToken, sortDirection: 'DESC' })),
        listAll((nextToken) => client.models.Conversation.listConversationsByType({ type: 'BUS_GROUP' }, { limit: 100, nextToken, sortDirection: 'DESC' })),
      ]);
      return [...cls, ...bus].sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
    },
  });
}

export function previewLabel(type: MessageType | null | undefined, text: string | null | undefined, t: (k: string) => string): string {
  switch (type) {
    case 'VOICE':
      return `🎤 ${t('chat.voiceNote')}`;
    case 'IMAGE':
      return `📷 ${t('chat.photo')}`;
    case 'VIDEO':
      return `🎬 ${t('chat.video')}`;
    case 'FILE':
      return `📎 ${t('chat.file')}`;
    default:
      return text ?? '';
  }
}

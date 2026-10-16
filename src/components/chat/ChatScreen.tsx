import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { Avatar } from '../../ui/Avatar';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { ListItem } from '../../ui/ListItem';
import { Screen } from '../../ui/Screen';
import { Sheet } from '../../ui/Sheet';
import { Text } from '../../ui/Text';
import { useTheme } from '../../ui/theme';
import { toast } from '../../ui/Toast';
import { useSession } from '../../lib/auth/session';
import { useMyProfile } from '../../features/profiles';
import {
  OFFICE_USER_ID,
  useConversation,
  useConversationMembers,
  useDeleteMessage,
  useMarkConversationRead,
  useMessageSubscription,
  useMessages,
  useReportMessage,
  useSendMessage,
} from '../../features/messaging';
import type { Message } from '../../lib/data/client';
import { randomId } from '../../lib/storage/s3';
import { relativeDay } from '../../lib/util/format';
import { copyText } from '../../lib/util/device';
import { Composer } from './Composer';
import { MessageBubble, type BubbleStatus } from './MessageBubble';
import { MediaViewer, type MediaItem } from './MediaViewer';
import { uploadAttachment, type PickedAttachment } from './attachments';
import { useUploadStore, type AttachmentMeta } from './uploadStore';

type Row = { kind: 'day'; id: string; label: string } | { kind: 'message'; id: string; message: Message; showSender: boolean };

/** The one chat UI used by every workspace. */
export function ChatScreen({ conversationId }: { conversationId: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const me = useMyProfile();
  const seatUserId = session.role === 'ADMIN' ? OFFICE_USER_ID : (session.userId ?? '');

  const conversation = useConversation(conversationId);
  const members = useConversationMembers(conversationId);
  const messagesQ = useMessages(conversationId);
  useMessageSubscription(conversationId);
  const send = useSendMessage();
  const markRead = useMarkConversationRead();
  const report = useReportMessage();
  const remove = useDeleteMessage();
  const uploads = useUploadStore((s) => s.uploads);
  const localUris = useUploadStore((s) => s.localUris);

  const [menuMsg, setMenuMsg] = useState<Message | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [media, setMedia] = useState<MediaItem | null>(null);
  const [showMembers, setShowMembers] = useState(false);
  const listRef = useRef<React.ComponentRef<typeof FlashList<Row>>>(null);

  // Viewing state: unread → 0 and suppress pushes while this screen is focused.
  useFocusEffect(
    useCallback(() => {
      if (seatUserId) markRead.mutate({ conversationId, seatUserId, viewing: true });
      return () => {
        if (seatUserId) markRead.mutate({ conversationId, seatUserId, viewing: false });
      };
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [conversationId, seatUserId]),
  );

  const myTitle = useMemo(() => {
    const mine = members.data?.find((m) => m.userId === seatUserId);
    return mine?.title ?? conversation.data?.title ?? '';
  }, [members.data, seatUserId, conversation.data]);
  const isGroup = conversation.data?.type === 'CLASS_GROUP' || conversation.data?.type === 'BUS_GROUP';

  const rows = useMemo<Row[]>(() => {
    const all = (messagesQ.data?.pages.flatMap((p) => p.items) ?? []).slice().sort((a, b) => a.sentAt.localeCompare(b.sentAt));
    const pending = Object.values(uploads)
      .filter((u) => u.conversationId === conversationId)
      .map<Message>((u) => ({
        id: `upload-${u.clientId}`,
        conversationId,
        schoolId: session.schoolId,
        senderId: session.userId ?? 'me',
        senderName: me.data?.fullName ?? '',
        senderRole: session.role ?? 'STUDENT',
        type: u.type,
        text: null,
        attachmentKey: null,
        attachmentMeta: JSON.stringify(u.meta),
        sentAt: new Date().toISOString(),
        clientId: u.clientId,
        deleted: false,
        createdAt: '',
        updatedAt: '',
      }));
    const merged = [...all, ...pending];
    const out: Row[] = [];
    let lastDay = '';
    let lastSender = '';
    for (const m of merged) {
      const day = m.sentAt.slice(0, 10);
      if (day !== lastDay) {
        out.push({ kind: 'day', id: `day-${day}`, label: relativeDay(day, t) });
        lastDay = day;
        lastSender = '';
      }
      out.push({ kind: 'message', id: m.id, message: m, showSender: isGroup && m.senderId !== lastSender });
      lastSender = m.senderId;
    }
    return out;
  }, [messagesQ.data, uploads, conversationId, session, me.data, isGroup, t]);

  const statusFor = useCallback(
    (m: Message): BubbleStatus => {
      if (m.id.startsWith('upload-')) return uploads[m.clientId ?? '']?.status === 'failed' ? 'failed' : 'uploading';
      if (m.id.startsWith('local-')) {
        const failed = send.isError && send.variables?.clientId === m.clientId;
        return failed ? 'failed' : 'sending';
      }
      return 'sent';
    },
    [uploads, send.isError, send.variables],
  );

  const sendText = (text: string) => {
    send.mutate({ conversationId, type: 'TEXT', text, clientId: randomId() }, { onError: (e) => toast.error(e.message) });
  };

  const sendAttachments = async (items: PickedAttachment[]) => {
    const store = useUploadStore.getState();
    for (const item of items) {
      const clientId = randomId();
      const run = async () => {
        store.start({ clientId, conversationId, type: item.type, localUri: item.uri, progress: 0, status: 'uploading', meta: { name: item.name, size: item.size, mime: item.mime, durationMs: item.durationMs, width: item.width, height: item.height } });
        try {
          const { key, meta } = await uploadAttachment(item, `chat/${conversationId}`, (p) => store.progress(clientId, p));
          store.finish(clientId);
          send.mutate({ conversationId, type: item.type, attachmentKey: key, attachmentMeta: meta as Record<string, unknown>, clientId }, { onError: (e) => toast.error(e.message) });
        } catch (e) {
          store.fail(clientId, (e as Error).message, run);
          toast.error((e as Error).message);
        }
      };
      void run();
    }
  };

  const openFile = async (url: string, meta: AttachmentMeta) => {
    if (Platform.OS === 'web') {
      window.open(url, '_blank', 'noopener');
      return;
    }
    await WebBrowser.openBrowserAsync(url, { showTitle: true, toolbarColor: theme.colors.surface }).catch(() => toast.error(meta.name ?? url));
  };

  const retryMessage = (m: Message) => {
    if (m.id.startsWith('upload-')) uploads[m.clientId ?? '']?.retry?.();
    else if (send.variables && send.variables.clientId === m.clientId) send.mutate(send.variables);
  };

  const headerRight = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {isGroup ? <Button size="sm" variant="ghost" icon="people-outline" title={String(conversation.data?.memberCount ?? members.data?.length ?? '')} onPress={() => setShowMembers(true)} /> : null}
    </View>
  );

  return (
    <Screen back title={myTitle} subtitle={isGroup ? t('chat.membersCount', { count: conversation.data?.memberCount ?? members.data?.length ?? 0 }) : undefined} padded={false} right={headerRight} edges={['top', 'left', 'right', 'bottom']} keyboard>
      <View style={styles.fill}>
        {messagesQ.isLoading && rows.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator color={theme.colors.primary} />
          </View>
        ) : rows.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="chatbubbles-outline" size={40} color={theme.colors.textFaint} />
            <Text color="textMuted">{t('chat.noMessages')}</Text>
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={rows}
            keyExtractor={(r) => r.id}
            getItemType={(r) => r.kind}
            maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.25, animateAutoScrollToBottom: true }}
            onStartReached={() => messagesQ.hasNextPage && !messagesQ.isFetchingNextPage && messagesQ.fetchNextPage()}
            onStartReachedThreshold={0.3}
            ListHeaderComponent={messagesQ.isFetchingNextPage ? <ActivityIndicator style={{ marginVertical: 12 }} color={theme.colors.primary} /> : null}
            contentContainerStyle={{ paddingVertical: 8 }}
            renderItem={({ item }) =>
              item.kind === 'day' ? (
                <View style={styles.dayRow}>
                  <Text variant="captionStrong" color="textMuted" style={[styles.dayPill, { backgroundColor: theme.colors.surfaceAlt }]}>
                    {item.label}
                  </Text>
                </View>
              ) : (
                <MessageBubble
                  message={item.message}
                  mine={item.message.senderId === session.userId}
                  showSender={item.showSender}
                  status={statusFor(item.message)}
                  upload={uploads[item.message.clientId ?? '']}
                  localUri={localUris[item.message.clientId ?? '']}
                  onLongPress={setMenuMsg}
                  onOpenMedia={setMedia}
                  onOpenFile={openFile}
                  onRetry={() => retryMessage(item.message)}
                />
              )
            }
          />
        )}
      </View>
      <Composer onSendText={sendText} onSendAttachments={sendAttachments} disabled={!conversation.data} />

      <Sheet visible={!!menuMsg} onClose={() => setMenuMsg(null)} title={menuMsg?.senderName} scroll={false}>
        {menuMsg?.text ? (
          <ListItem
            icon="copy-outline"
            title={t('common.copy')}
            onPress={() => {
              void copyText(menuMsg.text!, t('common.copied'));
              setMenuMsg(null);
            }}
          />
        ) : null}
        {menuMsg && menuMsg.senderId !== session.userId ? (
          <ListItem
            icon="flag-outline"
            title={t('chat.report')}
            onPress={() => {
              setReporting(true);
            }}
          />
        ) : null}
        {session.role === 'ADMIN' && menuMsg && !menuMsg.deleted ? (
          <ListItem
            icon="trash-outline"
            title={t('chat.deleteMessage')}
            onPress={() => {
              remove.mutate(menuMsg, { onSuccess: () => toast.success(t('chat.deleted')), onError: (e) => toast.error(e.message) });
              setMenuMsg(null);
            }}
          />
        ) : null}
        {reporting ? (
          <View style={{ gap: 12, paddingTop: 8 }}>
            <Input label={t('chat.reportReason')} value={reportReason} onChangeText={setReportReason} multiline />
            <Button
              title={t('chat.report')}
              variant="danger"
              loading={report.isPending}
              onPress={() =>
                menuMsg &&
                report.mutate(
                  { messageId: menuMsg.id, reason: reportReason || undefined },
                  {
                    onSuccess: () => {
                      toast.success(t('chat.reported'));
                      setMenuMsg(null);
                      setReporting(false);
                      setReportReason('');
                    },
                    onError: (e) => toast.error(e.message),
                  },
                )
              }
            />
          </View>
        ) : null}
      </Sheet>

      <Sheet visible={showMembers} onClose={() => setShowMembers(false)} title={t('chat.members')}>
        {(members.data ?? [])
          .filter((m) => m.userId !== OFFICE_USER_ID || session.role === 'ADMIN')
          .map((m) => (
            <ListItem
              key={m.userId}
              title={m.userId === OFFICE_USER_ID ? t('chat.office') : (m.peerUserId ? m.title : m.title)}
              subtitle={m.role ?? undefined}
              left={<Avatar name={m.title} avatarKey={m.avatarKey} size={36} />}
              onPress={
                m.userId !== OFFICE_USER_ID && m.userId !== session.userId && session.role !== 'ADMIN'
                  ? undefined
                  : undefined
              }
            />
          ))}
      </Sheet>

      <MediaViewer item={media} onClose={() => setMedia(null)} />
      {Platform.OS === 'web' ? null : <View style={{ height: 0 }} />}
      {router ? null : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  dayRow: { alignItems: 'center', paddingVertical: 8 },
  dayPill: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 999, overflow: 'hidden' },
});

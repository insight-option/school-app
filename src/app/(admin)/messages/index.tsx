import React, { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Button, Chip, ListItem, Screen, Sheet, useTheme } from '../../../ui';
import { InboxList } from '../../../components/chat/InboxList';
import { OFFICE_USER_ID, useGroupConversations } from '../../../features/messaging';
import { useMessageReports, useResolveReport } from '../../../features/ops';
import { timeAgoShort } from '../../../lib/util/format';

/** Office inbox: every direct chat with staff/parents plus oversight of class & bus groups. */
export default function AdminMessages() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const [tab, setTab] = useState<'inbox' | 'groups' | 'reports'>('inbox');
  const groups = useGroupConversations(tab === 'groups');
  const reports = useMessageReports(tab === 'reports');
  const resolve = useResolveReport();
  const [reportOpen, setReportOpen] = useState<string | null>(null);
  const openReports = (reports.data ?? []).filter((r) => !r.resolved);

  const header = (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: theme.spacing.lg, paddingVertical: theme.spacing.md }}>
      <Chip label={t('admin.messages')} icon="mail" selected={tab === 'inbox'} onPress={() => setTab('inbox')} />
      <Chip label={t('admin.groupChats')} icon="people" selected={tab === 'groups'} onPress={() => setTab('groups')} />
      <Chip label={t('admin.reports')} icon="flag" selected={tab === 'reports'} onPress={() => setTab('reports')} count={openReports.length || undefined} tone="danger" />
    </ScrollView>
  );

  return (
    <Screen padded={false} title={t('admin.messages')} right={<Button size="sm" icon="create-outline" title={t('admin.newMessage')} onPress={() => router.push('/(admin)/messages/new')} />}>
      {tab === 'inbox' ? (
        <InboxList seatUserId={OFFICE_USER_ID} header={header} />
      ) : tab === 'groups' ? (
        <ScrollView>
          {header}
          {(groups.data ?? []).map((c) => (
            <ListItem key={c.id} title={c.title} subtitle={c.lastMessageText ? `${c.lastMessageSenderName ?? ''}: ${c.lastMessageText}` : t('chat.noMessages')} meta={c.lastMessageText ? timeAgoShort(c.lastMessageAt) : undefined} left={<Avatar name={c.title} icon={c.type === 'CLASS_GROUP' ? 'people' : 'bus'} color={theme.colors.accent} />} chevron onPress={() => router.push(`/chat/${c.id}` as never)} />
          ))}
        </ScrollView>
      ) : (
        <ScrollView>
          {header}
          {(reports.data ?? []).map((r) => (
            <ListItem
              key={r.id}
              title={`${r.reporterName ?? r.reporterId} → ${r.senderName ?? ''}`}
              subtitle={`${r.reason ? `${r.reason} · ` : ''}${r.messageText ?? ''}`}
              subtitleLines={2}
              meta={timeAgoShort(r.reportedAt)}
              icon={r.resolved ? 'checkmark-done-outline' : 'flag'}
              onPress={() => setReportOpen(r.id)}
              style={r.resolved ? { opacity: 0.6 } : undefined}
            />
          ))}
        </ScrollView>
      )}
      <Sheet visible={!!reportOpen} onClose={() => setReportOpen(null)} title={t('admin.reports')} scroll={false}>
        {(() => {
          const r = reports.data?.find((x) => x.id === reportOpen);
          if (!r) return null;
          return (
            <View style={{ gap: theme.spacing.md }}>
              <ListItem title={r.messageText ?? t('chat.file')} subtitle={`${r.senderName ?? ''} · ${r.reason ?? ''}`} subtitleLines={3} />
              <Button title={t('common.open')} variant="secondary" icon="chatbubble-ellipses-outline" onPress={() => { setReportOpen(null); router.push(`/chat/${r.conversationId}` as never); }} />
              {!r.resolved ? <Button title={t('common.done')} icon="checkmark" loading={resolve.isPending} onPress={() => resolve.mutate(r.id, { onSuccess: () => setReportOpen(null) })} /> : null}
            </View>
          );
        })()}
      </Sheet>
    </Screen>
  );
}

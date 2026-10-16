import React, { useCallback } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, CountBadge, EmptyState, ListItem, SkeletonList, useTheme } from '../../ui';
import { previewLabel, useInbox, useInboxSubscription } from '../../features/messaging';
import type { ConversationMember } from '../../lib/data/client';
import { timeAgoShort } from '../../lib/util/format';

/** Conversation inbox for any seat (a user id or 'OFFICE'). */
export function InboxList({ seatUserId, header, emptyTitle, emptyBody }: { seatUserId: string | null | undefined; header?: React.ReactNode; emptyTitle?: string; emptyBody?: string }) {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const inbox = useInbox(seatUserId);
  useInboxSubscription(seatUserId);

  const render = useCallback(
    ({ item }: { item: ConversationMember }) => (
      <ListItem
        title={item.title}
        subtitle={item.lastMessageText ? `${item.lastMessageSenderName ? `${item.lastMessageSenderName}: ` : ''}${previewLabel(item.lastMessageType, item.lastMessageText, t)}` : item.subtitle}
        meta={item.lastMessageText ? timeAgoShort(item.lastMessageAt) : undefined}
        left={<Avatar name={item.title} avatarKey={item.avatarKey} size={46} icon={item.conversationType === 'CLASS_GROUP' ? 'people' : item.conversationType === 'BUS_GROUP' ? 'bus' : item.conversationType === 'OFFICE' && item.peerUserId === 'OFFICE' ? 'business' : undefined} color={item.conversationType === 'CLASS_GROUP' || item.conversationType === 'BUS_GROUP' ? theme.colors.accent : undefined} />}
        right={<CountBadge count={item.unreadCount ?? 0} />}
        onPress={() => router.push(`/chat/${item.conversationId}` as never)}
      />
    ),
    [router, t, theme.colors.accent],
  );

  if (inbox.isLoading && !inbox.data) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <SkeletonList />
      </View>
    );
  }
  return (
    <FlashList
      data={inbox.data ?? []}
      keyExtractor={(m) => m.conversationId}
      renderItem={render}
      ListHeaderComponent={<>{header}</>}
      ListEmptyComponent={<EmptyState icon="chatbubbles-outline" title={emptyTitle ?? t('chat.inboxEmpty')} body={emptyBody ?? t('chat.inboxEmptyBody')} />}
      refreshing={inbox.isRefetching}
      onRefresh={() => inbox.refetch()}
    />
  );
}

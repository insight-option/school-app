import React, { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { Badge, Button, EmptyState, ListItem, Screen, SkeletonList, useTheme } from '../ui';
import { useMarkNotificationsRead, useNotificationSubscription, useNotifications } from '../features/engagement';
import { useSession } from '../lib/auth/session';
import { parseJson, type Notification, type NotificationType } from '../lib/data/client';
import { timeAgoShort } from '../lib/util/format';
import { routeForPush, type PushData } from '../lib/push/notifications';

const ICONS: Record<NotificationType, keyof typeof Ionicons.glyphMap> = {
  ALARM: 'alarm',
  MESSAGE: 'chatbubble-ellipses',
  FEEDBACK: 'ribbon',
  BROADCAST: 'megaphone',
  BUS_NEAR: 'bus',
  BOARDED: 'checkmark-circle',
  DROPPED: 'home',
  SYSTEM: 'information-circle',
};

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const session = useSession();
  const q = useNotifications(session.userId);
  useNotificationSubscription(session.userId);
  const markRead = useMarkNotificationsRead();
  const items = useMemo(() => q.data?.pages.flatMap((p) => p.items) ?? [], [q.data]);
  const unread = items.filter((n) => !n.read);

  // Mark everything read when the inbox is opened (badge resets).
  useEffect(() => {
    if (unread.length && !markRead.isPending) markRead.mutate(unread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const open = (n: Notification) => {
    const data = parseJson<PushData>(n.data) ?? {};
    const route = routeForPush({ type: n.type as PushData['type'], ...data }, session.role);
    if (route && route !== '/notifications') router.push(route as never);
  };

  return (
    <Screen back title={t('notifications.title')} padded={false} right={unread.length ? <Button size="sm" variant="ghost" title={t('notifications.markAllRead')} onPress={() => markRead.mutate(unread)} /> : undefined}>
      {q.isLoading && !items.length ? (
        <SkeletonList />
      ) : items.length === 0 ? (
        <EmptyState icon="notifications-off-outline" title={t('notifications.empty')} body={t('notifications.emptyBody')} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(n) => n.id}
          onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
          onEndReachedThreshold={0.4}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          renderItem={({ item }) => (
            <ListItem
              title={item.title}
              subtitle={item.body}
              subtitleLines={2}
              meta={timeAgoShort(item.sentAt)}
              onPress={() => open(item)}
              left={
                <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: item.read ? theme.colors.surfaceAlt : theme.colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={ICONS[item.type] ?? 'notifications'} size={20} color={item.read ? theme.colors.textMuted : theme.colors.primary} />
                </View>
              }
              right={!item.read ? <Badge label={t('common.newBadge')} tone="primary" size="sm" /> : undefined}
            />
          )}
        />
      )}
    </Screen>
  );
}

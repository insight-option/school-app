import React, { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Avatar, Badge, Button, Chip, EmptyState, Input, ListItem, Screen, SkeletonList, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { useMyProfile, useProfilesByBus } from '../../../features/profiles';
import { useSettings } from '../../../features/settings';
import { useActiveTrip, useTripStops } from '../../../features/trips';
import { useBusDayStatuses } from '../../../features/dayStatus';
import { useOpenDirectConversation } from '../../../features/messaging';
import { todayIn } from '../../../lib/util/format';

type Filter = 'all' | 'going' | 'notGoing' | 'boarded';

export default function DriverStudents() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const me = useMyProfile();
  const settings = useSettings();
  const busId = me.data?.busId ?? null;
  const today = todayIn(settings.data?.timezone);
  const students = useProfilesByBus(busId);
  const statuses = useBusDayStatuses(busId, today);
  const trips = useActiveTrip(busId, today);
  const stops = useTripStops(trips.active?.id);
  const openDm = useOpenDirectConversation();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const notGoing = useMemo(() => new Set((statuses.data ?? []).filter((d) => d.status === 'NOT_GOING').map((d) => d.studentId)), [statuses.data]);
  const stopByStudent = useMemo(() => new Map((stops.data ?? []).map((s) => [s.studentId, s])), [stops.data]);
  const statusOf = (userId: string): Filter => {
    const stop = stopByStudent.get(userId);
    if (stop?.status === 'BOARDED' || stop?.status === 'DROPPED') return 'boarded';
    if (stop?.status === 'ABSENT' || notGoing.has(userId)) return 'notGoing';
    return 'going';
  };
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (students.data ?? []).filter((s) => (filter === 'all' || statusOf(s.userId) === filter) && (!q || s.fullName.toLowerCase().includes(q) || s.username.toLowerCase().includes(q)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students.data, query, filter, notGoing, stopByStudent]);

  return (
    <Screen padded={false} title={t('driver.students')} subtitle={me.data?.busName ? `${t('profile.bus')} ${me.data.busName}` : undefined} right={busId ? <Button size="sm" variant="secondary" icon="people" title={t('driver.messageAll')} onPress={() => router.push(`/chat/bus_${busId}` as never)} /> : undefined}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.sm, gap: theme.spacing.sm }}>
        <Input placeholder={t('common.search')} value={query} onChangeText={setQuery} leftIcon="search" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: theme.spacing.sm }}>
          <Chip label={t('common.all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
          <Chip label={t('driver.going')} tone="success" selected={filter === 'going'} onPress={() => setFilter('going')} />
          <Chip label={t('driver.notGoing')} tone="danger" selected={filter === 'notGoing'} onPress={() => setFilter('notGoing')} />
          <Chip label={t('driver.boarded')} tone="neutral" selected={filter === 'boarded'} onPress={() => setFilter('boarded')} />
        </ScrollView>
      </View>
      {students.isLoading && !students.data ? (
        <SkeletonList />
      ) : (
        <FlashList
          data={list}
          keyExtractor={(s) => s.userId}
          ListEmptyComponent={<EmptyState icon="people-outline" title={t('driver.noStudents')} />}
          renderItem={({ item }) => {
            const st = statusOf(item.userId);
            return (
              <ListItem
                title={item.fullName}
                subtitle={[item.className, item.homeAddress].filter(Boolean).join(' · ') || undefined}
                left={<Avatar name={item.fullName} avatarKey={item.avatarKey} />}
                right={<Badge label={st === 'going' ? t('driver.going') : st === 'notGoing' ? t('driver.notGoing') : t('driver.boarded')} tone={st === 'going' ? 'success' : st === 'notGoing' ? 'danger' : 'neutral'} size="sm" />}
                chevron
                onPress={() => openDm.mutate(item.userId, { onSuccess: (c) => c && router.push(`/chat/${c.id}` as never), onError: (e) => toast.error(e.message) })}
              />
            );
          }}
        />
      )}
    </Screen>
  );
}

import React, { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, Screen, SegmentedControl, Skeleton, useTheme } from '../../../ui';
import { BookingCard } from '../../../components/explore/BookingCard';
import { isUpcoming, useMyBookings } from '../../../features/platform';

export default function CustomerBookings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const router = useRouter();
  const bookings = useMyBookings();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const { upcoming, past } = useMemo(() => {
    const all = bookings.data ?? [];
    const up = all.filter(isUpcoming).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
    return { upcoming: up, past: all.filter((b) => !up.includes(b)) };
  }, [bookings.data]);
  const rows = tab === 'upcoming' ? upcoming : past;

  return (
    <Screen title={t('platform.bookings.title')} maxWidth={760} padded={false}>
      <View style={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.md }}>
        <SegmentedControl
          value={tab}
          onChange={(v) => setTab(v as 'upcoming' | 'past')}
          options={[
            { value: 'upcoming', label: `${t('platform.bookings.upcoming')}${upcoming.length ? ` · ${upcoming.length}` : ''}` },
            { value: 'past', label: t('platform.bookings.past') },
          ]}
        />
      </View>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: theme.spacing.xxxl, gap: 12, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={bookings.isRefetching} onRefresh={() => void bookings.refetch()} tintColor={theme.colors.primary} />}
      >
        {bookings.isLoading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} height={108} radius={24} />)
        ) : rows.length ? (
          rows.map((b) => <BookingCard key={b.id} booking={b} onPress={() => router.push(`/(customer)/booking/${b.id}` as never)} />)
        ) : (
          <EmptyState icon="calendar-outline" title={t('platform.bookings.empty')} body={t('platform.bookings.emptyBody')} actionLabel={t('platform.bookings.explore')} onAction={() => router.push('/(customer)/(tabs)/explore' as never)} />
        )}
      </ScrollView>
    </Screen>
  );
}

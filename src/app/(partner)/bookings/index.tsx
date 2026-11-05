import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, Screen, SkeletonCard, Text, useTheme } from '../../../ui';
import { toast } from '../../../ui/Toast';
import { Segmented } from '../../../components/partner/fields';
import { BookingRow, DateStrip, RequestActions } from '../../../components/partner/bookings';
import { hasEnded, useBusinessBookings, useQatarClock, useRespondBooking } from '../../../features/partner';
import { haptic } from '../../../lib/util/device';
import type { Booking } from '../../../lib/data/client';

type Mode = 'requests' | 'upcoming' | 'day' | 'past';

/** Requests to answer, the upcoming schedule, any single day, and history. */
export default function PartnerBookings() {
  const { t } = useTranslation();
  const theme = useTheme();
  const { spacing } = theme;
  const router = useRouter();
  const now = useQatarClock();
  const q = useBusinessBookings();
  const respond = useRespondBooking();
  const [mode, setMode] = useState<Mode | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);

  const all = useMemo(() => q.data ?? [], [q.data]);
  const pendingCount = useMemo(() => all.filter((b) => b.status === 'PENDING' && !hasEnded(b, now)).length, [all, now]);
  // Open on Requests when something is waiting, otherwise on the upcoming schedule.
  const active: Mode = mode ?? (pendingCount ? 'requests' : 'upcoming');
  const selectedDay = day ?? now.date;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const b of all) if (b.status === 'PENDING' || b.status === 'CONFIRMED' || b.status === 'COMPLETED') c[b.date] = (c[b.date] ?? 0) + 1;
    return c;
  }, [all]);

  const items = useMemo((): Booking[] => {
    switch (active) {
      case 'requests':
        return all.filter((b) => b.status === 'PENDING' && !hasEnded(b, now));
      case 'upcoming':
        return all.filter((b) => b.status === 'CONFIRMED' && !hasEnded(b, now));
      case 'day':
        return all.filter((b) => b.date === selectedDay);
      case 'past':
      default:
        return all.filter((b) => hasEnded(b, now) || (b.status !== 'PENDING' && b.status !== 'CONFIRMED')).reverse();
    }
  }, [active, all, now, selectedDay]);

  const answer = (bookingId: string, status: 'CONFIRMED' | 'DECLINED') => {
    setAnswering(bookingId);
    respond.mutate(
      { bookingId, status },
      {
        onSuccess: () => {
          haptic('success');
          toast.success(status === 'CONFIRMED' ? t('partner.bookings.confirmed') : t('partner.bookings.declined'));
        },
        onError: (e) => toast.error(e.message),
        onSettled: () => setAnswering(null),
      },
    );
  };

  const empty = {
    requests: t('partner.bookings.emptyRequests'),
    upcoming: t('partner.bookings.emptyUpcoming'),
    day: t('partner.bookings.emptyDay'),
    past: t('partner.bookings.emptyPast'),
  }[active];

  return (
    <Screen title={t('partner.bookings.title')} subtitle={t('partner.bookings.subtitle')} padded={false} maxWidth={900}>
      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, paddingBottom: spacing.sm }}>
        <Segmented<Mode>
          wrap={false}
          value={active}
          onChange={setMode}
          options={[
            { value: 'requests', label: pendingCount ? `${t('partner.bookings.requests')} · ${pendingCount}` : t('partner.bookings.requests'), icon: 'hourglass-outline' },
            { value: 'upcoming', label: t('partner.bookings.upcoming'), icon: 'calendar-outline' },
            { value: 'day', label: t('partner.bookings.day'), icon: 'today-outline' },
            { value: 'past', label: t('partner.bookings.past'), icon: 'time-outline' },
          ]}
        />
        {active === 'day' ? <DateStrip start={now.date} days={21} value={selectedDay} onChange={setDay} counts={counts} /> : null}
      </View>
      {q.isLoading ? (
        <View style={{ padding: spacing.lg, gap: spacing.md }}>
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </View>
      ) : q.isError ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => void q.refetch()} retryLabel={t('common.retry')} />
      ) : (
        <FlashList
          data={items}
          keyExtractor={(b) => b.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.huge, paddingTop: spacing.sm }}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          refreshing={q.isRefetching}
          onRefresh={() => void q.refetch()}
          ListEmptyComponent={<EmptyState icon="calendar-clear-outline" title={empty} body={t('partner.bookings.emptyBody')} />}
          ListHeaderComponent={
            active === 'requests' && items.length ? (
              <Text variant="caption" color="textMuted" style={{ marginBottom: spacing.sm }}>
                {t('partner.bookings.requestsCount', { count: items.length })}
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <BookingRow
              booking={item}
              showDate={active !== 'day'}
              onPress={() => router.push(`/(partner)/bookings/${item.id}` as never)}
              actions={item.status === 'PENDING' && active === 'requests' ? <RequestActions busy={answering === item.id} onConfirm={() => answer(item.id, 'CONFIRMED')} onDecline={() => answer(item.id, 'DECLINED')} /> : undefined}
            />
          )}
        />
      )}
    </Screen>
  );
}
